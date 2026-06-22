#!/usr/bin/env node
// Structural contract tests for the Shoonya forms backend.
// Run: node forms/_tests/structural.mjs   (from the Event Submission dir)
// Tests:
//  T1 — SUBMISSION_HEADERS entry counts match the known-good baseline (24/33/16/24).
//  T2 — every key in the weekly golden payload is READ by the backend
//       (data.<key> appears in code.gs) OR is a known meta/internal key.
//       Catches "sent but silently dropped" regressions after the kernel migration.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');               // Event Submission/
const code = readFileSync(join(root, 'backend', 'code.gs'), 'utf8');
const golden = JSON.parse(readFileSync(join(here, 'weekly-golden-payload.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

// ── T1: SUBMISSION_HEADERS counts ──
console.log('T1 — SUBMISSION_HEADERS counts');
const expected = { 'weekly-class': 24, 'workshop': 33, 'social-event': 16, 'festival': 24 };
for (const [type, want] of Object.entries(expected)) {
  const m = code.match(new RegExp("'" + type.replace(/[-]/g, '\\-') + "'\\s*:\\s*\\[([^\\]]*)\\]"));
  if (!m) { bad(`${type}: header array not found`); continue; }
  const count = (m[1].match(/'/g) || []).length / 2;   // count quoted strings
  count === want ? ok(`${type}: ${count} headers`) : bad(`${type}: ${count} headers (expected ${want})`);
}

// ── T2: weekly payload key coverage ──
console.log('T2 — weekly payload keys read by backend (no silent drops)');
// keys the backend intentionally does NOT read as data.<key> (meta/routing/internal/composed)
const META = new Set(['action','type','structured','submitted_via','testMode','_note',
  'descriptions_by_level',   // composed into class_description; excluded as internal
]);
for (const key of Object.keys(golden)) {
  if (META.has(key)) { ok(`${key} (meta/internal — not read directly, expected)`); continue; }
  // read as data.<key> anywhere in the backend?
  const read = code.includes('data.' + key) || code.includes("data['" + key + "']");
  read ? ok(`${key} → read by backend`) : bad(`${key} → SENT but NOT read by backend (silent drop?)`);
}

console.log(`\n${fail ? '✗' : '✓'} structural: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
