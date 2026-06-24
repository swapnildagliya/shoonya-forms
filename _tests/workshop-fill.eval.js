// Deterministic fill + payload-capture for the workshops form.
// Run via the Preview MCP preview_eval against
//   http://localhost:8771/forms/smart-form/workshops.html?test=1
// (reload the page first for a clean state). Returns { fill, capturedKeys, payload }.
// The returned `payload` MUST deep-equal workshop-golden-payload.json (order-independent)
// after the form-kernel migration — that's the migration's acceptance test.
//
// Photo-free by design (no guest teacher → no required photo): guest/host b64 are
// null and photos:[] so the baseline is binary-stable and reproducible.
(async () => {
  const setV = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } return !!e; };
  const clickVal = (cid, val) => { const c = document.querySelector(`#${cid} .chip[data-val="${val}"]`); if (c) c.click(); return !!c; };
  const loginProfile = { name: 'ZZ QA Kernel Teacher', email: 'swapkebolly@gmail.com', photo_url: 'https://example.com/teacher.jpg', bio_short: 'Test bio', dance_styles: '["Bachata","Salsa"]' };
  localStorage.setItem('shoonya_session', JSON.stringify({ profile: loginProfile, token: 'test-token' }));
  window.dispatchEvent(new CustomEvent('shoonya:login', { detail: loginProfile }));
  const log = {};

  log.name  = document.getElementById('f-teacher-name')?.value === loginProfile.name;
  log.email = document.getElementById('f-teacher-email')?.value === loginProfile.email;
  log.title = setV('f-title', 'ZZ QA Kernel Workshop');

  log.format = clickVal('format-chips', 'single');
  // multi-style + multi-level to exercise array round-trip
  log.style1 = clickVal('style-chips', 'Bachata');
  log.style2 = clickVal('style-chips', 'Salsa');
  log.level1 = clickVal('level-chips', 'Beginner');
  log.level2 = clickVal('level-chips', 'Open level');
  // EN is preset on load; leave langs = ['EN']. studio/partner defaults preset on load.

  // Specific date pattern (default). Fill the seeded date row → triggers preview render.
  const dateInput = document.querySelector('#specific-dates-list [data-ws-specific-date]');
  if (dateInput) { dateInput.value = '2026-10-15'; dateInput.dispatchEvent(new Event('change', { bubbles: true })); }
  log.date = !!dateInput;
  await new Promise(r => setTimeout(r, 120));

  // Per-session topic (inputs exist now that preview rendered)
  const topicInp = document.querySelector('#session-topics-list input[data-idx="0"][data-field="topic"]');
  if (topicInp) { topicInp.value = 'ZZ QA topic'; topicInp.dispatchEvent(new Event('input', { bubbles: true })); }
  log.topic = !!topicInp;

  // Pricing (single → no early-bird, no couple). Full price → member auto 10% off.
  log.price = setV('f-price-full', '45');
  log.notes = setV('f-pricing-notes', 'ZZ QA pricing notes.');

  // Content
  setV('f-description', 'ZZ QA kernel description.');
  setV('f-prereq', 'None.');
  setV('f-bring', 'Water.');
  setV('f-note', 'ZZ QA NOTE FOR SHOONYA kernel.');
  setV('f-co-teacher', 'ZZ Co Teacher');

  // Logistics
  setV('f-max', '16');
  setV('f-min', '4');
  setV('f-min-age', '16');

  // Capture the outgoing payload by intercepting fetch (test-mode response).
  window.__cap = null;
  const of = window.fetch;
  window.fetch = function (u, o) {
    try { window.__cap = JSON.parse(o.body); } catch (e) { window.__cap = { err: String(e) }; }
    return Promise.resolve(new Response(JSON.stringify({ ok: true, testMode: true, preview: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  try { await submitForm(); } catch (e) { log.submitErr = String(e); }
  window.fetch = of;

  return { fill: log, capturedKeys: window.__cap ? Object.keys(window.__cap).length : null, payload: window.__cap };
})()
