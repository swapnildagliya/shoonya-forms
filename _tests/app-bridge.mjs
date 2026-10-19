#!/usr/bin/env node
// Unit tests for backend/AppBridge.gs — the Shoonya Dance Centre App
// integration (GET getPendingSubmissions / POST markSubmissionProcessed).
//
// Run: node forms/_tests/app-bridge.mjs   (from the Event Submission dir)
//
// Same technique as forms/_tests/social-night-dedup.mjs: load the REAL
// backend/*.gs sources into a sandboxed Node `vm` context with mocked Apps
// Script globals (SpreadsheetApp / PropertiesService / etc.), then call the
// real handlers directly. No Apps Script runtime involved, nothing deployed.
//
// Covers (per the App Bridge contract):
//   T1 — id stability: same row -> same id across calls; different rows ->
//        different ids; organiser fallback when a row has no email.
//   T2 — review-status filter: blank/pending shown, Reviewed/Approved/
//        Rejected hidden, newest-first, case-insensitive 'pending'.
//   T3 — the three auth outcomes: Script Property unset -> 'bridge not
//        configured'; missing key -> 'unauthorised'; wrong key ->
//        'unauthorised'; correct key -> proceeds.
//   T4 — payload reconstruction from the "Submissions Log" raw JSON for a
//        real social-night shape (structured styles[]/pricing[]/programme[]
//        survive; the flattened sheet's summary strings do NOT leak through
//        when a raw-log match exists).
//   T5 — photo data is never returned: a `*_b64` key and a `photos[].b64`
//        field in the raw log are both replaced with a marker in the GET
//        response, while `photos[].name` (a filename) survives.
//   Bonus — POST markSubmissionProcessed round-trips against an id a GET
//        just produced (id + auth machinery is shared with GET, but the
//        write path itself is otherwise untested).
//
// 2026-09-17-app-bridge-2 — reviewer fixes:
//   T6  — P2-c: a nearest-timestamp raw-log match from a DIFFERENT event
//        (same organiser/type, close in time) is discarded — title+date must
//        match the sheet row, or the flattened fallback is used instead.
//   T7  — P2-f: the "Submissions Log" tab is read ONCE per request (counts
//        SpreadsheetApp.openById calls), not once per pending row.
//   T8  — P3-b: a Review status of "pending — note — time" still counts as
//        pending in the filter; full POST-then-GET round trip.
//   T9  — P3-c: photo stripping now runs at EVERY depth and also catches a
//        `data:` URI / base64-shaped string under any key name, not just a
//        `*_b64`-named key — nested `hero.b64`, `photo: "data:..."`, and
//        `photos[].data` are all caught; a long non-base64 prose string and
//        filenames are left alone.
//   T10 — P3-d: markSubmissionProcessed refuses with 'ambiguous id' when an
//        id matches more than one row, instead of silently stamping the first.
//   T11 — P3-a: GET getPendingSubmissions refuses without ever reading the
//        key; the new POST listPendingSubmissions carries the same contract;
//        the pre-existing POST getPendingSubmissions (old Phase-1 handler)
//        is untouched. Runs in its own vm context that also loads code.gs.
//
// 2026-09-17-app-bridge-3 — reviewer fixes (P1: the doPost default branch
// handed ANY body whose `data.type` named a submission type to handleSubmit,
// with no check on `action` — the App Bridge's own bodies have exactly that
// shape, so on a backend that hadn't learned the bridge action names yet,
// both fell straight through to handleSubmit -> logRawSubmission, which
// writes the WHOLE body — including `key`, the bridge secret — into the
// "Submissions Log" sheet):
//   T12 — submissionType/type: both bridge handlers read `submissionType`,
//        never `type`; a body carrying top-level `type` is refused with
//        {ok:false,error:'use submissionType'}, even when a valid
//        `submissionType` rides along with it.
//   T13 — bridge:3 is present on EVERY bridge response — success and every
//        refusal path (auth denied, legacy `type`, unknown type, not found,
//        id required, bad status).
//   T14 — markSubmissionProcessed refuses to overwrite a TERMINAL status
//        ('approved'/'rejected') with a DIFFERENT one; re-sending the SAME
//        status is still an idempotent success; a still-'pending' row is
//        unaffected by the guard.
//   T15 — the P1 fix itself: a bridge-shaped body (carries `key` and/or
//        `submissionType`, and/or a `type` naming a real submission type)
//        with an UNKNOWN action never reaches handleSubmit or
//        logRawSubmission (both stubbed, call counts asserted) — checked
//        against the CURRENT backend/code.gs. The exact same scenario is
//        then re-run against `git show HEAD:backend/code.gs` (the committed,
//        pre-fix source) as EVIDENCE that the old source fails it — that
//        second run is documentation, not a pass/fail gate on this suite.
//   T16 — real submission shapes copied from the actual forms (weekly-class's
//        `action:'submit'`, and the implicit-default no-`action` case) still
//        reach handleSubmit — the fix must not have broken the real path.
//
// 2026-10-18-teacher-profiles-1 (forms -> portal F1):
//   T22 — POST listTeacherProfiles: the Teachers sheet's public profile fields, found by HEADER NAME (columns shuffled on
//        purpose), never pin_hash / last_login / role, skips '@pending.shoonya' and role=admin rows, parses JSON and
//        comma lists, the photos[] cell and a legacy photo_url, 'yes' -> approved, bridge:3 on success AND on every
//        refusal (no secret configured / no key / wrong key).
//
// 2026-09-18-app-bridge-4 — THE GAP (two independent reviewers): a teacher
// correcting a submission AFTER the office approved/rejected it used to
// overwrite the row in place while it kept its terminal "Review status" — so
// it never resurfaced in this bridge's pending list, and the draft the app
// already created kept the OLD prices/times with nobody told. Fixed in
// SubmissionSheets.gs (saveToSheet / _reopenReviewStatusForCorrection), not
// here — AppBridge.gs's pending filter and terminal-status guard were already
// correct for a 'pending — ...' status and needed no change. bridge:3 is
// unchanged (the protocol didn't change), only BACKEND_VERSION bumped.
//   T17 — end to end through the REAL saveToSheet() AND the REAL
//        handleAppBridgeGetPendingSubmissions(): (A) a changed resubmit of an
//        APPROVED row reopens it to 'pending — corrected by the teacher on
//        <iso>; previously: approved — …' and it is listed again; (B) a
//        BYTE-IDENTICAL resubmit of an approved row leaves the status
//        untouched and the row stays unlisted (the suppressed-duplicate path
//        never reaches the reopen logic); (C) a changed resubmit of a row
//        that was NEVER reviewed (blank status) stays blank — no fake
//        "previously:" text.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

// ── Fake sheet — mirrors just enough of the SpreadsheetApp surface AppBridge
//    and TeacherAdmin's _ensureReviewStatusColumn touch. ────────────────────
function makeGrid(headers, rows) {
  const grid = [headers.slice()].concat(rows.map((r) => r.slice()));
  return {
    _grid: grid,
    written: [],
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
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
        setValue(v) {
          if (!grid[startRow - 1]) grid[startRow - 1] = [];
          grid[startRow - 1][startCol - 1] = v;
          self.written.push({ row: startRow, col: startCol, value: v });
        },
        setValues(vals) { grid[startRow - 1] = vals[0].slice(); },
        setBackground() { return this; },
        setFontColor() { return this; },
        setFontWeight() { return this; },
      };
    },
  };
}

// ── Sandbox state, swapped per test ─────────────────────────────────────────
let REVIEW_SHEET = makeGrid(['Timestamp'], []);
let TEACHERS_SHEET = makeGrid(['email'], []);
let LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);
let PROPS = {}; // Script Properties store
let SPREADSHEET_OPEN_CALLS = []; // every SpreadsheetApp.openById(id) call, in order — P2-f read-count check

const noop = () => {};
const ctx = vm.createContext({
  Logger: { log: noop }, console,
  SpreadsheetApp: {
    openById: (id) => {
      SPREADSHEET_OPEN_CALLS.push(id);
      return {
        getSheets: () => [REVIEW_SHEET],
        getSheetByName: (name) => (name === 'Submissions Log' ? LOG_SHEET : null),
      };
    },
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(PROPS, k) ? PROPS[k] : null),
      setProperty: noop,
    }),
  },
  DriveApp: {}, MailApp: { sendEmail: noop },
  Utilities: {
    formatDate: (d, _tz, fmt) => {
      const p = (n) => String(n).padStart(2, '0');
      if (fmt === 'HH:mm') return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    },
  },
  CacheService: {}, UrlFetchApp: {}, HtmlService: {}, ContentService: {},
  Session: { getScriptTimeZone: () => 'UTC' },
  jsonResponse: (o) => o,
  // _reviewSheetIdFor (TeacherAdmin.gs) reads these by name; our SpreadsheetApp
  // mock ignores the actual id, so the values just need to exist and differ.
  WEEKLY_CLASS_SHEET_ID: 'WEEKLY_ID', WORKSHOP_SHEET_ID: 'WORKSHOP_ID',
  SOCIAL_EVENT_SHEET_ID: 'SOCIAL_ID', FESTIVAL_SHEET_ID: 'FESTIVAL_ID',
  BACKEND_VERSION: 'test-version',
  // TeacherPortal.gs (not loaded here) owns the real one; T22 swaps TEACHERS_SHEET per test.
  getTeachersSheet: () => TEACHERS_SHEET,
});

// Load the REAL sources — TeacherAdmin.gs for _reviewSheetIdFor /
// _ensureReviewStatusColumn / REVIEW_STATUS_COLUMN, AppBridge.gs itself, and
// (2026-09-18-app-bridge-4, T17) SubmissionSheets.gs for saveToSheet /
// _reopenReviewStatusForCorrection — T17 proves the reopen-on-correction fix
// end to end: saveToSheet() writes the row, then the REAL
// handleAppBridgeGetPendingSubmissions() reads it back. code.gs is
// deliberately NOT loaded: its own `jsonResponse` calls the real
// ContentService (unmockable here) and would shadow the simple mock above —
// neither AppBridge.gs nor SubmissionSheets.gs needs anything from code.gs
// beyond the sheet-id constants and jsonResponse, both supplied directly in ctx.
for (const rel of ['backend/TeacherAdmin.gs', 'backend/AppBridge.gs', 'backend/BlockStudioServer.gs', 'backend/SubmissionSheets.gs']) {
  try {
    new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }).runInContext(ctx);
  } catch (err) {
    console.log('  ✗ could not load ' + rel + ' — ' + err.message);
    fail++;
  }
}

const call = (fnExpr) => vm.runInContext(fnExpr, ctx);

const SOCIAL_HEADERS = [
  'Timestamp', 'Organiser', 'Email', 'Event Title', 'Dance Style(s)', 'Date',
  'Doors Open', 'End Time', 'Dress Code', 'Programme', 'Pricing', 'Early Bird Deadline',
  'DJ(s)', 'Music Type', 'Note for Shoonya', 'Description', 'Photo Credit', 'Description Language',
  'Review status',
];
const col = (name) => SOCIAL_HEADERS.indexOf(name);

function socialRow({
  ts = '2026-09-01T10:00:00.000Z', organiser = 'ZZ QA Social Org', email = 'social@shoonya.example',
  title = 'ZZ QA Social', status = '',
} = {}) {
  const row = new Array(SOCIAL_HEADERS.length).fill('');
  row[col('Timestamp')] = ts;
  row[col('Organiser')] = organiser;
  row[col('Email')] = email;
  row[col('Event Title')] = title;
  row[col('Date')] = '2026-11-21';
  row[col('Review status')] = status;
  return row;
}

