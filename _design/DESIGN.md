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
- **The circuit layout is a shape**, drawn flat in a single color, not a map.

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
light outline on ink), next to a driver or team name. Never as text color and
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

Display sizes are fluid with `clamp()`. Reference scale from the mockup:

| Element | Size |
|---|---|
| Giant result "1" | `clamp(240px, 44vw, 660px)` |
| "LIVE" word | `clamp(120px, 25vw, 380px)` |
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
**860 px** (navbar becomes the Menu button), **760 px** (single column,
calendar becomes a list, smaller gutters).

### Motion

- **Transitions are written as `transition: all <duration> ease`**, with one
  duration shared by every animated element of a component, so the whole
  component moves in sync on enter and on leave (the project's rule, as in
  `styles/drivers.css`). No custom curves, delays or per-property lists. This
  replaces the mockup's `cubic-bezier(.7, 0, .2, 1)`.
- **Wipe** when the hero changes state: `clip-path` from `inset(0 100% 0 0)` to
  `inset(0)`, 0.7 s, `ease`.
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
| Paper | Upcoming hero, calendar, most content sections |
| Red | Live hero, the "Explore" index; the next round's calendar cell |

Avoid two sections of the same field in a row. Red is the loudest thing on the
site: one red field per screen at most.

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

### Navbar (site-wide)

- Ink bar, 56 px, sticky. Logo, then "Season 2026" as a label next to it.
- Links in label type: Calendar, Results, Drivers, Teams, Live.
- **Hover and keyboard focus: "rolling label".** The label rolls up out of
  view while a copy in `--red-hi` rolls in from below (both stacked in a
  one-cell grid with `overflow: hidden`; the copy is `aria-hidden`), and a
  2 px red rule draws itself left to right under the link (`clip-path` from
  `inset(0 100% 0 0)` to `inset(0)`). One `transition: all .35s ease` for the
  whole component. With reduced motion it switches instantly.
- **Current page** (`aria-current="page"`): the red rule stays drawn, so hover
  and "you are here" speak the same language.
- Tried and dropped on 12/10: the mockup's 1 px white border (looked like a
  form button), a paper block inverting the link, and a full-height version
  of that block (a dark strip stayed at the bottom; cause not found).
- **Live link**: has an `.ldot`. When a session is live, the link turns into a
  red block, the dot beats and the text reads "Live now".
- **≤ 860 px**: a "Menu" button opens the menu full screen on paper, with the
  links in display type (56 px). Same rolling label, with the copy in large
  `--red` and no drawn rule (each link already has its own separator). When a session is live, a red "● Live" chip
  stays visible next to the Menu button.
- The live state comes from the timetable (section 6), not from the relay.

### Homepage hero (3 states)

Each state is one full-height section (`min-height: calc(100svh - var(--nav))`
on desktop) with its own field, and the same skeleton: `.strip` on top, the
content grid, a `.band` at the bottom.

**Upcoming (paper).**
- Strip: "Next race" tag, "Round 20 / 25", circuit and place, weekend dates.
- Left (cols 1–7): roundel with the round number, kicker, GP name in display
  type.
- Right (cols 8–12): the circuit layout in red, with `.facts` under it: lap
  length and turns from `circuits.json` (`layouts[*].length`, `.turns`; pick
  the layout valid for the year). **Race laps are not in the data yet**: add
  them to the circuit layout (reference data) or leave the cell out.
- Bottom left (cols 1–8): "Next session — Practice 1 starts in" and the
  countdown (days, hours, minutes, seconds).
- Bottom right (cols 9–12): the weekend timetable in the visitor's time zone,
  the next session marked in red with a "Next" tag, the race row in display
  type.
- Band: "Race", its day and time, "Lights out in" with a compact countdown,
  and the Grand Prix page as the red action.

**Live (red).**
- Strip: beating "Live now" tag, round, GP, session and day.
- A giant "LIVE" word with a beating ink dot; the track in ink at the right.
- The session name in display type, and when it ends (from the timetable).
- The main action is an ink block: "Watch live timing →" to the Live page.
- Band: what comes next and when; the timetable as a secondary action.
- **Only show what the timetable knows.** The mockup's Q1/Q2/Q3 phases, the
  session clock and "15 cars left" need the live feed; the homepage is
  static and must not depend on the relay (which is also down until it moves
  to Oracle). Show "Qualifying · started 18 min ago · ends 20:00" instead.

