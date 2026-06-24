# Codex review — copy + field-sizing simplification pass (4 teacher forms)

Paste the block below into Codex. ABSOLUTE paths (files live outside any single session folder). The changes are LOCAL + UNCOMMITTED (not deployed) — review the working files; a clean diff anchor is the deployed clone, which still has the PRE-pass version.

```
Review a display-copy + textarea-sizing simplification pass made to the 4 Shoonya
teacher forms. Goal of the pass: calmer/shorter/harder-to-misuse, ~50% less visible
helper text, DISPLAY-ONLY (no behavior/payload change). Verify it holds — flag any
regression or any copy that's now too terse/ambiguous. Do NOT fix or deploy; report.

FILES (working copy = the pass applied):
- /Users/swapnil/Documents/Claude/Projects/Event Submission/forms/smart-form/weekly-classes.html
- /Users/swapnil/Documents/Claude/Projects/Event Submission/forms/smart-form/workshops.html
- /Users/swapnil/Documents/Claude/Projects/Event Submission/forms/smart-form/social-nights.html
- /Users/swapnil/Documents/Claude/Projects/Event Submission/forms/Festival/index.html
Rules it followed: /Users/swapnil/Documents/Claude/Projects/Event Submission/truth/form-design-principles.md
  → "Copy + field-sizing discipline (2026-06-22)".

DIFF ANCHOR (to isolate exactly what this pass changed): the deployed GitHub clone
still holds the PRE-pass version. Diff working vs clone:
  diff -u /Users/swapnil/Documents/GitHub/shoonya-forms/smart-form/weekly-classes.html  /Users/swapnil/Documents/Claude/Projects/Event\ Submission/forms/smart-form/weekly-classes.html
  (repeat for workshops.html, social-nights.html, and Festival/index.html)
Every changed line should be display text, a `rows=` attribute, an `(optional)` marker,
a removed helper paragraph/badge, or a CSS min-height/.opt tweak — NOTHING else.

A) GUARDRAILS (any violation = P0). Confirm the diffs changed NONE of:
   field ids, name attributes, payload keys, onclick/handler names, validation logic,
   option <value>s, music-chip/genre data-val values, FormKernel spec keys/payloadKey/dom,
   festival FESTIVAL_SPEC / festCollect* / NO_STAFF_TYPES strings / activity-type option
   text, the festival pass-inclusion option value="" , sheet headers, or submitted data shape.
   Also: no raw email reintroduced (must stay contact-page links); festival has no var(--mid).

B) GOLDEN ROUND-TRIPS (payloads must be byte-identical — this is the proof nothing broke).
   Serve the Event Submission root; for each form CLEAR drafts, reload, run the saved fill,
   capture the outgoing payload, deep-equal it (order-independent, ignore the golden "_note"
   key) to its golden:
   - weekly:   forms/_tests/weekly-fill.eval.js   == weekly-golden-payload.json   (25 keys)
   - workshops:forms/_tests/workshop-fill.eval.js == workshop-golden-payload.json (44 keys)
   - social:   forms/_tests/social-fill.eval.js   == social-golden-payload.json   (31 keys)
   - festival: forms/_tests/festival-fill.eval.js == festival-golden-payload.json (37 keys)
     Festival: localStorage.setItem('shoonya_session', JSON.stringify({profile:{name:'ZZ QA Org',
     email:'swapkebolly@gmail.com'}})) BEFORE navigating to /Festival/index.html?test=1;
     capture _festivalPending.payload (submitForm doesn't hit the network); normalize the
     submissionText trailing "Submitted: ..." timestamp. Stub alert/confirm.
   If the browser can't launch, say so and do the diff/static pass + run structural.

C) CONTRACT: node forms/_tests/structural.mjs → expect 30/30.

D) BADGE POLICY: only real-behavior badges may remain (`multi-select`, `auto`, `smart picker`).
   Confirm no `redesigned`/`simplified`/`catch-all`/`style-specific`/`tiers`/`new` status badges left.

E) TEXTAREA SIZING: public descriptions 4 rows (or autogrow), pricing/special notes 3,
   internal notes 2, normal 2. Spot-check each form's textareas match.

F) COPY QUALITY (the subjective half — the real value of your review):
   - Did it actually get ~50% lighter and calmer, or just shuffled?
   - Did any REMOVED hint actually prevent a real mistake (e.g. a format/required nuance,
     a "not shown publicly" that matters, the per-class drop-in meaning)? Flag any over-cut.
   - Any label/placeholder now ambiguous or under-explained for a non-technical teacher?
   - Optional markers consistent + muted everywhere (not loud)?
   - Festival should read less like an admin form now — does it?

G) FUNCTIONALITY still intact (don't just trust the copy): drafts save/restore, review modals
   render, test-mode, the relocated per-class drop-in checkbox in weekly §5 (visible, toggles
   the price field), festival login-gate + submit flow.

DELIVER: pass/fail per section + any P0/P1/P2 with file:line + repro, and a short
copy-quality verdict (over-cut / about right / could go further). Triage real-regression
vs by-design. No fixes, no deploy, no commits.
```
