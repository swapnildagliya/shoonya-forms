#!/usr/bin/env node
// Forms review F0 (13 Oct 2026) — backend proofs, run against the REAL .gs sources
// in a Node vm with a fake SpreadsheetApp. Nothing is deployed or written anywhere.
//   1. workshop + festival dedup (identical -> duplicate, changed -> updated, other date -> created)
//   2. weekly submission is logged ONCE (data.__logged)
//   3. flattened fallback formats time cells as HH:mm (+ early-bird date)
//   4. raw-mail fallback: sent when the sheet save fails, NOT on a normal submit
//   5. `corrects` / `correctsId` in the bridge row
//   6. archiveSubmissionsBefore_20261013: counts, idempotent
//   7. reading never writes 'Pending'; saved photos reach the bridge row
//
//   node forms/_tests/forms-f0.mjs   (from the Event Submission dir)
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

function makeSheet(headers, rows = []) {
  const grid = [headers.slice()].concat(rows.map((r) => r.slice()));
  const o = {
    _grid: grid, appended: [], failWrites: false,
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(...grid.map((r) => r.length)),
    appendRow(r) { if (o.failWrites) throw new Error('quota'); grid.push(r.slice()); o.appended.push(r.slice()); },
    getRange(sr, sc, nr = 1, nc = 1) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < nr; r++) { const src = grid[sr - 1 + r] || []; const l = []; for (let c = 0; c < nc; c++) l.push(src[sc - 1 + c] ?? ''); out.push(l); }
          return out;
        },
        setValue(v) { if (!grid[sr - 1]) grid[sr - 1] = []; grid[sr - 1][sc - 1] = v; return this; },
        setValues(vals) {
          if (o.failWrites) throw new Error('quota');
          vals.forEach((line, i) => { if (!grid[sr - 1 + i]) grid[sr - 1 + i] = []; line.forEach((v, j) => { grid[sr - 1 + i][sc - 1 + j] = v; }); });
          return this;
        },
        setBackground() { return this; }, setFontColor() { return this; }, setFontWeight() { return this; },
      };
    },
    setFrozenRows() {}, setColumnWidth() {},
  };
  return o;
}

