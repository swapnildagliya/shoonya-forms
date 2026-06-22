# Real-festival test cases for the Festival form (for Codex Phase-4)

Three REAL Shoonya/ABC festivals to fill into `forms/Festival/index.html?test=1` as a real-world data stress test, on top of the synthetic golden (`festival-golden-payload.json`). Goal: confirm a real organiser could capture each program without losing information. Capture each via `_festivalPending.payload` (see `festival-fill.eval.js`); these are NOT byte-golden — they're "does it fit" checks. Report any field that has nowhere to go.

**Swapnil's decision (2026-06-21):** the missing activity types (Lecture, Film, Tour, Museum Exhibition) are acceptable as **type = "Other"** with the real label written into the slot **title** (e.g. title "Lecture: Zubah al-Klubatiyah"). So "Other" is the intended catch-all — do NOT report that as a blocker. The genuine open gaps are the **per-item fees** and **multi-window/cross-day exhibition hours** (see each case).

---

## Case 1 — Ghent Tap Festival (simplest; near-perfect fit)
**Fourth edition · 7 & 8 March 2026 · Shoonya Dance Centre, Stapelplein 41, 9000 Gent · Organised by Shoonya Dance Centre & Tapdance Promotion.**

Programme (all are dance workshops unless noted; studio not specified on the flyer → pick any):
- **Sat 7 Mar** — 10:00-11:30 Tap Adv. Beg (Alexandre) · 11:45-13:15 Palmas Open Level (La Liz) · 13:30-15:00 Tap Intermediate (Peter Kuit) · 15:15-16:45 Tap Advanced (Peter Kuit) · 17:00-18:30 Tap Standard — Leon Collins Routine 53 (Alexandre)
- **Sun 8 Mar** — 10:00-11:30 Tap Intermediate (Josh Hilberman) · 11:45-13:15 Tap Advanced (Josh Hilberman) · 13:30-15:00 Tap Standard — Leon Collins Routine 53 (Alexandre) · 15:15-16:45 Tap Adv. Beg (Alexandre) · 17:00-18:30 **Free Tap Dance Taster Class (60 min)** — open to everyone, free
- **Performance** — "Not Dead Yet: Dances & Stories by Josh Hilberman", Shoonya Theatre, Sat: Show 1 19:00, Show 2 21:00
Teachers: Alexandre, Josh Hilberman, Peter Kuit, La Liz.