const GET = (type, key) => call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ submissionType: type, key })})`);
const POST = (payload) => call(`handleAppBridgeMarkSubmissionProcessed(${JSON.stringify(payload)})`);

// ============================================================================
console.log('\nT1 — id stability\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };

REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-01T10:00:00.000Z', email: 'a@shoonya.example' }),
]);
LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);

let r1 = GET('social-night', 'test-secret');
let r2 = GET('social-night', 'test-secret');
ok('same row -> same id across two separate calls',
  r1.ok && r2.ok && r1.rows[0].id === r2.rows[0].id, JSON.stringify([r1.rows?.[0]?.id, r2.rows?.[0]?.id]));
ok('id shape is <type>:<ISO timestamp>:<lower-cased email>',
  r1.rows[0].id === 'social-night:2026-09-01T10:00:00.000Z:a@shoonya.example', r1.rows[0].id);

REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-01T10:00:00.000Z', email: 'a@shoonya.example' }),
  socialRow({ ts: '2026-09-02T11:00:00.000Z', email: 'b@shoonya.example' }),
]);
let r3 = GET('social-night', 'test-secret');
ok('two different rows -> two different ids',
  r3.ok && r3.rows.length === 2 && r3.rows[0].id !== r3.rows[1].id,
  JSON.stringify(r3.rows?.map((x) => x.id)));

// Row with no Email must fall back to the organiser name, lower-cased.
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-03T09:00:00.000Z', email: '', organiser: 'ZZ QA Social Org' }),
]);
let r4 = GET('social-night', 'test-secret');
ok('no-email row falls back to lower-cased organiser in the id',
  r4.ok && r4.rows[0].id === 'social-night:2026-09-03T09:00:00.000Z:zz qa social org',
  r4.rows?.[0]?.id);

// ============================================================================
console.log('\nT2 — review-status filter\n');
// ============================================================================
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-01T10:00:00.000Z', email: 'blank@shoonya.example', status: '' }),
  socialRow({ ts: '2026-09-05T10:00:00.000Z', email: 'pending@shoonya.example', status: 'PENDING' }), // case-insensitive
  socialRow({ ts: '2026-09-10T10:00:00.000Z', email: 'approved@shoonya.example', status: 'approved' }),
  socialRow({ ts: '2026-09-11T10:00:00.000Z', email: 'rejected@shoonya.example', status: 'rejected — no capacity — 2026-09-12T00:00:00.000Z' }),
]);
let r5 = GET('social-night', 'test-secret');
ok('blank and (case-insensitive) pending rows are returned',
  r5.ok && r5.rows.length === 2, JSON.stringify(r5.rows?.map((x) => x.email)));
ok('approved/rejected rows are hidden',
  !r5.rows.some((x) => x.email.includes('approved')) && !r5.rows.some((x) => x.email.includes('rejected')),
  JSON.stringify(r5.rows?.map((x) => x.email)));
ok('newest first',
  r5.rows[0].email === 'pending@shoonya.example' && r5.rows[1].email === 'blank@shoonya.example',
  JSON.stringify(r5.rows?.map((x) => x.email)));

// ============================================================================
console.log('\nT3 — the three auth outcomes\n');
// ============================================================================
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [socialRow()]);

PROPS = {}; // APP_BRIDGE_SECRET unset entirely
let a1 = GET('social-night', 'anything');
ok("Script Property unset -> 'bridge not configured', never open",
  a1.ok === false && a1.error === 'bridge not configured', JSON.stringify(a1));

PROPS = { APP_BRIDGE_SECRET: 'the-real-secret' };
let a2 = GET('social-night', undefined);
ok("missing key -> 'unauthorised'", a2.ok === false && a2.error === 'unauthorised', JSON.stringify(a2));

let a3 = GET('social-night', 'totally-wrong-key');
ok("wrong key -> 'unauthorised'", a3.ok === false && a3.error === 'unauthorised', JSON.stringify(a3));

let a4 = GET('social-night', 'the-real-secret');
ok('correct key -> proceeds (ok:true)', a4.ok === true, JSON.stringify(a4));

// POST shares the same _appBridgeAuth gate — spot-check it isn't bypassed there.
PROPS = {};
let a5 = POST({ submissionType: 'social-night', id: 'x', status: 'approved', key: 'whatever' });
ok("POST also refuses when the property is unset", a5.ok === false && a5.error === 'bridge not configured', JSON.stringify(a5));

// ============================================================================
console.log('\nT4 — payload reconstruction from the raw Submissions Log (real social-night shape)\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };

const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'forms/_tests/social-golden-payload.json'), 'utf8'));
// GOLDEN is the exact structured payload the social-night form POSTs — the
// same shape logRawSubmission() writes into the "Submissions Log" JSON column.
const RAW_TS = '2026-11-01T08:00:00.000Z';

REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  // The flattened sheet only ever gets SUMMARY strings for programme/pricing —
  // deliberately different text from the structured raw payload, so a test
  // that reads structured data.programme/data.pricing PROVES the raw-log path
  // ran rather than the flattened fallback.
  (() => {
    const row = socialRow({ ts: RAW_TS, email: GOLDEN.email, title: GOLDEN.title });
    row[col('Programme')] = 'FLATTENED SUMMARY — should not appear as data.programme';
    row[col('Pricing')] = 'FLATTENED SUMMARY — should not appear as data.pricing';
    return row;
  })(),
]);
LOG_SHEET = makeGrid(
  ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
  [[RAW_TS, 'social-night', GOLDEN.teacher_name, GOLDEN.email, JSON.stringify(GOLDEN)]],
);

let r6 = GET('social-night', 'test-secret');
ok('GET succeeds and returns the row', r6.ok && r6.rows.length === 1, JSON.stringify(r6));
const d6 = r6.rows[0]?.data || {};
ok('data.styles[] is the original ARRAY, not a flattened string',
  Array.isArray(d6.styles) && JSON.stringify(d6.styles) === JSON.stringify(GOLDEN.styles), JSON.stringify(d6.styles));
ok('data.pricing[] is the original [{label,price}] structure',
  Array.isArray(d6.pricing) && d6.pricing[0]?.label === 'Advance' && d6.pricing[0]?.price === 8, JSON.stringify(d6.pricing));
ok('data.programme[] is the original structured array (raw-log path, not the flattened summary)',
  Array.isArray(d6.programme) && d6.programme[0]?.topic === 'ZZ QA other slot description', JSON.stringify(d6.programme));
ok('data.genres[] survived from the raw log',
  Array.isArray(d6.genres) && d6.genres.join(',') === 'Bachata,Salsa', JSON.stringify(d6.genres));
ok('data.dnStart / data.dnEnd (social-night-specific fields) survived',
  d6.dnStart === '22:30' && d6.dnEnd === '02:00', JSON.stringify([d6.dnStart, d6.dnEnd]));
ok('data.teacher_name is present (contract field for social-night)', d6.teacher_name === GOLDEN.teacher_name, d6.teacher_name);

// ============================================================================
console.log('\nT5 — photo data is never returned\n');
// ============================================================================
const PAYLOAD_WITH_PHOTOS = {
  ...GOLDEN,
  guest_photo_b64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==', // must be stripped entirely
  photos: [
    { name: 'flyer.jpg', b64: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==' }, // b64 stripped, name kept
  ],
};
const RAW_TS_2 = '2026-11-02T08:00:00.000Z';
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [socialRow({ ts: RAW_TS_2, email: GOLDEN.email, title: GOLDEN.title })]);
LOG_SHEET = makeGrid(
  ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
  [[RAW_TS_2, 'social-night', GOLDEN.teacher_name, GOLDEN.email, JSON.stringify(PAYLOAD_WITH_PHOTOS)]],
);
let r7 = GET('social-night', 'test-secret');
const d7 = r7.rows[0]?.data || {};
const asJson = JSON.stringify(r7);
// P3-c (2026-09-17-app-bridge-2): a stripped key is now REPLACED with a short
// marker ("[photo data removed]") rather than deleted outright, so the App
// can tell "this field was scrubbed" apart from "this field was never sent" —
// the raw bytes are gone from the response either way (see the last check).
ok('`*_b64` key is replaced with the photo-removed marker, never the raw bytes',
  d7.guest_photo_b64 === '[photo data removed]', JSON.stringify(d7.guest_photo_b64));
ok('photos[].b64 is replaced with the photo-removed marker', !d7.photos || d7.photos.every((p) => p.b64 === '[photo data removed]'), JSON.stringify(d7.photos));
ok('photos[].name (a filename) survives — filenames are fine per the contract',
  Array.isArray(d7.photos) && d7.photos[0]?.name === 'flyer.jpg', JSON.stringify(d7.photos));
ok('no raw base64 bytes anywhere in the serialized response',
  !asJson.includes('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') &&
  !asJson.includes('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'),
  'response leaked base64 photo bytes');

// ============================================================================
console.log('\nBonus — POST markSubmissionProcessed round-trips a GET-produced id\n');
// ============================================================================
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-20T10:00:00.000Z', email: 'roundtrip@shoonya.example', status: '' }),
]);
let g8 = GET('social-night', 'test-secret');
const id8 = g8.rows[0]?.id;
let p8 = POST({ submissionType: 'social-night', id: id8, status: 'approved', note: 'looks good', key: 'test-secret' });
ok('marking a real GET-produced id succeeds', p8.ok === true, JSON.stringify(p8));
ok('reviewStatus is "status — note — ISOtime"',
  /^approved — looks good — \d{4}-\d{2}-\d{2}T/.test(p8.reviewStatus || ''), p8.reviewStatus);
let g9 = GET('social-night', 'test-secret');
ok('the row no longer shows up as pending after being approved', g9.ok && g9.rows.length === 0, JSON.stringify(g9.rows));

let p9 = POST({ submissionType: 'social-night', id: 'social-night:1970-01-01T00:00:00.000Z:nobody@nowhere.example', status: 'approved', key: 'test-secret' });
ok("unknown id -> { ok:false, error:'not found' }", p9.ok === false && p9.error === 'not found', JSON.stringify(p9));

// ============================================================================
console.log('\nT6 — P2-c: a raw-log match must be the SAME event as the sheet row, or it is discarded\n');
// ============================================================================
// Reproduces the exact failure the reviewer proved: same organiser logs night
// A at 10:00, submits night B at 10:04, B's OWN log write fails (logRawSubmission
// is non-blocking — code.gs calls it in a try/catch that only Logger.logs on
// failure). The bridge must not attribute A's raw payload to B's sheet row just
// because A is the nearest-in-time log entry for the same organiser/type.
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };

const NIGHT_A_RAW = { ...GOLDEN, title: 'ZZ QA Night A', event_title: 'ZZ QA Night A', date: '2026-10-02', dnStart: '19:00', dnEnd: '21:00' };
const NIGHT_A_TS = '2026-09-01T10:00:00.000Z';
const NIGHT_B_TS = '2026-09-01T10:04:00.000Z'; // 4 minutes later — inside the 10-minute matching window

// The sheet only has Night B's flattened row — Night B's own raw log write "failed".
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  (() => {
    const row = socialRow({ ts: NIGHT_B_TS, email: GOLDEN.email, organiser: GOLDEN.teacher_name, title: 'ZZ QA Night B' });
    row[col('Date')] = '2026-11-06';
    row[col('Programme')] = 'FLATTENED SUMMARY — Night B — should be the fallback used';
    return row;
  })(),
]);
// The log only has Night A — same organiser/email, same type, 4 minutes earlier.
LOG_SHEET = makeGrid(
  ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
  [[NIGHT_A_TS, 'social-night', GOLDEN.teacher_name, GOLDEN.email, JSON.stringify(NIGHT_A_RAW)]],
);

let r10 = GET('social-night', 'test-secret');
ok("GET still returns Night B's sheet row", r10.ok && r10.rows.length === 1, JSON.stringify(r10));
const d10 = r10.rows[0]?.data || {};
ok("the outer title/date are Night B's own sheet values",
  r10.rows[0]?.title === 'ZZ QA Night B' && r10.rows[0]?.date === '2026-11-06',
  JSON.stringify([r10.rows[0]?.title, r10.rows[0]?.date]));
ok("data does NOT contain Night A's title (the P2-c bug: a wrong raw-log match overwrote it)",
  d10.title !== 'ZZ QA Night A' && d10.event_title !== 'ZZ QA Night A', JSON.stringify([d10.title, d10.event_title]));
ok("data does NOT carry Night A-only structured fields (proves the wrong match was discarded, not merged)",
  d10.dnStart === undefined && d10.dnEnd === undefined, JSON.stringify([d10.dnStart, d10.dnEnd]));
ok("data fell back to the FLATTENED reconstruction (Night B's own summary), not Night A's raw JSON",
  d10.programme_summary === 'FLATTENED SUMMARY — Night B — should be the fallback used', d10.programme_summary);

// ============================================================================
console.log('\nT7 — P2-f: the Submissions Log is read ONCE per request, not once per pending row\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-05T09:00:00.000Z', email: 'p2f-a@shoonya.example' }),
  socialRow({ ts: '2026-09-05T09:05:00.000Z', email: 'p2f-b@shoonya.example' }),
  socialRow({ ts: '2026-09-05T09:10:00.000Z', email: 'p2f-c@shoonya.example' }),
  socialRow({ ts: '2026-09-05T09:15:00.000Z', email: 'p2f-d@shoonya.example' }),
]);
LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []); // empty — every row still consults the log
SPREADSHEET_OPEN_CALLS = [];
let r11 = GET('social-night', 'test-secret');
ok('GET succeeds for all 4 pending rows', r11.ok && r11.rows.length === 4, JSON.stringify(r11.rows?.length));
const weeklyOpens = SPREADSHEET_OPEN_CALLS.filter((id) => id === 'WEEKLY_ID').length;
ok('the Submissions Log spreadsheet was opened exactly ONCE for 4 pending rows, not 4 times (pre-fix behaviour)',
  weeklyOpens === 1, 'opened ' + weeklyOpens + ' times — calls: ' + JSON.stringify(SPREADSHEET_OPEN_CALLS));

// ============================================================================
console.log("\nT8 — P3-b: a 'pending' status with a note must still count as pending\n");
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-06T10:00:00.000Z', email: 'p3b-note@shoonya.example', status: 'pending — waiting on capacity — 2026-09-06T10:05:00.000Z' }),
  socialRow({ ts: '2026-09-06T11:00:00.000Z', email: 'p3b-blank@shoonya.example', status: '' }),
  socialRow({ ts: '2026-09-06T12:00:00.000Z', email: 'p3b-approved@shoonya.example', status: 'approved — fine — 2026-09-06T12:05:00.000Z' }),
]);
let r12 = GET('social-night', 'test-secret');
ok("a 'pending — note — time' row is still returned as pending (the P3-b bug)",
  r12.ok && r12.rows.some((x) => x.email === 'p3b-note@shoonya.example'), JSON.stringify(r12.rows?.map((x) => x.email)));
ok("an 'approved — note — time' row is still excluded",
  !r12.rows.some((x) => x.email === 'p3b-approved@shoonya.example'), JSON.stringify(r12.rows?.map((x) => x.email)));
ok('exactly the blank + pending-with-note rows come back (2 of 3)', r12.ok && r12.rows.length === 2, JSON.stringify(r12.rows?.length));

// Round trip: POST status:'pending' WITH a note, then GET again — the row must not drop out.
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-07T10:00:00.000Z', email: 'p3b-roundtrip@shoonya.example', status: '' }),
]);
let g13 = GET('social-night', 'test-secret');
const id13 = g13.rows[0]?.id;
let p13 = POST({ submissionType: 'social-night', id: id13, status: 'pending', note: 'still checking capacity', key: 'test-secret' });
ok('marking pending-with-a-note succeeds', p13.ok === true, JSON.stringify(p13));
ok('reviewStatus written as "pending — note — ISOtime"',
  /^pending — still checking capacity — \d{4}-\d{2}-\d{2}T/.test(p13.reviewStatus || ''), p13.reviewStatus);
let g14 = GET('social-night', 'test-secret');
ok('the row STILL shows up as pending after the note round-trip',
  g14.ok && g14.rows.length === 1 && g14.rows[0].id === id13, JSON.stringify(g14.rows));

// ============================================================================
console.log('\nT9 — P3-c: photo data stripped at EVERY depth, not just top-level *_b64 / photos[].b64\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
const LONG_PROSE = 'This is a perfectly normal, fairly long class description with spaces and punctuation. '.repeat(30); // >2000 chars, NOT base64-shaped
ok('sanity: the prose fixture actually exceeds 2000 chars', LONG_PROSE.length > 2000, LONG_PROSE.length);
const DEEP_PHOTO_PAYLOAD = {
  ...GOLDEN,
  hero: { b64: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==', name: 'hero.jpg' }, // nested bare "b64" key — no underscore prefix
  photo: 'data:image/png;base64,DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', // data: URI under an unrelated key name
  photos: [
    { name: 'poster.jpg', data: 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE==' }, // photos[].data, not .b64
  ],
  description: LONG_PROSE, // must survive untouched
};
const RAW_TS_9 = '2026-11-03T08:00:00.000Z';
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [socialRow({ ts: RAW_TS_9, email: GOLDEN.email, title: GOLDEN.title })]);
LOG_SHEET = makeGrid(
  ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
  [[RAW_TS_9, 'social-night', GOLDEN.teacher_name, GOLDEN.email, JSON.stringify(DEEP_PHOTO_PAYLOAD)]],
);
let r15 = GET('social-night', 'test-secret');
const d15 = r15.rows[0]?.data || {};
ok('nested hero.b64 (no underscore prefix) is stripped', d15.hero?.b64 === '[photo data removed]', JSON.stringify(d15.hero));
ok('hero.name (a filename) survives', d15.hero?.name === 'hero.jpg', JSON.stringify(d15.hero));
ok('a data: URI under an unrelated key ("photo") is stripped', d15.photo === '[photo data removed]', d15.photo);
ok('photos[].data is stripped', d15.photos?.[0]?.data === '[photo data removed]', JSON.stringify(d15.photos));
ok('photos[].name (a filename) survives', d15.photos?.[0]?.name === 'poster.jpg', JSON.stringify(d15.photos));
ok('a long but non-base64-shaped prose string is NOT stripped', d15.description === LONG_PROSE, (d15.description || '').slice(0, 60));
const asJson15 = JSON.stringify(r15);
ok('none of the raw photo blobs leak anywhere in the serialized response',
  !asJson15.includes('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC') &&
  !asJson15.includes('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD') &&
  !asJson15.includes('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'),
  'response leaked base64 photo bytes');

// ============================================================================
console.log('\nT10 — P3-d: markSubmissionProcessed refuses when an id matches more than one row\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
const COLLIDE_TS = '2026-09-08T10:00:00.000Z';
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: COLLIDE_TS, email: 'collide@shoonya.example', title: 'ZZ QA Collision Row 1' }),
  socialRow({ ts: COLLIDE_TS, email: 'collide@shoonya.example', title: 'ZZ QA Collision Row 2' }),
]);
const collideId = 'social-night:' + COLLIDE_TS + ':collide@shoonya.example';
let p14 = POST({ submissionType: 'social-night', id: collideId, status: 'approved', key: 'test-secret' });
ok("ambiguous id -> { ok:false, error:'ambiguous id' }, NOT silently stamping the first row",
  p14.ok === false && p14.error === 'ambiguous id', JSON.stringify(p14));
let r16 = GET('social-night', 'test-secret');
ok('neither colliding row was written to — both still show up as pending',
  r16.ok && r16.rows.length === 2, JSON.stringify(r16.rows?.map((x) => x.reviewStatus)));

// ============================================================================
console.log('\nT11 — P3-a: the list endpoint moved from GET to POST (the secret must never travel in a URL)\n');
// ============================================================================
// Needs code.gs itself (the doGet/doPost routing switches), which the ctx
// above deliberately does NOT load — code.gs's OWN jsonResponse really calls
// ContentService, which would shadow the simple `(o) => o` mock every other
// test in this file relies on. Build a SEPARATE, independent vm context that
// loads TeacherAdmin.gs + AppBridge.gs + the REAL code.gs, with ContentService
// properly mocked so code.gs's jsonResponse works as itself.
let PROPS_RT = {};
const ctxRouting = vm.createContext({
  Logger: { log: noop }, console,
  SpreadsheetApp: {
    openById: () => ({
      getSheets: () => [REVIEW_SHEET],
      getSheetByName: (name) => (name === 'Submissions Log' ? LOG_SHEET : null),
    }),
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(PROPS_RT, k) ? PROPS_RT[k] : null),
      setProperty: noop,
    }),
  },
  DriveApp: {}, MailApp: { sendEmail: noop },
  Utilities: {
    formatDate: (d, _tz, fmt) => {
      const p = (n) => String(n).padStart(2, '0');
      if (fmt === 'HH:mm') return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    },
  },
  CacheService: {}, UrlFetchApp: {}, HtmlService: {},
  // Real ContentService mock — code.gs's OWN jsonResponse calls this for real,
  // unlike the plain `(o) => o` passthrough the rest of this file uses.
  ContentService: {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (text) => ({
      _text: text,
      setMimeType() { return this; },
      getContent() { return this._text; },
    }),
  },
  Session: { getScriptTimeZone: () => 'UTC' },
  // Deliberately NOT predefining WEEKLY_CLASS_SHEET_ID / BACKEND_VERSION /
  // jsonResponse here: code.gs declares every one of those itself as a
  // top-level `const`/`function`, and Node's vm throws a redeclaration
  // SyntaxError if a sandbox property of the same name already exists when
  // that line runs.
});

let routingLoadFailed = false;
for (const rel of ['backend/TeacherAdmin.gs', 'backend/AppBridge.gs', 'backend/code.gs']) {
  try {
    new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }).runInContext(ctxRouting);
  } catch (err) {
    routingLoadFailed = true;
    console.log('  ✗ could not load ' + rel + ' into the routing context — ' + err.message);
    fail++;
  }
}

const callRouting = (fnExpr) => vm.runInContext(fnExpr, ctxRouting);
const parseCS = (r) => JSON.parse(r.getContent());
const GETroute = (paramsObj) => parseCS(callRouting(`doGetSubmissions(${JSON.stringify({ parameter: paramsObj })})`));
const POSTroute = (bodyObj) => parseCS(callRouting(`doPost(${JSON.stringify({ postData: { contents: JSON.stringify(bodyObj) } })})`));

if (!routingLoadFailed) {
  // GET is closed — and must refuse WITHOUT reading the key at all. Proven by
  // leaving APP_BRIDGE_SECRET unset: if the GET case still called the App
  // Bridge's auth gate internally, an unset secret would answer 'bridge not
  // configured' instead of the fixed refusal below.
  PROPS_RT = {};
  const rGet1 = GETroute({ action: 'getPendingSubmissions', type: 'social-night', key: 'anything' });
  ok('GET getPendingSubmissions refuses with the fixed message even with APP_BRIDGE_SECRET unset (proves it never reads the key)',
    rGet1.ok === false && rGet1.error === 'use POST listPendingSubmissions', JSON.stringify(rGet1));

  PROPS_RT = { APP_BRIDGE_SECRET: 'routing-secret' };
  const rGet2 = GETroute({ action: 'getPendingSubmissions', type: 'social-night', key: 'routing-secret' });
  ok('GET getPendingSubmissions refuses the same way even with the CORRECT key',
    rGet2.ok === false && rGet2.error === 'use POST listPendingSubmissions', JSON.stringify(rGet2));

  // POST listPendingSubmissions is the new contract — same auth, same shape
  // the GET used to have.
  REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
    socialRow({ ts: '2026-09-09T10:00:00.000Z', email: 'routing@shoonya.example', status: '' }),
  ]);
  LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);
  const rList = POSTroute({ action: 'listPendingSubmissions', submissionType: 'social-night', key: 'routing-secret' });
  ok('POST listPendingSubmissions succeeds with the correct key and returns the pending row',
    rList.ok === true && rList.rows?.length === 1 && rList.rows[0].email === 'routing@shoonya.example', JSON.stringify(rList));

  const rListBadKey = POSTroute({ action: 'listPendingSubmissions', submissionType: 'social-night', key: 'wrong' });
  ok("POST listPendingSubmissions still enforces auth ('unauthorised' on a wrong key)",
    rListBadKey.ok === false && rListBadKey.error === 'unauthorised', JSON.stringify(rListBadKey));

  // The PRE-EXISTING POST 'getPendingSubmissions' case (old Phase-1 handler,
  // ADMIN_PANEL_SECRET auth) must be completely untouched — different action
  // name, different auth, still reachable, never confused with the new one.
  const rOldPost = POSTroute({ action: 'getPendingSubmissions', type: 'workshop', secret: 'not-the-right-admin-secret' });
  ok("the pre-existing POST 'getPendingSubmissions' case still routes to the OLD handler (rejects on ADMIN_PANEL_SECRET, unrelated to APP_BRIDGE_SECRET)",
    rOldPost.ok === false && rOldPost.error === 'Unauthorized', JSON.stringify(rOldPost));
}

// ============================================================================
console.log('\nSABOTAGE — prove T6-T11 actually depend on their fix (not vacuously green)\n');
// ============================================================================
// Per-project convention ("Prove the check can fail"): re-run each fix's
// scenario against an IN-MEMORY copy of the source with THAT ONE fix's code
// reverted to its pre-2026-09-17-app-bridge-2 form, and confirm the old bug
// reappears. The real .gs files on disk are never touched — only the string
// read into memory here (via fs.readFileSync, mutated with .replace()) is.
// If a `needle` below isn't found, the corresponding real source has drifted
// since this was written; mustReplace() fails loudly instead of silently
// sabotaging nothing (which would make a "proof" pass without proving anything).
const APPBRIDGE_SRC = fs.readFileSync(path.join(ROOT, 'backend/AppBridge.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'backend/code.gs'), 'utf8');

function mustReplace(src, needle, replacement, label) {
  if (!src.includes(needle)) {
    fail++;
    console.log('  ✗ sabotage setup failed for ' + label + " — expected text not found in source (it has drifted since this test was written)");
    return null;
  }
  return src.replace(needle, replacement);
}

// A fresh vm context, wired exactly like the main `ctx` above (same mocks,
// closing over the same REVIEW_SHEET/LOG_SHEET/PROPS/SPREADSHEET_OPEN_CALLS),
// but loading whatever AppBridge.gs source TEXT is handed to it.
function loadAppBridgeVariant(appBridgeSrc) {
  const c = vm.createContext({
    Logger: { log: noop }, console,
    SpreadsheetApp: {
      openById: (id) => {
        SPREADSHEET_OPEN_CALLS.push(id);
        return {
          getSheets: () => [REVIEW_SHEET],
          getSheetByName: (name) => (name === 'Submissions Log' ? LOG_SHEET : null),
        };
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(PROPS, k) ? PROPS[k] : null),
        setProperty: noop,
      }),
    },
    DriveApp: {}, MailApp: { sendEmail: noop },
    Utilities: {
      formatDate: (d, _tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        if (fmt === 'HH:mm') return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
        return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
      },
    },
    CacheService: {}, UrlFetchApp: {}, HtmlService: {}, ContentService: {},
    Session: { getScriptTimeZone: () => 'UTC' },
    jsonResponse: (o) => o,
    WEEKLY_CLASS_SHEET_ID: 'WEEKLY_ID', WORKSHOP_SHEET_ID: 'WORKSHOP_ID',
    SOCIAL_EVENT_SHEET_ID: 'SOCIAL_ID', FESTIVAL_SHEET_ID: 'FESTIVAL_ID',
    BACKEND_VERSION: 'test-version',
  });
  new vm.Script(fs.readFileSync(path.join(ROOT, 'backend/TeacherAdmin.gs'), 'utf8'), { filename: 'backend/TeacherAdmin.gs' }).runInContext(c);
  new vm.Script(appBridgeSrc, { filename: 'backend/AppBridge.gs (sabotaged)' }).runInContext(c);
  return c;
}
const inCtx = (c, fnExpr) => vm.runInContext(fnExpr, c);
const GETin = (c, type, key) => inCtx(c, `handleAppBridgeGetPendingSubmissions(${JSON.stringify({ submissionType: type, key })})`);

// --- sabotage T6 (P2-c): drop the title/date guard on a raw-log match ------
{
  const needle = `    // P2-c guard — see the doc comment above.
    if (sheetTitle !== undefined && sheetDate !== undefined) {
      var rawTitleKey = _appBridgeNormText(_appBridgeRawTitle(parsed));
      var wantTitleKey = _appBridgeNormText(sheetTitle);
      var rawDateKey  = _appBridgeCellToDateStr(_appBridgeRawDate(parsed)).trim();
      var wantDateKey = String(sheetDate == null ? '' : sheetDate).trim();
      if (rawTitleKey !== wantTitleKey || rawDateKey !== wantDateKey) {
        return null; // wrong event — discard; caller falls back to the flattened reconstruction
      }
    }