const noop = () => {};
const SHEETS = {};        // id -> sheet
let LOG = makeSheet(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)']);
const mails = [];
const ctx = vm.createContext({
  Logger: { log: noop }, console,
  SpreadsheetApp: { openById: (id) => ({ getSheets: () => [SHEETS[id]], getSheetByName: (n) => (n === 'Submissions Log' ? LOG : null), insertSheet: () => LOG }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'APP_BRIDGE_SECRET' ? 'sekret' : null), setProperty: noop, deleteProperty: noop }) },
  DriveApp: {}, MailApp: { sendEmail: (o) => mails.push(o) }, GmailApp: { sendEmail: noop },
  Utilities: {
    formatDate: (d, _tz, fmt) => {
      const p = (n) => String(n).padStart(2, '0');
      if (fmt === 'HH:mm') return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    },
    computeDigest: () => [], DigestAlgorithm: { SHA_256: 1 }, base64Decode: () => [], newBlob: () => ({}),
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: noop, remove: noop }) },
  UrlFetchApp: {}, HtmlService: {},
  ContentService: { createTextOutput: (s) => ({ setMimeType() { return JSON.parse(s); } }), MimeType: { JSON: 'json' } },
  Session: { getScriptTimeZone: () => 'UTC' },
});
for (const rel of ['code.gs', 'TeacherAdmin.gs', 'AppBridge.gs', 'BlockStudioServer.gs', 'ScheduleRules.gs', 'MasterSchedule.gs', 'SubmissionSheets.gs', 'OutputRenderers.gs', 'output-generator.gs']) {
  new vm.Script(fs.readFileSync(path.join(ROOT, 'backend', rel), 'utf8'), { filename: rel }).runInContext(ctx);
}
// Stub everything outside the code under test (Drive, teacher mail, Master Schedule, raw mail).
vm.runInContext(`
  var __raw = 0, __confirm = 0, __photoCalls = 0;
  findTeacherByName = () => null; syncTeacherProfileFromWeeklyClassSubmission = () => {}; syncToMasterSchedule = () => {};
  syncWorkshopToMasterSchedule = () => {}; syncSocialNightToMasterSchedule = () => {};
  savePhotoToDrive = () => { __photoCalls++; return { viewerUrl: 'https://drive.google.com/file/d/ABC/view', directUrl: 'https://lh3.googleusercontent.com/d/ABC', filename: 'DJ Kimo.jpg', label: 'DJ Kimo', fileId: 'ABC' }; };
  sendTeacherConfirmation = () => { __confirm++; }; sendRawPayloadEmail = () => { __raw++; };
  buildStyleCoverageSummary = () => null; auditSubmission = () => ({});
`, ctx);
const get = (expr) => vm.runInContext(expr, ctx);
const WS_ID = get('WORKSHOP_SHEET_ID'), FE_ID = get('FESTIVAL_SHEET_ID'), SO_ID = get('SOCIAL_EVENT_SHEET_ID'), WE_ID = get('WEEKLY_CLASS_SHEET_ID');
const resetSheets = () => {
  SHEETS[WS_ID] = makeSheet(get('SUBMISSION_HEADERS')['workshop']);
  SHEETS[FE_ID] = makeSheet(get('SUBMISSION_HEADERS')['festival']);
  SHEETS[SO_ID] = makeSheet(get('SUBMISSION_HEADERS')['social-event']);
  SHEETS[WE_ID] = makeSheet(get('SUBMISSION_HEADERS')['weekly-class']);
  LOG = makeSheet(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)']);
  mails.length = 0; get('__raw = 0; __confirm = 0; __photoCalls = 0');
};
// Dates must be built INSIDE the vm: AppBridge uses `instanceof Date`, which is false across realms (not in Apps Script).
const vmDate = (...a) => get(`new Date(Date.UTC(${a.join(',')}))`);
const J = (o) => JSON.stringify(o);
const save = (data, type) => get(`saveToSheet(${J(data)}, '${type}')`);
const list = (submissionType) => get(`handleAppBridgeGetPendingSubmissions(${J({ key: 'sekret', submissionType })})`);

const WORKSHOP = {
  type: 'workshop', teacher_name: 'ZZ Teacher', email: 'zz@example.com', title: 'ZZ Workshop', format: 'single',
  styles: ['Bachata'], levels: ['Open'], capacity: '16', price_full: '45',
  sessions: [{ date: '2026-11-15', start: '14:00', end: '16:00', topic: 'Basics' }],
};
const FESTIVAL = {
  type: 'festival', teacher_name: 'Lut', email: 'lut@example.com', title: 'ZZ Festival', start_date: '2026-12-05', end_date: '2026-12-06',
  venue: 'Gent', pricing: [{ label: 'Pass', regular: '40' }],
};

console.log('\n1. workshop + festival dedup');
for (const [type, base, change] of [
  ['workshop', WORKSHOP, { price_full: '50' }],
  ['festival', FESTIVAL, { venue: 'Brussel' }],
]) {
  resetSheets();
  const sheet = SHEETS[type === 'workshop' ? WS_ID : FE_ID];
  ok(`${type}: first submit is created`, save(base, type) === 'created');
  ok(`${type}: identical double submit is 'duplicate', no second row`, save(base, type) === 'duplicate' && sheet._grid.length === 2, 'rows=' + sheet._grid.length);
  const r3 = save({ ...base, ...change }, type);
  ok(`${type}: changed resubmit is 'updated' in place, still ONE row`, r3 === 'updated' && sheet._grid.length === 2, r3 + ' rows=' + sheet._grid.length);
  const other = type === 'workshop' ? { ...base, sessions: [{ date: '2026-11-22', start: '14:00', end: '16:00' }] } : { ...base, start_date: '2027-01-09' };
  ok(`${type}: same name on another date is a new row`, save(other, type) === 'created' && sheet._grid.length === 3);
}

