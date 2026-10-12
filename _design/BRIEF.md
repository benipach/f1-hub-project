# F1 Hub — Index redesign brief (shared by all design agents)

## The site
F1 Hub (https://benipach.github.io/f1-hub-project) is a fan-made Formula 1 hub: live timing from F1's
official feed, calendar in local time, results, standings, driver/team profiles, archive since 1990.
Vanilla HTML/CSS/JS, no framework, no build step, served from GitHub Pages. English UI.

## Goal
Redesign `index.html` from zero, **including the navbar and footer** (they are shared by every page,
so the new ones must work site-wide). Total creative freedom: nothing from the current index has to
survive (not the hero city-text effect, not the card grid).

## The hero has 3 states (the core of the page)
The first screen changes with the race weekend:
1. **UPCOMING** — next session + live countdown to it, and the countdown to the next race.
   Example now: US Grand Prix, Round 20, Circuit of The Americas (Austin, 🇺🇸).
   Weekend (local time): Fri 23 Oct FP1 14:30, FP2 18:30 · Sat 24 Oct FP3 15:00, Qualifying 19:00 · Sun 25 Oct Race 16:00.
2. **LIVE** — a session is running right now → prominent entry point to `live.html`
   (e.g. "Qualifying is live — Lap/Q2 in progress", "Watch live timing →"). Should feel urgent.
3. **RESULT** — up to 24 h after the race ends → show the race result (podium first, then more).
   Example: Singapore GP, Round 19, Marina Bay. Race top 10 (pos, driver, team, gap, grid):
   1 Verstappen, Red Bull, 1:42:00.785, grid 1 · 2 Leclerc, Ferrari, +7.335s, grid 2 (fastest lap) ·
   3 Antonelli, Mercedes, +24.573s, grid 4 · 4 Norris, McLaren, +40.506s, grid 5 ·
   5 Piastri, McLaren, +49.644s, grid 6 · 6 Hamilton, Ferrari, +53.188s, grid 3 ·
   7 Lawson, Racing Bulls, +81.666s, grid 8 · 8 Hülkenberg, Audi, +83.386s, grid 10 ·
   9 Russell, Mercedes, +84.677s, grid 19 · 10 Hadjar, Red Bull, +90.862s, grid 22.

The mockup must include a small state switcher (e.g. a floating pill "Upcoming / Live / Result",
also readable from `?state=upcoming|live|result`) so the three states can be compared. The countdown
must actually tick (JS).

## Below the hero (your call on order/format; these are the available ingredients)
- **Season calendar 2026**: 25 rounds. R1–R19 finished (R4 Bahrain and R5 Saudi Arabia CANCELLED),
  R20 US = next, R21–R25 upcoming. Sprint weekends: R2 China, R6 Miami, R7 Canada, R11 Britain,
  R14 Netherlands, R19 Singapore. Rounds: 1 Australia (05–08 Mar), 2 China (13–15 Mar), 3 Japan
  (26–29 Mar), 4 Bahrain (cancelled), 5 Saudi Arabia (cancelled), 6 Miami (01–03 May), 7 Canada
  (22–24 May), 8 Monaco (05–07 Jun), 9 Barcelona (12–14 Jun), 10 Austria (26–28 Jun), 11 Britain
  (03–05 Jul), 12 Belgium (17–19 Jul), 13 Hungary (24–26 Jul), 14 Netherlands (21–23 Aug),
  15 Italy (04–06 Sep), 16 Spain/Madrid (11–13 Sep), 17 Azerbaijan (24–26 Sep), 18 "Bahrain GP in
  Malaysia" (02–04 Oct), 19 Singapore (09–11 Oct), 20 USA (23–25 Oct), 21 Mexico (30 Oct–01 Nov),
  22 Brazil (06–08 Nov), 23 Las Vegas (20–22 Nov), 24 Qatar (27–29 Nov), 25 Abu Dhabi (04–06 Dec).
  Winners: R1 Russell, R2 Antonelli, R3 Antonelli, R6 Antonelli, R7 Antonelli, R8 Antonelli,
  R9 Hamilton, R10 Russell, R11 Leclerc, R12 Antonelli, R13 Norris, R14 Norris, R15 Antonelli,
  R16 Antonelli, R17 Russell, R18 Verstappen, R19 Verstappen.
- **Drivers' standings** (after R19): Antonelli 340 · Russell 238 · Hamilton 229 · Verstappen 221 ·
  Leclerc 215 · Norris 201 · Piastri 136 · Hadjar 94 · Lawson 73 · Gasly 50.
- **Constructors' standings**: Mercedes 578 · Ferrari 444 · McLaren 337 · Red Bull 329 ·
  Racing Bulls 96 · Alpine 77 · Haas 30 · Audi 23 · Williams 12 · Aston Martin 7 · Cadillac 0.
- Links into the rest of the site: Results, Drivers, Teams, Live, Grand Prix pages, archive.

## Assets you can use (paths relative to `_design/<your-folder>/index.html` → prefix `../../`)
- Fonts: `fonts/Formula1-Regular.ttf`, `Formula1-Bold.ttf`, `Formula1-Black.ttf`, `Formula1-Italic.ttf`
  (you may also use Google Fonts if your direction needs a different voice).
- Logo: `img/logo.png` (white "F1" + red "HUB" wordmark), `img/icon.png`.
- Circuit photos: `img/circuits/cota.png`, `img/circuits/marina-bay-street-circuit.png` (and others).
  Track layouts (SVG): `img/circuits/cota-layout.svg`, `img/circuits/marina-bay-street-circuit-layout.svg`.
- Driver portraits: `img/drivers/<lastname>.png` and `<lastname>-2.png` (verstappen, leclerc,
  antonelli, norris, piastri, hamilton, russell, lawson, hulkenberg, hadjar, gasly…).
- Team logos `img/teams/<id>-logo.png`, cars `img/teams/<id>-car.png`. Ids: mercedes, ferrari,
  mclaren, red-bull-racing, racing-bulls, alpine, aston-martin, haas, williams, audi, cadillac.
- Team colors: Mercedes #2BFFDB, Ferrari #FF0019, McLaren #FF7F00, Red Bull #22477A,
  Racing Bulls #667DFF, Alpine #006FBA, Aston Martin #229971, Haas #DEE1E2, Williams #1C7AFF,
  Audi #FF2E2E, Cadillac #AAAAAD. Brand red today: rgb(225,6,0).

## Navbar & footer requirements
- Navbar links: Calendar, Results, Drivers, Teams, Live (Live should be able to show a "live now"
  indicator). Must collapse well on mobile.
- Footer content to keep (restyle freely): tagline "Every Grand Prix in one place… Made by a fan,
  for fans.", a line "All times shown in <user timezone>", nav columns (Season: Calendar,
  Championship, Results, Live Timing · The Grid: Drivers, Teams · History: Memorabilia (Soon) ·
  Resources: Formula 1, FIA, OpenF1), legal notice ("Unofficial fan project… not associated with
  Formula 1 companies, the FIA or any team… trademarks of Formula One Licensing B.V."),
  © F1 Hub · Designed & built by Benicio Pacheco, social links (GitHub, LinkedIn, Portfolio),
  Back to top.

## Hard constraints
- One self-contained file: `_design/<your-folder>/index.html` (inline CSS + JS, hardcoded data
  above). No frameworks, no build step.
- Must work and look intentional at **1440px desktop and 375px mobile** (no horizontal scroll).
- Dark-first is fine (it's a motorsport site) but contrast must be readable (WCAG AA for text).
- Respect `prefers-reduced-motion`.
- It's a mockup to choose a direction, but build the WHOLE page (navbar → hero in 3 states →
  sections → footer), not just a hero.
