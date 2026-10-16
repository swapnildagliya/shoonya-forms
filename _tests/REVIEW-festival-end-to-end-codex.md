# Codex review — FESTIVAL submission, end to end (2026-09-28)

READ-ONLY. Do NOT edit, commit, deploy, run clasp, or make any real (non-test) submission.
You may run local read-only commands (node tests, git log/show/diff, grep).
Report findings as P1/P2/P3 · file:line · concrete repro · suggested fix, then one-line verdict.
Say "not checked" for anything you could not verify — never silently pass it.

## The path under review
A festival organiser (a teacher/organiser account) submits a multi-day festival; Shoonya reviews it
in the Shoonya Dance Centre app.

1. **Entry** — forms.shoonyadance.com → `smart-form/index.html` Festival card → `Festival/index.html`
2. **Login gate** — `setFestivalGate` reads `localStorage.shoonya_session`; `login-panel.js`
   `slpOpenModal`/`slpLogin`; incomplete profile → `/profile.html?complete=1&return=…` →
   `profile.html` return banner → back to the form (fixed today: commits ad38e07, 1b36a4e, 3033eb3,
   8684c36 in the deployed clone — already Codex-reviewed, don't redo in depth)
3. **Filling in** — `Festival/index.html`: organiser, festival meta, day tabs (`buildDayTabs`),
   programme slots, teachers, DJs, price tiers, early-bird/group, images, description/practical/notes,
   draft autosave/restore (`FESTIVAL_DRAFT_KEY`), `FESTIVAL_SPEC` via `form-kernel.js`
4. **Validation + review modal** — `submitForm()` → `_festivalPending` → `confirmAndSubmit()`
5. **Send** — `sendToSheet()` POST text/plain to `APPS_SCRIPT_URL` (`config.js`); failure →
   `sendToBackup` (`BACKUP_URL`); photos via `image-resize.js`; `?test=1` → `test-mode.js`
6. **Backend** — `backend/code.gs` doPost → `action:'generateOutputPackage'`, `type:'festival'` →
   `buildSheetRow` → `SUBMISSION_HEADERS['festival']` → `FESTIVAL_SHEET_ID`; photo storage;
   emails (`output-generator.gs`, teacher confirmation); `BACKEND_VERSION`
7. **App pickup** — `backend/AppBridge.gs` `listPendingSubmissions` (`submissionType:'festival'`,
   `bridge:3`, key auth) and the festival mapper (~line 544) → app
   `shoonydance/src/app/admin/submissions/actions.ts` + `SubmissionsClient.tsx` (listing,
   approve/reject; festival approval deliberately creates NO record — "create it by hand",
   ~line 554). Confirm that is what the admin actually sees and that nothing is lost on the way.

## Where the code is
- Forms SOURCE (what DEPLOY-forms rsyncs): `/Users/swapnil/Documents/Claude/Projects/Event Submission/forms/`
- Forms DEPLOYED clone (== forms.shoonyadance.com, GitHub Pages): `/Users/swapnil/Documents/GitHub/shoonya-forms/`
  ⚠️ The source has UNSHIPPED edits to `smart-form/{weekly-classes,workshops,social-nights}.html` and
  `_tests/social-night-dedup.mjs`, `_tests/app-bridge.mjs`. Festival files are identical in both.
  Note if any unshipped change affects the festival path (shared files: form-kernel.js, login-panel.js,
  config.js, test-mode.js, image-resize.js, shared-header.js).
- Backend (Apps Script source): `/Users/swapnil/Documents/Claude/Projects/Event Submission/backend/`
  (`code.gs`, `AppBridge.gs`, `SubmissionSheets.gs`, `output-generator.gs`, `_predeploy-check.mjs`)
- App: `/Users/swapnil/Documents/Claude/Projects/Shoonya Dance Centre App/shoonydance/`
  (checked-out branch may not be the deployed one — use `git log --all -- src/app/admin/submissions`
  to find the branch/commit carrying the bridge, and say which you reviewed). Live app = Vercel.
- Existing tests: `forms/_tests/structural.mjs`, `festival-fill.eval.js`,
  `festival-golden-payload.json`, `real-festival-test-cases.md`, `app-bridge.mjs`,
  `readable-output-contract.mjs`, `submission-audit.mjs`. Run what runs without network.


## ⚠️ Deployment state found by Claude today (network facts you cannot see)
- LIVE backend (`…AKfycbwh9P…/exec?action=version`, the same deployment the forms POST to and
  DEPLOY-apps-script.command targets) reports **`2026-08-15-registration-shim`**.
- Backend SOURCE says **`2026-09-18-app-bridge-6`**, and `backend/AppBridge.gs` is UNTRACKED;
  `code.gs` + `SubmissionSheets.gs` are uncommitted (`git status` in Event Submission/).
- The app's `APPS_SCRIPT_URL` lives only in Vercel env — not visible locally.
So review BOTH: (i) what happens TODAY with the Aug-15 backend (reconstruct it from
`git show dc0bd22:backend/code.gs` — the last commit — and say how close that is to what is live), and
(ii) what happens once the Sep-18 source is deployed. In particular: with the Aug-15 backend live,
what does the app's admin/submissions page do when it calls `listPendingSubmissions` — clear error,
empty list that looks like "no submissions", or worse (e.g. the old default branch filing the bridge
body as a teacher submission, the regression round 29 described)? Any festival field the Sep-18
source changes that would make an Aug-15-era sheet row unreadable by the bridge?

## Check specifically
A. **Field fidelity, form → sheet → app.** Build a table: every field the festival form collects →
   payload key → sheet column (SUBMISSION_HEADERS['festival'] / buildSheetRow) → AppBridge key →
   what the app shows. Flag any field that is collected but dropped, renamed wrongly, mis-ordered
   against the headers, or shown in the wrong place. Include programme slot fee/inclusion, co_organiser,
   teachers, DJs, pricing tiers (early/member), group pricing, UiTPAS, photos, free-entry note.
B. **Header drift.** Does the column order the backend WRITES match the column names AppBridge READS
   (`g('Festival Name')` etc.)? A column renamed or appended on one side only = silent blank in the app.
C. **Dates.** Multi-day festivals, date-end before date-start, timezone shifts in
   `_appBridgeCellToDateStr` (sheet date cells), far-future confirm, past dates.
D. **Failure paths.** Backend down / non-JSON / `ok:false` → does the organiser see a clear message,
   is the backup sink hit, can a double-click on Confirm submit twice, is the draft kept until success?
E. **Photos.** Size limits, HEIC rejection, many images → payload size vs Apps Script limits; where
   do stored photos end up and does the app see them?
F. **Auth / privacy.** Bridge key never in a GET URL or logged to a sheet; the festival form only
   opens with a session but the backend doPost — can an unauthenticated POST file a festival? Is that
   acceptable (it's a submission, reviewed by a human) or a spam risk? Any email address exposed
   on a public page (house rule: never)?
G. **App side.** Festival rows listed correctly (pending vs approved vs rejected, sorting, dedupe of
   resubmissions), approve/reject idempotent, the "create it by hand" note visible, no crash on a
   festival with empty teachers/DJs/pricing.
H. **Test mode.** `?test=1` and the flagged test account never write a sheet row, never email, and
   never appear in the app's pending list.

Already verified LIVE by Claude today (you have no network — don't redo): Festival page loads (200);
scripted full fill in `?test=1` → review modal → Confirm → backend returned the test preview
("Nothing was written. Type: festival · Sheet: Festivals"); login → profile → return banner → back to
the form works; open-redirect fixed.

OUTPUT: (1) the field-fidelity table, (2) findings P1→P3, (3) "not checked" list, (4) verdict.
