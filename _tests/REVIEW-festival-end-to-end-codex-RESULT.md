## Field fidelity

| Form fields → payload | Sheet column(s) | Bridge/App |
|---|---|---|
| First/last/display name, email → `teacher_name`, `organiser_name`, `organiser_legal_name`, `email` | Organiser, Email | Card shows organiser/date; raw-log path shows all identity keys. Legal name is absent if raw logging fails. |
| Co-organiser → `co_organiser` | Co-organiser | Preserved. |
| Name/tagline → `title`, `event_title`, `tagline` | Festival Name, Tagline | Card title and expanded data. |
| Start/end, day tabs → `start_date`, `date`, `end_date`, `festival_days` | Start Date, End Date; day tabs only raw log | Date card uses Start Date; `festival_days` needs raw log. |
| Styles, venue, language, dress code → `dance_style`, `venue`, `language`, `dress_code` | Style(s), Venue, Language, Dress Code | Preserved. |
| Programme: day/time/type/title/teacher/level/studio/inclusion/fee/description → `programme[]` | Programme; description in Raw Submission Text | Full array only via raw log. Flat fallback retains a combined summary, but loses the per-slot description structure. |
| Teachers: legal/display name, style, bio, link → `teachers[]` | Teachers (display/name + style) | Bio/link/legal-name fidelity depends on raw log. |
| DJs: name, styles, bio → `djs[]` | DJs (name + styles) | Bio depends on raw log. |
| Tiers: label, inclusion description, regular/early/member; deadline → `pricing[]`, `early_bird_deadline` | Pricing, Early Bird Deadline | Tier description depends on raw log; prices survive as readable summary. |
| Group minimum/price/perk → `group_min`, `group_price`, `group_perk` | Group Discount | Missing entirely from the bridge fallback. |
| UiTPAS percentage → `uitpas_pct` | UiTPAS | Missing entirely from the bridge fallback. |
| Free-entry note, practical, description, notes → corresponding keys | Free Entry Note, Practical Info, Description, Note for Shoonya | Preserved. |
| Banner/additional images → `photos[]` | No Festival-sheet column; originals saved to Drive | Raw log retains filename/role but strips bytes; App has no stored Drive URLs or image preview. |

The 24 Festival headers and `buildSheetRow()` order match exactly. The Festival header is unchanged from `dc0bd22`, so Sep-18 bridge code can read Aug-15-era Festival rows by header name; no Festival header drift found.

## Findings

**P1 — `backend/output-generator.gs:306` — failed Festival sheet writes become successful submissions.**  
Repro: make `saveToSheet(data, 'festival')` throw. The catch only logs the error, then photo/email work continues and the handler returns `{ok:true}` at line 431. The form therefore shows success and clears `FESTIVAL_DRAFT_KEY` at `forms/Festival/index.html:1528-1538`, while no Festival row exists for the App.  
Fix: make the Festival sheet write mandatory: return `{ok:false}`/throw immediately after the failed write, preserve the draft, and only send final confirmation after persistence succeeds.

**P1 — `forms/Festival/index.html:511`, `backend/code.gs:172-207` — the login gate is cosmetic; anonymous POSTs can file Festival submissions.**  
Repro: POST a minimally shaped `{action:"generateOutputPackage",type:"festival",…}` body directly to the public Apps Script URL. `doPost` routes it directly to `handleGenerateOutputPackage`; no session token or organiser/email ownership is checked. This writes a row, can create Drive files, and sends mail.  
Fix: send the existing session token with the submission and require server-side token validation plus email/profile matching before any Festival write; add rate limiting or CAPTCHA for abuse resistance.

**P2 — `forms/test-mode.js:22-29`, `backend/code.gs:183-189` — the protected test account is only protected by browser JavaScript.**  
Repro: submit a direct payload using the flagged account email with `testMode` omitted or false. The backend does not recognise the account and processes it as real. `?test=1` itself is safe: it reaches `handleTestPreview` before writes/emails.  
Fix: enforce the flagged test-email rule server-side before routing: force preview or reject real writes for that identity.