**Result (ink), until 24 h after the race ends.**
- Strip: "Race result" tag, round, GP and circuit, date.
- A giant red "1" (cols 1–3), the winner next to it: first name small, last
  name in display type, and a definition list: team (with its square), race
  time, starting position.
- Podium rows for P2 and P3: big position, name, team, gap, "from P4"
  (grid), fastest lap tag when it applies.
- Positions 4–10 as a table: position, driver, team, gap (from `RaceOutcome`),
  grid and places gained (▲ in paper, ▼ in `--red-hi`, — when equal). Link to
  the full classification.
- Band (red): next race and how far away it is; "All results".
- **No photo needed.** The mockup's duotone portrait (cols 9–12) is optional:
  without a photo, that block is the red field with the circuit layout in
  paper and the circuit name (see section 7). On ≤ 1100 px it's hidden anyway.

### Calendar: the season poster

- Section on paper. Title "Season 2026" in display type; three big stats
  (raced, cancelled, to go); a 25-segment progress bar (ink = raced, hatched =
  cancelled, red = next, outline = to come).
- A grid of rounds: 5 columns (3 at ≤ 1100 px), each cell with the round
  number, a "Sprint" tag when it applies, the circuit layout as a black shape,
  GP name, place and dates, and a footer line with the winner (team square +
  name), "Upcoming" or "Cancelled".
- Cell states: **done** (normal), **just finished** (round number in red),
  **next** (red field, white layout; "Live now · Qualifying" while live),
  **upcoming** (layout at 32 % opacity), **cancelled** (name struck through
  with a 3 px line, hatched background, layout at 18 %).
- Hover: the cell inverts to ink with a paper layout.
- ≤ 760 px: a list. Each row has the number, name, place, result on the right
  and a small layout.
- Dates in the visitor's local time.

### Standings

- Section on ink. Two boards side by side (stacked at ≤ 1100 px): drivers and
  constructors.
- Each board: the **leader** under a 4 px paper rule (label "Leader", name in
  display type, team square, lead over second) with their points as a huge
  red number; then positions 2–10 as rows: position, name (+ first name
  small), a bar proportional to the leader's points, points.
- A short sentence in the section header summarizes the fight ("Antonelli
  leads by 102 points with six rounds to go"). Generate it from the data.

### Explore index

- Section on red. A numbered list of the site's sections, each title in
  display type with a one-line description and an arrow. Hover: the row turns
  ink and indents.

### Footer (site-wide)

- Ink. Tagline in large body type; "All times shown in <time zone>".
- Four link columns (Season, The Grid, History, Resources); "Soon" items in a
  small outlined label; external links with "↗".
- The wordmark across the full width in display type, with the second word in
  red, closed by a 4 px paper rule. It's decorative (`aria-hidden`). It will
  change with the site's name.
- Legal notice in small muted text, then copyright, social links and "Back to
  top".

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

- Result hero: the giant "1" and the name carry the page. The optional
  portrait block falls back to red + circuit layout.
- Driver and team pages: a big condensed name, number and team square. A
  photo, if there is one, goes in a flat field, duotoned (grayscale, high
  contrast, `mix-blend-mode: multiply` on red), never as a background.

## 8. Accessibility and performance

- Text contrast AA at least; use the `--red-ink` / `--red-hi` variants for
  small red text.
- Visible focus: 3 px red outline, 2 px offset.
- Giant decorative type (the "1", "LIVE", the wordmark) is `aria-hidden`; the
  real heading is a normal element next to it. Countdowns have `role="timer"`
  and a screen-reader text that doesn't change every second.
- No horizontal scroll at 375 px. Check 1440, 1100, 860, 760 and 375 px.
- Performance floor is the owner's PC (Celeron N4020, 2 cores): one font file,
  inline SVG layouts, no layout reads in the countdown loop (update text only),
  animations off with reduced motion.

## 9. Open points from the mockup

- **Mobile hero height**: at 375 px the upcoming hero is taller than one
  screen. Tighten it so the countdown and the timetable's next session fit.
- **Result photo**: the duotone didn't render in the mockup; moot if section 7
  is followed.
- **Race laps** for `.facts` aren't in `data/` (see the upcoming hero).
- **Summary sentences** ("leads by 102 points…") must be generated, not typed.
- **Site name**: the wordmark and logo will change if the site is renamed (see
  the plan, "Nombre del sitio").
- The mockup's state switcher and its sample live data don't ship.
