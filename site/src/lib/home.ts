// What the homepage hero needs, prepared at build time from data/
// (_design/DESIGN.md, sections 5 and 6).
//
// The page is static: it's built when the data changes (after each session),
// but which state the hero shows depends on when someone looks at it. So the
// build picks two Grand Prix from the data, not from the clock:
//   - next: the first one of the season whose race has no results yet;
//   - last: the most recent one whose race has results.
// and the browser picks the state from the current time (hero-state.ts).

import { existsSync, readFileSync } from 'node:fs';
import { loadCircuits, loadCities, loadCountries, loadDrivers, loadLatestYear, loadNames, loadSeason, loadTeams } from '@f1hub/shared/data/load';
import { formatLapTime, type RaceOutcome } from '@f1hub/shared/data/results';
import type { GrandPrix, SessionKey, SessionOf } from '@f1hub/shared/data/season';
import type { useI18n } from '../i18n';

/** A page's language tools (useI18n), for the words built here. */
type I18n = ReturnType<typeof useI18n>;

/**
 * Grand Prix, city and country names in the page's language: from
 * data/i18n/<locale>.json, or the data's own (English) name when the language
 * has no file or no entry.
 */
function namesIn(dataDir: URL, locale: string) {
    const names = loadNames(dataDir, locale);
    return {
        gp: (id: string, own: string) => names?.grandsPrix[id] ?? own,
        city: (id: string, own: string) => names?.cities[id] ?? own,
        country: (id: string, own: string) => names?.countries[id] ?? own,
    };
}

export type HeroSession = {
    readonly key: SessionKey;
    readonly name: string;
    /** UTC, "2026-10-25T19:00:00Z" */
    readonly start: string;
    readonly end: string;
};

export type HeroGrandPrix = {
    readonly id: string;
    readonly round: number;
    readonly name: string;
    readonly circuit: string | null;
    /** "Austin · United States" */
    readonly place: string | null;
    /** Inline SVG markup of the layout, drawn in currentColor. */
    readonly layout: string | null;
    /** Lap length in km and turns, for the layout valid that year. */
    readonly length: number | null;
    readonly turns: number | null;
    /** The race distance in laps on this layout (see circuitRaceStats). */
    readonly raceLaps: number | null;
    /** The fastest race lap on this layout, with who set it and when. */
    readonly lapRecord: { readonly time: string; readonly driver: string; readonly year: number } | null;
    readonly sprint: boolean;
    readonly sessions: readonly HeroSession[];
};

export type HeroRow = {
    readonly pos: number;
    /** Car number. */
    readonly number: number;
    readonly firstName: string;
    readonly lastName: string;
    readonly team: string;
    readonly teamColor: string | null;
    /** Path of the team's logo inside the site ("img/teams/ferrari-logo.png"), when there is one. */
    readonly teamLogo: string | null;
    /** Race time for the winner, gap or status for everyone else. */
    readonly result: string;
    readonly grid: number | null;
    /** Places gained from the grid (negative: lost). null without a grid. */
    readonly gained: number | null;
    readonly fastestLap: boolean;
};

export type HeroResult = {
    readonly gp: HeroGrandPrix;
    /** When the race ended, UTC. */
    readonly raceEnd: string;
    /** Laps the winner completed. */
    readonly laps: number;
    readonly rows: readonly HeroRow[];
    /** The winner's portrait inside the site, when there is one. */
    readonly winnerPhoto: string | null;
};

export type HomeHero = {
    readonly season: number;
    readonly rounds: number;
    readonly next: HeroGrandPrix | null;
    readonly last: HeroResult | null;
};

