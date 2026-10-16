# Codex re-review ROUND 2 — the two festival P1 fixes (2026-09-28)

READ-ONLY. Do NOT edit, commit, deploy, or run clasp. Local read-only commands are fine.
Your round-1 report: forms/_tests/REVIEW-festival-end-to-end-codex-RESULT.md (same folder).
Repo: /Users/swapnil/Documents/Claude/Projects/Event Submission (backend/ is uncommitted working
tree — compare against the round-1 state by reading the marked blocks; search "Codex festival e2e").

FIXES CLAIMED
P1-a  backend/output-generator.gs (~line 306): saveToSheet throwing now alerts
      (_alertSilentFailure 'Sheet write') and RETURNS {ok:false, error} before photos/emails/
      confirmation. Applies to every type except weekly-class (unchanged path via handleSubmit).
P1-b  backend/code.gs doPost (~line 192): action generateOutputPackage + type festival requires
      resolveToken(data.token); token deleted from data before any logging; missing/expired →
      {ok:false, authRequired:true}; valid → data.account_email = session email.
      forms/Festival/index.html sendToSheet(): token read from localStorage.shoonya_session and put
      ONLY on the request body copy (not on `payload`, which sendToBackup + the review modal see);
      authRequired → "log in again, press Try again" message, no backup, draft kept.

Claude verified in a browser (stubbed fetch): token sent on the body, absent from the backup call;
authRequired → no backup, "Try again", pending kept; ok:false → backup (token-free), "Try again";
real live (Aug-15) backend in ?test=1 still returns the preview. Syntax: node --check passes on both
.gs. Tests: app-bridge 124/124, readable-output-contract 179/179, structural 136/139 — the 3 failures
are weekly/workshop/social header counts and fail identically WITHOUT these changes.

CHECK
1. Is either fix wrong or incomplete? Early-return in P1-a: anything that must still run on failure
   (lock release, raw-log consistency, dedupe state), or a caller that treats ok:false wrongly for
   workshop/social-night/series forms (check smart-form/*.html sendToSheet equivalents)? Does the
   logRawSubmission row written BEFORE the failed save cause a phantom entry in AppBridge / the app?
2. P1-b bypasses: token on other routes into the same write (action 'submit' with type festival →
   handleSubmit? type aliases via _canonicaliseType like 'Festival '/'fest'? testMode:true + real
   write?). Is data.token stripped on EVERY path before logRawSubmission / emails / sheet?
   Does resolveToken's sliding refresh or deleteProperty have side effects worth noting?
   Does account_email leak anywhere public (sheet → website generators, emails to organiser)?
3. Rollout order: forms currently live send no token. Confirm: deploy forms first (old backend
   ignores token), then backend. What happens to a user on a cached old Festival page after the
   backend deploy (10-min Pages cache) — acceptable?
4. Anything round 1 listed as P2/P3 that these changes made worse.

OUTPUT: findings (severity · file:line · repro · fix) or "no findings", then verdict:
READY TO DEPLOY (forms then backend) / NOT READY.