`;
  const sabotaged = mustReplace(APPBRIDGE_SRC, needle, '', 'T6/P2-c');
  if (sabotaged) {
    PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
    REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
      (() => {
        const row = socialRow({ ts: NIGHT_B_TS, email: GOLDEN.email, organiser: GOLDEN.teacher_name, title: 'ZZ QA Night B' });
        row[col('Date')] = '2026-11-06';
        return row;
      })(),
    ]);
    LOG_SHEET = makeGrid(
      ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
      [[NIGHT_A_TS, 'social-night', GOLDEN.teacher_name, GOLDEN.email, JSON.stringify(NIGHT_A_RAW)]],
    );
    const rSab = GETin(loadAppBridgeVariant(sabotaged), 'social-night', 'test-secret');
    ok("sabotage proves T6: WITHOUT the P2-c guard, Night B's response comes back contaminated with Night A's title",
      rSab.ok && rSab.rows[0]?.data?.title === 'ZZ QA Night A',
      'expected the pre-fix bug to reappear — got: ' + JSON.stringify(rSab.rows?.[0]?.data?.title));
  }
}

// --- sabotage T7 (P2-f): move the log load back inside the per-row loop ----
{
  const needle = `    // P2-f: read the "Submissions Log" tab ONCE for the whole request, not
    // once per pending row — see _appBridgeLoadSubmissionsLog's doc comment.
    var logRows = _appBridgeLoadSubmissionsLog();

    var out = [];
    for (var i = 1; i < grid.length; i++) {
      var raw = grid[i];`;
  const replacement = `    var out = [];
    for (var i = 1; i < grid.length; i++) {
      var raw = grid[i];
      var logRows = _appBridgeLoadSubmissionsLog(); // sabotaged: back to a per-row read`;
  const sabotaged = mustReplace(APPBRIDGE_SRC, needle, replacement, 'T7/P2-f');
  if (sabotaged) {
    PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
    REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
      socialRow({ ts: '2026-09-05T09:00:00.000Z', email: 'sab-a@shoonya.example' }),
      socialRow({ ts: '2026-09-05T09:05:00.000Z', email: 'sab-b@shoonya.example' }),
      socialRow({ ts: '2026-09-05T09:10:00.000Z', email: 'sab-c@shoonya.example' }),
    ]);
    LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);
    SPREADSHEET_OPEN_CALLS = [];
    GETin(loadAppBridgeVariant(sabotaged), 'social-night', 'test-secret');
    const opens = SPREADSHEET_OPEN_CALLS.filter((id) => id === 'WEEKLY_ID').length;
    ok('sabotage proves T7: WITHOUT the once-per-request load, 3 pending rows reopen the log 3 times',
      opens === 3, 'expected 3 (one per row) — got ' + opens);
  }
}

