#!/usr/bin/env node
// forms/login-panel.js: a stored session is checked once against the backend (getProfile).
//   expired            -> session cleared, shoonya:logout dispatched, page reloaded
//   still valid        -> nothing happens
//   network failure    -> NOT logged out
//   other backend error (ok:false, not "Session expired") -> NOT logged out
//   no stored session  -> no request
//   node forms/_tests/login-session-check.mjs   (from the Event Submission dir)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'forms/login-panel.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } };

async function run({ stored, reply }) {
  const store = new Map(stored ? [['shoonya_session', JSON.stringify(stored)]] : []);
  const log = { fetches: [], events: [], reloads: 0 };
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, appendChild() {}, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const document = {
    readyState: 'complete', head: el(), body: { insertBefore() {}, appendChild() {} },
    createElement: el, getElementById: () => null, addEventListener() {},
  };
  const window = {
    dispatchEvent: (e) => { log.events.push(e.type); }, addEventListener() {},
  };
  const ctx = {
    window, document, location: { reload: () => { log.reloads++; }, pathname: '/smart-form/x.html', search: '' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    APPS_SCRIPT_URL: 'https://example.test/exec', setTimeout: () => 0, console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    encodeURIComponent, JSON, String, Promise,
    fetch: async (url) => { log.fetches.push(url); if (reply instanceof Error) throw reply; return { text: async () => reply }; },
  };
  ctx.window.localStorage = ctx.localStorage;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  return { log, session: store.get('shoonya_session') ?? null };
}

const S = { profile: { name: 'Sonja S', email: 's@x.test' }, token: 'tok123' };

console.log('stored-session check');
{
  const r = await run({ stored: S, reply: JSON.stringify({ ok: false, error: 'Session expired. Please log in again.' }) });
  ok('asks getProfile with the token, once', r.log.fetches.length === 1 && r.log.fetches[0] === 'https://example.test/exec?action=getProfile&token=tok123', r.log.fetches.join());
  ok('expired -> session cleared', r.session === null);
  ok('expired -> shoonya:logout dispatched', r.log.events.includes('shoonya:logout'));
  ok('expired -> page reloaded to the logged-out state', r.log.reloads === 1);
}
{
  const r = await run({ stored: S, reply: JSON.stringify({ ok: true, profile: S.profile }) });
  ok('valid session -> kept, no reload', r.session !== null && r.log.reloads === 0 && !r.log.events.includes('shoonya:logout'));
}
{
  const r = await run({ stored: S, reply: new Error('offline') });
  ok('network failure -> NOT logged out', r.session !== null && r.log.reloads === 0 && !r.log.events.includes('shoonya:logout'));
}
{
  const r = await run({ stored: S, reply: '<html>Bad gateway</html>' });
  ok('non-JSON reply -> NOT logged out', r.session !== null && r.log.reloads === 0);
}
{
  const r = await run({ stored: S, reply: JSON.stringify({ ok: false, error: 'Exception: service unavailable' }) });
  ok('other backend error -> NOT logged out', r.session !== null && r.log.reloads === 0);
}
{
  const r = await run({ stored: null, reply: JSON.stringify({ ok: false, error: 'Session expired.' }) });
  ok('no stored session -> no request', r.log.fetches.length === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
