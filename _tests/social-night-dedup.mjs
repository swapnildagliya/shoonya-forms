// Unit tests for the 2026-08-07 social-night server-side dedup.
//
// Context: Alex's "Oefenavond" saved TWICE, 7.35 s apart — 2 rows, 2 mails,
// 4 Drive files — and 22 May 2026 already held FOUR near-identical Alex rows.
// The client-side button lock is the first guard; this is the second, because a
// flaky network, a retry or a second tab all reproduce it with a fixed client.
//
// The invariant these tests protect, in priority order:
//   1. A genuinely DIFFERENT event is never overwritten (that direction loses data).
//   2. A byte-identical resubmit does not create a second row (it adds nothing).
//   3. A correction overwrites in place and keeps the old row in __previousSubmission.
//   4. A dedup failure never costs a submission — it falls through and appends.
//
//   node forms/_tests/social-night-dedup.mjs

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

// ── Fake sheet ─────────────────────────────────────────────────────────────
// Mirrors just enough of the SpreadsheetApp surface that saveToSheet touches.
// F4 (review 2026-09-18): kept in sync with SUBMISSION_HEADERS['social-event']
// (SubmissionSheets.gs) — this fixture had drifted since 'Photo Credit'/
// 'Description Language' were appended 2026-08-15. Out of sync, EVERY save()
// call in this file found those two canonical headers "missing" from the live
// sheet and had _ensureSheetHeaders append them — an unconditional row-1
// header write on every call, polluting `sheet.written` (row 1) ahead of any
// real data-row write and breaking every `written.length`/`written[0]`
// assertion below, independent of anything this file is actually testing.
const HEADERS = ['Timestamp', 'Organiser', 'Email', 'Event Title', 'Dance Style(s)', 'Date',
  'Doors Open', 'End Time', 'Dress Code', 'Programme', 'Pricing', 'Early Bird Deadline',
  'DJ(s)', 'Music Type', 'Note for Shoonya', 'Description', 'Photo Credit', 'Description Language', 'Review status'];

function makeSheet(rows) {
  const grid = [HEADERS.slice()].concat(rows.map(r => r.slice()));
  return {
    appended: [],
    written: [],
    _grid: grid,
    getLastRow: () => grid.length,
    getLastColumn: () => HEADERS.length,
    getRange(startRow, startCol, numRows, numCols) {
      const self = this;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const src = grid[startRow - 1 + r] || [];
            const line = [];
            for (let c = 0; c < numCols; c++) line.push(src[startCol - 1 + c] ?? '');
            out.push(line);
          }
          return out;
        },
        // 2026-10-13: _stampCorrects adds the 'Corrects' header with setValue (real Range has it).
        setValue(v) { grid[startRow - 1][startCol - 1] = v; },
        setValues(vals) {
          self.written.push({ row: startRow, values: vals[0] });
          grid[startRow - 1] = vals[0].slice();
        },
      };
    },
    appendRow(r) { this.appended.push(r); grid.push(r.slice()); },
  };
}

let SHEET = makeSheet([]);

const noop = () => {};
const ctx = vm.createContext({
  Logger: { log: noop }, console,
  SpreadsheetApp: { openById: () => ({ getSheets: () => [SHEET] }) },
  DriveApp: {}, MailApp: { sendEmail: noop },
  Utilities: {
    // Honours the format string — a mock that always returned yyyy-MM-dd would
    // silently skip the time-cell branch of _snCellKey, which is exactly the
    // branch the live sheet exercises (End Time is stored as a time value).
    formatDate: (d, _tz, fmt) => {
      const p = (n) => String(n).padStart(2, '0');
      if (fmt === 'HH:mm') return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: noop }) },
  CacheService: {}, UrlFetchApp: {}, HtmlService: {}, ContentService: {},
  Session: { getScriptTimeZone: () => 'UTC' },
  jsonResponse: (o) => o,
});

for (const rel of ['backend/BlockStudioServer.gs', 'backend/ScheduleRules.gs',
                   'backend/MasterSchedule.gs', 'backend/SubmissionSheets.gs',
                   'backend/code.gs']) {
  try {
    new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }).runInContext(ctx);
  } catch (err) {
    console.log('  ✗ could not load ' + rel + ' — ' + err.message);
    fail++;
  }
}

// Alex's real 2026-08-07 payload.
const ALEX = {
  type: 'social-night',
  teacher_name: 'Alex',
  email: 'alexpapaianopol@yahoo.com',
  title: 'Oefenavond',
  date: '2026-09-11',
  styles: ['Bachata', 'Cuban Salsa', 'Rueda de Casino'],
  doors: '20:00',
  end: '01:00',
  earlyDeadline: '2026-09-10',
  djName: 'DJ Kimo',
  musicType: 'guest-dj',
  genres: ['Bachata', 'Salsa', 'Kizomba'],
  programme: [{ type: 'workshop', topic: 'Solo Salsa', start: '20:00', end: '21:00', teacher: 'Gheorghe & Timea' }],
  pricing: [
    { label: 'Advance Workshop + Party', price: '10' },
    { label: 'Door Workshop + Party', price: '15' },
  ],
};

