# F1 Hub — 2026 Season

A modern web portal for Formula 1 enthusiasts, covering the full 2026 season with race schedules, driver profiles, team histories, standings, and race results — all with an aesthetic inspired by official F1 branding.

---

## Pages

| Page | File | Description |
|---|---|---|
| Home | `index.html` | Hero, live countdown, race calendar, and mini driver standings |
| Drivers | `drivers.html` | Grid overview of all 2026 drivers |
| Driver Profile | `drivers/driver.html?driver=<id>` | Full driver page with 2026 stats, charts, career history, and gallery |
| Teams | `teams.html` | Overview of all 2026 constructors |
| Team Profile | `teams/team.html?team=<id>` | Full team page with 2026 stats, driver cards, lineage timeline, history chart, and gallery |
| Championship | `championship.html` | Driver and constructor standings tables and cumulative points charts |
| Results | `results.html` | Past race results *(page in progress)* |
| Race Detail | `races/race.html?gp=<id>` | Per-GP session schedule, results, circuit overview, weather, and race history |

---

## Features

### Home (`index.html` + `index.js`)
- Hero section showing the **next upcoming race**: circuit image, GP name, round number, sprint badge
- **Live session countdown** — dynamically switches between "X starts in" / "X ends in" for each session (FP1, FP2, FP3, Sprint Qualy, Sprint Race, Qualifying, Race), updating every second
- **Session schedule card** in local time (Buenos Aires timezone), auto-adapts layout for sprint weekends vs standard weekends
- **Race calendar** with all 24 rounds; cards tagged `NEXT`, `UPCOMING`, `ENDED`, or `CANCELLED`
- **Mini driver standings** (top 10) with driver avatar, last name, team color accent, and points, built from race + sprint race results

### Driver Profile (`drivers/<name>.html` + `drivers.js`)
- URL-based routing via `?driver=<id>`
- Fullscreen hero: driver photo, gradient overlay, oversized car number watermark
- Meta row: nationality, date of birth, calculated age, car number, world titles
- **2026 season stats:** points, championship position, wins, podiums (with podium rate %), poles, fastest laps, DNFs
- **Chart.js** — points per race bar chart (race + sprint combined), with sprint segment highlighted separately; win markers; scroll/drag to navigate; tooltip with GP name
- **Career stats panel:** team, debut year, total race starts, wins, podiums, poles, points, world titles — all aggregated from `drivers.json` history + live 2026 data
- **Chart.js** — points per season bar chart, bars colored by team; click a bar to drill into that season's stats; drag to scroll if career spans many seasons
- Photo gallery with featured/grid layout

### Team Profile (`teams/team.html?team=<id>` + `team.js`)
- URL-based routing via `?team=<id>`
- Hero: team image, team logo watermark (grayscale, low opacity), full name, meta row (country, base city, founded year, team principal, constructor championships)
- **2026 season stats:** points, constructor championship position, combined wins/podiums/poles/fastest laps/DNFs for both drivers
- Points per race chart (combined team points, sprint included)
- **2026 Drivers section** — two driver cards with photo, car number, nationality, and link to driver profile
- **Constructor history** info card + bar chart across all seasons; bars colored by team identity of that era; click a bar to drill into that season's chassis, engine, and stats
- **Team Lineage timeline** — visual timeline of predecessor constructors (e.g. Tyrrell → BAR → Honda → Brawn GP → Mercedes); only shown if the team has a lineage
- Photo gallery with featured/grid layout

### Championship (`championship.html` + `championship.js`)
- Tabs: **Drivers** / **Constructors**
- Full standings table with position, flag, driver name (3-letter code on mobile), team logo, car number, points, and gap to leader
- **Chart.js** cumulative points line chart — one line per driver/constructor, colored by team; zoom (wheel/pinch) and pan (drag) enabled
- Per-driver/constructor filter dropdown with color-coded checkboxes and select/deselect all

### Race Detail (`races/race.html?gp=<id>` + `race.js`)
- URL-based routing via `?gp=<id>` (24 circuits mapped)
- Hero: circuit image, country flag emoji background, GP name, circuit name, sprint weekend badge, meta row (length, laps, corners, overtake zones, first GP year)
- **Circuit Overview** section:
  - Track layout image
  - Stats card: km per lap, total km, race laps, corners, overtake zones, editions held, lap record, top speed
  - Characteristics card with visual progress bars: Downforce, Overtaking, Tyre Degradation, Track Type
- Fun facts section
- **Session tabs** — dynamically built from available data only; tabs: FP1, FP2, FP3, Sprint Qualifying (short: SQ), Sprint Race (short: SR), Qualifying, Race
- Results tables for each session: position, driver number (team color), full/short name, team logo, lap time, gap; top 3 highlighted
- Race result shows fastest lap indicator and DNF/DNS styling
- **Weather section** — Friday/Saturday/Sunday cards with icon, condition, temp, notes, rain chance; hidden if no data
- **Circuit history table** — past winners, teams, and pole sitters by year; current year highlighted

