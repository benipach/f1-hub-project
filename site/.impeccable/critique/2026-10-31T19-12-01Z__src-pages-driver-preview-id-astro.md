---
target: site/src/pages/driver-preview/[id].astro
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\dev\\f1-hub-project\\site\\src\\pages\\driver-preview\\[id].astro"
target_fingerprint: "sha256:d254a52e781eabdf81dfa9db9f71cb3f449a07b3d0cc443b1d6bcd7d895dedf2"
target_path: "C:\\dev\\f1-hub-project\\site\\src\\pages\\driver-preview\\[id].astro"
timestamp: 2026-10-31T19-12-01Z
slug: src-pages-driver-preview-id-astro
---
Method: dual-agent (A: design review · B: detector + browser)

## Design health
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Season pick not in the URL; season and board redraws not announced (no aria-live) |
| 2 | Match with real world | 3 | "Broke all-time record" doesn't name the record; ES page shows English facts (driver-facts.ts) |
| 3 | User control | 3 | A season-bar click scrolls up but focus stays on the bar |
| 4 | Consistency | 3 | Zero is "·" for wins/podiums, "0" for points; Career stats folds zeros, season figures still show "0 0 0 0 0" |
| 5 | Error prevention | 3 | Read-only; predictable |
| 6 | Recognition | 2 | Ribbon key without colour; teammate codes; 7-state grid key |
| 7 | Flexibility | 2 | 8–11k px, no section jump, no ?season= link |
| 8 | Aesthetic/minimalist | 3 | Rows of rounds not raced / to come pad the season panel |
| 9 | Error recovery / empty states | 3 | Zero line fixed the winless dead end; "1 races together", all-zero season figures |
| 10 | Help | 3 | Short keys; nothing says the ranks are switches |
| **Total** | | **28/40** | Good (up from 27) |

## Design specificity
Strongly product-specific (fitted name, duel bars, form curve with classified retirements, season bars, every-race grid). Generic leftovers: 1-column spec sheet on phones, row-per-round lists of rounds not raced, zero season figures.
Detector: CLI 0. Browser (4 pages, natural scroll, no overflow anywhere): kicker-above-heading, cream-palette, stripes (DESIGN.md mandates); .eras key flagged as kicker (false); low-contrast on the 2020 title bar at 390 (computed 4.2:1, large text, anti-aliasing); footer tight-leading/straggler (shared chrome). Partly real: ES Season by season kicker is 84 uppercase chars, half of it an instruction. Advisory: "driver" straggler in the Career stats kicker at 390.

## Priority issues
- [P1] The season now is buried on phones for drivers on the grid: Antonelli's championship position first appears ~2,400 px down at 390 px, after nine single-column info cells. Fix: championship position in the hero strip/figures for active drivers; Driver info 2-up on phones. Command: layout, then adapt.
- [P2] The driver's own board row contradicts the bars: `.board li.me` has a full-width paper background (driver.css ~444) and a .09 bar, so Bearman's 68 points read as the longest bar. Fix: mark the row without filling it (rank chip or rule), draw its bar at its true length. Command: colorize, then polish.
- [P2] Short careers and partial seasons pad the season panel: Schneider 1990 shows five zero figures and 15 "Did not race" rows; Hamilton 2026 seven "To come" rows. Fix: collapse runs of missed/upcoming rounds into one row; mute or fold zero figures. Command: harden, then distill.
- [P2] Ribbon unreadable without hovering (carried over): key without colour swatches; Gasly's three navies, Ferrari red vs semantic red. Command: clarify.
- [P3] No ?season= deep link, no section jump on a ~10k px page. Command: layout.

## Persona red flags
- Casey: season ~2,400 px down; seven "To come" rows; "click one" kicker on touch.
- Sam: 79 tab stops (20 bars, 24 milestones) and no skip; silent redraws; focus stays after bar click; h1 is the last name only; home races and numbers lists are hover-only (data-tt, no sr text); picker option focus by colour only (outline: none).
- Riley: "1 races together" (en.ts:299, es.ts:280 not pluralised); titleLine "1 wins" (en.ts:348); same-race milestones (Debut + Best result in the team).
- Archive fan: no season link; record milestones don't name the record; teammate codes.

## Minor
- ES Season by season kicker too long for an uppercase label; move the instruction out.
- Before F1 entries and birthplace stay English on ES pages.
- Gasly's 2019 grid row taller (two logos stacked in the year column).
- Unselected rank switches read as disabled.
- Board motion uses cubic-bezier curves outside DESIGN.md's "ease" rule.
- Career stats kicker straggler at 390 (text-wrap: balance).

## Questions
1. Should a driver on the grid lead with "now" during a race weekend and keep archive order between races?
2. Should section depth scale with career length?
3. Is a giant "197th" the right lead for a back-marker, or value first and rank second?
