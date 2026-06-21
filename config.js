// ============================================================
// SHOONYA — Shared Configuration
// Edit this file only. All forms read from here.
// ============================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwh9PSrNxMUkBaMayhyfnU3XDzL76khEm7RL932CJ83qqm7dTG9afA-WB1cZYKSrcs3/exec'; // paste your deployed Apps Script URL here

// Standalone "Forms Watchdog" — a SEPARATE Apps Script project (watchdog/Code.js).
// Forms POST here ONLY if the primary submission above fails, so a teacher's data
// is never lost during a backend outage. Independent on purpose: a main-backend
// bug can't take this down too. See watchdog/Code.js for the uptime monitor.
const BACKUP_URL = 'https://script.google.com/macros/s/AKfycbymKXZpTbxHpZve3JeYfg53bTR54WQtlfXTMmqHNAdsFc-9WF-42bM3d4CATfuMJLyNtA/exec';

// Shared best-effort backup: fire-and-forget the payload to the watchdog sink.
// no-cors so it never throws and never blocks the UI; we can't read the response,
// but the submission lands in the backup sheet. Safe to call even before BACKUP_URL
// is authorized (it just no-ops on the wire).
function sendToBackup(payload, reason) {
  try {
    if (typeof BACKUP_URL !== 'string' || !BACKUP_URL) return;
    var body = JSON.stringify(Object.assign({ _backupReason: reason || 'primary failed' }, payload || {}));
    fetch(BACKUP_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body });
  } catch (e) { /* best effort only */ }
}