console.log('\n2. weekly classes are logged once');
{
  resetSheets();
  const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'forms/_tests/weekly-golden-payload.json'), 'utf8'));
  delete golden.testMode; delete golden._note;
  get('handleSubmit')(golden);
  ok('one weekly submission -> ONE Submissions Log row', LOG._grid.length === 2, 'rows=' + (LOG._grid.length - 1));
  ok('the __logged flag is not inside the logged JSON', !LOG._grid[1][4].includes('__logged'));
  resetSheets();
  get('handleGenerateOutputPackage')({ ...WORKSHOP });
  ok('a workshop is still logged once (flag absent)', LOG._grid.length === 2);
}

console.log('\n3. flattened fallback: time cells as HH:mm');
{
  resetSheets();
  const h = get('SUBMISSION_HEADERS')['social-event'];
  const row = h.map(() => '');
  const set = (name, v) => { row[h.indexOf(name)] = v; };
  set('Timestamp', '2026-10-12T10:00:00.000Z'); set('Organiser', 'Alex'); set('Email', 'a@example.com');
  set('Event Title', 'Night'); set('Date', '2026-11-13');
  set('Doors Open', vmDate(1899, 11, 30, 21, 0)); set('End Time', vmDate(1899, 11, 30, 1, 0));
  set('Early Bird Deadline', vmDate(2026, 10, 12, 0, 0));
  SHEETS[SO_ID].appendRow(row);
  const d = list('social-night').rows[0].data;
  ok('Doors Open Date cell -> "21:00"', d.doors === '21:00', d.doors);
  ok('End Time Date cell -> "01:00" (the proven refusal)', d.end === '01:00', d.end);
  ok('Early Bird Deadline Date cell -> "2026-11-12"', d.earlyDeadline === '2026-11-12', d.earlyDeadline);
  SHEETS[SO_ID]._grid[1][h.indexOf('End Time')] = '1:00';
  ok('plain text "1:00" -> "01:00"', list('social-night').rows[0].data.end === '01:00');
}

