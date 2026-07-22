// Unit tests for the 2026-07-22 "update or additional class?" flow.
//
// WHY: submissions are keyed on (teacher, style, semester), so a SECOND
// submission for the same style silently REPLACED the first — a teacher adding
// "Ballet Thursday" alongside "Ballet Monday" lost Monday without being told.
// Swapnil's call: don't guess, ask the teacher. These tests cover the two
// backend halves of that — the lookup that lets the form ask a concrete
// question, and the honouring of the answer.
//
//   node forms/_tests/resubmission-intent.mjs

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

// ── Sandbox ────────────────────────────────────────────────────────────────
const noop = () => {};
const ctx = vm.createContext({
  Logger: { log: noop }, console, JSON, Date, String, Number, Array, Object, isNaN,
  MailApp: { sendEmail: noop },
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: noop }) },
  Session: { getScriptTimeZone: () => 'Europe/Brussels' },
  SpreadsheetApp: {}, DriveApp: {}, CacheService: {}, UrlFetchApp: {},
  HtmlService: {}, ContentService: {},
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

// backend/code.gs defines its own jsonResponse() on top of ours, and it wraps
// ContentService (Apps Script-only). Return the plain object instead so tests
// can assert on it directly.
vm.runInContext('jsonResponse = function(obj) { return obj; };', ctx);

console.log('\nresubmission-intent — "update or additional class?"\n');

// ── Fake Master Schedule ───────────────────────────────────────────────────
// Column layout per MASTER_SCHEDULE_HEADERS:
// 0 ts, 1 teacher, 2 email, 3 style, 4 level, 5 day, 6 start, 7 end, 8 capacity,
// 9 slotTeacher, 10 coTeacher, 11 semester, 12 source, 13 submissionTs …
const HEADER_COUNT = vm.runInContext('MASTER_SCHEDULE_HEADERS.length', ctx);
const row = (email, style, level, day, start, end, semester) => {
  const r = new Array(HEADER_COUNT).fill('');
  r[0] = '2026-07-01T10:00:00Z'; r[1] = 'Tester'; r[2] = email; r[3] = style;
  r[4] = level; r[5] = day; r[6] = start; r[7] = end; r[11] = semester;
  r[13] = '2026-07-01T10:00:00Z';
  return r;
};

function installSheet(rows) {
  ctx.__rows = rows;
  vm.runInContext(`
    getMasterScheduleSheet = function() {
      return {
        getLastRow: function() { return __rows.length + 1; },
        getRange: function() { return { getValues: function() { return __rows; } }; },
      };
    };
  `, ctx);
}

const call = (fn, arg) => vm.runInContext(`${fn}(${JSON.stringify(arg)})`, ctx);

// Token resolution → a fixed teacher.
vm.runInContext(`resolveToken = function(t) { return t === 'good-token' ? 'tono@example.com' : ''; };`, ctx);

// ── 1. handleCheckExistingClass — the lookup the form asks with ────────────
installSheet([
  row('tono@example.com', 'Ballet', 'Level 1', 'Monday', '19:00', '20:00', 'Semester 1 — 2026/2027'),
  row('tono@example.com', 'Ballet', 'Level 2', 'Monday', '20:00', '21:15', 'Semester 1 — 2026/2027'),
  row('tono@example.com', 'Yoga',   'Open',    'Tuesday', '18:00', '19:00', 'Semester 1 — 2026/2027'),
  row('other@example.com', 'Ballet', 'Level 1', 'Friday', '19:00', '20:00', 'Semester 1 — 2026/2027'),
]);

let r = call('handleCheckExistingClass', { token: 'good-token', dance_style: 'Ballet', semester_name: 'Semester 1 — 2026/2027' });
ok('finds the teacher\'s existing Ballet rows', r.ok === true && r.exists === true && r.slots.length === 2,
   JSON.stringify(r).slice(0, 140));