const save = (data, sheetRows) => {
  SHEET = makeSheet(sheetRows || []);
  const res = vm.runInContext(
    `saveToSheet(${JSON.stringify(data)}, 'social-night')`, ctx);
  return { result: res, sheet: SHEET };
};

// Build the row Alex's payload produces, so fixtures are real rather than guessed.
const alexRow = vm.runInContext(`buildSheetRow(${JSON.stringify(ALEX)}, 'social-night')`, ctx);
const alexStored = alexRow.concat(['Pending']);   // + Review status

console.log('\nsocial-night dedup — the 2026-08-07 double-submit guard\n');

// ── 1. Empty sheet → append ────────────────────────────────────────────────
let r = save(ALEX, []);
ok('first submission is appended', r.result === 'created' && r.sheet.appended.length === 1,
   r.result + ' / appended=' + r.sheet.appended.length);

// ── 2. THE BUG: identical resubmit → suppressed ────────────────────────────
r = save(ALEX, [alexStored]);
ok('byte-identical resubmit is suppressed, not appended',
   r.result === 'duplicate' && r.sheet.appended.length === 0,
   r.result + ' / appended=' + r.sheet.appended.length);
ok('suppressed duplicate writes nothing to the sheet at all',
   r.sheet.written.length === 0, 'writes=' + r.sheet.written.length);

// ── 3. A correction → overwrite in place, old row preserved ────────────────
const corrected = { ...ALEX, doors: '19:30', description: 'Now with a real description.' };
r = save(corrected, [alexStored]);
ok('a changed resubmit overwrites instead of appending',
   r.result === 'updated' && r.sheet.appended.length === 0 && r.sheet.written.length === 1,
   r.result + ' / appended=' + r.sheet.appended.length + ' / written=' + r.sheet.written.length);
ok('the overwrite targets the matched row (row 2)',
   r.sheet.written[0] && r.sheet.written[0].row === 2, JSON.stringify(r.sheet.written[0]?.row));
ok('the corrected value actually lands',
   r.sheet.written[0] && r.sheet.written[0].values[HEADERS.indexOf('Doors Open')] === '19:30',
   JSON.stringify(r.sheet.written[0]?.values[HEADERS.indexOf('Doors Open')]));
ok('"Review status" (a non-canonical column) survives the overwrite',
   r.sheet.written[0] && r.sheet.written[0].values[HEADERS.indexOf('Review status')] === 'Pending',
   JSON.stringify(r.sheet.written[0]?.values[HEADERS.indexOf('Review status')]));

// ── 4. THE INVARIANT THAT MATTERS MOST — never clobber a different event ───
const otherDate = { ...ALEX, date: '2026-10-09' };
r = save(otherDate, [alexStored]);
ok('same organiser, DIFFERENT date → appended, never overwritten',
   r.result === 'created' && r.sheet.written.length === 0, r.result);

const otherTitle = { ...ALEX, title: 'Kizomba Night' };
r = save(otherTitle, [alexStored]);
ok('same organiser + date, DIFFERENT title → appended, never overwritten',
   r.result === 'created' && r.sheet.written.length === 0, r.result);

const otherOrganiser = { ...ALEX, teacher_name: 'Sonja KikiZomba', email: 'kikizombanet@gmail.com' };
r = save(otherOrganiser, [alexStored]);
ok('DIFFERENT organiser, same date + title → appended, never overwritten',
   r.result === 'created' && r.sheet.written.length === 0, r.result);

// ── 5. Matching is tolerant of the shapes Sheets actually stores ───────────
const coercedDateRow = alexStored.slice();
coercedDateRow[HEADERS.indexOf('Date')] = new Date(Date.UTC(2026, 8, 11));
r = save(ALEX, [coercedDateRow]);
ok('a Date-coerced date cell still reads as an identical duplicate',
   r.result === 'duplicate', r.result);

// The live sheet really does store End Time as "1:00" while the form sends "01:00",
// and Sheets anchors bare times to 1899-12-30. Both must compare equal or every
// unchanged resubmit is misread as a correction.
const coercedTimeRow = alexStored.slice();
coercedTimeRow[HEADERS.indexOf('End Time')] = new Date(Date.UTC(1899, 11, 30, 1, 0));
r = save(ALEX, [coercedTimeRow]);
ok('a Date-coerced TIME cell (1899-anchored) still reads as identical',
   r.result === 'duplicate', r.result);

const shortTimeRow = alexStored.slice();
shortTimeRow[HEADERS.indexOf('End Time')] = '1:00';
r = save(ALEX, [shortTimeRow]);
ok('"1:00" on the sheet matches "01:00" from the form', r.result === 'duplicate', r.result);

