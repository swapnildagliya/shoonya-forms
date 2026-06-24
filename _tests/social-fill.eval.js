// Deterministic fill + payload-capture for the social-nights form.
// Run via the Preview MCP preview_eval against
//   http://localhost:<port>/forms/smart-form/social-nights.html?test=1
// CLEAR drafts + reload first (see the reload one-liner below) for a clean state.
// Returns { log, capturedKeys, payload }.
// The returned `payload` MUST deep-equal social-golden-payload.json (order-independent)
// after the form-kernel migration — that's the migration's acceptance test.
//
// Photo-free by design: the GUEST-DJ path requires a DJ photo upload (and each
// extra-DJ + each workshop/performance slot teacher requires a photo) which can't
// be scripted into a file input. So the golden uses the TEACHER-DJ music path and
// an "other"-type programme slot with NO teacher name → zero required photos →
// binary-stable, reproducible baseline. The guest-dj conditional (djName/djFee/
// djSocials populated + photos[] dj role), extraDjs[], and per-slot teacher photos
// are NOT in this golden — same gap as workshops' guest-photo: verify those via a
// real human upload submission (Codex / manual), not this fixture.
//
// Reload-clean one-liner (run FIRST, then this fill):
//   (async()=>{Object.keys(localStorage).filter(k=>/social|sn-|draft/i.test(k)).forEach(k=>localStorage.removeItem(k));location.reload();return 'reloading';})()
(async () => {
  const setV = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } return !!e; };
  const styleClick = (re) => { const c = [...document.querySelectorAll('#style-chips .chip')].find(x => re.test(x.textContent)); if (c) c.click(); return !!c; };
  const loginProfile = { name: 'ZZ QA Social Org', email: 'swapkebolly@gmail.com', dance_styles: '["Bachata","Salsa"]' };
  localStorage.setItem('shoonya_session', JSON.stringify({ profile: loginProfile, token: 'test-token' }));
  window.dispatchEvent(new CustomEvent('shoonya:login', { detail: loginProfile }));
  const log = {};

  log.name = document.getElementById('f-teacher-name')?.value === loginProfile.name;
  log.email = document.getElementById('f-teacher-email')?.value === loginProfile.email;
  setV('f-title', 'ZZ QA Social');
  log.s1 = styleClick(/^\s*Bachata\s*$/);
  log.s2 = styleClick(/^\s*Salsa\s*$/);
  setV('f-date', '2026-11-21');
  setV('f-doors', '22:00'); setV('f-end', '02:00');
  setV('f-dn-start', '22:30'); setV('f-dn-end', '02:00');
  setV('f-dresscode', 'ZZ QA dress');
  setV('f-early-deadline', '2026-11-14');

  // music = teacher-dj (photo-free)
  const mc = [...document.querySelectorAll('#music-type-chips .music-chip')].find(c => c.dataset.val === 'teacher-dj');
  if (mc) mc.click();
  await new Promise(r => setTimeout(r, 120));
  log.tdj = setV('f-teacher-dj', 'ZZ QA Teacher DJ');

  // genres (shared across music types) — 2
  const gc = [...document.querySelectorAll('#genre-chips .music-chip')].slice(0, 2);
  gc.forEach(c => c.click()); log.genres = gc.length;

  // programme slot: type "other" + topic, NO teacher → no required photo
  if (typeof addProgrammeSlot === 'function') { addProgrammeSlot(); await new Promise(r => setTimeout(r, 100)); }
  const pc = document.querySelector('#programme-rows .prog-card'); log.progCard = !!pc;
  if (pc) {
    const typeChip = pc.querySelector('.chip[data-type="other"]'); if (typeChip) typeChip.click();
    const set = (q, v) => { const e = pc.querySelector(q); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('[data-slot="start"]', '20:30');
    set('[data-slot="duration"]', '45 min');
    set('[data-slot="level"]', 'Beginner');
    set('[data-slot="style"]', 'Bachata');
    set('[data-slot="topic"]', 'ZZ QA other slot description');
  }

  // pricing tiers (fill the two seeded .pricing-tier rows)
  const tiers = [...document.querySelectorAll('.pricing-tier')]; log.tierRows = tiers.length;
  const fillTier = (t, l, p) => { if (!t) return; const ins = t.querySelectorAll('input'); if (ins[0]) { ins[0].value = l; ins[0].dispatchEvent(new Event('input', { bubbles: true })); } if (ins[1]) { ins[1].value = p; ins[1].dispatchEvent(new Event('input', { bubbles: true })); } };
  fillTier(tiers[0], 'Advance', '8');
  fillTier(tiers[1], 'Door', '12');

  setV('f-description', 'ZZ QA social description.');
  setV('f-notes', 'ZZ QA NOTE FOR SHOONYA.');

  // Capture the outgoing payload by intercepting fetch (test-mode response).
  window.__cap = null;
  const of = window.fetch;
  window.fetch = function (u, o) {
    try { window.__cap = JSON.parse(o.body); } catch (e) { window.__cap = { err: String(e) }; }
    return Promise.resolve(new Response(JSON.stringify({ ok: true, testMode: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  let err = null; try { await submitForm(); } catch (e) { err = String(e); }
  window.fetch = of;

  const errBox = document.getElementById('error-box') || document.querySelector('[id*="err"]');
  return { log, submitErr: err, errShown: errBox && errBox.offsetParent !== null ? (errBox.textContent || '').slice(0, 200) : '', capturedKeys: window.__cap ? Object.keys(window.__cap).length : null, payload: window.__cap };
})()