// --- sabotage T8 (P3-b): revert the pending filter to an exact-match check -
{
  const needle = `      var statusFirstToken = status.split(' — ')[0].trim().toLowerCase();
      var isPending = status === '' || statusFirstToken === 'pending';`;
  const replacement = `      var isPending = status === '' || status.toLowerCase() === 'pending'; // sabotaged: exact match again`;
  const sabotaged = mustReplace(APPBRIDGE_SRC, needle, replacement, 'T8/P3-b');
  if (sabotaged) {
    PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
    REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
      socialRow({ ts: '2026-09-06T10:00:00.000Z', email: 'sab-note@shoonya.example', status: 'pending — waiting on capacity — 2026-09-06T10:05:00.000Z' }),
    ]);
    const rSab = GETin(loadAppBridgeVariant(sabotaged), 'social-night', 'test-secret');
    ok('sabotage proves T8: WITHOUT the first-token filter, a \'pending — note — time\' row drops off the pending list',
      rSab.ok && rSab.rows.length === 0, 'expected 0 rows (the bug) — got ' + JSON.stringify(rSab.rows?.map((x) => x.email)));
  }
}

// --- sabotage T9 (P3-c): revert photo stripping to the old shallow version -
{
  const needle = `function _appBridgeStripPhotoData(node, inPhotosArray) {
  if (Array.isArray(node)) {
    return node.map(function(item) { return _appBridgeStripPhotoData(item, inPhotosArray); });
  }
  if (node && typeof node === 'object') {
    var out = {};
    Object.keys(node).forEach(function(k) {
      if (APP_BRIDGE_B64_KEY_RE.test(k)) { out[k] = APP_BRIDGE_PHOTO_MARKER; return; } // drop raw base64 blobs entirely, any depth
      if (k === 'data' && inPhotosArray) { out[k] = APP_BRIDGE_PHOTO_MARKER; return; } // photos[].data
      var v = node[k];
      if (v && typeof v === 'object') {
        var childIsPhotosArray = Array.isArray(v) && /photo/i.test(k);
        out[k] = _appBridgeStripPhotoData(v, childIsPhotosArray);
        return;
      }
      out[k] = _appBridgeLooksLikePhotoString(v) ? APP_BRIDGE_PHOTO_MARKER : v;
    });
    return out;
  }
  return _appBridgeLooksLikePhotoString(node) ? APP_BRIDGE_PHOTO_MARKER : node;
}`;
  const replacement = `function _appBridgeStripPhotoData(obj) {
  if (Array.isArray(obj)) {
    return obj.map(function(v) { return _appBridgeStripPhotoData(v); });
  }
  if (!obj || typeof obj !== 'object') return obj;
  var out = {};
  Object.keys(obj).forEach(function(k) {
    if (/_b64$/i.test(k)) return; // sabotaged: old shallow key-name-only stripping
    var v = obj[k];
    if (k === 'photos' && Array.isArray(v)) {
      out[k] = v.map(function(p) {
        if (!p || typeof p !== 'object') return p;
        var copy = {};
        Object.keys(p).forEach(function(pk) {
          if (pk === 'b64') return;
          copy[pk] = p[pk];
        });
        return copy;
      });
      return;
    }
    out[k] = (v && typeof v === 'object') ? _appBridgeStripPhotoData(v) : v;
  });
  return out;
}`;
  const sabotaged = mustReplace(APPBRIDGE_SRC, needle, replacement, 'T9/P3-c');
  if (sabotaged) {
    PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
    const DEEP_PHOTO_PAYLOAD_SAB = {
      ...GOLDEN,
      hero: { b64: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==', name: 'hero.jpg' },
      photo: 'data:image/png;base64,DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      photos: [{ name: 'poster.jpg', data: 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE==' }],
    };
    const rawTs = '2026-11-03T08:00:00.000Z';
    REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [socialRow({ ts: rawTs, email: GOLDEN.email, title: GOLDEN.title })]);
    LOG_SHEET = makeGrid(
      ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
      [[rawTs, 'social-night', GOLDEN.teacher_name, GOLDEN.email, JSON.stringify(DEEP_PHOTO_PAYLOAD_SAB)]],
    );
    const rSab = GETin(loadAppBridgeVariant(sabotaged), 'social-night', 'test-secret');
    const dSab = rSab.rows?.[0]?.data || {};
    ok("sabotage proves T9: WITHOUT the every-depth strip, nested hero.b64 leaks raw bytes",
      dSab.hero?.b64 === 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==', JSON.stringify(dSab.hero));
    ok("sabotage proves T9: WITHOUT the value-shape check, a data: URI under an unrelated key ('photo') leaks",
      typeof dSab.photo === 'string' && dSab.photo.startsWith('data:'), dSab.photo);
    ok('sabotage proves T9: WITHOUT the photos-array data check, photos[].data leaks',
      dSab.photos?.[0]?.data === 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE==', JSON.stringify(dSab.photos));
  }
}