**Fit:** Workshops map 1:1. Free taster → type "Community Class" or "Other" (free → write "free" so pricing validation passes if it's a tier). Performance → type "Performance" (NOTE: Performance requires a teacher name → "Josh Hilberman"; the TWO show times 19:00 & 21:00 need TWO slots — one slot = one time window).
**Gaps:** (1) **Level names** — "Adv. Beg" and "Standard" aren't in the form's Level select (All Levels/Beginner/Open Level/Intermediate/Advanced) → fall back to closest or leave blank. (2) **Co-organiser** — the form has ONE organiser; "Tapdance Promotion" as co-organiser has nowhere structured to go (→ note in description). (3) No pricing on the flyer.

---

## Case 2 — Leylet Raqs Heritage: Muhammad Ali Street Edition (most complex; lecture/film/exhibition heavy)
**29-31 May 2026 · Shoonya Dance Centre.** festival-name "Leylet Raqs Heritage", tagline "Muhammad Ali Street Edition".

Programme (type → use "Other" for Lecture/Film/Tour/Exhibition per Swapnil; real label in title):
- **Fri 29 May** — 16:00-17:30 Historical Ghent + Chocolate Tour (Lenka Badriyah) *[Tour; +15€ add-on, NOT in full pass]* · 19:30-21:00 Lecture: Zubah al-Klubatiyah (Nisaa & Reda Henkesh) · 21:00-22:00 Opening of the Museum Exhibition (Lenka Badriyah)
- **Sat 30 May** — 09:00-10:30 Workshop: Baladi Masri Home Made (Nada Al Basha) · 11:00-13:00 Workshop: The Awalim and the Delta Ghawazi (Nisaa) · 13:30-15:00 Lecture: The Entertainment Landscape of Cairo (Nisaa & Reda Henkesh) · 15:15-16:45 Movie: Funoon Shaabeya + Discussion (Sheyla) · 17:00-19:00 Museum Exhibition (hours) · 19:30-21:00 **Galashow: Golden Era Theatre Show** (Art Deco; 20€ tickets; 8+ only) · [breaks: snack 10:30-11:00, lunch 13:00-13:30]
- **Sun 31 May** — 09:00-10:00 & 12:00-12:45 Museum Exhibition (hours) · 10:00-12:00 Workshop: Egyptian Belly Dance in Transition (Nisaa & Reda Henkesh) · 12:45-14:15 Lecture: From the Street of Art (Nisaa & Reda Henkesh) · 14:30-16:30 Workshop: Dancing Sheikh Imam (Nada Al Basha) · 16:30-17:00 Closing Circle
Teachers (bios on shoonyadance.com — paraphrase for test fill): **Nisaa** (Heather D. Ward, ME dance researcher, St. Louis), **Reda Henkesh** (Egyptian tabla master, Muhammad Ali Street), **Nada Al Basha** (Italian-Egyptian dancer, dir. Karabà / Meya Meya Raqs Festival), **Sheyla** (Czech, Egyptian folklore, dir. Tales of Sahara), **Lenka Badriyah** (tour guide).

**Pricing tiers:** Friday Package 45€ · Saturday Package 170€ · Sunday Package 150€ · Full Package — Early Bird 230€ / Full 280€ (all workshops + lectures + museum entrance) · Online Package 115€ (all lectures live via Zoom + 2-week recordings) · Individual: 1.5h lecture/workshop 45€, 2h workshop 60€, movie screening 30€. **Add-ons:** Historical Ghent + Chocolate Tour 15€, Galashow 20€.
**Gaps:** (1) **Per-item fees** — tour 15€, galashow/theatre 20€ are per-activity tickets; the form has no per-slot fee → they only survive as extra pricing tiers or in the description. (2) **Museum Exhibition hours** — multi-window AND cross-day (Sun 09:00-10:00 **&** 12:00-12:45); one slot = one window → needs 2 slots or a description note. (3) **Breaks** — no concept; omit. (4) **Add-on vs ticket** — no distinction from main passes. (Lectures/films/tour/exhibition as "Other" = fine per Swapnil.)

---

## Case 3 — GIDF 2026 (Gent India Dans Festival, Edition 4) — read from the GIDF folder
**Fri 1 → Sun 3 May 2026 · Shoonya Dance Centre.** Codex: the full program is in `/Users/swapnil/Documents/Claude/Projects/GIDF/2026/` — read `GIDF-2026-RECAP.md` (festival-in-one-paragraph + faculty + pricing), `Planning/GIDF 2026 — Festival Schedule.pdf`, and the `Program/` folder + `Show-Ops/GIDF_2026_Teacher_Pack.html` for the exact per-session grid. Summary for the fit check:
- 3 days, 3 studios in rotation (Ananta / Aakash / Art Deco — all present in the form's Studio list). Workshop-heavy.
- Faculty: Vaishali (Bollywood Folk Fusion + Bamboo Beats), Shampa (Garba + Mayurbhanj Chhau), Colleena (Rajasthani Folk Lab + Abhinaya + Indian Fusion Bellydance), Manasi (Giddha), Desihop (Kuthu + Desi-Afro Grooves), Swapnil (Kalbeliya + Lavani + Rise & Riyaaz).
- Day 1 closes with **Opening Party** (10 acts, 16 dancers, Dariya Live Band, DJ @swapkebolly). Day 2 closes with **Gala Showcase** (~90 min, 18 acts, sold out, €20). Day 3 closes with "One Last Gupshup". Branded daily moments: Rise & Riyaaz, Spill the Chai, One Last Gupshup.
- Pricing: Friday €65 / Saturday €110 / Sunday €110 (day passes excluded the Rajasthani Folk Lab + the Gala).

**Fit (GIDF fits the form BEST of the three):** workshops → Workshop; **Opening Party → "Opening Party" type (exists!)**; DJ @swapkebolly → DJs section; Gala Showcase → "Performance"; studios all match; faculty → teachers section.
**Gaps:** (1) Gala **€20 ticket** = per-slot fee gap again. (2) Branded ritual moments (Rise & Riyaaz / Spill the Chai / Gupshup) + the Folk Lab → "Other". (3) Day-pass **exclusions** (Lab + Gala excluded from day passes) → only expressible in a tier description.

---

## Gaps — status after the 2026-06-21 form additions
**CLOSED (added to the form — Codex should now TEST these):**
1. ✅ **Per-slot fee / ticket** — every programme slot now has an optional `.slot-fee` field → `programme[].fee` (and it prints in the submissionText slot line, "€15" for numerics or the raw word e.g. "Free"). Tours / gala / theatre / individually-priced items attach their price to the slot.
2. ✅ **Activity types** — added `Lecture / Discussion`, `Film Screening`, `Guided Tour`, `Museum Exhibition` (no longer forced into "Other"). "Other" remains the catch-all.
3. ✅ **Co-organiser / partner org** — new optional `#co-organiser` → `co_organiser` key (+ submissionText "Co-organiser:" line). Ghent Tap → "Tapdance Promotion".
4. ✅ **Level vocabulary** — added `Adv. Beginner` + `Standard` to the Level select.

5. ✅ **Teacher/studio no longer required for non-teaching slots** (Codex real-festival pass, 2026-06-21) — Lecture / Film / Guided Tour / Museum Exhibition / Other slots validate with empty teacher + studio (museum open-hours, films, self-guided activities). Teaching/performing slots (Workshop/Performance/etc.) STILL require teacher + studio. Verified: museum-no-staff accepted, workshop-no-teacher still blocked.

6. ✅ **Slot pass-inclusion** (Codex rec, added 2026-06-21) — per-slot `.slot-inclusion` select → `programme[].inclusion` ('' = Included in pass / "Separate ticket" / "Add-on" / "Free"), paired with the fee field; prints in the submissionText slot line. So pass-inclusion is now STRUCTURED, not just descriptive.

**STILL OPEN (deliberately not built):**
7. **Museum-exhibition / open-hours concept** — a thing "open" across multiple windows AND days (Leylet Sun 09:00-10:00 & 12:00-12:45). Still one-slot-one-window → use multiple "Museum Exhibition" slots or a description note. (Codex recommends a repeated-windows model — deferred; bigger feature.)
8. **Breaks / check-in / lunch / lobby** — no first-class type; omit or use "Other" (fine).

NOTE (backend follow-up): `co_organiser` + `programme[].fee` + slot `desc` flow into the **payload + submissionText (the RAW archive email Swapnil reads)** but the backend's compact **Programme sheet column** (`backend/code.gs` ~994) omits fee + desc. No data is lost (it's in the RAW email); wiring them into sheet columns belongs to the backend canonical-normalization phase.