### Drivers Grid (`drivers.html` + `drivers.css`)
- Fullscreen hero with background image, gradient overlay, and oversized "2026" watermark
- Cards animate in on scroll (fade + slide up via `IntersectionObserver`)
- Hover parallax: driver number scales and floats, photo slides and scales, info block rises to reveal a CTA
- Champion driver card has a gold gradient on the number and left accent stripe
- Per-team dark background color on each card

### Teams Grid (`teams.html` + `teams.css`)
- Two-column card grid with per-team color accent stripe and team logo
- On hover: car model name slides up from bottom with team-color glow, car image scales and shifts, info block rises to reveal CTA

### Shared Infrastructure (`teams.js`)
- Single source of truth for **all team colors** (current + historical): `rgb()` values, CSS variable names, logo filenames, and constructor lineages
- Auto-injects `--f1-*` CSS variables into `:root` on page load
- Covers all 2026 teams plus historical identities: Tyrrell, BAR, Honda, Brawn GP, Stewart, Jaguar, Jordan, Force India, Racing Point, Toleman, Benetton, Renault, Lotus, Minardi, Toro Rosso, AlphaTauri, Sauber, BMW Sauber, Alfa Romeo, Kick Sauber, and more
- Helper functions: `teamColor(id)`, `teamCssVar(id)`, `teamLogo(id)`, `teamLineage(id)`

---

## Tech Stack

- **HTML5** — Semantic structure
- **CSS3** — Flexbox, Grid, `backdrop-filter` glassmorphism, per-page stylesheets; team colors via CSS custom properties
- **Vanilla JavaScript** — No frameworks or build tools
- **Chart.js 4.4.1** — All charts (line, bar); with zoom/pan via **chartjs-plugin-zoom 2.0.1** and **Hammer.js 2.0.8** (touch gesture support for pinch-to-zoom on championship charts)
- **Twemoji** — Emoji flag rendering for nationalities
- **JSON** — All data in flat files under `data/`

---

## Project Structure

```text
├── index.html                  # Home / Race Calendar
├── drivers.html                # Drivers grid
├── teams.html                  # Teams overview
├── championship.html           # Championship standings
├── results.html                # Race results
├── style.css                   # Global stylesheet
│
├── data/
│   ├── season2026.json         # Full 2026 calendar: sessions, results, weather, colors
│   ├── drivers.json            # Driver profiles, stats, and season-by-season history
│   ├── teams.json              # Team info + year-by-year historical data (chassis, engine, stats)
│   └── circuits.json           # Circuit metadata, stats, history, fun facts
│
├── drivers/
│   └── driver.html             # Driver profile page (shared template, routed via ?driver=)
│
├── teams/
│   └── team.html               # Team profile page (shared template, routed via ?team=)
│
├── races/
│   └── race.html               # Race detail page (shared template, routed via ?gp=)
│
├── js/
│   ├── index.js                # Home: countdown, calendar, mini standings
│   ├── drivers.js              # Driver profile: stats, charts, career history
│   ├── teams.js                # Shared: team colors, CSS vars, lineage, logo helpers
│   ├── team.js                 # Team profile: stats, lineage chart, history
│   ├── race.js                 # Race page: sessions, results tables, circuit, weather
│   ├── championship.js         # Standings tables and filtered cumulative charts
│   ├── navbar.js               # Hamburger menu toggle
│   └── twemoji.js              # Emoji rendering for country flags
│
├── styles/
│   ├── index.css           # Home page styles
│   ├── drivers.css         # Drivers grid page
│   ├── teams.css           # Teams grid page
│   ├── race.css            # Race detail page
│   ├── championship.css    # Championship page
│   └── style.css           # Global: reset, fonts, navbar, footer, scrollbar
│                           # Note: driver and team profile styles are inline in their HTML files
│
├── fonts/                      # Official Formula 1 typeface
│   ├── Formula1-Black.ttf
│   ├── Formula1-Bold.ttf
│   ├── Formula1-Regular.ttf
│   ├── Formula1-Wide.ttf
│   └── Formula1-Italic.ttf
│
└── img/
    ├── drivers/                # Driver portraits
    ├── teams/                  # Team logos and team hero images
    ├── circuits/               # Circuit images
    ├── hero/                   # Hero images for main sections
    └── logo.png
```

---

## Data

All dynamic content is driven by JSON files — no backend or build step required.

- **`season2026.json`** — Full calendar with round numbers, session start/end times, per-GP results (qualifying, race, sprint), weather data, and team color gradients
- **`drivers.json`** — Driver roster with first/last name, nationality, date of birth, car number, image filename, and full season-by-season history (team, starts, wins, podiums, poles, points, championship position)
- **`teams.json`** — Constructor list with country and city; selected teams include complete year-by-year data (chassis, engine, team principal, points, wins, poles, podiums, DNFs, starts, position)
- **`circuits.json`** — Circuit metadata: name, stats (length, laps, turns, overtake zones), fun facts, and race-winner history by year

---

> Unofficial fan project. Not affiliated with Formula 1, FOM, or the FIA.