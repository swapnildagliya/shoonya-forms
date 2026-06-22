// Deterministic fill + payload-capture for the FESTIVAL form.
// Run via the Preview MCP preview_eval. The festival form is gated behind a
// client-side login check (reads localStorage.shoonya_session) — STUB it first,
// THEN navigate (the gate runs on load):
//   localStorage.setItem('shoonya_session', JSON.stringify({profile:{name:'ZZ QA Org', email:'swapkebolly@gmail.com'}}));
//   location.href='/Festival/index.html?test=1';
// (Server root = forms/ folder, so the path is /Festival/index.html, NOT /forms/...)
//
// Then run THIS fill. It returns { payload }. The payload MUST deep-equal
// festival-golden-payload.json (order-independent, 37 keys) after the migration —
// EXCEPT `submissionText`'s last line carries a `new Date()` timestamp, so this
// fill NORMALIZES it to "Submitted: <NORMALIZED>" (the golden stores it that way too).
//
// Photo-free by design (banner/additional image inputs left empty → photos:[]).
// Festival has NO draft (saveDraft/restoreDraft don't exist) — so the only gate
// is the fresh-fill round-trip; there is no draft-restore check.
//
// NOTE: submitForm() builds the payload, stashes it in the module-level
// `_festivalPending`, and opens the review modal (it does NOT hit the network).
// confirmAndSubmit() is what sends `_festivalPending.payload`. We capture from
// `_festivalPending.payload` directly (identical to what would be sent).
// alert()/confirm() are stubbed so a far-future-date confirm or any validation
// alert can't block; if validation FAILS, `_festivalPending` stays null.
(async () => {
  const _alert = window.alert; window.alert = () => {};
  const _confirm = window.confirm; window.confirm = () => true;
  const setV = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } };

  // Organiser
  setV('first-name', 'ZZ'); setV('last-name', 'QA Org'); setV('display-name', 'ZZ QA Festival Org'); setV('email', 'swapkebolly@gmail.com');
  setV('co-organiser', 'ZZ Partner Org');   // 2026-06-21: co-organiser field
  // Festival meta — language MUST be a real <select> option ('English'), not 'EN'
  setV('festival-name', 'ZZ QA Festival'); setV('tagline', 'ZZ tagline'); setV('date-start', '2026-11-21'); setV('date-end', '2026-11-22');
  setV('dance-styles', 'Bachata, Salsa'); setV('venue', 'Shoonya Dance Centre'); setV('language', 'English'); setV('dress-code', 'Casual');
  if (typeof buildDayTabs === 'function') buildDayTabs();   // builds festivalDays + repopulates seeded slot's day-select

  // Programme — fill the one seeded slot (selects take the option text as value)
  const slot = document.querySelector('#programme-slots .slot-card');
  if (slot) {
    const set = (cls, v) => { const e = slot.querySelector(cls); if (e) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('.day-select', '2026-11-21'); set('.slot-start', '10:00'); set('.slot-end', '12:00'); set('.slot-type', 'Workshop');
    set('.slot-title', 'ZZ QA workshop'); set('.slot-teacher', 'ZZ Teacher'); set('.slot-level', 'All Levels'); set('.slot-studio', 'Art Deco');
    set('.slot-inclusion', 'Separate ticket');   // 2026-06-21: structured pass-inclusion
    set('.slot-fee', '15');   // 2026-06-21: optional per-slot fee
  }
  // Teacher
  addTeacherCard(); await new Promise(r => setTimeout(r, 60));
  const tc = document.querySelector('#teachers-list .person-card');
  if (tc) { const set = (cls, v) => { const e = tc.querySelector(cls); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('.tc-first', 'ZZ'); set('.tc-last', 'Teacher'); set('.tc-display', 'ZZ Display'); set('.tc-style', 'Bachata'); set('.tc-bio', 'ZZ bio'); set('.tc-link', 'https://example.com'); }
  // DJ
  addDjCard(); await new Promise(r => setTimeout(r, 60));
  const dj = document.querySelector('#djs-list .person-card');
  if (dj) { const set = (cls, v) => { const e = dj.querySelector(cls); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('.dj-name', 'ZZ DJ'); set('.dj-styles', 'Salsa'); set('.dj-bio', 'ZZ dj bio'); }
  // Pricing — fill ALL 3 seeded tiers (a labelled tier with no amount fails validation)
  const tiers = [...document.querySelectorAll('#price-tiers .price-tier')];
  const fillTier = (t, label, desc, reg, early, mem) => { if (!t) return; const set = (cls, v) => { const e = t.querySelector(cls); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } }; set('.tier-label', label); set('.tier-desc', desc); set('.tier-regular', reg); set('.tier-early', early); set('.tier-member', mem); };
  fillTier(tiers[0], 'Full Pass', 'All workshops', '90', '75', '80');
  fillTier(tiers[1], 'Day Pass', 'One day', '40', '35', '36');
  fillTier(tiers[2], 'Single Workshop', 'One session', '20', '', '18');
  setV('early-bird-deadline', '2026-11-14'); setV('group-min', '5'); setV('group-price', '70'); setV('group-perk', 'free drink');
  setV('description', 'ZZ QA festival description.'); setV('practical', 'ZZ practical info.'); setV('notes', 'ZZ NOTE FOR SHOONYA.');

  let err = null; try { await submitForm(); } catch (e) { err = String(e); }
  window.alert = _alert; window.confirm = _confirm;

  const p = (typeof _festivalPending !== 'undefined' && _festivalPending) ? _festivalPending.payload : null;
  if (p && p.submissionText) p.submissionText = p.submissionText.replace(/Submitted: .*/, 'Submitted: <NORMALIZED>');
  return { submitErr: err, payloadKeys: p ? Object.keys(p).length : 0, payload: p };
})()
