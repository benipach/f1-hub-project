# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Formula 1 fans, in two situations that weigh the same:

- **Race weekend.** They check when the next session starts in their own time zone, follow it live, and read the results as soon as it ends. Often on a phone, often while watching the broadcast.
- **Between races.** They dig into history: past seasons, drivers' and teams' careers, standings, records, comparing eras back to 1950.

The site's UI is in English, with Spanish as the second language. More languages may follow.

## Product Purpose

F1 Hub is an unofficial fan site that puts every Grand Prix in one place: live timing during sessions, the calendar in the visitor's local time, full results and standings, driver and team profiles, and an archive of the championship's history. Success is a fan never needing a second site for any of that, during a weekend or between them.

It is also its owner's portfolio project. That is why internal quality (architecture, typed code, tested logic) matters as much as the surface.

## Positioning

- **Everything together.** Live timing, the calendar, results and the full historical archive in one site, without paying for F1 TV.
- **The poster design.** It reads like a Grand Prix poster, not like another stats table.
- **Free, with no accounts and no ads.** No login, no advertising, no paywall.

## Operating Context

- The weekend rhythm drives the site: a session is upcoming, live, or just finished, and the homepage changes state with it. Results are shown up to 24 hours after a race.
- Results arrive automatically: a GitHub Actions job fills finished sessions from OpenF1, Friday to Monday. History is built from Jolpica (Ergast) plus formula1.com.
- Live timing comes from F1's official live feed through the project's own relay. The relay is suspended until it moves to Oracle Cloud, so the Live page does not work in the meantime.
- Hosting is 100 % free: GitHub Pages for the site, a free VM for the relay, GitHub Actions for data. One person maintains everything.

## Capabilities and Constraints

- **Stack:** TypeScript and Astro (static) in `site/`, shared types, schemas and normalization in `shared/`, data in JSON under `data/`. The live page will be rebuilt later as a Svelte 5 island. No React or Next, no online database.
- **Migration in progress:** the old vanilla site (`main`) is being replaced page by page from the `next` branch. Pages done in Astro: home (`/home-preview/`) and driver profile (`/driver-preview/<id>/`), in EN and ES. Each new page is built directly in the poster design; no page is rebuilt twice. Old pages wear the new navbar and footer until they are replaced.
- **Data facts:** cancelled Grands Prix have no round number, and calendar order comes from dates. Session start times before 2005 are unknown (date only). OpenF1 covers only 2023 onward.
- **Archive data is a work in progress, handled only by the owner.** The database is one JSON file per season (`data/seasons/`), which the owner is actively filling from APIs, aiming at every season since 1950. Some careers, totals and ranks are incomplete until that work is done. That is expected and out of scope for design work: design and front-end work (critiques, refinements) evaluates the interface only, never flags or works around missing or incomplete data, and never edits the data files.
- **Undecided:** the site's final name (the owner wants one without "F1"; candidates include Damero, Largada, Monoposto, Purple Sector); a public preview of `next`; a PWA or store app.

## Brand Commitments

- Unofficial fan project, not affiliated with Formula 1, FOM or the FIA. The footer disclaimer stays.
- Never use the official Formula 1 typeface or present the site as official.
- Driver photos, circuit layouts and team logos are currently used with known IP risk; the owner decided to keep them for now and revisit before any serious public launch. Every surface must still work without photos.

## Evidence on Hand

- Real data for every season in `data/seasons/`, plus precomputed `careers.json` and `seasons-index.json`.
- Driver photos (`img/drivers/`), team logos (`img/teams/`), circuit layouts (`img/circuits/`, `data/track-layouts/`).
- Spanish names for Grands Prix, cities and countries in `data/i18n/es.json`.
- No users' testimonials, traffic numbers or audience figures exist: don't invent them.

## Product Principles

1. **Live state first.** Anyone should know where the weekend stands in a couple of seconds, before reading a word.
2. **Facts, accurately.** Results, dates and times are the product. A wrong time zone or a missing round is a bug, not a detail.
3. **One site for the whole sport.** The weekend and the archive belong together; a fan shouldn't need to leave to answer a question about F1.
4. **Built to last.** Clean, typed and tested code over patches.

## Accessibility & Inclusion

- **Low-end hardware is the performance floor.** A 2-core Celeron N4020 with 4 GB of RAM is used on purpose: if a page runs smoothly there, it runs anywhere.
- Animation is welcome and part of the design. Honor `prefers-reduced-motion` as a standard fallback, but it is not a constraint on what to design.
