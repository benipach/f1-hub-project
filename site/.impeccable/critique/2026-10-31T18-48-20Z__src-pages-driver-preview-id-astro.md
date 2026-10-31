---
target: site/src/pages/driver-preview/[id].astro
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:C:\\dev\\f1-hub-project\\site\\src\\pages\\driver-preview\\[id].astro"
target_fingerprint: "sha256:d254a52e781eabdf81dfa9db9f71cb3f449a07b3d0cc443b1d6bcd7d895dedf2"
target_path: "C:\\dev\\f1-hub-project\\site\\src\\pages\\driver-preview\\[id].astro"
timestamp: 2026-10-31T18-48-20Z
slug: src-pages-driver-preview-id-astro
---
---
target: site/src/pages/driver-preview/[id].astro
---
Method: dual-agent (A: design review · B: detector + browser)

## Design health
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Selected season marked in picker and season-by-season; the pick never reaches the URL |
| 2 | Match with real world | 3 | Accurate F1 language; "Broke all-time record" doesn't say which record |
| 3 | User control | 3 | Esc/outside click on picker and milestone pin; no way back after a milestone scrolls |
| 4 | Consistency | 3 | Red carries six meanings (title, lost duel, DNF, ×, milestone tick, Ferrari in the ribbon) |
| 5 | Error prevention | 3 | Read-only surface; hovers and pins predictable |
| 6 | Recognition | 2 | Teammates as 3-letter codes; ribbon key without colour swatches; 7-state grid key |
| 7 | Flexibility | 2 | 8–11k px page, no section jump, no deep link to a season |
| 8 | Aesthetic/minimalist | 3 | Distill landed; left: 1-column spec sheet on phones, rows of "to come" rounds |
| 9 | Error recovery / empty states | 2 | Empty "Beyond F1" cell; dead Career stats for drivers without wins |
| 10 | Help | 3 | Short keys and hints in place |
| **Total** | | **27/40** | Acceptable (up from 24) |

## Design specificity
Strongly product-specific: fitted name + red number hero, teammate duel, form curve with classified retirements, season bars, every-race grid. Generic moments: the stacked Driver info on phones, and edge cases (short or winless careers).
Detector: CLI 0 findings. Browser (CDP, 4 pages): kicker-above-heading, cream-palette, repeating-stripes (all DESIGN.md mandates, false positives); .eras key flagged as kicker before h3 "Every race"; low-contrast on a title bar (sampling a scrolled-out bar, real 4.1:1); tight-leading and 10px "Soon" in the shared footer; SVG "POINTS" label ≈9px at 390.
Verified false: Bearman 2024 bar label collision (label sits above the bar once the deferred measurement runs); 847px page width at 390 (only with content-visibility forced off; real page 390px, but `.sr` spans in `.sbs__row` escape the scroller — fragile).

## Priority issues
- [P2] Career stats dead end for drivers without wins: the board opens on Wins (DriverPage.astro ranks/boardHtml 'wins'), Bearman sees four big "—" and a top five without himself. Fix: open on the first stat with a value; fold zero stats into one quiet line. Command: harden.
- [P2] The season now is buried for drivers on the grid: the hero shows only career totals; Antonelli's championship lead first appears ~1,150 px down (≈1,800 px on a phone, after ~1,300 px of stacked Driver info). Fix: championship position in the hero strip next to "On the grid"; two short cells per row on phones. Command: layout, then adapt.
- [P2] The ribbon can't be read without hovering: the key is logos and names with no colour; similar navies (Toro Rosso, Red Bull, AlphaTauri), Haas grey vanishing on paper, Ferrari red against the site's semantic red. Fix: a swatch per key item, hairline on light colours. Command: clarify (with colorize).
- [P2] Empty "Beyond F1" cell when only "Before F1" exists (DriverPage.astro, junior/beyond map; Antonelli). Pending owner decision. Fix: draw only filled cells, the other spans full width. Command: harden.
- [P3] No section jump or season deep link on a ~10k px page (`?season=2008`). Command: layout.

## Persona red flags
- Casey (phone, weekend): championship position not in the hero; ~1,300 px of spec cells first; seven "To come" rows before season-by-season.
- Sam (keyboard/SR): every-race grid reads ~450 cells with no skip or per-year heading; rank switches well labelled.
- Riley (edge cases): winless board, empty Beyond F1, debut + first points + best in team on one race, 7-title wall wraps 6+1.
- Archive fan: no season deep link, teammate codes only, record milestones don't name the record.

## Minor
- `.sr` spans in `.sbs__row` (vs teammate, teammate) are positioned against body; give `.sbs__row` position: relative.
- SVG chart labels ≈9px at 390 (driver-view.ts "POINTS", ticks).
- A lost teammate record in --red-ink has no key entry.
- Form curve's empty P1–P3 band for back-markers.

## Questions
1. For a driver on the grid during a race weekend, should the page open on "now" and push Driver info below the season?
2. Does a two-season rookie need all six sections, or should Career stats and milestones shrink until there's something to rank?
3. Should the ribbon carry the team names inside wide stretches and drop the separate key?
