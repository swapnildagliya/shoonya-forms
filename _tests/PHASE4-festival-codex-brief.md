# Phase 4 — Festival form-kernel migration: independent live verification (Codex)

**Context.** `forms/Festival/index.html` was migrated to the shared `forms/form-kernel.js` engine. Its collect + buildPayload now run through one `FESTIVAL_SPEC`. The big structural fix: teachers/djs/pricing/programme used to be iterated TWICE (once for the `submissionText` text blob, once for the structured arrays) — now FOUR single-source collectors (`festCollect{Programme,Teachers,Djs,Pricing}`) feed BOTH the payload and a pure `festBuildSubmissionText` formatter. The review modal (`openFestivalReview`) and the alert-based validation gate are unchanged. Festival has NO draft (none was added). SOURCE-ONLY — NOT deployed. Background: `memory/reference_form_kernel.md`, `truth/decisions.md` (Form changes log, top row).

Claude already verified the golden gate in the live preview: fresh-fill payload == golden 36/36 (incl. full `submissionText`), banner photo path works, structural 30/30, 0 console errors. Your job is the INDEPENDENT, broader pass — especially multi-item repeaters and the photo roles.

**Serve + open.** Server config `opendeurdag-new-surfaces` serves the Event Submission root on port 8771. The festival form is gated behind a CLIENT-SIDE login check (`localStorage.shoonya_session`). STUB it, THEN open (the gate runs on load):
```
localStorage.setItem('shoonya_session', JSON.stringify({profile:{name:'ZZ QA Org', email:'swapkebolly@gmail.com'}}));
location.href='http://localhost:8771/forms/Festival/index.html?test=1';
```
Capture the payload from the module-level `_festivalPending.payload` AFTER calling `submitForm()` (it builds + stashes + opens the review modal; it does NOT hit the network — `confirmAndSubmit()` sends it). Stub `window.alert`/`window.confirm` so a far-future-date confirm or validation alert can't block. Verify in a REAL browser, not jsdom. `submissionText`'s last line has a `new Date()` timestamp — normalize `/Submitted: .*/` before comparing.

**Baseline regression (must still pass).**
Run `forms/_tests/festival-fill.eval.js` deterministic fill → `submitForm()` → `_festivalPending.payload` deep-equals `forms/_tests/festival-golden-payload.json` (order-independent, **37 keys**, timestamp normalized).

**NEW fields added 2026-06-21 (verify these specifically):** optional per-slot fee (`.slot-fee` → `programme[].fee`, prints "€15"/"Free" in submissionText); **structured per-slot pass-inclusion** (`.slot-inclusion` → `programme[].inclusion`: ''=Included in pass / "Separate ticket" / "Add-on" / "Free"); 4 new activity types (Lecture / Discussion, Film Screening, Guided Tour, Museum Exhibition); optional co-organiser (`#co-organiser` → `co_organiser` + submissionText "Co-organiser:" line); Level options "Adv. Beginner" + "Standard". **Teacher + studio are now required ONLY for teaching/performing slots** — optional for Lecture/Film/Guided Tour/Museum Exhibition/Other (verify: a Museum Exhibition slot with no teacher/studio submits; a Workshop with no teacher is still blocked). The golden exercises co_organiser="ZZ Partner Org", slot fee="15", slot inclusion="Separate ticket". NOTE: `co_organiser` + `programme[].fee` + `inclusion` reach the payload + submissionText (RAW email) but NOT dedicated sheet columns yet — backend follow-up; don't flag as data loss.

**Edge cases NOT covered by the golden (the real Phase-4 value).** The golden has only 1 programme slot / 1 teacher / 1 DJ. For each: fill → `submitForm()` → sanity-check `_festivalPending.payload` AND that `submissionText` lists every item.
- **Multi-day programme:** 2-day festival, ≥3 slots across BOTH days, mixed activity types (Workshop / Social Dance / Performance / Opening Party). Confirm `programme[]` order + each slot's computed fields, and that `submissionText` groups slots by day in `festivalDays` order with "Unassigned" last.
- **Multiple teachers + DJs:** add 2–3 of each → `teachers[]`/`djs[]` arrays AND the text blob both list all, in order. Check the teacher "Legal Name" line in `submissionText` prints under the exact original condition (`display && (first||last)`) — even when the typed display name equals "First Last".
- **Pricing variety:** a tier with only `regular`, one with all three (regular/early/member), one marked "free" in the label/desc with no amounts (must pass validation), and confirm an empty tier is dropped. A labelled tier with NO amount and NOT free must be REJECTED (alert).
- **Photos (DataTransfer):** inject a banner image (`#banner-input`) and 1–2 additional images → `photos[]` carries `role:'banner'` first then `role:'additional'`, each with real b64. HEIC must be rejected with a surfaced message.
- **Validation gate:** missing required field, end-date-before-start, a programme slot missing day/start/end/title/teacher/studio, after-midnight time sanity — each blocks with an alert and no payload is built.
- **Review modal:** open it for a rich multi-item fill; confirm teachers/djs/pricing/programme/photos all render and match the payload.

**Known by-design behaviors — do NOT report as bugs:**
- Review modal is hand-written (`openFestivalReview`), NOT kernel-derived; every FESTIVAL_SPEC field is `review:false`.
- `extra` (merged after buildPayload): `festival_days`, `uitpas_pct` (CONFIG.uitpasDiscount||80), `structured:true`, `action`, `type`, `submissionText`. `photos` merged after that (async). `testMode` last.
- Several inputs feed multiple payload keys (title+event_title, description+approved_description, notes+note_shoonya, start_date+date, teacher_name+organiser_name) — intentional aliases.
- `language` is a `<select>` — its payload value is the option text (e.g. "English"), not a code.
- `teachers[]` collector carries internal helper keys for the text formatter but the payload `teachers[]` is stripped to `{legal_name, display_name, style, bio, link}` via payloadValue.
- Festival has NO draft — there is no saveDraft/restoreDraft and none should exist.
- Login gate is client-side only (localStorage) — submit itself is public (no token).

**REAL-DATA stress test (new — Swapnil supplied 3 real festivals).** After the synthetic golden passes, also try filling the form with the three real programs in `forms/_tests/real-festival-test-cases.md` (Ghent Tap Festival, Leylet Raqs Heritage, GIDF 2026 — the GIDF program files are in `/Users/swapnil/Documents/Claude/Projects/GIDF/2026/`, read them directly). These are "does every piece of info have a home?" checks, not byte-goldens. Swapnil has DECIDED that Lecture/Film/Tour/Museum-Exhibition items use type="Other" with the real label in the slot title — do NOT flag that as a gap. DO confirm/triage the real open gaps: per-slot fee/ticket (tour 15€, gala/theatre 20€, GIDF Gala €20), multi-window cross-day exhibition hours, co-organiser (Ghent Tap = Shoonya & Tapdance Promotion), and Level vocabulary ("Adv. Beg"/"Standard"). Report which of these are worth a form change vs acceptable-as-description.

**Deliverable.** Pass/fail per check + any P1/P2 with file:line and repro. Triage real-regression vs pre-existing/by-design. Do not fix or deploy — report back to Swapnil.