**P2 — `backend/AppBridge.gs:256-261,544-567` — raw-log failure produces a materially incomplete Festival review.**  
The raw log is explicitly non-blocking. If it fails, the fallback omits `festival_days`, organiser legal name, teacher/DJ bios and links, tier descriptions, group pricing, UiTPAS, and structured programme descriptions. It also has no Drive asset links.  
Fix: persist a structured, photo-free Festival JSON/asset-reference column on the Festival row itself, or make the raw log durable and required before confirming success.

**P2 — `backend/OutputRenderers.gs:2421`, `backend/AppBridge.gs:641` — uploaded images are not reviewable in the App.**  
Images go to the `Shoonya Event Submissions` Drive folder, but the raw log is written before `__savedPhotos` exists and the bridge strips image bytes. The admin sees only role/filename metadata, never a Drive viewer/direct URL.  
Fix: store safe Drive URLs/file IDs in a Festival sheet column after upload and return those references through the bridge.

**P2 — `forms/config.js:14-23`, `forms/Festival/index.html:552-556` — backup is presented as confirmed despite being fire-and-forget.**  
Repro: primary fails while the backup endpoint is unreachable. The no-CORS fetch is neither awaited nor inspectable, yet UI says the entry “was saved safely.” The draft does remain for retry.  
Fix: say “we could not confirm a backup” unless an independently verifiable acknowledgement is available.

**P2 — app `SubmissionsClient.tsx:201-214`; `actions.ts:553-555` — the manual Festival handoff is not visible at approval time.**  
The server writes “create it by hand” into the sheet note, but the UI replaces it with only “Approved.”  
Fix: return/display “Approved — no automatic Festival record was created; create it by hand.”

**P3 — `forms/Festival/index.html:1364-1415` — no aggregate attachment limit.**  
Each image is resized, but additional images are unbounded and there is no total payload-byte/count guard. A large multi-image Festival can exceed browser, request, Apps Script, or backup limits.  
Fix: enforce a total count and encoded-byte budget before opening review.

**P3 — `forms/Festival/index.html:1352-1361` — past Festival dates are accepted.**  
End-before-start is blocked and far-future dates require confirmation; past dates have no warning/block.  
Fix: either reject past start dates or show an explicit “historical/archive Festival” confirmation.

## Aug-15 live-backend result

Using `dc0bd22` as the reconstruction: it has no `listPendingSubmissions` route or AppBridge. The current App sends `submissionType`, not top-level `type`; therefore the old default route returns an unknown-action response. The App rejects it because it lacks `bridge:3` and shows its explicit “backend has not been updated” error. It does **not** show a trustworthy empty inbox, write a junk teacher submission, or leak the bridge key into the sheet on this request shape.

Reviewed App source: `history-import` / `launch-2026-09`, submissions implementation unchanged since `8e5914d`; live Vercel commit not checked.

## Not checked

- Live Vercel code/env, deployed Apps Script bundle, actual sheet headers/rows, Script timezone, Drive permissions, backup sink, and platform payload quotas.
- `festival-fill.eval.js` needs a browser harness and fails under plain Node (`window` unavailable).
- App unit tests could not start because the read-only sandbox blocks Vitest’s temporary SSR directory.
- The Apps Script predeploy guard cannot syntax-check `.gs` files under this Node 24 ESM environment; this is a tool/runtime limitation, not a syntax pass.
- `readable-output-contract.mjs`: 179 passed; `app-bridge.mjs`: 124 passed. Structural test: Festival header check passed; three unrelated non-Festival header-count assertions failed.

**Verdict: DON’T DEPLOY — live Aug-15 cannot feed the App, and Sep-18 source still has the sheet-write-success P1 plus anonymous Festival submission P1.**