/** A round of the season poster (the calendar section). */
export type PosterRound = {
    readonly id: string;
    readonly round: number;
    /** "Australian Grand Prix", "Gran Premio de Australia" */
    readonly name: string;
    /** "Melbourne" */
    readonly city: string | null;
    /** Layout SVG inside the site ("img/circuits/cota-layout.svg"), when there is one. */
    readonly layout: string | null;
    /** Lap length in km of the layout valid that season. */
    readonly lengthKm: number | null;
    readonly sprint: boolean;
    readonly status: 'done' | 'cancelled' | 'next' | 'upcoming';
    /** UTC start of the first session and of the race, for the dates. */
    readonly weekendStart: string | null;
    readonly raceStart: string | null;
    readonly winner: {
        readonly firstName: string;
        readonly name: string;
        readonly team: string;
        readonly teamColor: string | null;
        readonly teamLogo: string | null;
    } | null;
};

export type SeasonPoster = {
    readonly season: number;
    readonly rounds: readonly PosterRound[];
    readonly raced: number;
    readonly cancelled: number;
    readonly toGo: number;
};

/** "+7.335s", "+1:08.358", "+2 Laps", "DNF", in the page's language. */
export function outcomeText(outcome: RaceOutcome, { t, plural }: I18n): string {
    switch (outcome.kind) {
        case 'time': return outcome.time === null ? '—' : formatLapTime(outcome.time);
        case 'gap': return outcome.gap < 60_000 ? `+${formatLapTime(outcome.gap)}s` : `+${formatLapTime(outcome.gap)}`;
        case 'lapped': return plural(t.outcome.lapped, outcome.laps);
        case 'dnf': return t.outcome.dnf;
        case 'dns': return t.outcome.dns;
        case 'dsq': return t.outcome.dsq;
    }
}

/**
 * A circuit's layout files, in order of preference: the version with thinner
 * borders (img/circuits/thin/, made by scripts/thin-layouts.js; owner's call,
 * 14/10), then the original drawing.
 */
function layoutNames(circuitId: string): string[] {
    return [`thin/${circuitId}-layout.svg`, `${circuitId}-layout.svg`];
}

/**
 * A circuit's layout SVG, recolored to currentColor and sized by CSS.
 *
 * Only the root <svg> loses its width and height: some files wrap the drawing
 * in a clipPath whose <rect> needs its own, and stripping them everywhere left
 * a zero-size clip that hid the whole layout (7 of the 24 files, Singapore and
 * Sepang among them; found 13/10). That clip only repeats the viewBox, so it's
 * dropped too: its fixed id would also clash when one layout is inlined twice.
 * Only the drawing's own colour (#15151E) turns into currentColor: the thin
 * versions' mask needs its white and black as they are.
 */
function layoutSvg(repoRoot: URL, circuitId: string | null): string | null {
    if (!circuitId) return null;
    for (const name of layoutNames(circuitId)) {
        try {
            return readFileSync(new URL(`img/circuits/${name}`, repoRoot), 'utf8')
                .replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, ''))
                .replace(/\sclip-path="url\(#[^)]*\)"/g, '')
                .replace(/<defs>\s*<clipPath\b[\s\S]*?<\/clipPath>\s*<\/defs>/g, '')
                .replace(/fill="#15151E"/gi, 'fill="currentColor"')
                .replace('<svg', '<svg aria-hidden="true" focusable="false"');
        } catch {
            // try the next name
        }
    }
    return null;
}

/** A circuit's layout SVG file, as a path inside the site, if there is one. */
function layoutFile(repoRoot: URL, circuitId: string | null): string | null {
    if (!circuitId) return null;
    for (const name of layoutNames(circuitId)) {
        if (existsSync(new URL(`img/circuits/${name}`, repoRoot))) return `img/circuits/${name}`;
    }
    return null;
}

/**
 * The driver's wide photo (img/drivers/<last part of the id>-2.png, the one
 * the old driver pages use as a cover and the mockup used for the winner),
 * if there is one. 1920×1080 PNGs of ~2–5 MB: the page resizes them.
 */
