# F1 Hub design system: "Poster"

The visual language for the whole site, taken from the homepage mockup chosen
on 2026-10-12 (`_design/d-poster/index.html`, direction D of four explored in
`_design/compare.html`). This file is the spec: the mockup is the reference
picture, this is what to build from. Where they disagree, this file wins.

Read it before building any new page or component. The site is being rebuilt
page by page in Astro (`site/`), reading normalized data from
`shared/src/data/` (`loadSeason()`); see the project plan.

---

## 1. Idea

Vintage Grand Prix posters, read through the Swiss / International style.

- **Type is the graphic.** Huge condensed numbers and names do the work that
  photos and illustrations do elsewhere: the round number, the countdown, the
  winner's "1".
- **One flat color field per moment.** Paper while waiting for the next
  session, solid red while a session is live, ink for results. Anyone should
  know the state of the weekend in two seconds, before reading a word.
- **A strict grid, heavy rules.** 12 columns, 1 px hairlines between things,
  4 px rules on top of every block that starts something.
- **Few elements, each one big and deliberate.** If something doesn't earn
  its size, it goes.
- **Photos are optional, never load-bearing.** Every component must look
  finished without one (see section 7).
- **The circuit layout is a shape**, drawn flat in a single color, not a map. The drawings are today's official files with **thinner borders** (owner's call, 14/10): `scripts/thin-layouts.ts` runs a mask along every edge of the ribbon, cutting 0.7 units off each side of each border (cut 1.4 in the 121 × 85 viewBox), and writes `img/circuits/thin/` (25 files; every layout must be named `<circuitId>-layout.svg`; known issue: in Madring, Marina Bay and Sepang the ribbon is made of pieces whose joins cross it, and the mask cuts along them, leaving small gaps; an erosion filter was tried and dropped, owner's call, 14/10); the site uses those first (`layoutNames()` in `home.ts`). Our own drawings from car positions were tried and set aside for now (`_design/tracks/`).

What it must not become: a dashboard (that's the Live page's job), a magazine
with long texts, or an imitation of F1's own broadcast graphics.

## 2. Tokens

Define these once as CSS custom properties (Astro: a global stylesheet) and use
nothing else. Values are the mockup's.

### Color

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--paper` | `#EFEAE0` | Base field: upcoming hero, calendar, light sections; text on ink | — |
| `--paper-2` | `#E6E0D3` | Slightly darker paper, for a second level on paper | — |
| `--ink` | `#121212` | Text on paper; base field for results, standings, navbar, footer | — |
| `--ink-2` | `#1E1E1E` | Second level on ink | — |
| `--mute` | `#66625A` | Secondary text **on paper** | 5.0:1 |
| `--mute-ink` | `#A39E93` | Secondary text **on ink** | 7.0:1 |
| `--red` | `#E10600` | Brand red: **large type and flat fields only** (it fails AA for small text on paper) | — |
| `--red-ink` | `#B30500` | Red for **small text** on paper or white | AA |
| `--red-hi` | `#FF5A4E` | Red for **small text on ink** | AA |
| `--fl` | `#C08BFF` | Fastest lap marker, on ink | — |

Team colors come from `data/teams.json` (`color`), never from a table in code.
They appear as small flat squares (`.sq`, 10×10 px with a 1 px dark outline,
light outline on ink), next to a driver or team name. **Wherever a team is
named (tables, the result's winner and podium, the calendar's winners) it
shows its logo instead**: the `TeamMark` component
(`site/src/components/TeamMark.astro`), `img/teams/<id>-logo.png` in a square
box (20 px by default, `object-fit: contain`; resized at build time to
twice the box, as WebP, 16/10), falling back to the color
square when there's no logo file (owner's calls, 12/10; logos are
trademarks, see the plan's intellectual-property list). **Logos always go in
their own colors, everywhere** (owner's call, 13/10). Dropped before that: an
ink/paper duotone (SVG `feComponentTransfer` filter, with the real colors
fading in on hover), used in the calendar and at first everywhere, and before
it a flat one-color silhouette (everything looked black). Don't bring either
back. The text next to a mark goes in `.mark-text`
(`text-box: trim-both cap alphabetic`), so it centers on the logo optically:
otherwise the room the text box keeps for descenders makes it sit low. Rules
in `base.css`. The color square stays for the design-system palette (the
hero strip's tags lost theirs on 16/10, owner's call). Never as text color and
never as a field: some team colors (Red Bull `#22477A`, Alpine `#006FBA`) are
unreadable on ink, and the square with its outline works for all of them.

### Typography

One family: **Archivo**, variable (`wdth 62–125`, `wght 100–900`), SIL Open
Font License. **Self-host it** (`woff2`, subset to Latin) instead of loading it
from Google Fonts: no third party, faster first paint. The official Formula 1
fonts in `fonts/` are not used by this system (licensing; see the plan).

It's used at two extremes, plus plain text:

| Role | Class | Settings |
|---|---|---|
| **Display** (numbers, names, titles) | `.cond` | weight 900, `font-stretch: 62%`, uppercase, `line-height: .86` (as low as .73 for the giant "1"), `letter-spacing: -.005em` |
| **Label** (kickers, column heads, buttons, tags) | `.lbl` | 11–12 px, weight 700, `font-stretch: 115%`, uppercase, `letter-spacing: .09em` |
| **Body** | — | 16 px, weight 400–600, `line-height: 1.45`, normal width |
| **Numbers** | `.num` | `font-variant-numeric: tabular-nums lining-nums` on anything that ticks or lines up in a column |

**`.num` (tabular, fixed-width digits) only where digits change every second
or must line up in a column** (the big countdown, timetable times, table
gaps). Display numbers that don't tick (round numbers, stats, facts, the
compact race countdown) go without it: in this condensed face fixed-width
digits open wide gaps (owner's call, 12/10).

Display numbers and words placed inside a `.lbl` block (like the facts under
the track layout) must reset `letter-spacing: 0`: they'd otherwise inherit the
label's wide `.09em` tracking (owner's call, 12/10).

Display sizes are fluid with `clamp()`. Reference scale from the mockup:

| Element | Size |
|---|---|
| Giant result "1" | `clamp(240px, 44vw, 660px)` |
| "LIVE + session" line | fitted to its box by script (up to 400 px) |
| Section titles ("Season 2026") | `clamp(72px, 12vw, 196px)` |
| Countdown digits | `clamp(68px, 12vw, 190px)` |
| Hero GP title | `clamp(44px, 7.4vw, 118px)` |
| Winner name | `clamp(52px, 7vw, 110px)` |
| Round number in a calendar cell | 60 px |
| Table / list values | 26–28 px display |

### Space, grid and layout

| Token | Desktop | ≤ 760 px |
|---|---|---|
| `--gut` (page side padding) | 32 px | 16 px |
| `--gap` (column gap) | 16 px | 12 px |
| `--nav` (navbar height) | 56 px | 56 px |

- `.wrap`: `max-width: 1440px`, centered, side padding `--gut`.
- `.g12`: `grid-template-columns: repeat(12, minmax(0, 1fr))`, gap `--gap`.
- Sections: 112 px top, 120 px bottom (72 / 80 px on mobile).
- Rules: 1 px hairlines in `currentColor` (or a translucent paper on ink);
  **4 px** solid rule on top of each block that opens a group (countdown,
  timetable, standings leader, calendar grid, footer wordmark).

Breakpoints: **1100 px** (two-column layouts collapse, calendar 5 → 3 columns),
**760 px** (single column, calendar becomes a list, smaller gutters, the
navbar's season label hides). The navbar has no breakpoint of its own any
more: its hamburger is there at every width (13/10).

### Motion

- **Transitions are written as `transition: all <duration> ease`**, with one
  duration shared by every animated element of a component, so the whole
  component moves in sync on enter and on leave (the project's rule, as in
  `styles/drivers.css`). No custom curves, delays or per-property lists. This
  replaces the mockup's `cubic-bezier(.7, 0, .2, 1)`.
- **Hover rules learned on 12/10** (the owner saw buttons "blink" mid-hover):
  - the hover color must contrast with the field the element sits on: a red
    button that turns ink fades into an ink band halfway, so on ink
    (`.on-ink`) it turns paper;
  - children of a hovered element (like `.arrow`) use the same duration as
    the element;
  - no `currentColor` in a shadow or border that animates together with
    `color`: use an explicit color (`--line` on `.btn--line`);
  - an image whose `filter` animates gets `will-change: filter`, so it keeps
    its layer and doesn't flash when the transition starts and ends;
  - change `background-color`, not the `background` shorthand, when the
    element also has a `background-image` (it would vanish at once).
- **Wipe** when the hero changes state: `clip-path` from `inset(0 100% 0 0)` to
  `inset(0)`, 0.7 s, `ease`.
- **Loading** (16/10): every animation waits, paused at its first frame, until
  the font is in, at most 1.5 s (`html.is-loading`, set by an inline script in
  `Base.astro`, rule in `base.css`), so the wipe never runs in the fallback
  font and swaps letters halfway. No loading screen, no minimum duration: the
  page is there at once, only the motion waits.
- **Beat** for anything live (dots): opacity 1 → .35 and back, ~1.1 s loop.
  The dot keeps its size (owner's call, 12/10: the mockup's scaling pulse
  changed it too much).
- Arrows move 6 px right on hover.
- Animate only `transform`, `opacity` and `clip-path`.
- `prefers-reduced-motion: reduce` turns every animation and transition off.
  The owner's PC has it on (Windows animations disabled), so the static
  version is what he sees by default: it must look complete without motion.

## 3. Color fields and page rhythm

Fields alternate down the page, so each section starts with a clear change:

| Field | Where |
|---|---|
| Ink | Navbar (always), result hero, standings, footer |
| Paper | Upcoming hero, calendar, the "Explore" index, most content sections |
| Red | Live hero; the next round's calendar cell |

Avoid two sections of the same field in a row. Red is the loudest thing on the
site: one red field per screen at most. **Red fields are kept for what's live
or about to be** (owner's call, 13/10: the Explore index, the result's band
and its layout block moved from red to paper). Red as a small brand accent
stays: the giant "1", leader points, main buttons, countdown separators, the
upcoming hero's track, "To go", "Hub" in the footer wordmark. (The latest
round's number in the calendar was red too, until 13/10: owner's call.)

**Copy never states where the archive starts** ("since 1990"): it's being
extended back to 1950 and is in progress (owner's call, 13/10).

## 4. Primitives

| Class | What it is |
|---|---|
| `.lbl`, `.cond`, `.num` | The type roles above |
| `.sq` | Team color square: `<span class="sq" style="--c: #FF0019">` |
| `.ldot` | Live dot: gray when idle, white and beating when live |
| `.strip` | A row of label cells divided by hairlines; opens every hero (state tag, round, place, date) |
| `.band` | A full-width ink (or red) bar closing a hero: one key fact and one action |
| `.digits` | Countdown / clock: condensed tabular digits with small labels under each unit; separators in red |
| `.btn--red`, `.btn--ink`, `.btn--line` | Square buttons in label type, no radius. Red is the main action; line is secondary |
| `.arrow` | "→" that slides on hover of its link |
| `.roundel` | Ink disc with the round number, condensed |
| `.facts` | Row of 2–4 big numbers with labels, divided by hairlines |

No rounded corners anywhere, except the roundel and the dots. No shadows,
except the floating mockup switcher (which doesn't ship).
## 5. Components

### Site sections: one order everywhere

The navbar, the homepage's Explore index and the footer list the sections in
**the same order** (owner's request, 13/10, after the navbar and Explore had
ended up different), grouped like the footer's columns:

1. **Season**, in time order: Calendar (what's coming) → Live (what's on) →
   Results (what happened) → Championship (where it leaves the standings).
2. **The grid**: Drivers → Teams.
3. **History**: Archive → Hall of Fame ("Soon", no link yet).

Explore leaves Calendar out (it's on the same page, right above). Live goes
second, not last: it's the site's headline feature, and in the middle of the
bar its red block during a session stands out more. Championship and Archive
link to `championship.html` and `archive.html`, which today forward to
Results (its standings section, and the page itself); they're the addresses
those pages will have, so the links won't change when they're built. A new
section goes into this list first, then into all three places.

### Navbar (site-wide)

- Ink bar, 56 px, sticky: the logo, "Season 2026" as a label next to it
  (hidden at ≤ 760 px) and **a hamburger button at every width** (owner's
  call, 13/10: with eight sections and the language switcher, a row of links
  was too much for the bar). Until then the links sat in the bar on desktop
  and the hamburger only took over below 860, then 1100, then 1200 px.
- `<meta name="theme-color" content="#121212">` in `Base.astro`: mobile
  browsers that support it paint their own bars in the navbar's ink, so the
  page reads as starting at the top of the screen (owner's request, 13/10).
  It stays ink while a session is live: the navbar doesn't turn red.
- **Hamburger**: three 2 px bars that turn into an X when open; 44 × 44 px;
  its label ("Open menu" / "Close menu", from the dictionary) is for screen
  readers. **The menu drops down from the bar like a blind**, full screen on
  paper (`clip-path` from `inset(0 0 100% 0)` to `inset(0)`), the links
  coming down 16 px with it, and goes back up the same way; one
  `transition: all .35s ease` for the whole component (owner's request,
  13/10: it used to appear at once, behind a button that read "Menu").
  Following a link or pressing Escape closes it; the page doesn't scroll
  while it's open.
- **In the menu**: every section in the site's order and groups (see "Site
  sections" below), each with a rule under it: Calendar, Live, Results,
  Championship · Drivers, Teams · Archive, Hall of Fame (no page yet: muted,
  not a link, with a "Soon" tag). Then the language switcher, in label type.
- **Two forms of the menu** (owner's call, 13/10: on a computer the
  full-screen menu with its giant type was too loud):
  - **≤ 760 px, full screen** on paper, dropping down from the bar, links in
    display type at 48 px, no group labels.
  - **≥ 761 px, a side panel** on ink, like a continuation of the bar: 440 px
    wide, sliding in from the right (`clip-path` from `inset(0 0 0 100%)`,
    contents moving 24 px with it) over the page dimmed at 45 % (a click
    there closes it). Links at 30 px display type in paper, grouped under
    small label headings (Season, The Grid, History, the footer's names);
    hover copy and current page in `--red-hi`; the switcher at the foot,
    after a rule. The scroll thumb hides while it's open (`<html
    data-menu-open>`).
- **Hover and keyboard focus: "rolling label".** The label rolls up out of
  view while a copy in `--red` rolls in from below (both stacked in a
  one-cell grid with `overflow: hidden`; the copy is `aria-hidden`). With
  reduced motion it switches instantly.
- **Current page** (`aria-current="page"`): its link in `--red-ink` (in
  `--red-hi` in the desktop panel). Only real pages can be current
  (`NavPage`): Calendar is a section of the homepage, so it's never marked
  (13/10: the homepage preview marked it, and it showed red).
- Tried and dropped on 12/10, when the links sat in the bar: the mockup's
  1 px white border (looked like a form button), a paper block inverting the
  link, a full-height version of that block (a dark strip stayed at the
  bottom; cause not found), and a red rule drawn under the hovered link.
- **Live**: the link has an `.ldot`; while a session is live it turns red,
  the dot beats and it reads "Live now". A red "● Live" chip also shows in
  the bar, next to the button, so the live state is seen without opening
  the menu.
- The live state comes from the timetable (section 6), not from the relay.

### Homepage hero (3 states)

Each state is one full-height section (`min-height: calc(100svh - var(--nav))`
on desktop) with its own field, and the same skeleton: `.strip` on top, the
content grid, a `.band` at the bottom.

**Upcoming (paper).**
- Strip: a tag that follows the weekend, "Round 20 / 25", circuit and place,
  weekend dates. The tag reads **"Next race"** before the first session,
  **"Race weekend"** between sessions, and **"Race finished"** once every
  session is over but the result isn't in the build yet (the "Results on the
  way" case), where "Next race" read as if it hadn't been run (owner's call,
  13/10). Written by `hero-state.ts` (`[data-up-tag]`).
- Left (cols 1–7): roundel with the round number, kicker, GP name in display
  type.
- Right (cols 8–12): the circuit layout in red, with `.facts` under it, two
  by two (owner's call, 13/10): lap length and turns from `circuits.json`
  (`layouts[*].length`, `.turns`; the layout valid for the year), then **race
  laps** and the **lap record** ("1:33.808 · Lap record · Hamilton 2025"),
  worked out from the races in the data on that layout (`circuitRaceStats`
  in `home.ts`): laps as the most a winner completed there (a race cut short
  doesn't lower it), the record as the fastest race lap (rows have `bestLap`
  from 2004; a new layout starts a new record, as in F1's own). The label
  doesn't say it's the race lap record. A cell without data is left out.
  **On desktop (≥ 761 px) the facts sit under the Grand Prix name**, in one
  row of four aligned with the title (the record's holder on a second line),
  and the layout has its column to itself; on mobile they stay under the
  layout, two by two (owner's call, 13/10: on a 1920 × 1080 screen the hero
  didn't fit, with an empty gap under the title). Done with the grid
  (`.up__track { display: contents }` on desktop), not by moving the markup.
- **The countdown digits (17vh) and "Results on the way" (12vh) also follow
  the screen's height** (`min(…vw, …vh)`), so a wide but short screen fits
  the whole hero, while a tall one keeps the full sizes. The Grand Prix
  title keeps its own size (`clamp(44px, 7.4vw, 118px)`): capping it by
  height too was tried and dropped (owner's call, 13/10).
- Bottom left (cols 1–8): "Next session — Practice 1 starts in" and the
  countdown (days, hours, minutes, seconds). Once every session is over but
  the result isn't in the build yet, it gives way to "Weekend complete" and
  **"Results on the way" in display type, always on one line**: its size
  comes from the column's width and the title's length (`cqi` and
  `--chars`), so it fits in any language. No explanatory sentence under it
  (owner's call, 13/10: nobody needs it, and it saves height).
- Bottom right (cols 9–12): the weekend timetable in the visitor's time zone,
  the next session marked in red with a "Next" tag, the race row in display
  type.
- Band: "Race", its day and time, "Lights out in" with a compact countdown,
  and the Grand Prix page as the red action.

**Live (red).** Redesigned from zero on 16/10 (owner's call, after four
directions explored with agents in `_design/live/`; the chosen one is a mix
of A's table and D's layout, `_design/live/e-mix/`). Two columns that share
the top and the bottom line, **7 | 5**:
- Strip: beating "Live now" tag, round, GP and circuit, "Sprint weekend".
- **Left (cols 1–7), three bands:**
  1. **The giant line**, "LIVE" in white and the session in ink ("LIVE
     RACE", "LIVE / QUALIFYING"; Spanish "CARRERA / EN VIVO", the order
     from the dictionary's `liveLine`). It takes the height the other bands
     leave and is fitted to its box by `hero-state.ts` (on one line, or on
     two when two lines make it bigger), once per session and on resize,
     never in the tick.
  2. **The session's progress**, under a 4 px rule: the heading ("Race in
     progress · Singapore Grand Prix", your time zone), a big readout, the
     start ("Lights out" in a race) and the end with "40 min ago" / "in 1 h
     19 min", and a heavy bar across the column. **What the bar measures
     (owner's calls, 16/10):** in a race or sprint, the laps (a tick per
     lap); in qualifying, **three segments, Q1, Q2, Q3, each as long as its
     part** (18 / 15 / 12 min; sprint 12 / 10 / 8), not ticks every 15
     minutes, the breaks only a gap; in practice, **the session's clock**
     (60:00 to 00:00). **The bar follows the session's clock, not the wall
     clock**, because a red flag stops it; the feed sends that clock
     (contract in `hero-state.ts`). Without the feed it falls back to the
     timetable (qualifying parts estimated from the standard format).
  3. **The weekend**, under a 4 px rule: its sessions in a row (done, the
     live one as an ink block with its own progress, the next one with a
     white "Next" tag and how far away it is).
- **Right (cols 8–12): the top 10**, an ink panel from the top line to the
  band: header "● Top 10" and "Race · Gap to leader" (or "· Best lap"),
  then the classification (position, first name muted + LAST NAME, team
  logo in its colours + name, gap), rows sharing the height so nothing is
  left empty under P10, **no row hover**. P1's gap cell says "Leader" in a
  race or sprint, "Fastest" otherwise. **Its foot is the page's main
  action**, a red block "Positions, gaps, sectors and tyres / WATCH LIVE
  TIMING →" (hover: paper). **The top 10 is always there** (owner's call,
  16/10: no version without it); until the relay's endpoint fills it
  (phase 4) the real page shows its rows as "—", and preview pages fill it
  with the last race's classification.
- Band (ink): "Up next", the next session, its day and time, how far away;
  "Weekend timetable →". After the race: "Race result · Here, after the
  flag".
- ≤ 1100 px it stacks: the three bands, then the top 10 at full width.
  ≤ 760 px: the heading only for screen readers, the readout and the two
  times on one row, the weekend as five short cells ("P1", "SQ", "Quali"),
  the table as logo + last name + gap. About 1.2 screens with the table.
- Dropped on 16/10: the giant "LIVE" on its own with the session small
  under it, and the floating "Watch live timing" ink box (12/10 version).

**Result (ink), until 24 h after the race ends.**
- Strip: "Race result" tag, round, GP and circuit, date.
- A giant red "1" (cols 1–3), the winner next to it: first name small, last
  name in display type, and a definition list: team (with its square), race
  time, starting position.
- Podium rows for P2 and P3: big position, name, team, gap, "from P4"
  (grid), fastest lap tag when it applies.
- Positions 4–10 as the **classification table** (`.tbl`): position in
  display type, driver (first name muted + LAST NAME), team (logo in its
  colors + name, in the same type as the driver's first name: 16 px, weight
  500, muted; owner's call, 13/10), gap (from `RaceOutcome`), grid and places gained (▲ and ▼
  both in paper, the arrow says which; — in muted when equal; owner's call,
  13/10). Link to the full classification. On mobile the
  team, grid and first name go.
- Band (red): next race and how far away it is; "All results".
- **The winner's photo** (cols 9–12, a 4:5 block; owner's calls, 13/10,
  accepting the licensing risk while the site is a non-commercial GitHub
  repo; see the plan's intellectual-property list), **as in the mockup**: the
  driver's wide photo, `img/drivers/<last part of the id>-2.png`, in a **red
  and black duotone**: a red field with the photo multiplied on it
  (`grayscale(1) contrast(1.35) brightness(1.08)`, `mix-blend-mode:
  multiply`), so dark goes to black and light to red; white caption
  (circuit, round). The red here is the owner's explicit exception to "red
  for what's live". The source files are 1920×1080 PNGs of 2–5 MB: the page
  gets a 1000 px WebP made at build time with `getImage` (`astro:assets`;
  Verstappen's: 5.4 MB → 129 KB). **Without a photo** (e.g. a past season's
  winner) the block is a paper field with the circuit layout in ink and the
  caption (section 7). On ≤ 1100 px it's hidden.
- The band under the result is **paper** too (was red, same reason).

### Calendar: the season poster

- Section on paper. Title "Season 2026" in display type; three big stats
  (**total, raced, to go**; owner's call, 13/10: no cancelled count, the total
  being raced + to go so the three add up); a progress bar with a segment per
  round (ink = raced, hatched = cancelled, red = next, outline = to come).
- **The round cards: "Spec sheet"** (chosen by the owner on 14/10 out of four
  directions explored with agents; the mockups and their brief are in
  `_design/cards/`, the chosen one in `d-spec/`). Each card is a data plate
  in four bands divided by hairlines that run edge to edge:
  1. **The plate**: the round number huge in its corner (`clamp(72px, 6.4vw,
     96px)`), a solid ink "Sprint" tag under it when it applies, and the
     layout beside it (104 px tall, `object-fit: contain`, right-aligned). No
     layout on file: an empty plate of the same size, framed and crossed by a
     hairline, with "No layout".
  2. **The name**: the full Grand Prix name in display type (24–30 px), on
     two lines broken around the language's "Grand Prix" phrase, which never
     splits ("Chinese / Grand Prix", "Gran Premio / de China").
  3. **The fields**: the city as the label over the dates ("23–25 Oct", the
     visitor's time zone, no year), and "Lap km" over the lap length.
  4. **The result**: a label over a value. "Winner" over the team logo (in its
     colours) and the full name; "Lights out in" over the countdown ("1mo
     22d", "12d 04h", "04h 12m"; minutes are its smallest unit, no `.num`);
     "Status" over "Cancelled". The next round reads "Next · Lights out in"
     ("This weekend · Lights out in" once the weekend has begun, "● Live now"
     over the session's name while one runs, "Results on the way" after the
     last one).
  **Labels** are label type in the soft colour; **values are in a lighter
  face**: normal width, weight 500, as written, 16–18 px (owner's call,
  14/10: in the 900 condensed face the card looked too loaded).
  **Every card shares the same four rows through `subgrid`**, so plates,
  names, fields and results line up across each row of the grid, and the
  season reads like a timing sheet even where a name runs to three lines.
- **Rounds count only the Grands Prix that are run** (owner's call, 14/10): a cancelled one has no round and **no number on its card** (the corner stays empty), and the rest count on without it (2026: Miami is round 4, Abu Dhabi 23; "Round 17 / 23"). The normalized data does it (`GrandPrix.round` is null when cancelled; `slot` keeps the calendar place).
- Card states: **done** (the latest isn't marked, owner's call, 13/10),
  **next** (the one red field: white text and layout, rules at 50 % white,
  white tag), **upcoming** (layout at 32 %), **cancelled** (hatched, name
  struck through with a 3 px line, layout at 18 %, field values soft).
- Hover (reworked 29/10): ink rises from the card's foot like a curtain
  (a `::before` layer under the content, `scaleY` in .38 s; it carries its
  own hatching on cancelled cards), layout, tag and rules turn paper, the
  round number turns red and shifts 4 px. A red light lapping the circuit
  (a turning `conic-gradient` masked by the drawing) was tried and dropped
  the same day (owner).
- ≤ 760 px: a list, one row per round: number (with the Sprint tag under it)
  | name, the city and the dates (in label type), the result inline | the
  layout 72 px tall. The plate and fields open up (`display: contents`) into
  the row's grid; the lap length and the "Winner" label are left out there.
- Built in `site/src/components/home/Calendar.astro` from
  `buildSeasonPoster()` (which gives each round its lap length and the
  winner's full name and team). The layouts are **`<img>` SVG files with lazy
  loading**, blackened with `filter: brightness(0)` (white with
  `invert(1)`), not inline SVG: 25 inline drawings would add hundreds of KB.
  Before 14/10 the card was a stack: number, layout, name, place · dates and
  a footer line; see the plan for its history.

### Standings

Redesigned on 28/10 ("podium poster", chosen out of four proposals; the
old two boards with bars are gone). Section on ink, built from three pieces
only: **the step** (a solid field, paper or red), **the column** (under a
4 px rule in the team's color) and **the figures row** (label + number
pairs split by 1 px hairlines: "Behind 84 | Wins 3", the owner's favorite
part).

- A short sentence in the section header summarizes the fight ("Antonelli
  leads by 84 points with 7 rounds to go…"). Generated from the data.
- **Podium, 2-1-3:** each driver is a photo on top of a step. The photo is
  sharp, in the ink and paper duotone of the driver pages (SVG filter
  `#duo-standings`, same values as `_design/driver`'s `#duo`), with a clean
  edge: **no blend, veil or gradient over it** (all tried and dropped,
  28/10). Steps at fixed podium heights (440 / 380 / 340 px), not point
  heights: the numbers carry the gaps. Paper steps for 2nd and 3rd, red for
  the leader. A square position tab ("P1") in the step's color sits on the
  photo's bottom-left corner. On the step: first name, last name in display
  type, team (17 px, logo 30 px; 19 / 34 for the leader), points with a
  "PTS" unit, and the figures row (leader: wins | podiums; others: behind |
  wins). No big outlined position number (it competed with the points).
  Without a photo, the photo box shows the team logo.
- **The chasing pack, P4–P10:** seven columns across the full width, each
  under its team's color rule: position, logo, first and last name, points,
  "Behind". No bars of points (too heavy, owner 28/10). Then a full-width
  band "All 23 drivers →" to `championship.html`: the home shows the top
  ten only. At ≤ 760 px the columns become rows with the rule on the left.
- **Constructors**, under a heading of their own ("Teams"): the leader as a
  wide red step (P1, logo, name, points, and wins | lead | each of its two
  drivers' points), the rest as pack columns, five to a row.
- Photos resized at build time like the hero's winner (`getImage`, 1000 px
  WebP; the sources are 2–5 MB PNGs).
- Built as `site/src/components/home/Standings.astro` from
  `buildStandings()`, which adds up the race and sprint points in the season
  file (nothing typed by hand); wins and podiums count classified Grand Prix
  finishes. Hover (owner, 29/10, pointer devices only): a podium step rises
  14 px, its photo leaves the duotone for color (a second, unfiltered copy
  fades in) and zooms 5 %, and a 6 px rule in the team's color runs across
  the top of the block. The pack columns (drivers and constructors): the
  team's color floods down from their rule as a tint (34 % to 10 %) and the
  position number turns paper. Nothing else in the section has a hover
  except its links. The title
  breaks as "STAND-INGS" through a soft hyphen (`&shy;`) when it doesn't
  fit its 7 columns: kept on purpose (owner's call). Ties go to more wins, then alphabetical:
  **not the FIA's full rule** (then most 2nd places, 3rds…), to fix for the
  championship page.

### Explore index

- Section on paper (it was red in the mockup; moved on 13/10, since red is
  kept for what's live). A numbered list of the site's sections, each title
  in display type with a one-line description (muted) and an arrow. Hover:
  the row turns ink with paper text and indents.
- Built (13/10) as `site/src/components/home/Explore.astro`: Results, Live
  timing, Drivers, Teams, Championship, Archive, and "Hall of Fame" with a
  "Soon" tag and no link yet. The archive's first year comes from the files in
  `data/seasons/`, so it moves back on its own when 1950–1989 are added.

### Footer (site-wide)

- Ink. Tagline in large body type; "All times shown in **your local time**
  (Buenos Aires · GMT-3)", the detected zone in muted as a check (owner's
  call, 13/10: "All times shown in Buenos Aires · GMT-3" read as if the site
  ran on Argentine time).
- Four link columns (Season, The Grid, History, Resources); "Soon" items in a
  small outlined label; external links with "↗". History holds **"Hall of
  Fame"** (Soon), the future page's name (renamed from "Memorabilia" on 12/10,
  owner's call).
- The wordmark across the full width in display type, with the second word in
  red, closed by a 4 px paper rule. It's decorative (`aria-hidden`). It will
  change with the site's name.
- Legal notice in small muted text, then copyright, social links and "Back to
  top".

### Old pages: the new navbar and footer (option B)

While the pages are rebuilt one at a time, the old ones get the new navbar
and footer, so the site reads as one (owner's call, 13/10; built 16/10).
`src/pages/legacy-chrome.astro` renders the two (`legacy` prop: no language
switcher, the old pages are English only) with `legacy-chrome.css`; the
`legacy-site` integration puts them into every old page, at build time and in
`astro dev`, in place of `<header class="navbar">` and `<footer
class="footer">`, drops `js/navbar.js` and `js/footer.js`, adds the chrome's
stylesheets and scripts after the page's own and `theme-color`, marks the
page's section (`aria-current`), and removes the helper page from the build.
- **Only the chrome changes:** the old pages keep their reset, type and
  native scrollbar. That's why `base.css` (the reset) and `primitives.css`
  (the classes) are two files: the old pages load only the second.
- `legacy-chrome.css` undoes what the old `style.css` does to any `nav ul li a`
  (margin, uppercase, red underline), sets the chrome's font, and keeps the
  bar **fixed**, as the old one was (the old layouts leave room for it), at
  z-index 100. Results' sticky year bar sits at `var(--nav)`.
- **Arrows as text** in the footer (`↗︎`, `↑︎`, with U+FE0E): the old pages run
  Twemoji over the whole page, which turned them into emoji images.
- `live.html` (no navbar, full-screen app) and the two redirects are left as
  they are.

## 6. When the hero shows each state

Decided in the browser (the page is built before anyone knows if a session is
live), from the current season's timetable (`loadSeason()`, all 2026 sessions
are `kind: 'datetime'` with a real `end`):

1. **Live** if now is between a session's `start` and `end`.
2. Otherwise **Result** if the last race (`key: 'race'`) ended less than 24 h ago.
3. Otherwise **Upcoming**, pointing at the next session that hasn't started;
   cancelled GPs are skipped.

The build precomputes the candidates (next session, last race result) so the
script only compares times and toggles the state; it doesn't fetch or render
data. Recheck every minute while the page is open. The navbar's Live link and
the calendar's next cell follow the same state.

## 7. Without photos

Driver photos are a licensing risk and can't be guaranteed for every race,
so nothing depends on them:

- Result hero: the giant "1" and the name carry the page. The portrait block
  shows the winner's photo in red and black duotone when there is one, and
  falls back to paper + circuit layout when there isn't.
- Driver and team pages: a big condensed name, number and team square. A
  photo, if there is one, goes in a flat field, duotoned (grayscale, high
  contrast, `mix-blend-mode: multiply` on red), never as a background.

## 8. Accessibility and performance

- Text contrast AA at least; use the `--red-ink` / `--red-hi` variants for
  small red text.
- Visible focus: 3 px red outline, 2 px offset.
- No tap highlight on mobile (`-webkit-tap-highlight-color: transparent` on
  `html`; owner's call, 13/10: browsers drew a blue box over whatever was
  tapped). The keyboard focus outline is unaffected.
- No page scrollbar (`scrollbar-width: none` and `::-webkit-scrollbar` on
  `html`; owner's call, 13/10): on desktop the layout gets the full window
  width instead of losing ~15 px to the bar. **In its place, the site draws
  its own thumb, floating over the page** (`ScrollThumb.astro`, in
  `Base.astro`; owner's call, 13/10: keep a thumb to drag, lose the track).
  Browsers no longer offer an overlay scrollbar, hence a custom one. A square
  4 px bar flush with the right edge, mid gray at 60 % (visible on paper, ink
  and red), 6 px wide and 90 % on hover or while dragged (owner's calls,
  13/10: thinner, and no gap at the edge), grabbed over a 14 px wide area; **its track starts below the navbar**
  (`top: var(--nav)`), so it never runs over the bar (owner's call, 13/10); height in
  proportion to the page, 40 px at least. Desktop only (`pointer: fine`).
  Scrolling moves it with a transform on an outer element with no
  transition; the inner bar carries the `transition: all .2s ease`, so the
  move never lags. Sizes are measured on resize and when the page's height
  changes (`ResizeObserver`), never on scroll. Dragging scrolls with
  `behavior: 'instant'`, past the CSS smooth scrolling.
- Giant decorative type (the "1", "LIVE", the wordmark) is `aria-hidden`; the
  real heading is a normal element next to it. Countdowns have `role="timer"`
  and a screen-reader text that doesn't change every second.
- No horizontal scroll at 375 px. Check 1440, 1100, 860, 760 and 375 px.
- Performance floor is the owner's PC (Celeron N4020, 2 cores): one font file,
  layouts as files (the calendar's `<img>`, the hero's CSS mask in
  `currentColor` on the same file; never inline: one inline Singapore was 81 KB
  of the page, 16/10), logos resized at build time, no layout reads in the
  countdown loop (update text only),
  animations off with reduced motion.

## 8b. Languages

Set up on 13/10: **English** and **Spanish** (neutral) so far; the owner's
plan adds Brazilian Portuguese and German next, then Italian, French, Dutch,
Japanese and Chinese. **No component has UI text of its own**: every word
comes from a dictionary in `site/src/i18n/`.

- `en.ts`: the base dictionary, grouped by component. `"{name}"`
  placeholders are filled with `fill()`; `{ one, other }` entries are
  plurals, picked with `Intl.PluralRules` (`plural()`), because languages
  pluralize differently. Plain strings only.
- `index.ts`: `useI18n(Astro.currentLocale)` gives a component `t` (the
  dictionary), `fill`, `plural`, `intl` (the BCP 47 tag for `Intl` dates and
  numbers: `en` → `en-GB`) and `heroWords()`. The `Dict` type is derived from
  `en.ts`, so a dictionary with a missing key fails `astro check`.
- **Browser scripts** don't bundle the dictionaries: the hero gets its words
  and Intl tag in its state JSON (`heroWords()`), the navbar's menu button
  its two labels as data attributes. `fill()` lives in its own module for
  that reason.
- Words built from data (session names, "+1 Lap", "DNF") come from the
  dictionary too: `buildHomeHero(dataDir, i18n)` takes the page's tools.
- **Routing** (`astro.config.ts`, `i18n`): English at the root with no
  prefix, so URLs don't change; every other locale at `/<code>/`. A page's
  body is a component (`components/pages/HomePreview.astro`) rendered by
  `pages/home-preview.astro` (English) and `pages/[lang]/home-preview.astro`
  (`getStaticPaths` over the other locales). `localePath()` and
  `pathWithoutLocale()` build a page's URL in another locale.
- `<html lang>` follows the page's locale, and every page lists itself in
  each language with `<link rel="alternate" hreflang>` (plus `x-default`,
  English), so search engines show each visitor theirs.
- **Language switcher** (`LangSwitch.astro`): the same page in each locale,
  each language named in itself (`LANGUAGE_NAMES`: "English", "Español").
  In the navbar's menu, under the links, and in the footer, under the time
  zone line (a `codes` variant, "EN · ES", exists for a tight row).
  Switching keeps the query and the hash (a preview's `?now=`).
- The live hero's giant line is fitted by script to any length, and the
  dictionary sets the order of its two words (`liveLine`: "LIVE RACE",
  "CARRERA EN VIVO").
- Words that are the same in a language stay the same (Spanish keeps
  "Sprint", "Top 10" and the DNF / DNS / DSQ codes of the timing screens).
  Spanish countdown units: "2M 05d" (M for months, since m is minutes).

**Adding a language** (Spanish went this way):
1. Its dictionary, `<code>.ts`: `export default { … } satisfies Dict`.
2. Add it to `LOCALES`, `DICTIONARIES`, `INTL_TAGS` (`pt` → `pt-BR`, `de` →
   `de-DE`) and `LANGUAGE_NAMES`, and to `i18n.locales` in
   `astro.config.ts`. The `[lang]` pages and the switcher pick it up.
3. Its names file, `data/i18n/<code>.json`, with every Grand Prix, city and
   country (the test lists what's missing).
4. Check every page at 375 px in that language (German's long words in
   the giant condensed titles; Spanish and Portuguese run ~20–30 % longer),
   with `hyphens: auto` where needed.

**Names from the data** (13/10): Grand Prix, city and country names come in
each language from **`data/i18n/<locale>.json`** (`{ grandsPrix, cities,
countries }`, by id; schema `RawNames`, loader `loadNames()`), with the
catalog's English name as the fallback (`namesIn()` in `home.ts`). A file of
its own per language, not new fields in `grandsPrix.json` and the rest: the
old pages read those catalogs, and `main` has changes to them that `next`
doesn't, so editing them in `next` would clash at the big merge; a new file
clashes with nothing. A test (`shared/test/raw.test.ts`) fails if any Grand
Prix, city or country lacks a name in a language. The calendar breaks the
name around the dictionary's `gpPhrase` ("Chinese / Grand Prix", "Gran
Premio / de China"). **Proper names stay as they are**: circuits, teams and
drivers. Plain numbers follow the language (`Intl.NumberFormat`: "4,928 km"
in Spanish); lap and race times keep the timing screens' dot.

**Still to do for every language:**
- Internal links that keep the locale (a `localHref()`), towards new pages
  only: the old pages exist in English only, so today every link but the
  switcher leads to English.
- `/design-system/` and the preview's "moments" panel stay English (they
  don't ship).

Japanese and Chinese need a font of their own (Archivo has no CJK glyphs)
and a design pass of their own: see the plan.

## 9. Open points from the mockup

- ~~**Mobile hero height**~~: closed on 13/10, the owner checked the whole
  homepage on their phone and it's fine.
- ~~**Result photo**~~: closed on 13/10, the winner's photo in red and black
  duotone (section 5, Result), built with `getImage`.
- ~~**Race laps**~~: closed on 13/10, worked out from the races in the data (see the upcoming hero).
- **Summary sentences** ("leads by 102 points…") must be generated, not typed.
- **Site name**: the wordmark and logo will change if the site is renamed (see
  the plan, "Nombre del sitio").
- The mockup's state switcher and its sample live data don't ship.