// --- sabotage T10 (P3-d): revert to write-on-first-match ------------------
{
  const needle = `    if (matches.length === 0) return _appBridgeJson({ ok: false, error: 'not found' });
    if (matches.length > 1) return _appBridgeJson({ ok: false, error: 'ambiguous id' });`;
  const replacement = `    if (matches.length === 0) return _appBridgeJson({ ok: false, error: 'not found' });
    // sabotaged: ambiguous-id check removed — matches[0] (the FIRST match) is used silently below`;
  const sabotaged = mustReplace(APPBRIDGE_SRC, needle, replacement, 'T10/P3-d');
  if (sabotaged) {
    PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
    const collideTs = '2026-09-08T10:00:00.000Z';
    REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
      socialRow({ ts: collideTs, email: 'sab-collide@shoonya.example', title: 'ZZ QA Collision Row 1' }),
      socialRow({ ts: collideTs, email: 'sab-collide@shoonya.example', title: 'ZZ QA Collision Row 2' }),
    ]);
    const collideId = 'social-night:' + collideTs + ':sab-collide@shoonya.example';
    const c = loadAppBridgeVariant(sabotaged);
    const pSab = inCtx(c, `handleAppBridgeMarkSubmissionProcessed(${JSON.stringify({ submissionType: 'social-night', id: collideId, status: 'approved', key: 'test-secret' })})`);
    ok("sabotage proves T10: WITHOUT the ambiguous-id check, a colliding id silently stamps the FIRST row instead of refusing",
      pSab.ok === true, 'expected ok:true (the bug: silent stamp) — got ' + JSON.stringify(pSab));
  }
}

// --- sabotage T11 (P3-a): reopen the GET route -----------------------------
{
  const needle = `      case 'getPendingSubmissions': return jsonResponse({ ok: false, error: 'use POST listPendingSubmissions' });`;
  const replacement = `      case 'getPendingSubmissions': return handleAppBridgeGetPendingSubmissions(e.parameter); // sabotaged: reopened on GET`;
  const sabotaged = mustReplace(CODE_SRC, needle, replacement, 'T11/P3-a');
  if (sabotaged) {
    let propsSab = {}; // APP_BRIDGE_SECRET unset
    const cSab = vm.createContext({
      Logger: { log: noop }, console,
      SpreadsheetApp: {
        openById: () => ({
          getSheets: () => [REVIEW_SHEET],
          getSheetByName: (name) => (name === 'Submissions Log' ? LOG_SHEET : null),
        }),
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (Object.prototype.hasOwnProperty.call(propsSab, k) ? propsSab[k] : null),
          setProperty: noop,
        }),
      },
      DriveApp: {}, MailApp: { sendEmail: noop },
      Utilities: {
        formatDate: (d, _tz, fmt) => {
          const p = (n) => String(n).padStart(2, '0');
          if (fmt === 'HH:mm') return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
          return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
        },
      },
      CacheService: {}, UrlFetchApp: {}, HtmlService: {},
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: (text) => ({ _text: text, setMimeType() { return this; }, getContent() { return this._text; } }),
      },
      Session: { getScriptTimeZone: () => 'UTC' },
    });
    for (const rel of ['backend/TeacherAdmin.gs', 'backend/AppBridge.gs']) {
      new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }).runInContext(cSab);
    }
    new vm.Script(sabotaged, { filename: 'backend/code.gs (sabotaged)' }).runInContext(cSab);
    const rSab = JSON.parse(vm.runInContext(
      `doGetSubmissions(${JSON.stringify({ parameter: { action: 'getPendingSubmissions', type: 'social-night', key: 'anything' } })})`,
      cSab,
    ).getContent());
    ok("sabotage proves T11: WITHOUT the closed GET route, ?action=getPendingSubmissions reads the key again (answers 'bridge not configured' instead of the fixed refusal)",
      rSab.ok === false && rSab.error === 'bridge not configured',
      'expected the pre-fix behaviour (key read, secret unset) — got ' + JSON.stringify(rSab));
  }
}

// ============================================================================
console.log('\nT12 — submissionType is honoured; a body carrying top-level `type` is refused\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-15T10:00:00.000Z', email: 't12@shoonya.example' }),
]);
LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);

let t12a = call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ submissionType: 'social-night', key: 'test-secret' })})`);
ok('GET honours submissionType', t12a.ok === true && t12a.rows.length === 1, JSON.stringify(t12a));

let t12b = call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ type: 'social-night', key: 'test-secret' })})`);
ok("GET refuses a body carrying top-level `type` with 'use submissionType'",
  t12b.ok === false && t12b.error === 'use submissionType', JSON.stringify(t12b));

// A body smuggling BOTH `type` and a VALID `submissionType` is still refused —
// `type` alone disqualifies it, whatever else rides along.
let t12c = call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ type: 'social-night', submissionType: 'social-night', key: 'test-secret' })})`);
ok('GET refuses even when a valid submissionType also rides along with `type`',
  t12c.ok === false && t12c.error === 'use submissionType', JSON.stringify(t12c));

let t12d = POST({ type: 'social-night', submissionType: 'social-night', id: 'whatever', status: 'approved', key: 'test-secret' });
ok('POST markSubmissionProcessed refuses the same way', t12d.ok === false && t12d.error === 'use submissionType', JSON.stringify(t12d));

let t12e = POST({ submissionType: 'social-night', id: 'whatever-not-found', status: 'approved', key: 'test-secret' });
ok('POST honours submissionType (reaches the normal not-found path, not a submissionType refusal)',
  t12e.ok === false && t12e.error === 'not found', JSON.stringify(t12e));

// ============================================================================
console.log('\nT13 — bridge:3 is present on EVERY bridge response, success or refusal\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-15T11:00:00.000Z', email: 't13@shoonya.example' }),
]);
LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);

const bridgeChecks = [];
bridgeChecks.push(['GET success', call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ submissionType: 'social-night', key: 'test-secret' })})`)]);
PROPS = {};
bridgeChecks.push(['GET bridge not configured', call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ submissionType: 'social-night', key: 'anything' })})`)]);
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
bridgeChecks.push(['GET unauthorised (wrong key)', call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ submissionType: 'social-night', key: 'wrong' })})`)]);
bridgeChecks.push(['GET use submissionType', call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ type: 'social-night', key: 'test-secret' })})`)]);
bridgeChecks.push(['GET unknown type', call(`handleAppBridgeGetPendingSubmissions(${JSON.stringify({ submissionType: 'not-a-real-type', key: 'test-secret' })})`)]);
bridgeChecks.push(['POST not found', POST({ submissionType: 'social-night', id: 'nope', status: 'approved', key: 'test-secret' })]);
bridgeChecks.push(['POST id required', POST({ submissionType: 'social-night', status: 'approved', key: 'test-secret' })]);
bridgeChecks.push(['POST bad status', POST({ submissionType: 'social-night', id: 'x', status: 'bogus', key: 'test-secret' })]);

bridgeChecks.forEach(([label, res]) => {
  ok('bridge:3 present on ' + label, res && res.bridge === 3, JSON.stringify(res));
});

// ============================================================================
console.log('\nT14 — markSubmissionProcessed refuses to overwrite a TERMINAL status\n');
// ============================================================================
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-16T10:00:00.000Z', email: 'terminal-approved@shoonya.example', status: 'approved — created performance(s) — 2026-09-16T10:05:00.000Z' }),
  socialRow({ ts: '2026-09-16T11:00:00.000Z', email: 'terminal-rejected@shoonya.example', status: 'rejected — no capacity — 2026-09-16T11:05:00.000Z' }),
]);
const approvedId = 'social-night:2026-09-16T10:00:00.000Z:terminal-approved@shoonya.example';
const rejectedId = 'social-night:2026-09-16T11:00:00.000Z:terminal-rejected@shoonya.example';

let t14a = POST({ submissionType: 'social-night', id: approvedId, status: 'rejected', key: 'test-secret' });
ok("a stale tab cannot flip an APPROVED row to rejected — the exact bug this guards against (a stale tab turning "
  + "'approved — created performance(s)…' into 'rejected' while the drafts still exist)",
  t14a.ok === false && t14a.error === 'already approved', JSON.stringify(t14a));

let t14b = POST({ submissionType: 'social-night', id: rejectedId, status: 'approved', key: 'test-secret' });
ok('...nor can an approved status overwrite a REJECTED row',
  t14b.ok === false && t14b.error === 'already rejected', JSON.stringify(t14b));

let t14c = POST({ submissionType: 'social-night', id: approvedId, status: 'approved', note: 'still good', key: 'test-secret' });
ok('re-sending the SAME terminal status is an idempotent success, not refused',
  t14c.ok === true && /^approved — still good — \d{4}-\d{2}-\d{2}T/.test(t14c.reviewStatus || ''), JSON.stringify(t14c));

let t14d = POST({ submissionType: 'social-night', id: rejectedId, status: 'rejected', key: 'test-secret' });
ok('re-sending the SAME terminal status with no note is also an idempotent success',
  t14d.ok === true, JSON.stringify(t14d));

// A still-pending row must be unaffected by the terminal guard.
REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
  socialRow({ ts: '2026-09-16T12:00:00.000Z', email: 'still-pending@shoonya.example', status: '' }),
]);
const pendingId = 'social-night:2026-09-16T12:00:00.000Z:still-pending@shoonya.example';
let t14e = POST({ submissionType: 'social-night', id: pendingId, status: 'rejected', key: 'test-secret' });
ok('a still-pending row can be set to any status freely (the terminal guard does not fire early)',
  t14e.ok === true, JSON.stringify(t14e));

// ============================================================================
console.log('\nT15 — P1: a bridge-shaped body with an UNKNOWN action never reaches handleSubmit or logRawSubmission\n');
// ============================================================================
// Builds an ISOLATED vm context per call so `handleSubmit` can be safely
// overridden AFTER code.gs defines it (code.gs's own top-level `function
// handleSubmit(data) {...}` would otherwise shadow any pre-set stub of the
// same name — so the override has to happen post-load, relying on doPost's
// call to `handleSubmit(...)` being a normal dynamic global lookup, not an
// early-bound reference). `logRawSubmission` is never declared by any source
// loaded here (it lives in SubmissionSheets.gs, deliberately NOT loaded), so
// pre-declaring it as a trackable stub is safe — nothing can shadow it.
function runP1Scenario(codeSrc, bodyObj) {
  const calls = { handleSubmit: 0, logRawSubmission: 0 };
  const c = vm.createContext({
    Logger: { log: noop }, console,
    SpreadsheetApp: { openById: () => ({ getSheets: () => [], getSheetByName: () => null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: noop }) },
    DriveApp: {}, MailApp: { sendEmail: noop },
    Utilities: {
      formatDate: (d, _tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        if (fmt === 'HH:mm') return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
        return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
      },
    },
    CacheService: {}, UrlFetchApp: {}, HtmlService: {},
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({ _text: text, setMimeType() { return this; }, getContent() { return this._text; } }),
    },
    Session: { getScriptTimeZone: () => 'UTC' },
    logRawSubmission: () => { calls.logRawSubmission++; },
  });
  new vm.Script(codeSrc, { filename: 'backend/code.gs (P1 scenario)' }).runInContext(c);
  // Override AFTER load — see the comment above.
  c.__p1calls = calls;
  vm.runInContext('handleSubmit = function(data) { __p1calls.handleSubmit++; return jsonResponse({ ok: true, stubbed: true }); };', c);
  const result = JSON.parse(vm.runInContext(
    `doPost(${JSON.stringify({ postData: { contents: JSON.stringify(bodyObj) } })})`,
    c,
  ).getContent());
  return { result, calls };
}