function driverPhoto(repoRoot: URL, driverId: string): string | null {
    const path = `img/drivers/${driverId.split('-').pop()}-2.png`;
    return existsSync(new URL(path, repoRoot)) ? path : null;
}

/** The team's logo, if img/teams has one (same file the old pages use). */
function teamLogo(repoRoot: URL, teamId: string): string | null {
    const path = `img/teams/${teamId}-logo.png`;
    return existsSync(new URL(path, repoRoot)) ? path : null;
}

function race(gp: GrandPrix): SessionOf<'race'> | undefined {
    return gp.sessions.find((s): s is SessionOf<'race'> => s.key === 'race');
}

/** The homepage hero's data; session names and outcomes in the page's language. */
export function buildHomeHero(dataDir: URL, i18n: I18n): HomeHero {
    const repoRoot = new URL('../', dataDir);
    const season = loadLatestYear(dataDir);
    const teams = loadTeams(dataDir);
    const gps = loadSeason(dataDir, season, teams);
    const drivers = loadDrivers(dataDir);
    const circuits = loadCircuits(dataDir);
    const cities = loadCities(dataDir);
    const countries = loadCountries(dataDir);
    const local = namesIn(dataDir, i18n.locale);

    // Every season the stats below may read, loaded once.
    const seasons = new Map<number, GrandPrix[]>([[season, gps]]);
    const seasonGps = (year: number): GrandPrix[] => {
        if (!seasons.has(year)) {
            const exists = existsSync(new URL(`seasons/season${year}.json`, dataDir));
            seasons.set(year, exists ? loadSeason(dataDir, year, teams) : []);
        }
        return seasons.get(year) ?? [];
    };

    /**
     * A circuit's race stats on its current layout, from the races in the data
     * (nothing typed by hand): the distance in laps, as the most laps a winner
     * completed (a race cut short by rain doesn't lower it), and the lap record,
     * the fastest race lap (rows have bestLap from 2004; a new layout starts a
     * new record, as in F1's own).
     */
    const circuitRaceStats = (circuitId: string, from: number) => {
        let laps = 0;
        let record: { ms: number; driver: string; year: number } | null = null;
        for (let year = from; year <= season; year++) {
            for (const g of seasonGps(year)) {
                const r = g.circuitId === circuitId ? race(g) : undefined;
                if (!r) continue;
                laps = Math.max(laps, r.results.find((row) => row.pos === 1)?.laps ?? 0);
                for (const row of r.results) {
                    if (row.bestLap !== null && (!record || row.bestLap < record.ms)) record = { ms: row.bestLap, driver: row.driver, year };
                }
            }
        }
        return {
            raceLaps: laps || null,
            lapRecord: record
                ? { time: formatLapTime(record.ms), driver: drivers[record.driver]?.lastName ?? record.driver, year: record.year }
                : null,
        };
    };

    const heroGp = (gp: GrandPrix): HeroGrandPrix => {
        const circuit = gp.circuitId ? circuits[gp.circuitId] : undefined;
        const city = circuit ? cities[circuit.location.city] : undefined;
        const country = city ? countries[city.country] : undefined;
        const layout = circuit
            ? Object.values(circuit.layouts).find((l) => l.validFrom <= season && (l.validTo === null || l.validTo >= season))
            : undefined;
        return {
            id: gp.id,
            round: gp.round,
            name: local.gp(gp.id, gp.name),
            circuit: circuit?.name ?? null,
            place: circuit && city
                ? [local.city(circuit.location.city, city.name), country && local.country(city.country, country.name)].filter(Boolean).join(' · ')
                : null,
            layout: layoutSvg(repoRoot, gp.circuitId),
            length: layout?.length ?? null,
            turns: layout?.turns ?? null,
            ...(gp.circuitId && layout
                ? circuitRaceStats(gp.circuitId, layout.validFrom)
                : { raceLaps: null, lapRecord: null }),
            sprint: gp.sprint,
            sessions: gp.sessions.flatMap((s) =>
                s.time?.kind === 'datetime' && s.time.end
                    ? [{ key: s.key, name: i18n.t.sessions[s.key], start: s.time.start, end: s.time.end }]
                    : []),
        };
    };

    const raced = (gp: GrandPrix) => (race(gp)?.results.length ?? 0) > 0;
    const running = gps.filter((gp) => !gp.cancelled);
    const next = running.find((gp) => !raced(gp));
    const last = [...running].reverse().find(raced);

    let lastResult: HeroResult | null = null;
    const lastRace = last ? race(last) : undefined;
    if (last && lastRace && lastRace.time?.kind === 'datetime' && lastRace.time.end) {
        lastResult = {
            gp: heroGp(last),
            raceEnd: lastRace.time.end,
            laps: lastRace.results[0]?.laps ?? 0,
            rows: lastRace.results.slice(0, 10).map((row) => {
                const driver = drivers[row.driver];
                const team = teams[row.teamId];
                const grid = row.grid && row.grid > 0 ? row.grid : null;
                return {
                    pos: row.pos,
                    number: row.number,
                    firstName: driver?.firstName ?? '',
                    lastName: driver?.lastName ?? row.driver,
                    team: team?.name ?? row.teamId,
                    teamColor: team?.color ?? null,
                    teamLogo: teamLogo(repoRoot, row.teamId),
                    result: outcomeText(row.outcome, i18n),
                    grid,
                    gained: grid === null ? null : grid - row.pos,
                    fastestLap: row.fastestLap,
                };
            }),
            winnerPhoto: lastRace.results[0] ? driverPhoto(repoRoot, lastRace.results[0].driver) : null,
        };
    }

    return {
        season,
        rounds: gps.length,
        next: next ? heroGp(next) : null,
        last: lastResult,
    };
}