console.log('\n4. raw-mail fallback');
{
  resetSheets();
  get('handleGenerateOutputPackage')({ ...WORKSHOP });
  ok('normal submit: NO raw archive mail', get('__raw') === 0, 'raw=' + get('__raw'));
  resetSheets();
  SHEETS[WS_ID].failWrites = true;
  const res = get('handleGenerateOutputPackage')({ ...WORKSHOP });
  ok('sheet save fails: the raw mail (with the data) is sent exactly once', get('__raw') === 1, 'raw=' + get('__raw'));
  ok('sheet save fails: the form is told it failed', res.ok === false);
  ok('dead branch gone: no second raw mail path in output-generator.gs', !/if \(!data\.__rawEmailSent/.test(fs.readFileSync(path.join(ROOT, 'backend/output-generator.gs'), 'utf8')));
}

console.log('\n5. corrects');
{
  resetSheets();
  const sheet = SHEETS[WS_ID];
  save(WORKSHOP, 'workshop');
  const h = sheet._grid[0];
  const origTs = sheet._grid[1][h.indexOf('Timestamp')];
  const first = list('workshop').rows[0];
  ok('a fresh row has no corrects', first.corrects === '' && first.correctsId === '');
  const statusCol = h.indexOf('Review status');
  // approve it, then the teacher corrects it
  get(`handleAppBridgeMarkSubmissionProcessed(${J({ key: 'sekret', submissionType: 'workshop', id: first.id, status: 'approved', note: 'ok' })})`);
  save({ ...WORKSHOP, price_full: '55' }, 'workshop');
  const again = list('workshop').rows[0];
  ok('corrected row is pending again and carries corrects = the ORIGINAL Timestamp', again.corrects === origTs, again.corrects + ' vs ' + origTs);
  ok('correctsId equals the id the approved draft was made under', again.correctsId === first.id, again.correctsId + ' vs ' + first.id);
  ok('"Corrects" is a non-canonical column (header list unchanged)', !get('SUBMISSION_HEADERS')['workshop'].includes('Corrects'));
}

console.log('\n6. archive');
{
  resetSheets();
  const h = get('SUBMISSION_HEADERS')['workshop'];
  const mk = (ts, status) => { const r = h.map(() => ''); r[0] = ts; r[1] = 't'; if (status !== undefined) r[h.length] = status; return r; };
  const sheet = SHEETS[WS_ID];
  sheet._grid[0].push('Review status');
  sheet._grid.push(mk('2026-09-01T10:00:00.000Z', ''), mk('2026-10-11T23:59:00.000Z', 'pending'), mk('2026-10-12T00:00:00.000Z', ''),
                   mk('2026-08-01T10:00:00.000Z', 'approved — x'), mk('garbage', ''));
  const rep = get('archiveSubmissionsBefore_20261013')();
  const st = (i) => sheet._grid[i][h.length];
  ok('row before the cutoff (blank) archived', st(1) === 'rejected — archived before app, 2026-10-13', st(1));
  ok('row before the cutoff ("pending") archived', st(2) === 'rejected — archived before app, 2026-10-13');
  ok('row from 12 Oct 00:00 UTC (the Alex night) left alone', st(3) === '');
  ok('already approved row untouched', st(4) === 'approved — x');
  ok('unreadable Timestamp left alone', st(5) === '');
  ok('report states the counts', /workshop: archived 2 · already reviewed 1/.test(rep.join('\n')) && /no usable Timestamp \(left pending\) 1/.test(rep.join('\n')), rep.join(' | '));
  const rep2 = get('archiveSubmissionsBefore_20261013')();
  ok('second run is idempotent: archives 0', /workshop: archived 0 · already reviewed 3/.test(rep2.join('\n')), rep2.join(' | '));
  ok('archived rows no longer reach the bridge', list('workshop').rows.length === 2);
}

console.log('\n6b. dedup ignores rejected / archived rows')
{
  for (const [label, status] of [['rejected', 'rejected — too late'], ['archived', 'rejected — archived before app, 2026-10-13']]) {
    resetSheets();
    const sheet = SHEETS[WS_ID];
    save(WORKSHOP, 'workshop');
    const h = sheet._grid[0];
    sheet._grid[0].push('Review status'); sheet._grid[1][h.length - 1] = status;
    ok(`identical resubmission of a ${label} row creates a NEW row`, save(WORKSHOP, 'workshop') === 'created' && sheet._grid.length === 3, 'rows=' + sheet._grid.length);
  }
  resetSheets();
  const sheet = SHEETS[WS_ID];
  save(WORKSHOP, 'workshop');
  sheet._grid[0].push('Review status'); sheet._grid[1][sheet._grid[0].length - 1] = 'approved — ok';
  ok('an APPROVED row still suppresses an identical resubmission', save(WORKSHOP, 'workshop') === 'duplicate');
}

console.log('\n7. no Pending write on read; saved photos reach the bridge');
{
  resetSheets();
  const sheet = SHEETS[WS_ID];
  sheet._grid.push(sheet._grid[0].map(() => ''));
  list('workshop');
  const sc = sheet._grid[0].indexOf('Review status');
  ok('first read adds the column but writes no "Pending" into existing rows', sc >= 0 && (sheet._grid[1][sc] ?? '') === '', JSON.stringify(sheet._grid[1][sc]));
  resetSheets();
  const dj = { type: 'social-night', teacher_name: 'Alex', email: 'a@example.com', title: 'Night', date: '2026-11-13', doors: '21:00', end: '01:00',
    pricing: [{ label: 'Advance', price: '5' }], photos: [{ role: 'dj', label: 'DJ Kimo', filename: 'k.jpg', b64: 'AAAA' }] };
  get('handleGenerateOutputPackage')(dj);
  const row = list('social-night').rows[0];
  ok('saved photo Drive URL arrives as data.__savedPhotos', Array.isArray(row.data.__savedPhotos) && row.data.__savedPhotos[0].viewerUrl.includes('drive.google.com'), J(row.data.__savedPhotos));
  ok('no base64 in the bridge row', !J(row).includes('AAAA'));
}

console.log('\n' + (fail ? '✗' : '✓') + ' forms F0: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