// The exact bridge body shapes from the AppBridge.gs contract comment, with
// an action name the backend does NOT recognise (simulates either an old
// deploy predating the App Bridge cases, or a FUTURE bridge action added to
// the App before a matching case exists here) — `type` names a real
// submission type, which is what made this look like a genuine submission.
const CURRENT_CODE_SRC = fs.readFileSync(path.join(ROOT, 'backend/code.gs'), 'utf8');
const LIST_BODY = { action: 'someFutureBridgeAction', key: 'the-bridge-secret', type: 'workshop' };
const MARK_BODY = { action: 'someFutureBridgeAction', key: 'the-bridge-secret', type: 'workshop', id: 'x', status: 'approved', note: 'n' };

for (const [label, body] of [['listPendingSubmissions-shaped body', LIST_BODY], ['markSubmissionProcessed-shaped body', MARK_BODY]]) {
  const { result, calls } = runP1Scenario(CURRENT_CODE_SRC, body);
  ok('CURRENT source: ' + label + ' with an unknown action never calls handleSubmit',
    calls.handleSubmit === 0, 'handleSubmit called ' + calls.handleSubmit + ' times');
  ok('CURRENT source: ' + label + ' with an unknown action never calls logRawSubmission',
    calls.logRawSubmission === 0, 'logRawSubmission called ' + calls.logRawSubmission + ' times');
  ok('CURRENT source: ' + label + " gets the closed-off refusal, not a stubbed 'ok:true' from handleSubmit",
    result.ok === false && /Unknown action/.test(result.error || ''), JSON.stringify(result));
}

// A `submissionType`-carrying body (no `key`) must ALSO never reach
// handleSubmit — the P1 fix's second, independent gate.
{
  const body = { action: 'someFutureBridgeAction', submissionType: 'workshop', type: 'workshop' };
  const { calls } = runP1Scenario(CURRENT_CODE_SRC, body);
  ok('CURRENT source: a submissionType-carrying body with an unknown action never calls handleSubmit',
    calls.handleSubmit === 0, 'handleSubmit called ' + calls.handleSubmit + ' times');
}

// --- EVIDENCE ONLY: the same scenario against the COMMITTED HEAD source ----
// Per "Prove the check can fail" — re-run the exact P1 scenario against
// `git show HEAD:backend/code.gs`, the source this P1 was proven against.
// This documents that the pre-fix source actually has the hole; it is
// deliberately NOT wired through ok()/fail — a red HEAD is the expected,
// correct outcome, not a regression in this suite.
try {
  const headCodeSrc = execSync('git show HEAD:backend/code.gs', { cwd: ROOT, encoding: 'utf8' });
  const { result: headResult, calls: headCalls } = runP1Scenario(headCodeSrc, LIST_BODY);
  if (headCalls.handleSubmit > 0) {
    console.log('  ⚠ EVIDENCE: git show HEAD:backend/code.gs — the listPendingSubmissions-shaped body DOES reach handleSubmit ('
      + headCalls.handleSubmit + ' call(s)) — confirms the P1 hole existed in the committed source. Result: ' + JSON.stringify(headResult));
  } else {
    console.log('  ⚠ EVIDENCE: git show HEAD:backend/code.gs did NOT reproduce the P1 hole (handleSubmit not called) — '
      + 'either HEAD has moved past the vulnerable revision, or this body shape no longer matches it. Investigate before relying on this as evidence.');
  }
} catch (err) {
  console.log('  ⚠ EVIDENCE step skipped — could not load git show HEAD:backend/code.gs: ' + err.message);
}

// ============================================================================
console.log('\nT16 — real submission shapes (copied from the actual forms) still reach handleSubmit\n');
// ============================================================================
// forms/smart-form/weekly-classes.html: WEEKLY_META = { action:'submit',
// type:'weekly-class', structured:true, submitted_via:'weekly-v2-form' }
// (workshops.html / social-nights.html / Festival/index.html all send
// action:'generateOutputPackage' instead, which has its own explicit switch
// case above the default branch and calls handleGenerateOutputPackage, not
// handleSubmit — out of scope for this default-branch regression check).
const REAL_WEEKLY_SUBMIT_BODY = {
  action: 'submit', type: 'weekly-class', structured: true, submitted_via: 'weekly-v2-form',
  teacher_name: 'ZZ QA Teacher', email: 'zzqa@shoonya.example', dance_style: 'Bachata',
};
{
  const { calls, result } = runP1Scenario(CURRENT_CODE_SRC, REAL_WEEKLY_SUBMIT_BODY);
  ok("a real weekly-class form body (action:'submit') still reaches handleSubmit",
    calls.handleSubmit === 1, 'handleSubmit called ' + calls.handleSubmit + ' times');
  ok('...and gets the stubbed success back (proves the call actually went through, not a refusal)',
    result.ok === true && result.stubbed === true, JSON.stringify(result));
}

// A client that omits `action` entirely (doPost defaults it to 'submit') must
// still reach handleSubmit — requirement 1's "action is absent" case.
const REAL_WEEKLY_SUBMIT_NO_ACTION_BODY = {
  type: 'weekly-class', teacher_name: 'ZZ QA Teacher 2', email: 'zzqa2@shoonya.example', dance_style: 'Salsa',
};
{
  const { calls, result } = runP1Scenario(CURRENT_CODE_SRC, REAL_WEEKLY_SUBMIT_NO_ACTION_BODY);
  ok('a body with NO `action` field at all (implicit \'submit\') still reaches handleSubmit',
    calls.handleSubmit === 1, 'handleSubmit called ' + calls.handleSubmit + ' times');
  ok('...and gets the stubbed success back', result.ok === true && result.stubbed === true, JSON.stringify(result));
}

// ============================================================================
console.log('\nT17 — 2026-09-18-app-bridge-4 (THE GAP): a correction to an APPROVED/\n'
  + '      REJECTED row reopens it to pending and it resurfaces in listPendingSubmissions\n');
// ============================================================================
// End-to-end through the REAL functions: saveToSheet() (SubmissionSheets.gs)
// writes the row, then the REAL handleAppBridgeGetPendingSubmissions()
// (AppBridge.gs) reads it back — proving the fix from the app's own point of
// view, not just the sheet cell.
PROPS = { APP_BRIDGE_SECRET: 'test-secret' };

function t17Payload(overrides) {
  return Object.assign({
    type: 'social-night',
    teacher_name: 'ZZ QA Correction Org',
    organiser_name: 'ZZ QA Correction Org',
    email: 'zzqa-correction@shoonya.example',
    title: 'ZZ QA Correction Night',
    event_title: 'ZZ QA Correction Night',
    date: '2026-12-05',
    styles: ['Bachata'],
    doors: '20:00',
    end: '23:00',
    musicType: 'guest-dj',
    djName: 'DJ ZZ',
  }, overrides || {});
}
const reviewCol = col('Review status');

// ── A. Correction to a previously APPROVED row ──────────────────────────────
{
  const baseRow = call(`buildSheetRow(${JSON.stringify(t17Payload())}, 'social-night')`);
  const oldStatus = 'approved — created performance(s) — 2026-09-10T09:00:00.000Z';
  REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [baseRow.concat([oldStatus])]);
  LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);

  // Genuine content change (Doors Open) — must be read as a CORRECTION, not
  // a byte-identical resubmit.
  const corrected = t17Payload({ doors: '21:00' });
  const saveRes = call(`saveToSheet(${JSON.stringify(corrected)}, 'social-night')`);
  ok('A: a changed resubmit of an approved row overwrites in place',
    saveRes === 'updated', String(saveRes));

  const writtenStatus = String(REVIEW_SHEET._grid[1][reviewCol] || '');
  ok('A: Review status first token is now "pending"',
    writtenStatus.split(' — ')[0].trim().toLowerCase() === 'pending', writtenStatus);
  ok('A: the OLD status text is preserved after "previously:"',
    writtenStatus.indexOf('previously: ' + oldStatus) !== -1, writtenStatus);
  ok('A: the new status also says WHEN and WHO ("corrected by the teacher on <iso>")',
    /corrected by the teacher on \d{4}-\d{2}-\d{2}T/.test(writtenStatus), writtenStatus);

  const getRes = GET('social-night', 'test-secret');
  ok('A: listPendingSubmissions lists the row again (it was hidden as "approved" a moment ago)',
    getRes.ok === true && getRes.rows.length === 1 && getRes.rows[0].email === 'zzqa-correction@shoonya.example',
    JSON.stringify(getRes.rows?.map((r) => [r.email, r.reviewStatus])));
}

// ── B. Byte-identical resubmit of an approved row — status untouched, not relisted ──
{
  const payload = t17Payload({ email: 'zzqa-correction-b@shoonya.example', teacher_name: 'ZZ QA Correction Org B', organiser_name: 'ZZ QA Correction Org B' });
  const baseRow = call(`buildSheetRow(${JSON.stringify(payload)}, 'social-night')`);
  const oldStatus = 'approved — created performance(s) — 2026-09-11T09:00:00.000Z';
  REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [baseRow.concat([oldStatus])]);
  LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);

  const saveRes = call(`saveToSheet(${JSON.stringify(payload)}, 'social-night')`);
  ok('B: an unchanged resubmit is suppressed as a duplicate, not read as a correction',
    saveRes === 'duplicate', String(saveRes));

  const writtenStatus = String(REVIEW_SHEET._grid[1][reviewCol] || '');
  ok('B: Review status is byte-for-byte UNTOUCHED — an identical resubmit must never reopen an approved row',
    writtenStatus === oldStatus, writtenStatus);

  const getRes = GET('social-night', 'test-secret');
  ok('B: the row is still NOT listed as pending — the identical-duplicate path never reaches the reopen logic',
    getRes.ok === true && getRes.rows.length === 0, JSON.stringify(getRes.rows));
}

