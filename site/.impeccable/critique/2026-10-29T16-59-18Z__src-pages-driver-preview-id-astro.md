---
target: site/src/pages/driver-preview/[id].astro
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\dev\\f1-hub-project\\site\\src\\pages\\driver-preview\\[id].astro"
target_fingerprint: "sha256:d254a52e781eabdf81dfa9db9f71cb3f449a07b3d0cc443b1d6bcd7d895dedf2"
target_path: "C:\\dev\\f1-hub-project\\site\\src\\pages\\driver-preview\\[id].astro"
timestamp: 2026-10-29T16-59-18Z
slug: src-pages-driver-preview-id-astro
---
# Critique: driver profile (driver-preview/[id].astro), 2026-10-29

## Design Health Score: 24/40 (Acceptable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | No cue that the season and round tables scroll sideways on mobile (scrollbars hidden, driver.css:327) |
| 2 | Match with real world | 3 | `r.out.slice(0,2)` gives "DN"/"DS"; "205th all-time" for 0 is a tie, not a rank |
| 3 | User control | 3 | Picker and milestones support Esc and outside click |
| 4 | Consistency | 2 | Tablist uses aria-pressed; kickers not numbered like home; birthplace not translated in ES |
| 5 | Error prevention | 2 | Pre-archive careers shown as fact |
| 6 | Recognition | 3 | Teammate as a 3-letter code, full name only on hover |
| 7 | Flexibility | 2 | No in-page jump nav on a ~12k px page |
| 8 | Aesthetic/minimalist | 2 | Hero figures repeated in Career stats; red "7" twice; races/points restated 4 times |
| 9 | Error recovery | 2 | Unexplained empty states (empty Beyond F1, No data, single full-width bar) |
| 10 | Help | 2 | Keys exist; nothing explains where the archive ends |

## Design specificity
LLM: strongly product-specific and on-brief (fitted name + red number hero, team-colour ribbon, every-race grid, teammate duel, form curve). Weakness is density: 6 equal-weight sections and ~470 hover-only details drift toward the dashboard DESIGN.md §1 rejects.
Detector: CLI 0 findings (5 files). CDP: 4 on desktop (Hamilton, Antonelli), 6 on ES Alonso, 35 on 390px Hamilton. Real: undersized-ui-text 9–10px (driver.css:74, 117, 198, 317, 432, 488), all-caps-body on the 85-char ES section-4 kicker, tight-leading 1.2 on p.foot__tag. False positives: cream-palette (--paper), kicker-above-heading (spec), repeating-stripes-gradient (meaningful hatching).

## Strengths
1. Hero: fitted name (DriverPage.astro:420–439), zero figures drop out, no-photo fallback.
2. Journey: ribbon + every-race grid + milestone linking.
3. Owner rules respected: no title=, sane headings, no horizontal overflow at 390px.

## Priority issues
- [P0] Pre-archive careers presented as complete (Senna: 2 titles, debut 1990, 21 wins, 0 poles 1991, "1 home race in 2026"). Fix: flag partial careers in buildDriver, suppress/mark debut, age and ranks with a neutral "Archive incomplete" tag; hide home races when inactive (DriverPage.astro:232). Command: harden.
- [P1] Mobile: rounds table leads with Sprint and hides Race off-screen; form-curve text ~5px; season-by-season labels collide (--lab 74px, driver.css:330); ~14px grid taps; 9px labels. Fix: Race before Sprint ≤760px, HTML text for curve, ~100px label column, scroll cue, wrap grid ~12 cells, labels to spec floor. Command: adapt.
- [P1] Edge states: one-season full-width bar (driver.css:299), one-option picker, "0 · 205th all-time" x4, empty Beyond F1 (DriverPage.astro:256). Fix: cap bar width, plain text picker, "—" for zero, render fact cells only when filled. Command: harden.
- [P1] Keyboard/SR: grid cells, ribbon, milestones hover-only, aria-hidden card; milestones not focusable (617–627); picker label lacks year; H2 name includes listbox options; tablist semantics. Fix: aria-labels from tt, show card on focus, milestones as buttons, move listbox out of H2, role=tab/aria-selected. Command: audit.
- [P2] Repetition flattens hierarchy (hero figures vs Career stats, double "7", stints line). Fix: ranks-only Career stats, title list without second giant number, drop stints line. Command: distill.

## Persona red flags
- Casey (phone, race weekend): Sprint-first table, unreadable curve, overlapping labels, no jump to current season.
- Sam (keyboard/SR): grid, ribbon, milestones unreachable; picker without year; polluted H2.
- Riley (edge cases): full-width bar, tied ranks, DN/DS, empty box, one-option picker, Senna home race 2026.
- Archive stats fan: Senna page breaks trust; ranks compare against an incomplete archive with no notice.

## Minor
- Kickers not numbered as on home; ES copy uses voseo (es.ts:308, 360) vs DESIGN §8b neutral Spanish.
- MERCEDES-AMG wraps badly in mobile crown; no-photo fallback repeats the digit; "Bahrain Grand Prix in Malaysia"; lazy team logos pop in.

## Questions
1. Should pre-archive drivers get a profile yet, and how to say "partial" in poster language?
2. During a weekend, should the current season lead for active drivers?
3. Does a rookie need six sections?
4. Which of ~470 hover-only details survive if hover didn't exist?
