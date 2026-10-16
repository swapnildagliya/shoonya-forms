# Codex re-review ROUND 3 — festival P1 fixes after your round-2 findings (2026-09-28)

READ-ONLY. Do NOT edit, commit, deploy, or run clasp. Local read-only commands fine.
Round-2 report: forms/_tests/REVIEW-festival-e2e-fixes-ROUND2-codex-RESULT.md. Search "Codex festival e2e".

CHANGES SINCE ROUND 2
1. backend/code.gs doPost: the festival gate moved ABOVE the test-mode branch and now covers
   action 'submit' (incl. omitted action → 'submit') AND 'generateOutputPackage', type matched
   case/space-insensitively. data.token is deleted first thing for any festival write (test or real);
   real writes need resolveToken(token) → else {ok:false, authRequired:true}; valid → account_email.
2. Rollout plan changed per your finding: BACKEND FIRST, then forms minutes later.
3. forms/Festival/index.html failure copy no longer claims "saved safely": now "Could not save right
   now. Your form is kept on this device — please press Try again…".
Deliberately NOT done (product decision for Swapnil, flag if you think it's a blocker): binding the
session account to the organiser email typed on the form — account_email is recorded for review.

CHECK: any remaining route to an unauthenticated festival write or to the token being logged/emailed/
stored; anything the move above test mode broke (test preview for festival, other types' test mode,
other actions); P1-a still sound; rollout plan (backend first) safe for the currently-live form, which
sends no token and has no authRequired handling (it shows its generic failure + fires the backup).
OUTPUT: findings or "no findings", then verdict READY TO DEPLOY (backend then forms) / NOT READY.