// ── C. Correction to a row that was NEVER reviewed — status stays empty ─────
{
  const payload = t17Payload({ email: 'zzqa-correction-c@shoonya.example', teacher_name: 'ZZ QA Correction Org C', organiser_name: 'ZZ QA Correction Org C' });
  const baseRow = call(`buildSheetRow(${JSON.stringify(payload)}, 'social-night')`);
  REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [baseRow.concat([''])]); // blank Review status — never reviewed
  LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);

  const corrected = t17Payload({ email: 'zzqa-correction-c@shoonya.example', teacher_name: 'ZZ QA Correction Org C', organiser_name: 'ZZ QA Correction Org C', doors: '21:15' });
  const saveRes = call(`saveToSheet(${JSON.stringify(corrected)}, 'social-night')`);
  ok('C: a changed resubmit of a never-reviewed row still overwrites in place',
    saveRes === 'updated', String(saveRes));

  const writtenStatus = String(REVIEW_SHEET._grid[1][reviewCol] || '');
  ok('C: Review status stays EMPTY — no fake "previously:" text for a row that was never reviewed',
    writtenStatus === '', JSON.stringify(writtenStatus));
}

// ============================================================================
console.log('\nT18 — audit #15: workshop raw-log match via sessions[0].date fallback\n');
// ============================================================================
// Confirmed against the REAL "Submissions Log" tab (2026-09-18, read-only Drive
// read, deleted after): every live workshop submission (three rows checked,
// 22/23 Jun 2026) has `sessions[]` and NO top-level `date`/`start_date` — see
// backend/AppBridge.gs's 2026-09-18-app-bridge-5 doc comment on
// _appBridgeRawDate. forms/_tests/workshop-golden-payload.json has the
// identical shape (sessions[0].date, no top-level date) and IS the exact
// payload the real workshops.html form POSTs — used here rather than a
// hand-rolled fixture so this test tracks the real form contract.
{
  PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
  const WGOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'forms/_tests/workshop-golden-payload.json'), 'utf8'));
  const WS_HEADERS = call('SUBMISSION_HEADERS.workshop').concat(['Review status']);
  const wsCol = (name) => WS_HEADERS.indexOf(name);
  const wsRow = new Array(WS_HEADERS.length).fill('');
  const WS_TS = '2026-10-01T08:00:00.000Z';
  wsRow[wsCol('Timestamp')] = WS_TS;
  wsRow[wsCol('Teacher')] = WGOLDEN.teacher_name;
  wsRow[wsCol('Email')] = WGOLDEN.email;
  wsRow[wsCol('Title')] = WGOLDEN.title;
  wsRow[wsCol('First Date')] = WGOLDEN.sessions[0].date; // the sheet's own flattened date column
  // Deliberately different text from the structured raw payload's pricing —
  // proves (like T4) that the RAW-log path ran, not the flattened fallback.
  wsRow[wsCol('Pricing')] = 'FLATTENED SUMMARY — should not appear verbatim as data.price_full';

  REVIEW_SHEET = makeGrid(WS_HEADERS, [wsRow]);
  LOG_SHEET = makeGrid(
    ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
    [[WS_TS, 'workshop', WGOLDEN.teacher_name, WGOLDEN.email, JSON.stringify(WGOLDEN)]],
  );

  const r18 = GET('workshop', 'test-secret');
  ok('GET succeeds and returns the workshop row', r18.ok && r18.rows.length === 1, JSON.stringify(r18));
  const d18 = r18.rows[0]?.data || {};
  ok('data.price_full is the REAL price from the raw log (the flattened fallback has NO price_full field at all — see _appBridgeFallbackFromFlattened)',
    d18.price_full === WGOLDEN.price_full, JSON.stringify(d18.price_full));
  ok('data.sessions[] is the original structured array (raw-log path, not the flattened fallback)',
    Array.isArray(d18.sessions) && d18.sessions.length === WGOLDEN.sessions.length && d18.sessions[0].date === WGOLDEN.sessions[0].date,
    JSON.stringify(d18.sessions));
  ok('data.capacity survived from the raw log', d18.capacity === WGOLDEN.capacity, JSON.stringify(d18.capacity));

  // --- sabotage: revert _appBridgeRawDate to its pre-fix form (no sessions
  // fallback) on an IN-MEMORY copy only — AppBridge.gs is untracked (never
  // committed), so `git show HEAD:...` has no prior version to diff against;
  // this file's own established pattern for that case (see T6/T7/etc. above)
  // is exactly this: sabotage a string in memory, load it in a throwaway vm
  // context, never touch the real file on disk.
  const needle = `function _appBridgeRawDate(payload) {
  var v = payload && (payload.date || payload.start_date);
  if (!v && payload && Array.isArray(payload.sessions) && payload.sessions.length) {
    v = payload.sessions[0] && payload.sessions[0].date;
  }
  return String(v == null ? '' : v).trim();
}`;
  const replacement = `function _appBridgeRawDate(payload) {
  var v = payload && (payload.date || payload.start_date);
  return String(v == null ? '' : v).trim();
}`;
  const sabotagedSrc = mustReplace(APPBRIDGE_SRC, needle, replacement, 'T18/#15 pre-fix _appBridgeRawDate');
  if (sabotagedSrc) {
    const rSab = GETin(loadAppBridgeVariant(sabotagedSrc), 'workshop', 'test-secret');
    const dSab = rSab.rows?.[0]?.data || {};
    ok('sabotage proves #15: WITHOUT the sessions[0].date fallback, price_full is LOST (raw-log match discarded, flattened fallback has no price_full)',
      rSab.ok && rSab.rows.length === 1 && dSab.price_full === undefined,
      'expected the pre-fix bug (no price_full) to reappear — got: ' + JSON.stringify(dSab.price_full));
  }
}

// ============================================================================
console.log('\nT19 — audit #17: Sheets writes guard formula injection + leading-zero coercion\n');
// ============================================================================
{
  // Pure-function checks of _sheetSafeCell — the single point every row
  // saveToSheet() writes now passes through (see `row = _sheetSafeRow(...)`).
  ok("_sheetSafeCell prefixes a string starting '='", call(`_sheetSafeCell('=1+1')`) === "'=1+1", call(`_sheetSafeCell('=1+1')`));
  ok("_sheetSafeCell prefixes a string starting '+'", call(`_sheetSafeCell('+1')`) === "'+1", call(`_sheetSafeCell('+1')`));
  ok("_sheetSafeCell prefixes a string starting '-'", call(`_sheetSafeCell('-1')`) === "'-1", call(`_sheetSafeCell('-1')`));
  ok("_sheetSafeCell prefixes a string starting '@'", call(`_sheetSafeCell('@mention')`) === "'@mention", call(`_sheetSafeCell('@mention')`));
  ok('_sheetSafeCell forces a leading-zero numeric-looking string to text (the audit\'s own "007"->7 example)',
    call(`_sheetSafeCell('007')`) === "'007", call(`_sheetSafeCell('007')`));
  ok('_sheetSafeCell leaves an ordinary title alone', call(`_sheetSafeCell('Bachata Solo Night')`) === 'Bachata Solo Night');
  ok('_sheetSafeCell leaves a non-string value alone (already a real number/boolean)', call(`_sheetSafeCell(42)`) === 42);

  // End to end through the REAL saveToSheet(): a resubmit whose Organiser name
  // starts with '=' must land in the sheet PREFIXED, not stored as a live
  // formula. Same email+date+title as the seed row so this is read as a
  // correction and hits the overwrite/setValues path saveToSheet actually
  // uses — the fake sheet mock has no appendRow, same constraint every other
  // saveToSheet test in this file works within.
  const seed = t17Payload({ email: 'zzqa-sheetsafe@shoonya.example', title: 'ZZ QA SheetSafe Night', event_title: 'ZZ QA SheetSafe Night' });
  const baseRow = call(`buildSheetRow(${JSON.stringify(seed)}, 'social-night')`);
  REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [baseRow.concat([''])]);
  LOG_SHEET = makeGrid(['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'], []);

  const evil = t17Payload({
    email: 'zzqa-sheetsafe@shoonya.example', title: 'ZZ QA SheetSafe Night', event_title: 'ZZ QA SheetSafe Night',
    teacher_name: '=1+1', organiser_name: '=1+1', doors: '20:30', // doors changed so this is a genuine content change, not the suppressed-duplicate path
  });
  const saveRes = call(`saveToSheet(${JSON.stringify(evil)}, 'social-night')`);
  ok('a resubmit with an Organiser name starting with "=" is still accepted as an update', saveRes === 'updated', String(saveRes));

  const writtenOrganiser = REVIEW_SHEET._grid[1][col('Organiser')];
  ok('the written Organiser cell is prefixed, not stored as a live formula',
    writtenOrganiser === "'=1+1", JSON.stringify(writtenOrganiser));
}

// ============================================================================
console.log('\nT20 — F4 P2 (review 2026-09-18): a SERIES workshop is matched to its raw-log\n'
  + "      payload even though it is logged type 'series' while the App only ever\n"
  + "      requests submissionType 'workshop' (APP_BRIDGE_TYPES has no 'series')\n");
