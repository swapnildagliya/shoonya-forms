#!/usr/bin/env node
// Structural contract tests for the Shoonya forms backend.
// Run: node forms/_tests/structural.mjs   (from the Event Submission dir)
// Tests:
//  T1 — SUBMISSION_HEADERS entry counts match the known-good baseline (24/33/16/24).
//  T2 — every key in every golden payload is READ by the backend/output layer
//       (direct data.<key>, first('<key>'), or a known meta/internal key).
//       Catches "sent but silently dropped" regressions after the kernel migration.
//
// Pair this with:
//   node forms/_tests/readable-output-contract.mjs
// which verifies fields are visible in the human-readable raw/admin formatter.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');               // Event Submission/
const backendDir = join(root, 'backend');
const backendFiles = readdirSync(backendDir)
  .filter((file) => file.endsWith('.gs'))
  .sort();
const backend = backendFiles
  .map((file) => readFileSync(join(backendDir, file), 'utf8'))
  .join('\n');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

// ── T1: SUBMISSION_HEADERS counts ──
console.log('T1 — SUBMISSION_HEADERS counts');
const expected = { 'weekly-class': 24, 'workshop': 33, 'social-event': 16, 'festival': 24 };
for (const [type, want] of Object.entries(expected)) {
  const m = backend.match(new RegExp("'" + type.replace(/[-]/g, '\\-') + "'\\s*:\\s*\\[([^\\]]*)\\]"));
  if (!m) { bad(`${type}: header array not found`); continue; }
  const count = (m[1].match(/'/g) || []).length / 2;   // count quoted strings
  count === want ? ok(`${type}: ${count} headers`) : bad(`${type}: ${count} headers (expected ${want})`);
}

// ── T2: golden payload key coverage ──
console.log('T2 — golden payload keys read by backend/output layer (no silent drops)');
const GOLDENS = {
  weekly: 'weekly-golden-payload.json',
  workshop: 'workshop-golden-payload.json',
  social: 'social-golden-payload.json',
  festival: 'festival-golden-payload.json',
};
// Keys intentionally not read as first-class submitted content.
const META_BY_FORM = {
  weekly: new Set(['_note','action','type','structured','submitted_via','testMode',
    'descriptions_by_level']), // composed into class_description/profile sync
  workshop: new Set(['_note','action','type','structured','submitted_via','testMode',
    'format_internal', 'teacher_known']), // internal display/routing helpers
  social: new Set(['_note','action','type','structured','submitted_via','testMode']),
  festival: new Set(['_note','action','type','structured','submitted_via','testMode',
    'date', 'approved_description']), // aliases for start_date/description
};

function keyIsRead(key) {
  return backend.includes('data.' + key)
    || backend.includes("data['" + key + "']")
    || backend.includes("'" + key + "'")
    || backend.includes('"' + key + '"');
}

for (const [form, file] of Object.entries(GOLDENS)) {
  const golden = JSON.parse(readFileSync(join(here, file), 'utf8'));
  const meta = META_BY_FORM[form] || new Set();
  for (const key of Object.keys(golden)) {
    if (meta.has(key)) { ok(`${form}.${key} (meta/internal/alias — expected)`); continue; }
    keyIsRead(key)
      ? ok(`${form}.${key} → read by backend/output`)
      : bad(`${form}.${key} → SENT but NOT read by backend/output (silent drop?)`);
  }
}

console.log(`\n${fail ? '✗' : '✓'} structural: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
