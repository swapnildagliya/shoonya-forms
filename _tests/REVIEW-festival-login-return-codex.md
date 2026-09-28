# Codex review — Festival option: login 404 fix + return-to-form (2026-09-28)

Read-only review. Do NOT edit, commit, deploy, or make any real (non-test) submission.
Report findings as P1/P2/P3 with file:line + a concrete repro, and say "no findings" if clean.

REPO: /Users/swapnil/Documents/GitHub/shoonya-forms/ (served at https://forms.shoonyadance.com, GitHub Pages, site root = repo root)

WHAT SHIPPED (commits ad38e07 + 1b36a4e — `git show ad38e07 1b36a4e`)
1. login-panel.js slpLogin(): a teacher whose profile lacks bio_short or photo_url is sent to
   profile completion. The path was relative ('profile.html'), so from /Festival/index.html it
   went to /Festival/profile.html (404). Now root-absolute:
   '/profile.html?complete=1&return=' + encodeURIComponent(location.pathname + location.search)
2. profile.html: new #return-banner. getReturnPath() accepts only '/'-prefixed, not '//', no
   backslash. refreshReturnBanner() shows "Back to the Festival form →" (path /Festival/…) or
   "Back to your form →" once isProfileIncomplete() is false. Called from maybePromptComplete()
   and refreshCompleteBanner() (which every section/photo save already calls).

REVIEW THE WHOLE FESTIVAL PATH, not just the diff:
  smart-form/index.html Festival card → Festival/index.html login gate (setFestivalGate,
  slpOpenModal) → login-panel.js slpLogin → profile.html?complete=1&return=… → save bio/photo →
  return banner → back to Festival/index.html (session in localStorage.shoonya_session opens the
  gate) → submitForm → confirmAndSubmit → sendToSheet (APPS_SCRIPT_URL in config.js).

CHECK SPECIFICALLY
- Open-redirect / XSS: can any ?return= value escape the origin or inject script
  (e.g. '/\\evil', '/%2F%2Fevil', 'javascript:', encoded tabs/newlines, '/.//evil')? The href is
  set via .href and the label via textContent — confirm.
- Does profile.html's OWN login gate (gateLogin) or any reload/logout path drop ?return=?
- Is profile.html's `profile` object populated before maybePromptComplete() runs on every
  entry route (fresh session vs existing session vs gateLogin)?
- Any other relative link in login-panel.js / shared-header.js / Festival/index.html that breaks
  because Festival/ sits one level deep like smart-form/ (e.g. '../register.html' from a page at
  root). List every relative href/location in those files and whether it resolves from each page
  that loads it.
- The other three forms (smart-form/*.html) also load login-panel.js — confirm the change is
  correct for them too.
- Festival/index.html file mode is -rw------- locally; confirm this has no effect on Pages.

Already verified live by Claude (don't need network): hub → Festival page 200; stubbed login
lands on /profile.html?complete=1&return=%2FFestival%2Findex.html; banner hidden while incomplete,
shown after bio+photo, click returns to the Festival form with the form visible; '//evil.example'
return is ignored; full Festival submit in ?test=1 mode returns the backend test preview.

OUTPUT: findings list (severity · file:line · repro · suggested fix), then a one-line verdict.
