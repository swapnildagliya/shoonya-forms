# Phase 4 — Workshops form-kernel migration: independent live verification (Codex)

**Context.** `forms/smart-form/workshops.html` was migrated to the shared `forms/form-kernel.js` engine. All 5 paths (collect / draft / restore / review / payload) now read from one `WORKSHOP_SPEC` (35 fields). This is SOURCE-ONLY — NOT deployed, NOT committed. Do not deploy. Background: `memory/reference_form_kernel.md`, `truth/decisions.md` (Form changes log, top two rows).

Claude already verified the golden gate in the live preview: fresh-fill payload == golden 44/44, draft-restore == golden 44/44, review 7 sections, 0 console errors, structural 30/30. Your job is the INDEPENDENT, broader pass.

**Serve + open.** Server config `opendeurdag-new-surfaces` serves the Event Submission root on port 8771. Open `http://localhost:8771/forms/smart-form/workshops.html?test=1` (test mode → backend previews, never saves). Capture the payload by intercepting `window.fetch` inside `submitForm` (see `forms/_tests/workshop-fill.eval.js`). Verify in a REAL browser, not jsdom.

**Baseline regression (must still pass).**
1. Run `forms/_tests/workshop-fill.eval.js` deterministic fill → submit → payload deep-equals `forms/_tests/workshop-golden-payload.json` (order-independent, 44 keys).
2. Same fill → `FormKernel.saveDraft(WORKSHOP_SPEC, WS_DRAFT_KEY)` → reload (keep draft) → auto-restore on load → submit → payload deep-equals golden.

**Edge cases NOT covered by the golden (the real Phase-4 value) — for each: fill → submit → sanity-check payload, then draft→reload→restore→submit → must reproduce the same payload:**
- **Date patterns:** `series` format (type must become `"series"`, early-bird block appears), `recurring` weekly (dow + start/end → multiple sessions; the silent date-shift note), `contiguous` (date range → consecutive sessions). Confirm `sessions[]` regenerates identically after restore for each.
- **Per-session overrides:** different times per session (`f-times-differ` on) + per-session topics → survive restore (these were dropped before).
- **Drop-in:** `f-single-session` on, then UNCHECK some sessions → `dropIn` flags per session must match after restore (drop-in EXCLUSIONS are what's persisted).
- **Pricing:** per-session price + couple price (toggle on) + early-bird price + deadline → present in payload and review; member price auto = full × 0.90.
- **Guest teacher + photo:** fill guest name (reveals bio/photo) + attach a photo → `photos[]` gets a `guest_teacher` entry with b64; validation requires the photo when a guest name is set. (Photos are NOT in the draft — can't serialize a File — so don't expect them to survive reload; that's by design.)
- **Min participants** set → min-cancel chip (`Cancel + notify` = `min_cancel_if_under:true`) survives restore.
- **Review modal:** open it for a rich fill; confirm sections render and the Photos status line shows.

**Known by-design behaviors — do NOT report as bugs:**
- Form keeps its `state` object; chip restore CLICKS chips (so `bindChips` repopulates `state`).
- Numeric fields are `getNum()` → number-or-null; capacity/age/min use `||''` (so blank → `''`, matching legacy).
- Async photos + dynamic `type` live in `submitForm` `extra`, not the spec.
- Teacher name/email restore is only-if-empty (live login wins).
- `preferred_studio:"No preference"` and `partner_required:false` are SENT but the review shows studio always / partner only when truthy (legacy parity).
- Draft key bumped `shoonya_workshop_draft_v1` → `_v2` (stale v1 drafts are ignored).

**Deliverable.** Pass/fail per check + any P1/P2 with file:line and repro. Triage each finding as real-regression vs pre-existing/by-design. Do not fix or deploy — report back to Swapnil.