ok('returns level/day/time so the form can name the class',
   r.slots[0].level === 'Level 1' && r.slots[0].day === 'Monday' && r.slots[0].start === '19:00',
   JSON.stringify(r.slots[0]));
ok('does NOT leak another teacher\'s rows', r.slots.every(s => s.day !== 'Friday'), JSON.stringify(r.slots));

// The chip label must find canonically-stored rows — this exact mismatch is what
// made Tono's classes invisible in the first place.
r = call('handleCheckExistingClass', { token: 'good-token', dance_style: 'Ballet', semester_name: 'Sep 2026' });
ok('chip label "Sep 2026" still matches canonically-stored rows', r.exists === true && r.slots.length === 2,
   JSON.stringify(r).slice(0, 140));

r = call('handleCheckExistingClass', { token: 'good-token', dance_style: 'Bachata', semester_name: 'Sep 2026' });
ok('a style with no prior submission reports exists:false', r.ok === true && r.exists === false && r.slots.length === 0);

r = call('handleCheckExistingClass', { token: 'good-token', dance_style: 'Ballet', semester_name: 'Feb 2027' });
ok('a different semester does not match', r.exists === false, JSON.stringify(r.slots));

r = call('handleCheckExistingClass', { token: 'bad-token', dance_style: 'Ballet', semester_name: 'Sep 2026' });
ok('a bad token is rejected', r.ok === false && /session expired/i.test(r.error || ''), JSON.stringify(r));

r = call('handleCheckExistingClass', { token: 'good-token', dance_style: '', semester_name: '' });
ok('missing style/semester returns exists:false rather than erroring', r.ok === true && r.exists === false);

// ── 2. The answer is honoured ──────────────────────────────────────────────
// Spy on clearMasterScheduleRowsFor: 'add' must NOT clear; 'update'/absent must.
vm.runInContext(`
  __cleared = 0;
  __realClear = clearMasterScheduleRowsFor;
  clearMasterScheduleRowsFor = function(email, style, semester) {
    __cleared++;
    return { count: 1, earliestTimestamp: null, slotKeys: ['monday 19:00'] };
  };
  resolveTeacherFromSubmission = function(d) { return { name: 'Tester', email: 'tono@example.com' }; };
  getMasterScheduleSheet = function() {
    return {
      getLastRow: function() { return 1; },
      getRange: function() { return { getValues: function() { return []; }, setValues: function() {} }; },
      appendRow: function() {},
      deleteRows: function() {},
      getDataRange: function() { return { getValues: function() { return []; } }; },
    };
  };
`, ctx);

const syncWith = (intent) => {
  vm.runInContext('__cleared = 0;', ctx);
  const data = {
    dance_style: 'Ballet', semester_name: 'Sep 2026', email: 'tono@example.com',
    teacher_name: 'Tester', type: 'weekly-class',
    levels: [{ level: 'Level 1', slots: [{ day: 'Thursday', start: '19:00', end: '20:00' }] }],
  };
  if (intent) data.submission_intent = intent;
  vm.runInContext(`syncToMasterSchedule(${JSON.stringify(data)});`, ctx);
  return vm.runInContext('__cleared', ctx);
};

ok('intent "add" does NOT clear the earlier rows', syncWith('add') === 0);
ok('intent "update" DOES clear the earlier rows', syncWith('update') === 1);
ok('no intent keeps the historical replace behaviour (back-compat)', syncWith('') === 1);
ok('unknown intent value falls back to replace, never to silent-add', syncWith('banana') === 1);
ok('intent is case/whitespace tolerant', syncWith('  ADD  ') === 0);

// ── 3. Flat-sheet side reads the same flag ────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, 'backend/SubmissionSheets.gs'), 'utf8');
ok('flat-sheet overwrite is skipped for intent "add"',
   /submission_intent/.test(src) && /wantsAdd/.test(src) && /!wantsAdd\s*&&/.test(src));

console.log('\n' + (fail === 0 ? '✓' : '✗') +
  ` resubmission-intent: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
