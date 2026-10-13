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
import { loadCircuits, loadCities, loadCountries, loadDrivers, loadLatestYear, loadSeason, loadTeams } from '@f1hub/shared/data/load';
import { formatLapTime, type RaceOutcome } from '@f1hub/shared/data/results';
import type { GrandPrix, SessionKey, SessionOf } from '@f1hub/shared/data/season';

const SESSION_NAMES: Record<SessionKey, string> = {
    fp1: 'Practice 1',
    fp2: 'Practice 2',
    fp3: 'Practice 3',
    sprintQualy: 'Sprint Qualifying',
    sprintRace: 'Sprint',
    qualifying: 'Qualifying',
    race: 'Race',
};

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
};

export type HomeHero = {
    readonly season: number;
    readonly rounds: number;
    readonly next: HeroGrandPrix | null;
    readonly last: HeroResult | null;
};

/** "+7.335s", "+1:08.358", "+2 Laps", "DNF". */
export function outcomeText(outcome: RaceOutcome): string {
    switch (outcome.kind) {
        case 'time': return outcome.time === null ? '—' : formatLapTime(outcome.time);
        case 'gap': return outcome.gap < 60_000 ? `+${formatLapTime(outcome.gap)}s` : `+${formatLapTime(outcome.gap)}`;
        case 'lapped': return `+${outcome.laps} Lap${outcome.laps === 1 ? '' : 's'}`;
        case 'dnf': return 'DNF';
        case 'dns': return 'DNS';
        case 'dsq': return 'DSQ';
    }
}

/** A circuit's layout SVG, recolored to currentColor and sized by CSS. */
function layoutSvg(repoRoot: URL, circuitId: string | null): string | null {
    if (!circuitId) return null;
    for (const name of [`${circuitId}-layout.svg`, `${circuitId}.svg`]) {
        try {
            return readFileSync(new URL(`img/circuits/${name}`, repoRoot), 'utf8')
                .replace(/\s(width|height)="[^"]*"/g, '')
                .replace(/fill="#[0-9A-Fa-f]{3,6}"/g, 'fill="currentColor"')
                .replace('<svg', '<svg aria-hidden="true" focusable="false"');
        } catch {
            // try the next name
        }
    }
    return null;
}

/** The team's logo, if img/teams has one (same file the old pages use). */
function teamLogo(repoRoot: URL, teamId: string): string | null {
    const path = `img/teams/${teamId}-logo.png`;
    return existsSync(new URL(path, repoRoot)) ? path : null;
}

function race(gp: GrandPrix): SessionOf<'race'> | undefined {
    return gp.sessions.find((s): s is SessionOf<'race'> => s.key === 'race');
}

export function buildHomeHero(dataDir: URL): HomeHero {
    const repoRoot = new URL('../', dataDir);
    const season = loadLatestYear(dataDir);
    const teams = loadTeams(dataDir);
    const gps = loadSeason(dataDir, season, teams);
    const drivers = loadDrivers(dataDir);
    const circuits = loadCircuits(dataDir);
    const cities = loadCities(dataDir);
    const countries = loadCountries(dataDir);

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
            name: gp.name,
            circuit: circuit?.name ?? null,
            place: city ? [city.name, country?.name].filter(Boolean).join(' · ') : null,
            layout: layoutSvg(repoRoot, gp.circuitId),
            length: layout?.length ?? null,
            turns: layout?.turns ?? null,
            sprint: gp.sprint,
            sessions: gp.sessions.flatMap((s) =>
                s.time?.kind === 'datetime' && s.time.end
                    ? [{ key: s.key, name: SESSION_NAMES[s.key], start: s.time.start, end: s.time.end }]
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
                    result: outcomeText(row.outcome),
                    grid,
                    gained: grid === null ? null : grid - row.pos,
                    fastestLap: row.fastestLap,
                };
            }),
        };
    }

    return {
        season,
        rounds: gps.length,
        next: next ? heroGp(next) : null,
        last: lastResult,
    };
}