// ============================================================================
{
  PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
  const SERIES_GOLDEN = { ...JSON.parse(fs.readFileSync(path.join(ROOT, 'forms/_tests/workshop-golden-payload.json'), 'utf8')), type: 'series', format: 'Series' };
  const WS_HEADERS = call('SUBMISSION_HEADERS.workshop').concat(['Review status']);
  const wsCol = (name) => WS_HEADERS.indexOf(name);
  const wsRow = new Array(WS_HEADERS.length).fill('');
  const SERIES_TS = '2026-10-02T08:00:00.000Z';
  wsRow[wsCol('Timestamp')] = SERIES_TS;
  wsRow[wsCol('Teacher')] = SERIES_GOLDEN.teacher_name;
  wsRow[wsCol('Email')] = SERIES_GOLDEN.email;
  wsRow[wsCol('Title')] = SERIES_GOLDEN.title;
  // buildSheetRow writes `data.format || type` into Format — a series
  // submission's own `type` ('series') ends up here exactly like T18's
  // workshop row got 'Single' from `data.format`; not itself under test.
  wsRow[wsCol('Format')] = 'Series';
  wsRow[wsCol('First Date')] = SERIES_GOLDEN.sessions[0].date;
  // Deliberately different text from the structured raw payload's pricing —
  // proves (like T18) that the RAW-log path ran, not the flattened fallback,
  // which has no `price_full` field at all (_appBridgeFallbackFromFlattened).
  wsRow[wsCol('Pricing')] = 'FLATTENED SUMMARY — should not appear verbatim as data.price_full';

  REVIEW_SHEET = makeGrid(WS_HEADERS, [wsRow]);
  LOG_SHEET = makeGrid(
    ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
    // Logged as 'series', NOT 'workshop' — output-generator.gs's
    // handleGenerateOutputPackage passes `data.type` straight into
    // logRawSubmission's Type column, and a series submission's own type IS
    // 'series' (SubmissionSheets.gs's saveToSheet/_headerKey already treat
    // 'series' as 'workshop' for the SHEET/headers, but the raw log's Type
    // column keeps the submission's real type).
    [[SERIES_TS, 'series', SERIES_GOLDEN.teacher_name, SERIES_GOLDEN.email, JSON.stringify(SERIES_GOLDEN)]],
  );

  const r20 = GET('workshop', 'test-secret');
  ok('GET (submissionType: workshop) succeeds and returns the series row (it lives in the same WORKSHOP_SHEET_ID sheet)',
    r20.ok && r20.rows.length === 1, JSON.stringify(r20));
  const d20 = r20.rows[0]?.data || {};
  ok("data.price_full is the REAL price from the raw log — a row logged type 'series' is still matched against a 'workshop' request",
    d20.price_full === SERIES_GOLDEN.price_full, JSON.stringify(d20.price_full));
  ok('data.sessions[] is the original structured array (raw-log path), not the flattened fallback',
    Array.isArray(d20.sessions) && d20.sessions.length === SERIES_GOLDEN.sessions.length && d20.sessions[0].date === SERIES_GOLDEN.sessions[0].date,
    JSON.stringify(d20.sessions));

  // --- sabotage: revert the type-equivalence back to a strict `rowType !== type` —
  const needle = `      var rowTypeMatches = (rowType === type) || (type === 'workshop' && rowType === 'series');
      if (!rowTypeMatches) continue;`;
  const replacement = `      if (rowType !== type) continue; // sabotaged: series no longer matches a 'workshop' request`;
  const sabotaged = mustReplace(APPBRIDGE_SRC, needle, replacement, 'T20/F4-P2 series');
  if (sabotaged) {
    const rSab = GETin(loadAppBridgeVariant(sabotaged), 'workshop', 'test-secret');
    const dSab = rSab.rows?.[0]?.data || {};
    ok("sabotage proves F4 P2: WITHOUT the series/workshop type equivalence, price_full is LOST for a series row (raw-log match discarded, flattened fallback has none)",
      rSab.ok && rSab.rows.length === 1 && dSab.price_full === undefined,
      'expected the pre-fix bug (no price_full) to reappear — got: ' + JSON.stringify(dSab.price_full));
  }
}

// ============================================================================
console.log('\nT21 — F4 P2 (review 2026-09-18): the `\'` write guard (_sheetSafeCell) must not\n'
  + '      break the P2-c raw-log title/date match on a Plain-text-formatted column\n');
// ============================================================================
{
  // Pure checks first — Sheets DROPS a leading `\'` on write for an
  // Automatic-formatted cell (so a value read back never carries it) but
  // KEEPS it literally for a Plain-text-formatted one (so a value read back
  // from THAT column still does); _appBridgeNormText/_appBridgeCellToDateStr
  // must treat both the same.
  ok('_appBridgeNormText strips a leading straight-quote artifact (Plain-text-format column) …',
    call(`_appBridgeNormText("'ZZ QA Quote Night")`) === 'zz qa quote night', call(`_appBridgeNormText("'ZZ QA Quote Night")`));
  ok('… and is unchanged when there is none (Automatic-format column already dropped it)',
    call(`_appBridgeNormText("ZZ QA Quote Night")`) === 'zz qa quote night', call(`_appBridgeNormText("ZZ QA Quote Night")`));
  ok('_appBridgeCellToDateStr strips a leading straight-quote the same way',
    call(`_appBridgeCellToDateStr("'2026-11-21")`) === '2026-11-21', call(`_appBridgeCellToDateStr("'2026-11-21")`));

  // End-to-end through the REAL P2-c guard (_appBridgeFindRawSubmission):
  // the flattened sheet's Event Title cell literally carries the `'`
  // (simulating a Plain-text-formatted column, per the review) while the raw
  // Submissions Log JSON — never touched by _sheetSafeCell — carries the
  // title as originally typed. Before the fix these compared UNEQUAL and the
  // raw-log match was discarded as "wrong event", exactly like T6's P2-c
  // scenario but for a false negative on the SAME event rather than a false
  // positive on a different one.
  PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
  const QUOTE_TS = '2026-09-20T10:00:00.000Z';
  const QUOTE_RAW = { ...GOLDEN, title: 'ZZ QA Quote Night', event_title: 'ZZ QA Quote Night', date: '2026-12-01' };
  REVIEW_SHEET = makeGrid(SOCIAL_HEADERS, [
    (() => {
      const row = socialRow({ ts: QUOTE_TS, email: GOLDEN.email, organiser: GOLDEN.teacher_name, title: "'ZZ QA Quote Night" });
      row[col('Date')] = '2026-12-01';
      return row;
    })(),
  ]);
  LOG_SHEET = makeGrid(
    ['Timestamp', 'Type', 'Teacher', 'Email', 'Full JSON (photos stripped)'],
    [[QUOTE_TS, 'social-night', GOLDEN.teacher_name, GOLDEN.email, JSON.stringify(QUOTE_RAW)]],
  );
  const r21 = GET('social-night', 'test-secret');
  // `teacherDJ` exists only on the RAW structured payload —
  // _appBridgeFallbackFromFlattened('social-night', …) has no such key at
  // all — so its presence proves the raw-log match succeeded rather than
  // falling back to the flattened summary (which the literally-quoted sheet
  // title, unfixed, would have forced).
  ok('the raw-log payload is matched despite the sheet\'s literally-quoted title (a field that ONLY exists on the raw payload, never the flattened fallback, is present)',
    r21.ok && r21.rows.length === 1 && r21.rows[0].data?.teacherDJ === GOLDEN.teacherDJ,
    JSON.stringify(r21.rows?.[0]?.data));
}

// ============================================================================
console.log('\nT22 — listTeacherProfiles (forms -> portal F1)\n');
// ============================================================================
{
  PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
  // Column order deliberately NOT the order the real sheet uses: the handler must read by header name.
  const H = ['approved', 'photos', 'bio_long', 'email', 'pin_hash', 'role', 'name', 'photo_url', 'bio_short', 'dance_styles', 'teaching_languages',
    'instagram', 'facebook', 'youtube', 'website', 'last_login', 'registered_at', 'associated_events', 'photo_credit'];
  const row = (o) => H.map((h) => (o[h] === undefined ? '' : o[h]));
  TEACHERS_SHEET = makeGrid(H, [
    row({ email: 'Sonja@Example.BE ', pin_hash: 'SECRETHASH1', name: 'Sonja S', role: 'teacher', approved: 'yes', bio_short: 'Short', bio_long: 'Long\nbio',
      dance_styles: '["Salsa","Bachata"]', teaching_languages: 'NL, EN', instagram: '@sonja', photo_url: 'https://drive.google.com/thumbnail?id=FILE1&sz=w1000',
      photos: JSON.stringify([{ url: 'https://drive.google.com/thumbnail?id=FILE1&sz=w1000', fileId: 'FILE1', label: 'main' }, { url: 'https://drive.google.com/thumbnail?id=FILE2&sz=w1000', label: '' }, 'junk', { nothing: true }]),
      photo_credit: 'Jan Peeters', last_login: '2026-10-01', registered_at: '2026-01-01', associated_events: '["x"]' }),
    row({ email: 'placeholder@pending.shoonya', pin_hash: 'SECRETHASH2', name: 'Placeholder', role: 'teacher' }),
    row({ email: 'boss@example.be', pin_hash: 'SECRETHASH3', name: 'Admin Boss', role: 'Admin' }),
    row({ email: '', pin_hash: 'SECRETHASH4', name: 'No email' }),
    row({ email: 'bare@example.be', name: 'Bare', approved: '', dance_styles: 'not json, Kizomba', photos: 'not json' }),
    row({ email: 'ok@example.be', name: 'Boolean', approved: true, photos: '[]' }),
  ]);
  const LIST = (key) => call(`handleAppBridgeListTeacherProfiles(${JSON.stringify({ key })})`);
  const r = LIST('test-secret');
  ok('ok + bridge:3 + version + a teachers array', r.ok === true && r.bridge === 3 && r.version === 'test-version' && Array.isArray(r.teachers), JSON.stringify(r).slice(0, 200));
  ok('placeholder, admin and e-mail-less rows are skipped', r.teachers.map((t) => t.email).join('|') === 'sonja@example.be|bare@example.be|ok@example.be', r.teachers.map((t) => t.email).join('|'));
  const so = r.teachers[0];
  ok('fields are read by header name and the e-mail is lower-cased + trimmed',
    so.name === 'Sonja S' && so.bioShort === 'Short' && so.bioLong === 'Long\nbio' && so.instagram === '@sonja' && so.photoCredit === 'Jan Peeters' && so.approved === true, JSON.stringify(so));
  ok('JSON list and comma list both become arrays', JSON.stringify(so.danceStyles) === '["Salsa","Bachata"]' && JSON.stringify(so.teachingLanguages) === '["NL","EN"]', JSON.stringify([so.danceStyles, so.teachingLanguages]));
  ok('photos[]: bad entries dropped, a missing fileId is taken from the URL, label kept', JSON.stringify(so.photos) === JSON.stringify([
    { url: 'https://drive.google.com/thumbnail?id=FILE1&sz=w1000', fileId: 'FILE1', label: 'main' },
    { url: 'https://drive.google.com/thumbnail?id=FILE2&sz=w1000', fileId: 'FILE2', label: '' },
  ]), JSON.stringify(so.photos));
  ok('legacy photo_url is returned on its own', so.photoUrl === 'https://drive.google.com/thumbnail?id=FILE1&sz=w1000');
  ok('a plain comma list and an unparseable photos cell do not throw', JSON.stringify(r.teachers[1].danceStyles) === '["not json","Kizomba"]' && JSON.stringify(r.teachers[1].photos) === '[]' && r.teachers[1].approved === false);
  ok('a boolean TRUE in approved counts as approved', r.teachers[2].approved === true);
  ok('pin_hash (and other private columns) never appear anywhere in the reply',
    !/SECRETHASH|pin_hash|last_login|registered_at|associated_events|2026-10-01/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 300));
  ok('no key, wrong key and an unset secret are refused WITH bridge:3 and no teachers',
    (() => { const a = LIST(undefined), b = LIST('nope'); PROPS = {}; const c = LIST('test-secret'); PROPS = { APP_BRIDGE_SECRET: 'test-secret' };
      return a.error === 'unauthorised' && b.error === 'unauthorised' && c.error === 'bridge not configured' && [a, b, c].every((x) => x.bridge === 3 && x.ok === false && !x.teachers); })());
  TEACHERS_SHEET = makeGrid(['email', 'name'], []);
  ok('an empty sheet is ok:true with an empty list', (() => { const e = LIST('test-secret'); return e.ok === true && Array.isArray(e.teachers) && e.teachers.length === 0; })());
  TEACHERS_SHEET = makeGrid(['name'], [['x']]);
  ok('a sheet without an email column is refused, not guessed at', LIST('test-secret').ok === false);
  // routed from doPost?
  const codeSrc = fs.readFileSync(path.join(ROOT, 'backend/code.gs'), 'utf8');
  ok("code.gs routes 'listTeacherProfiles' to the handler and bumps BACKEND_VERSION", /case 'listTeacherProfiles':\s+return handleAppBridgeListTeacherProfiles\(data\);/.test(codeSrc) && /BACKEND_VERSION = '2026-10-18-teacher-profiles-1'/.test(codeSrc));
}

console.log('\n' + (fail ? '✗' : '✓') + ' app-bridge: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