// …but a genuinely different time must still count as a correction.
const realTimeChange = alexStored.slice();
realTimeChange[HEADERS.indexOf('End Time')] = '02:00';
r = save(ALEX, [realTimeChange]);
ok('a genuinely different end time is still treated as a correction',
   r.result === 'updated', r.result);

// Casing/padding must still MATCH the row (so no second row is created); whether
// it lands as 'duplicate' or 'updated' depends on whether the stored cells differ
// textually, and overwriting to normalise the casing is lossless either way.
const casedRow = alexStored.slice();
casedRow[HEADERS.indexOf('Email')] = 'AlexPapaianopol@Yahoo.com';
casedRow[HEADERS.indexOf('Event Title')] = '  oefenavond  ';
r = save(ALEX, [casedRow]);
ok('case and padding differences still match the same event (no new row)',
   r.result !== 'created' && r.sheet.appended.length === 0, r.result);

// ── 6. Fall back to organiser NAME when the row has no email ───────────────
// Row 6 of the real sheet (22 May) has a blank email — that must still match.
const noEmailRow = alexStored.slice();
noEmailRow[HEADERS.indexOf('Email')] = '';
r = save({ ...ALEX, email: '' }, [noEmailRow]);
ok('rows with a blank email still match on organiser name', r.result === 'duplicate', r.result);

// ── 7. Too little to match on → always append, never guess ────────────────
r = save({ ...ALEX, date: '', title: '' }, [alexStored]);
ok('a payload with no date/title is appended rather than matched',
   r.result === 'created', r.result);

// ── 8. Other submission types are untouched by this path ──────────────────
SHEET = makeSheet([alexStored]);
const wsRes = vm.runInContext(
  `saveToSheet(${JSON.stringify({ ...ALEX, type: 'workshop' })}, 'workshop')`, ctx);
ok('workshops do not go through the social-night dedup', wsRes === 'created', String(wsRes));

// ── 9. F4 P2 (review 2026-09-18): the `'` write guard (_sheetSafeCell) must
// not break the identical-vs-correction comparison, in EITHER cell format.
//
// _sheetSafeCell prefixes a formula-looking or leading-zero-numeric string
// with `'` as a write guard (audit #17). Sheets DROPS that `'` on write for
// an Automatic-formatted cell — so a value read back from the live sheet
// never carries it — but KEEPS it literally for a Plain-text-formatted one —
// so a value read back from THAT sheet still does. `positionedRow` (built
// fresh in memory, about to be compared) always still carries the `'` when
// one was added, because it has not gone through Sheets yet. Before the fix,
// an Automatic-format sheet's read-back cell ("007", no `'`) compared
// unequal to the freshly-built one ("'007", with it) — an UNCHANGED resubmit
// misread as a correction: it reopens an already-approved night, sends a
// second confirmation mail, and duplicates every Drive photo.
const ALEX_LEADING_ZERO = { ...ALEX, dresscode: '007' };
const alexLZRaw = vm.runInContext(`buildSheetRow(${JSON.stringify(ALEX_LEADING_ZERO)}, 'social-night')`, ctx);

// Automatic format: Sheets drops the `'` on write — the stored/read-back row
// is identical to the RAW (unsanitized) buildSheetRow output.
const automaticStored = alexLZRaw.concat(['Pending']);
r = save(ALEX_LEADING_ZERO, [automaticStored]);
ok('Automatic-format sheet: an unchanged resubmit with a leading-zero field ("007") is STILL a duplicate, not a correction',
   r.result === 'duplicate' && r.sheet.written.length === 0,
   r.result + ' / written=' + r.sheet.written.length);

// Plain-text format: Sheets keeps the `'` literally on write — the stored/
// read-back row is the SANITIZED (`'`-prefixed) buildSheetRow output.
const alexLZPlainText = vm.runInContext(`_sheetSafeRow(${JSON.stringify(alexLZRaw)})`, ctx);
ok('sanity: _sheetSafeRow actually added the `\'` prefix to the leading-zero cell (proves this test exercises the real guard)',
   alexLZPlainText[HEADERS.indexOf('Dress Code')] === "'007", JSON.stringify(alexLZPlainText[HEADERS.indexOf('Dress Code')]));
const plainTextStored = alexLZPlainText.concat(['Pending']);
r = save(ALEX_LEADING_ZERO, [plainTextStored]);
ok('Plain-text-format sheet: an unchanged resubmit with a leading-zero field is STILL a duplicate — a stored "\'007" must not be misread as different from a fresh "\'007"',
   r.result === 'duplicate' && r.sheet.written.length === 0,
   r.result + ' / written=' + r.sheet.written.length);

// A genuinely CHANGED leading-zero field must still be a correction — the
// fix strips the write-guard artifact before comparing, it does not stop
// comparing altogether.
r = save({ ...ALEX_LEADING_ZERO, dresscode: '008' }, [automaticStored]);
ok('a genuinely different leading-zero value is still read as a correction, not swallowed by the strip',
   r.result === 'updated', r.result);

console.log('\n' + (fail ? '✗' : '✓') + ' social-night dedup: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
