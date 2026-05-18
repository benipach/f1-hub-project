# F1 Hub - 2026 Season

A modern and dynamic web portal designed for Formula 1 enthusiasts. This site allows users to track the 2026 season calendar, check detailed session schedules in local time, and review results from past races with an interface inspired by official F1 aesthetics.

## Key Features
- **Immersive Hero Section:** High-impact visual header integrated with a glassmorphism navigation bar.
- **Dynamic Race Calendar:** Full list of Grand Prix events with status tags (`NEXT`, `ENDED`, `CANCELLED`).
- **Detailed Schedules:** Local time conversion for race sessions (Practice, Qualifying, Race).
- **Responsive Design:** Fully optimized for desktop, tablets, and mobile devices.

## Tech Stack
- **HTML5:** Semantic structure.
- **CSS3:** Advanced layouts using Flexbox and Grid, including `backdrop-filter` effects.
- **JavaScript:** DOM manipulation for countdown logic and navigation.

## Project Structure
Based on current workspace organization:

```text
├── index.html              # Main Landing Page (Hub)
├── style.css               # Global Stylesheet
├── drivers.html            # Drivers Gallery/Overview
├── teams.html              # Teams Overview
├── championship.html       # Championship Standings & Points Charts
├── README.md               # Project Documentation
├── data/                   # Dynamic Data Storage
│   └── drivers.json        # Central Database for Drivers & Stats
├── drivers/                # Individual Driver Profile Pages
│   ├── antonelli.html
│   ├── bearman.html
│   ├── hamilton.html
│   └── ...
├── teams/                  # Individual Team Profile Pages
│   └── Red-Bull.html       # Example of a Team Showcase Page
├── races/                  # Race Details & Schedules
├── fonts/                  # Official Formula 1 Typography
│   ├── Formula1-Black.ttf
│   ├── Formula1-Bold.ttf
│   ├── Formula1-Regular.ttf
│   ├── Formula1-Wide.ttf
│   └── Formula1-Italic.ttf
├── js/                     # Logic & Interactivity Scripts
│   ├── calendar.js         # Date Handling & Grand Prix Logic
│   ├── drivers.js          # Data Injection from JSON
│   ├── navbar.js           # Navigation Bar Behavior
│   └── twemoji.js          # Emoji Support for Country Flags
└── img/                    # Visual Assets
    ├── drivers/            # Driver Portraits
    ├── hero/               # Hero Images for Main Sections
    └── logo.png            # Official Site Logo