/** Every round of the latest season, for the calendar poster, in the page's language. */
export function buildSeasonPoster(dataDir: URL, i18n: I18n): SeasonPoster {
    const repoRoot = new URL('../', dataDir);
    const season = loadLatestYear(dataDir);
    const teams = loadTeams(dataDir);
    const gps = loadSeason(dataDir, season, teams);
    const drivers = loadDrivers(dataDir);
    const circuits = loadCircuits(dataDir);
    const cities = loadCities(dataDir);
    const local = namesIn(dataDir, i18n.locale);

    const raced = (gp: GrandPrix) => (race(gp)?.results.length ?? 0) > 0;
    const nextId = gps.find((gp) => !gp.cancelled && !raced(gp))?.id;

    const rounds = gps.map((gp): PosterRound => {
        const circuit = gp.circuitId ? circuits[gp.circuitId] : undefined;
        const starts = gp.sessions.flatMap((s) => (s.time?.kind === 'datetime' ? [s.time.start] : []));
        const raceTime = race(gp)?.time;
        const winnerRow = race(gp)?.results.find((r) => r.pos === 1);
        const winner = winnerRow ? drivers[winnerRow.driver] : undefined;
        return {
            id: gp.id,
            round: gp.round,
            name: local.gp(gp.id, gp.name),
            city: circuit ? local.city(circuit.location.city, cities[circuit.location.city]?.name ?? '') || null : null,
            layout: layoutFile(repoRoot, gp.circuitId),
            lengthKm: circuit
                ? Object.values(circuit.layouts).find((l) => l.validFrom <= season && (l.validTo === null || l.validTo >= season))?.length ?? null
                : null,
            sprint: gp.sprint,
            status: gp.cancelled ? 'cancelled' : raced(gp) ? 'done' : gp.id === nextId ? 'next' : 'upcoming',
            weekendStart: starts.sort()[0] ?? null,
            raceStart: raceTime?.kind === 'datetime' ? raceTime.start : null,
            winner: winnerRow
                ? {
                    firstName: winner?.firstName ?? '',
                    name: winner?.lastName ?? winnerRow.driver,
                    team: teams[winnerRow.teamId]?.name ?? winnerRow.teamId,
                    teamColor: teams[winnerRow.teamId]?.color ?? null,
                    teamLogo: teamLogo(repoRoot, winnerRow.teamId),
                }
                : null,
        };
    });

    return {
        season,
        rounds,
        raced: rounds.filter((r) => r.status === 'done').length,
        cancelled: rounds.filter((r) => r.status === 'cancelled').length,
        toGo: rounds.filter((r) => r.status === 'next' || r.status === 'upcoming').length,
    };
}

