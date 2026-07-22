// Unit test for the 2026-07-22 auto-derivation of weekly session dates.
//
// WHY THIS EXISTS: the weekly form has no date inputs, so `class_dates` /
// `total_classes` / `per_day_dates` never arrive. Before this change, col S
// (Slot Dates) on the Master Schedule and cols H/I/J on the flat sheet were
// blank on EVERY auto-synced weekly submission — the Tono Ferriol failure mode.
//
// Runs the real backend sources in a sandbox (they are Apps Script globals, so
// concatenating them mirrors the deployed global scope) and asserts the derived
// calendar against config/semester-config.json, which is the canonical source.
//
//   node forms/_tests/derive-dates.mjs

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

// ── Load the pieces of backend global scope we need ─────────────────────────
const sources = ['backend/BlockStudioServer.gs', 'backend/MasterSchedule.gs'];
const ctx = vm.createContext({
  Logger: { log() {} },
  console,
  // Minimal Apps Script surface so top-level code in these files can load.
  SpreadsheetApp: {}, DriveApp: {}, MailApp: {}, Utilities: {},
  PropertiesService: {}, CacheService: {}, UrlFetchApp: {}, HtmlService: {},
  ContentService: {}, SitesApp: {}, Session: {},
});

for (const rel of sources) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    new vm.Script(code, { filename: rel }).runInContext(ctx);
  } catch (err) {
    console.log('  ✗ could not load ' + rel + ' — ' + err.message);
    fail++;
  }
}

const call = (fn, ...args) => vm.runInContext(
  `(${fn}).apply(null, ${JSON.stringify(args)})`, ctx
);

// ── Canonical expectations from semester-config.json ────────────────────────
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/semester-config.json'), 'utf8'));
const autumn = cfg.semesters.find(s => s.id === '2026-autumn');

console.log('\nderive-dates — weekly session-date derivation\n');

// 1. The function exists and is wired.
ok('deriveSlotDatesForDay is defined', typeof vm.runInContext('typeof deriveSlotDatesForDay', ctx) === 'string'
  && vm.runInContext('typeof deriveSlotDatesForDay', ctx) === 'function');

// 2. Canonical semester label resolves (this is the alias that used to silently miss).
const monday = call('deriveSlotDatesForDay', 'Semester 1 — 2026/2027', 'Monday');
ok('canonical label "Semester 1 — 2026/2027" resolves to dates', Array.isArray(monday) && monday.length > 0,
   'got ' + JSON.stringify(monday).slice(0, 80));

// 3. Every derived date really is a Monday.
ok('every derived Monday date is a Monday',
   monday.every(d => new Date(d + 'T12:00:00').getDay() === 1),
   monday.filter(d => new Date(d + 'T12:00:00').getDay() !== 1).join(', '));

// 4. Dates sit inside the canonical semester window.
ok('derived dates are within semester start/end',
   monday.every(d => d >= autumn.start && d <= autumn.end),
   'window ' + autumn.start + '→' + autumn.end + ' got ' + monday[0] + '→' + monday[monday.length - 1]);

// 5. Holidays are excluded — no date may fall inside a canonical holiday range.
const inHoliday = monday.filter(d =>
  autumn.holidays.some(h => d >= h.start && d <= h.end));
ok('no derived date falls in a school holiday', inHoliday.length === 0, inHoliday.join(', '));

// 6. Session count is sane vs the canonical reference (16 for 2026-autumn).
//    Different weekdays legitimately yield 15-17; assert a tight band, not equality.
ok('Monday session count is within 2 of the canonical reference (' + autumn.total_sessions_reference + ')',
   Math.abs(monday.length - autumn.total_sessions_reference) <= 2,
   'got ' + monday.length);

// 7. Every weekday resolves to a non-empty list.
for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
  const d = call('deriveSlotDatesForDay', 'Semester 1 — 2026/2027', day);
  ok(day + ' derives a non-empty date list', Array.isArray(d) && d.length > 0, 'got ' + (d || []).length);
}

// 8. The raw chip label must ALSO work once normalised — this is the exact bug
//    that made Tono's classes invisible ("Sep 2026" never matched the feed).
const viaChip = call('deriveSlotDatesForDay', call('canonicalSemesterName', 'Sep 2026'), 'Monday');
ok('chip label "Sep 2026" normalises and derives the same dates',
   JSON.stringify(viaChip) === JSON.stringify(monday),
   'chip gave ' + (viaChip || []).length + ', canonical gave ' + monday.length);

// 9. Fail-safe: unknown input returns [] rather than throwing or inventing dates.
ok('unknown semester returns [] (no invented dates)',
   JSON.stringify(call('deriveSlotDatesForDay', 'Not A Semester', 'Monday')) === '[]');
ok('unknown day returns []',
   JSON.stringify(call('deriveSlotDatesForDay', 'Semester 1 — 2026/2027', 'Funday')) === '[]');
ok('empty args return []',
   JSON.stringify(call('deriveSlotDatesForDay', '', '')) === '[]');

// 10. Spring 2027 also resolves (guards against a 2026-only hardcode).
const spring = call('deriveSlotDatesForDay', 'Semester 2 — 2026/2027', 'Monday');
ok('Spring 2027 semester also derives dates', Array.isArray(spring) && spring.length > 0,
   'got ' + (spring || []).length);

console.log('\n' + (fail === 0 ? '✓' : '✗') +
  ` derive-dates: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
