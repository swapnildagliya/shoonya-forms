// Unit tests for the 2026-07-22 backend data-integrity work:
//   1. auditSubmission()  — completeness flag + new-style detection (backlog #4)
//   2. _semKey()          — semester normalisation used by BOTH dedup paths.
//                           The gap here let a resubmission leave the old row in
//                           place, so a class showed TWICE on the live schedule.
//
//   node forms/_tests/submission-audit.mjs

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

// ── Sandbox mirroring the Apps Script shared global scope ───────────────────
const noop = () => {};
const ctx = vm.createContext({
  Logger: { log: noop }, console,
  SpreadsheetApp: {}, DriveApp: {}, MailApp: { sendEmail: noop },
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: noop }) },
  CacheService: {}, UrlFetchApp: {}, HtmlService: {}, ContentService: {},
  Session: { getScriptTimeZone: () => 'Europe/Brussels' },
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

const run = (expr) => vm.runInContext(expr, ctx);
const audit = (data, type) =>
  vm.runInContext(`auditSubmission(${JSON.stringify(data)}, ${JSON.stringify(type)})`, ctx);

console.log('\nsubmission-audit — completeness, new-style, semester dedup\n');

// ── 1. auditSubmission — completeness ───────────────────────────────────────
const completeWeekly = {
  dance_style: 'Bachata',
  semester_name: 'Sep 2026',
  class_description: 'A real description.',
  levels: [{ level: 'Level 1', slots: [{ day: 'Monday', start: '19:00', end: '20:00' }] }],
};

let r = audit(completeWeekly, 'weekly-class');
ok('complete weekly submission reports no missing fields', r.missing.length === 0, JSON.stringify(r.missing));
ok('complete weekly submission produces no subject tag', r.subjectTag === '', JSON.stringify(r.subjectTag));

r = audit({ ...completeWeekly, class_description: '' }, 'weekly-class');
ok('missing description is detected', r.missing.includes('Class description'), JSON.stringify(r.missing));
ok('missing field produces an INCOMPLETE subject tag', /INCOMPLETE/.test(r.subjectTag), r.subjectTag);

r = audit({ ...completeWeekly, class_description: '   ' }, 'weekly-class');
ok('whitespace-only field counts as missing', r.missing.includes('Class description'));

r = audit({ ...completeWeekly, levels: [] }, 'weekly-class');
ok('empty levels array is detected', r.missing.includes('Levels + slots'));

r = audit({ ...completeWeekly, levels: [{ level: 'Level 1', slots: [] }] }, 'weekly-class');
ok('level with no slots is detected', r.missing.includes('Levels + slots'));

r = audit({ ...completeWeekly, levels: [{ level: 'L1', slots: [{ day: 'Monday' }] }] }, 'weekly-class');
ok('slot missing a start time is detected', r.missing.includes('Levels + slots'));

r = audit({}, 'weekly-class');
ok('empty weekly submission flags all four required fields', r.missing.length === 4, JSON.stringify(r.missing));

r = audit({ title: 'X', dance_style: 'Bachata', description: 'Y' }, 'workshop');
ok('complete workshop reports nothing missing', r.missing.length === 0, JSON.stringify(r.missing));
r = audit({ dance_style: 'Bachata' }, 'workshop');
ok('workshop missing title + description is detected', r.missing.length === 2, JSON.stringify(r.missing));

r = audit({ foo: 1 }, 'not-a-real-type');
ok('unknown submission type audits cleanly (no crash, nothing missing)',
   r.missing.length === 0 && r.subjectTag === '');

// ── 2. auditSubmission — new-style detection ────────────────────────────────
r = audit(completeWeekly, 'weekly-class');
ok('known style (Bachata) is NOT flagged as new', r.newStyle === null, String(r.newStyle));

for (const known of ['Tap Dance', 'Cuban Salsa', 'Ballet', 'Yoga']) {
  r = audit({ ...completeWeekly, dance_style: known }, 'weekly-class');
  ok('known style "' + known + '" is not flagged as new', r.newStyle === null, String(r.newStyle));
}

r = audit({ ...completeWeekly, dance_style: 'tapdance' }, 'weekly-class');
ok('alias "tapdance" resolves and is not flagged as new', r.newStyle === null, String(r.newStyle));

r = audit({ ...completeWeekly, dance_style: 'Underwater Basket Weaving' }, 'weekly-class');
ok('genuinely new style IS flagged', r.newStyle === 'Underwater Basket Weaving', String(r.newStyle));
ok('new style produces a NEW STYLE subject tag', /NEW STYLE/.test(r.subjectTag), r.subjectTag);

r = audit({ ...completeWeekly, dance_style: '' }, 'weekly-class');
ok('blank style is reported as missing, not as a new style',
   r.newStyle === null && r.missing.includes('Dance style'));

// ── 3. _semKey — the duplicate-classes fix ─────────────────────────────────
const semKey = (v) => run(`_semKey(${JSON.stringify(v)})`);

ok('chip label "Sep 2026" and canonical label collapse to the SAME key',
   semKey('Sep 2026') === semKey('Semester 1 — 2026/2027'),
   `"${semKey('Sep 2026')}" vs "${semKey('Semester 1 — 2026/2027')}"`);

ok('spring chip label "Feb 2027" collapses to its canonical key',
   semKey('Feb 2027') === semKey('Semester 2 — 2026/2027'),
   `"${semKey('Feb 2027')}" vs "${semKey('Semester 2 — 2026/2027')}"`);

ok('semester 1 and semester 2 remain DIFFERENT keys (no over-matching)',
   semKey('Sep 2026') !== semKey('Feb 2027'));

ok('case and padding are normalised',
   semKey('  SEP 2026  ') === semKey('Sep 2026'));

ok('empty input yields an empty key', semKey('') === '' && semKey(null) === '');

ok('an unrecognised label passes through instead of collapsing',
   semKey('Summer School 2029') === 'summer school 2029', semKey('Summer School 2029'));

console.log('\n' + (fail === 0 ? '✓' : '✗') +
  ` submission-audit: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