export type StandingRow = {
    readonly pos: number;
    readonly name: string;
    /** Drivers only: shown small next to the last name. */
    readonly firstName: string | null;
    readonly team: string;
    readonly teamColor: string | null;
    readonly teamLogo: string | null;
    readonly points: number;
    readonly wins: number;
};

export type Standings = {
    /** Rounds with a race result so far, and the season's total. */
    readonly afterRound: number;
    readonly rounds: number;
    /** Races still to run (not cancelled). */
    readonly toGo: number;
    readonly drivers: readonly StandingRow[];
    readonly teams: readonly StandingRow[];
};

/**
 * Drivers' and constructors' standings, added up from the season's race and
 * sprint results (the `pts` of each row), like careers.json does: nothing
 * typed by hand. Ties go to the one with more wins, then alphabetically.
 */
export function buildStandings(dataDir: URL): Standings {
    const repoRoot = new URL('../', dataDir);
    const season = loadLatestYear(dataDir);
    const teams = loadTeams(dataDir);
    const gps = loadSeason(dataDir, season, teams);
    const drivers = loadDrivers(dataDir);

    type Tally = { points: number; wins: number; teamId: string };
    const byDriver = new Map<string, Tally>();
    const byTeam = new Map<string, Tally>();

    const raced = gps.filter((gp) => !gp.cancelled && (race(gp)?.results.length ?? 0) > 0);
    for (const gp of raced) {
        for (const session of gp.sessions) {
            if (session.kind !== 'race') continue;
            for (const row of session.results) {
                const win = session.key === 'race' && row.pos === 1 ? 1 : 0;
                // A driver's team is the one of their latest race (rounds go in order).
                const d = byDriver.get(row.driver) ?? { points: 0, wins: 0, teamId: row.teamId };
                byDriver.set(row.driver, { points: d.points + row.points, wins: d.wins + win, teamId: row.teamId });
                const t = byTeam.get(row.teamId) ?? { points: 0, wins: 0, teamId: row.teamId };
                byTeam.set(row.teamId, { points: t.points + row.points, wins: t.wins + win, teamId: row.teamId });
            }
        }
    }

    const order = <T extends { points: number; wins: number; name: string }>(a: T, b: T) =>
        b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name);
    const mark = (teamId: string) => ({
        team: teams[teamId]?.name ?? teamId,
        teamColor: teams[teamId]?.color ?? null,
        teamLogo: teamLogo(repoRoot, teamId),
    });

    const driverRows = [...byDriver.entries()]
        .map(([id, t]) => ({ name: drivers[id]?.lastName ?? id, firstName: drivers[id]?.firstName ?? null, ...mark(t.teamId), points: t.points, wins: t.wins }))
        .sort(order)
        .map((row, i) => ({ pos: i + 1, ...row }));
    const teamRows = [...byTeam.entries()]
        .map(([id, t]) => ({ ...mark(id), name: teams[id]?.name ?? id, firstName: null, points: t.points, wins: t.wins }))
        .sort(order)
        .map((row, i) => ({ pos: i + 1, ...row }));

    return {
        afterRound: raced[raced.length - 1]?.round ?? 0,
        rounds: gps.length,
        toGo: gps.filter((gp) => !gp.cancelled && !raced.includes(gp)).length,
        drivers: driverRows,
        teams: teamRows,
    };
}
