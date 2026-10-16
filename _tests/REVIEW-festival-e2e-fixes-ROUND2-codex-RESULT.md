Findings:

- **P1 · `backend/code.gs:197-205, 286-290`** — Festival writes remain anonymously reachable through `action:'submit'` (or omitted action). Repro: POST `{action:'submit', type:'festival', ...}`; it skips the token gate, enters `handleSubmit`, raw-logs, writes the Festival sheet, and emails admin. A supplied `token` is also logged and emailed. Fix: apply one Festival-auth gate to both persistence actions before routing, delete the token before any log/email/write, and bind/validate the authenticated account against the allowed organiser identity.

- **P1 · rollout order** — Do **not** deploy forms first. The new form sends its token; the old backend logs the full body and formats unknown fields into the raw archive email, exposing that token internally. Deploying backend first makes cached old pages fail safely with `authRequired` and retain the draft, but they need refresh/retry during the cache window.

- **P2 · `forms/Festival/index.html:566-570`** — P1-a now makes a real sheet-write failure enter the existing unverified-backup path, whose UI says the entry “was saved safely.” The backup is fire-and-forget. Fix: say the draft is retained and backup could not be confirmed, unless the backup provides a verified acknowledgement.

P1-a itself is otherwise sound: no lock or dedupe reservation is left unreleased; the prior raw-log row cannot create a phantom App Bridge item because the Bridge enumerates Festival-sheet rows first. Workshop/social callers correctly treat `{ok:false}` as failure and retain drafts. `account_email` is not public, but is included in the internal raw log, App Bridge payload, and raw archive email; `resolveToken` refreshes a valid token’s 30-day expiry and deletes expired token records.

Re-ran: App Bridge 124/124; readable contract 179/179; structural 136/139 with the same three unrelated header-count failures.

**NOT READY.**

