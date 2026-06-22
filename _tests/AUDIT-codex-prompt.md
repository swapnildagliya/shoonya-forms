# Codex prompt — full audit + test of the Shoonya forms kernel migration + backend

Paste the block below into Codex. It uses ABSOLUTE paths (the files live outside any single session folder). Codex should VERIFY in a real browser (Chrome/CDP) where possible; if the browser can't launch, do the static/source + structural + live-curl pass and SAY the browser gate was skipped — don't silently pass it.

```
Audit + test the Shoonya teacher-submission forms after their form-kernel migration
and the festival backend changes. Read by ABSOLUTE PATH. Do NOT fix, deploy, commit,
or make any real (non-test) submission. Report pass/fail per check + any P1/P2 with
file:line + repro, and triage each as real-regression vs by-design.

REPO ROOTS
- Forms + tests: /Users/swapnil/Documents/Claude/Projects/Event Submission/forms/
- Backend (Apps Script source): /Users/swapnil/Documents/Claude/Projects/Event Submission/backend/
- Decisions log (context): /Users/swapnil/Documents/Claude/Projects/Event Submission/truth/decisions.md (Form changes log, top rows)
- GIDF 2026 real program (for the festival real-fit check): /Users/swapnil/Documents/Claude/Projects/GIDF/2026/

WHAT SHIPPED (verify it all holds)
- All 4 submission forms now route collect/payload/draft(/review) through one shared
  window.FormKernel (forms/form-kernel.js) + a per-form FIELD_SPEC:
  weekly-classes.html (WEEKLY_SPEC), workshops.html (WORKSHOP_SPEC),
  social-nights.html (SOCIAL_SPEC), Festival/index.html (FESTIVAL_SPEC).
  profile.html is intentionally NOT migrated (inline editor — out of scope).
- Festival gained: per-slot fee (programme[].fee) + structured pass-inclusion
  (programme[].inclusion: ''/Separate ticket/Add-on/Free), 4 activity types
  (Lecture / Discussion, Film Screening, Guided Tour, Museum Exhibition),
  co_organiser, levels "Adv. Beginner"/"Standard", and teacher/studio optional for
  non-teaching slot types.
- login-panel.js fill() now only fills EMPTY fields (Phase-4 P0 — was clobbering a
  typed Festival display-name via a 50ms-delayed prefill). Scope: only Festival has
  the first-name/display-name/email fields it targets.
- Backend (deployed, BACKEND_VERSION '2026-06-22-festival-cols-2'): festival sheet
  Programme column now includes per-slot inclusion+fee; new 'Co-organiser' column
  APPENDED (festival headers 23→24); teacher confirmation shows co-organiser + fee/
  inclusion; dead buildOpendeurSummary hardened; initialiseAllSheets now sources the
  canonical SUBMISSION_HEADERS; added zero-arg writeCanonicalHeaders() wrapper.

A) CONTRACT / STRUCTURAL (node, no browser)
- Run: node forms/_tests/structural.mjs  → expect 30/30. (Header counts 24/33/16/24
  + every weekly golden payload key is read by code.gs.)
- Confirm buildSheetRow(festival) outputs 24 values matching SUBMISSION_HEADERS['festival']
  (the 24th = data.co_organiser). Confirm the festival Programme cell builder includes
  s.inclusion + a fee label.

B) GOLDEN ROUND-TRIPS (real browser; the core test)
Serve the Event Submission root on a local port (e.g. 8771). For each form: CLEAR
localStorage drafts, reload, run the saved deterministic fill, intercept the outgoing
fetch (or read the stashed payload) and DEEP-EQUAL it (order-independent) to the golden.
IGNORE the golden's "_note" doc key. Festival: normalize submissionText's trailing
"Submitted: ..." timestamp to "Submitted: <NORMALIZED>".
- weekly:   forms/_tests/weekly-fill.eval.js   == weekly-golden-payload.json   (25 real keys)
- workshops:forms/_tests/workshop-fill.eval.js == workshop-golden-payload.json (44 keys)
- social:   forms/_tests/social-fill.eval.js   == social-golden-payload.json   (31 keys)
- festival: forms/_tests/festival-fill.eval.js == festival-golden-payload.json (37 keys)
  Festival login gate is CLIENT-SIDE: localStorage.setItem('shoonya_session',
  JSON.stringify({profile:{name:'ZZ QA Org',email:'swapkebolly@gmail.com'}})) BEFORE
  navigating to /Festival/index.html?test=1. submitForm() stashes the payload in the
  module var _festivalPending (no network); capture _festivalPending.payload. Stub
  window.alert/confirm so validation/far-future-date prompts don't block.

C) DRAFT-RESTORE ROUND-TRIPS (weekly/workshops/social only — festival has no draft)
For each: run the fill, FormKernel.saveDraft(<SPEC>, <DRAFT_KEY>), reload (keep draft),
let it auto-restore on load, submit → payload must STILL deep-equal the golden. This is
the historically fragile path (repeater/levels/sessions DOM rebuild). Draft keys:
shoonya_weekly_draft_v2 / shoonya_workshop_draft_v2 / shoonya_socialnight_draft_v2.

D) FESTIVAL NEW-FIELD + REGRESSION CHECKS (real browser)
- Phase-4 P0 regression guard: after the 50ms login-panel prefill fires, a typed
  Festival display-name must SURVIVE (teacher_name/organiser_name = the typed value,
  not the session profile name). Also: a typed value must not be clobbered on a
  re-dispatched 'shoonya:login'.
- Per-slot fee + inclusion present in payload AND in the submissionText slot line.
- 4 new activity types selectable; "Adv. Beginner"/"Standard" levels present.
- Teacher/studio conditional: a "Museum Exhibition" slot with NO teacher/studio
  SUBMITS; a "Workshop" with no teacher is BLOCKED.
- Photos via DataTransfer: banner first then additional; real b64. HEIC rejected.

E) REAL-FESTIVAL FIT (does every piece of info have a home?)
Using forms/_tests/real-festival-test-cases.md, fill Ghent Tap, Leylet Raqs, and GIDF
2026 (GIDF program at /Users/swapnil/Documents/Claude/Projects/GIDF/2026/). By design:
Lecture/Film/Tour/Museum use type + the structured fields; museum multi-window hours
need multiple slots (open-hours model intentionally not built); breaks omitted.

F) LIVE DEPLOY SANITY (curl)
- https://forms.shoonyadance.com/{smart-form/weekly-classes,smart-form/workshops,
  smart-form/social-nights,Festival/index}.html → each contains form-kernel.js + its SPEC.
- https://forms.shoonyadance.com/login-panel.js contains the only-if-empty guard
  ("value && !el.value").
- Backend version endpoint returns {"ok":true,"version":"2026-06-22-festival-cols-2"}.
  (curl the /exec?action=version of the deployment — verify with curl, NOT a browser
  fetch, which masks errors via CORS + multi-account /u/1 rewrite.)

KNOWN BY-DESIGN (do NOT flag): profile.html unmigrated; festival has no draft; review
modals on social+festival are hand-written (review:false on spec fields); co_organiser
+ programme[].fee/inclusion reach payload + submissionText (RAW email) and the sheet,
long slot desc stays in the RAW blob not the compact Programme cell; the golden "_note"
key is documentation; festival submissionText carries a timestamp (normalize it); the
live Festivals sheet row-1 'Co-organiser' header is written by running
writeCanonicalHeaders() in the Apps Script editor (may not be run yet — data still
lands in the column + RAW email regardless).
```
