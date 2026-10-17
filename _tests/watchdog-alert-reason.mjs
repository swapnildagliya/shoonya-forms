#!/usr/bin/env node
// watchdog/Code.js doPost: the backup-path alert mail names the reason (data._backupReason), '?' when missing.
//   node forms/_tests/watchdog-alert-reason.mjs   (from the Event Submission dir)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(process.env.WATCHDOG_SRC || path.join(ROOT, 'watchdog/Code.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? ' — ' + d : '')); } };

function send(data) {
  const mails = [], rows = [];
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet-id' }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ appendRow: (r) => rows.push(r) }) }) },
    MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
    ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  vm.runInContext('globalThis.__doPost = doPost', ctx);
  ctx.__doPost({ postData: { contents: JSON.stringify(data) } });
  return { mails, rows };
}
console.log('watchdog alert mail');
{
  const r = send({ type: 'workshop', teacher_name: 'Sonja', email: 's@x.test', _backupReason: 'Failed to fetch' });
  ok('one alert mail', r.mails.length === 1);
  ok('mail carries "Reason: Failed to fetch"', /\nReason: Failed to fetch\n/.test(r.mails[0].body), r.mails[0].body);
  ok('sheet row still carries the reason', r.rows[0][4] === 'Failed to fetch');
}
{
  const r = send({ type: 'workshop', teacher_name: 'Sonja', email: 's@x.test' });
  ok('no reason -> "Reason: ?"', /\nReason: \?\n/.test(r.mails[0].body), r.mails[0].body);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
