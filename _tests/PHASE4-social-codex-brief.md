# Phase 4 — Social-nights form-kernel migration: independent live verification (Codex)

**Context.** `forms/smart-form/social-nights.html` was migrated to the shared `forms/form-kernel.js` engine. The collect / draft / restore / payload paths now read from one `SOCIAL_SPEC`. The review modal (`_buildReviewSummaryHtml`) was kept hand-written on purpose (every spec field is `review:false`) — its conditional DJ rows are intricate/user-facing. This is SOURCE-ONLY — NOT deployed, NOT committed. Do not deploy. Background: `memory/reference_form_kernel.md`, `truth/decisions.md` (Form changes log, top row).

Claude already verified the golden gate in the live preview: fresh-fill payload == golden 31/31, draft save→reload→restore==golden 31/31, structural 30/30, 0 console errors. Your job is the INDEPENDENT, broader pass — **including the parts the golden could not cover because file inputs can't be scripted (guest-DJ + photos).**

**Serve + open.** Server config `opendeurdag-new-surfaces` serves the Event Submission root on port 8771. Open `http://localhost:8771/forms/smart-form/social-nights.html?test=1` (test mode → backend previews, never saves). Capture the payload by intercepting `window.fetch` inside `submitForm` (see `forms/_tests/social-fill.eval.js`). Verify in a REAL browser, not jsdom. **Clear localStorage social drafts + reload before each clean fill** (stale drafts re-toggle chips OFF and block validation):
`Object.keys(localStorage).filter(k=>/social|sn-|draft/i.test(k)).forEach(k=>localStorage.removeItem(k));location.reload();`

**Baseline regression (must still pass).**
1. Run `forms/_tests/social-fill.eval.js` deterministic fill → submit → payload deep-equals `forms/_tests/social-golden-payload.json` (order-independent, 31 keys).
2. Same fill → `FormKernel.saveDraft(SOCIAL_SPEC, SS_DRAFT_KEY)` → reload (keep draft) → auto-restore on load (IIFE) → submit → payload deep-equals golden. Draft key is `shoonya_socialnight_draft_v2`.

**Edge cases NOT covered by the golden (the real Phase-4 value).** For each: fill → submit → sanity-check payload; then (where serializable) draft→reload→restore→submit must reproduce it.
- **GUEST-DJ music path (golden uses teacher-DJ — THIS is the uncovered path).** Pick "Guest DJ" → fill `f-dj-name`, `f-dj-social`, `f-dj-fee`, attach a DJ photo (`f-dj-photo`). Expected payload: `musicType:"guest-dj"`, `djName`/`djSocials` set, `djFee` = parseFloat(≥0) else null, `teacherDJ:null`, and `photos[]` gets a `role:"dj"` entry with b64 + the flat `dj_photo_b64`/`dj_photo_name` set. Validation must REQUIRE the DJ photo when guest-dj. (Photos aren't serialized into the draft — won't survive reload; by design.)
- **Music-type switching (the conditional-null logic).** Type a DJ name under Guest DJ, then switch to "Playlist only" / teacher-DJ → the stale DJ fields must drop to null in the payload (djName/djSocials/djFee null unless guest-dj; teacherDJ null unless teacher-dj). This is the exact parallel-path bug class — confirm it holds via BOTH submit and review.
- **Playlist-only path:** `musicType:"playlist"`, all DJ/teacherDJ fields null, no DJ photo required.
- **Extra DJs repeater:** `addExtraDJ()` → fill name + social + attach a photo per row → `extraDjs[]` carries name/social; each extra-DJ row with a name REQUIRES a photo (validation) and adds a `photos[]` entry. Names/socials must survive draft restore (photos won't).
- **Programme repeater — workshop/performance slots:** add a slot, set type `workshop` (and another `performance`) → style + teacher/performer name + per-slot teacher photo are all REQUIRED; `programme[]` carries `{type,start,duration,end(computed),level,style,teacher,topic}`. Add multiple slots of mixed types → all survive restore (rebuilt via addProgrammeSlot+setProgType; photos won't). Confirm computed `end` = start+duration for each.
- **Pricing repeater:** add a 3rd tier via `addPricingTier`; a tier with a label but no amount must be rejected (unless free). Tiers survive restore.
- **Custom chips:** add a custom style (`addCustomStyle`) and a custom genre (`addCustomGenre`) → both appear in `styles[]`/`genres[]` and survive restore (re-created as selected chips).
- **Time sanity:** end before doors / dance-floor outside doors–end → validation flags (after-midnight aware). `_collectValidationErrors()` is the SINGLE gate — confirm a DIRECT submit (not via review) still enforces every rule.
- **Early-bird deadline:** set `f-early-deadline` → `earlyDeadline` in payload (ISO) + survives restore; blank → `''` (NOT null — legacy parity).
- **Review modal:** open it for a rich guest-DJ fill; confirm DJ rows, genres, programme, pricing, early-bird all render and match the payload.

**Known by-design behaviors — do NOT report as bugs:**
- Review modal is hand-written (not kernel-derived); every `SOCIAL_SPEC` field is `review:false`. The kernel drives collect/payload/draft only.
- Async items live OUTSIDE the spec and merge as `extra` in `buildPayload`: `photos[]`, flat `dj_photo_b64`/`dj_photo_name`/`guest_teacher_photo_b64`/`guest_teacher_photo_name` (null/"" when photo-free), `action`/`type`/`submitted_via`. `testMode` set after buildPayload.
- `earlyDeadline:''` when blank (not null). `dresscode`/`description`/`notes` → null when blank.
- Teacher name/email restore is only-if-empty (live login wins).
- Photos never survive a draft reload (can't serialize a File) — that's expected.
- Draft key bumped `shoonya_socialnight_draft_v1` → `_v2` (stale v1 ignored).
- The two vestigial `const styles` / `const musicSelected` at the top of `submitForm` are unused leftovers (harmless).

**Deliverable.** Pass/fail per check + any P1/P2 with file:line and repro. Triage each finding as real-regression vs pre-existing/by-design. Do not fix or deploy — report back to Swapnil.
