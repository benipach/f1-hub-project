# Live hero redesign: brief shared by every design agent

## What this is
F1 Hub's homepage hero has three states (upcoming, **live**, result). The
**live** state shows while a session of the Grand Prix weekend is running
(practice, sprint qualifying, sprint, qualifying, race). The owner doesn't
like **how the space is laid out** in it and wants it **redesigned from
zero**. Your job: a live hero that is clearly better *and* belongs to the
site's design system. The owner will compare four directions and pick one,
so make yours the strongest, most finished version of its idea.

Read before you start, in this order:
1. `_design/DESIGN.md`: the design system ("Poster"). **It is the law.**
   Tokens, type, grid, motion and colour rules; section 5 → "Homepage hero
   (3 states)", especially **Live (red)**, and section 6 (when each state
   shows).
2. Look at today's live hero: `_design/live/current-1440.png`,
   `current-1920.png` and `current-375.png` (the dark floating bar at the
   bottom is a preview tool, ignore it).
3. `site/src/components/home/Hero.astro`: today's markup and CSS (the
   `hero--live` section and the shared `.strip`, `.band`, `.tbl`, `.ldot`).
   Steal what works. Also look at the **upcoming** and **result** states in
   the same file: the live state must feel like their sibling (same
   skeleton: `.strip` on top, content grid, `.band` at the bottom).
4. `_design/d-poster/index.html`: the mockup the system came from (its live
   state).
5. `_design/live/data.json`: the real data you must use (below).

## What's wrong today (our reading of it; the owner just said "the layout of the space")
At 1440 × 900 (see the screenshots):
- The giant "LIVE" floats in the top-left with a big **dead red area** to
  its right; it says the obvious and takes the most room.
- The **session** (what's actually live: "RACE · Lap 19 / 62") is small and
  pushed to the bottom-left, the least prominent spot, yet it's the news.
- The "Watch live timing" ink block **floats** between the session and the
  tower, the same height as neither, and reads as a third unrelated box.
- The top-10 tower is an ink column with **empty space under row 10**; the
  three things (LIVE, session, CTA, tower) don't share edges or baselines.
- The band at the bottom ("Up next — Weekend complete") is weak.
- On mobile (375) the hero becomes a very long stack: LIVE, session, a big
  CTA box, then a ten-row table: two screens of scrolling before the
  calendar.
- **Most important:** until the relay moves (December) and often after, the
  top-10 feed **is not available**: the tower is hidden and today the hero
  becomes just "LIVE" + a small session line + the CTA box, which looks
  empty. The real homepage will show that version for months.

## The hard requirement: two modes, both finished
- **With feed**: the top 10 (position, driver, team, gap) plus the race lap
  or the qualifying part and clock.
- **Without feed**: only the timetable is known (session name, when it
  started, when it ends; what comes next). This must look **complete and
  intentional**, not like "a tower is missing". Design it first, then add
  the feed on top.
The switch between them must not move what's already there in a jarring
way (the feed can arrive a few seconds after the page loads).

## Content you can use (and nothing invented)
From the timetable (always available): GP name, round "17 / 23", circuit,
city, sprint weekend, the session running, "Started 40 min ago", its end
time in the visitor's zone ("Ends 15:00"), the weekend timetable with what's
done / live / next, what comes next and when.
From the circuit data (always available): the layout drawing
(`gp.layout`), lap length, turns, race laps, lap record.
From the live feed (only "with feed"): top 10 rows (`pos`, `number`, `code`
three-letter, `firstName`, `lastName`, `team`, `teamLogo`, `gap`); race and
sprint: current lap / total; qualifying: the part ("Q2") and its clock
("07:24 left"), or between parts "Q2 next". P1's gap cell names what P1 is:
"Leader" in races, "Fastest" otherwise.
Optional, only if it really earns its place: `optionalFeedFields`
(track status flag, weather). Say in your note that it needs a new feed
field. No tyres, sectors, intervals, pit stops, telemetry: that's the Live
page's job; this hero is a **door** to it, not a dashboard.

The main action is **"Watch live timing →"** (to `live.html`). Secondary:
the weekend timetable (the GP page). Copy is in English; keep text lengths
flexible (Spanish runs 20–30 % longer: "EN VIVO", "Clasificación",
"Gran Premio de Singapur", "Ver el timing en vivo").

## Data: `_design/live/data.json`
`gp` (the weekend's facts), `sessions` (UTC), and four `scenarios`, each
with a `now` and its feed values:
- `race`: lap 19 / 62, top 10 with gaps ("Leader", "+2.307s"…);
- `qualifying`: Q2 running, "07:24 left", top 10 with lap time for P1 and
  gaps;
- `qualiBreak`: between Q1 and Q2 ("Q2 next", starts in 04:00);
- `practice`: FP1, "Ends …", top 10 by fastest lap.
Load it with `fetch('../data.json')` (the folder is served over HTTP).
Show times in the visitor's zone with `Intl`. Clocks that tick (the
qualifying clock, "Started N min ago") must actually tick from the
scenario's `now`.

## Deliverable
One self-contained file: `_design/live/<your-folder>/index.html` (inline CSS
and JS, no frameworks, no build step). It shows:
1. A simple navbar (ink, 56 px, logo `img/logo.png`, a red "● Live" chip,
   a hamburger icon), then **the live hero** at full height
   (`min-height: calc(100svh - 56px)`), then the first lines of the next
   section (the paper calendar title "Season 2026" is enough) so the
   transition is visible.
2. A small floating switcher (fixed, bottom, ink, label type, like the
   preview tool in the screenshots), also readable from the URL
   (`?scenario=race|qualifying|qualiBreak|practice&feed=on|off`), to flip
   **scenario** and **feed on / off**. Default: race, feed on.
3. Must work and look intentional at **1920 × 960, 1440 × 900, 1100, 760 and
   375 px**, with no horizontal scroll. **On desktop the whole hero (strip
   to band) must fit one screen** at 1440 × 900 and 1920 × 960 (the owner's
   monitor). On mobile, aim for a hero that doesn't need two screens.
4. A short note at the top of the page, above the navbar (small, muted,
   removable): your direction's name, the idea in two lines, what you
   changed versus today and why, and any feed field you'd need.

Assets (paths relative to `_design/live/<your-folder>/index.html`, so
prefix `../../../`): logo `img/logo.png`; circuit layout
`img/circuits/thin/<id>-layout.svg` as `<img>` with a CSS filter
(`brightness(0)` black, `brightness(0) invert(1)` white; on red use white
or ink); team logos `img/teams/<id>-logo.png` (always in their own colours,
never duotone or filtered); font Archivo variable:
`@font-face { font-family: 'Archivo'; src:
url('../../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2')
format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }`.

## Hard rules (from DESIGN.md, repeated because they matter)
- Tokens only: paper `#EFEAE0`, paper-2 `#E6E0D3`, ink `#121212`, ink-2
  `#1E1E1E`, mute `#66625A` (on paper), mute-ink `#A39E93` (on ink), red
  `#E10600` (large type and fields only), red-ink `#B30500` (small red text
  on paper), red-hi `#FF5A4E` (small red text on ink). White `#fff` on red.
  Team colours only through logos.
- **The live state's field is red** (it's the one moment red is for). One
  red field per screen. Ink and paper blocks may sit on it.
- No rounded corners (except dots), no shadows (except your floating
  switcher). 1 px hairlines; 4 px rule on top of each block that opens a
  group. 12-column grid, `--gut` 32 px (16 px ≤ 760), `--gap` 16 px (12 px).
- Type: Archivo only. Display: weight 900, `font-stretch: 62%`, uppercase,
  tight line-height. Labels: 11–12 px, 700, `font-stretch: 115%`,
  uppercase, `.09em` tracking. `tabular-nums` only on what ticks every
  second or lines up in a column (the gaps, a running clock). Display
  numbers inside a label block reset `letter-spacing: 0`.
- The beating live dot (`.ldot`): opacity 1 → .35, ~1.1 s, it keeps its
  size. No other looping animation.
- Motion: `transition: all <t> ease`, one duration per component, no
  delays; animate only transform / opacity / clip-path / colours. The hero
  enters with the wipe (`clip-path` from `inset(0 100% 0 0)`, .7 s). Respect
  `prefers-reduced-motion` (the owner has it ON: the static version is what
  they see and must look complete).
- Table rows are not links: **no row hover**. Hover only on real links/buttons;
  a hover colour must contrast with the field it sits on.
- Giant decorative type is `aria-hidden`, with a real heading next to it.
  Clocks have `role="timer"` and screen-reader text that doesn't change
  every second. Contrast AA for text (white on `#E10600` is fine for large
  and bold text; check small text).
- Performance floor is a Celeron N4020: update text only in the tick, no
  layout reads in loops.

## Don't
- Don't edit anything outside `_design/live/<your-folder>/`.
- Don't use git. Don't start servers on other ports than you need.
- Don't make it a dashboard. Few elements, each big and deliberate. If
  something doesn't earn its size, it goes.
- Don't copy F1's own TV graphics.

## Check your work
The repo root is already served at **http://localhost:5050/** (your page:
`http://localhost:5050/_design/live/<your-folder>/index.html`); don't start
another server. Look at your page with headless
Chrome (`"C:/Program Files/Google/Chrome/Application/chrome.exe"
--headless=new --hide-scrollbars --user-data-dir=<a temp dir of yours>
--virtual-time-budget=3000 --window-size=W,H --screenshot=<file> <url>`;
wrap it in `timeout 40`, Chrome can hang). Note: headless Chrome won't
make the viewport narrower than ~500 px, so for 375 check with a
`<iframe width=375>` page of your own or by reading your CSS carefully.
Screenshot at least 1440 × 900 and 1920 × 960 in each scenario with feed on
and off, read the images, and fix what's wrong before you finish. Your
final message: the direction in three lines, and anything you couldn't
resolve.
