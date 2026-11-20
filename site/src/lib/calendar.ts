// The homepage calendar (_design/hero-f1/calendar.html, approved 20/11/2026):
// every Grand Prix of the latest season, cancelled ones included, prepared at
// build time from data/. The countdowns run in the browser (lib/calendar-cd.ts).

import { existsSync } from 'node:fs';
import { loadCircuits, loadCities, loadCountries, loadDrivers, loadLatestYear, loadSeason, loadTeams } from '@f1hub/shared/data/load';
import type { GrandPrix, SessionOf } from '@f1hub/shared/data/season';
import type { useI18n } from '../i18n';
import { layoutFile, namesIn, outcomeText, teamLogo } from './home';

type I18n = ReturnType<typeof useI18n>;

export type CalendarPodiumRow = {
    readonly pos: number;
    /** "VER" */
    readonly code: string;
    readonly teamLogo: string | null;
    /** Race time for the winner, the gap for the rest. */
    readonly result: string;
};

export type CalendarRound = {
    readonly id: string;
    /** null for a cancelled Grand Prix (it has no round). */
    readonly round: number | null;
    readonly name: string;
    readonly city: string | null;
    /** Flag file inside the site ("img/flags/us.svg"), when there is one. */
    readonly flag: string | null;
    /** Thin-border layout SVG inside the site. */
    readonly layout: string | null;
    readonly lengthKm: number | null;
    /** Race distance in laps (see raceLaps). */
    readonly laps: number | null;
    readonly sprint: boolean;
    readonly status: 'done' | 'cancelled' | 'next' | 'upcoming';
    /** UTC: the first session's start and the race's, for the dates and the countdown. */
    readonly weekendStart: string | null;
    readonly raceStart: string | null;
    readonly podium: readonly CalendarPodiumRow[];
};

export type Calendar = {
    readonly season: number;
    readonly rounds: readonly CalendarRound[];
    readonly total: number;
    readonly raced: number;
    readonly toGo: number;
    /** "Melbourne", "Abu Dhabi": where the season starts and ends. */
    readonly firstCity: string | null;
    readonly lastCity: string | null;
};

function race(gp: GrandPrix): SessionOf<'race'> | undefined {
    return gp.sessions.find((s): s is SessionOf<'race'> => s.key === 'race');
}

export function buildCalendar(dataDir: URL, i18n: I18n): Calendar {
    const repoRoot = new URL('../', dataDir);
    const season = loadLatestYear(dataDir);
    const teams = loadTeams(dataDir);
    const gps = loadSeason(dataDir, season, teams);
    const drivers = loadDrivers(dataDir);
    const circuits = loadCircuits(dataDir);
    const cities = loadCities(dataDir);
    const countries = loadCountries(dataDir);
    const local = namesIn(dataDir, i18n.locale);

    const seasons = new Map<number, GrandPrix[]>([[season, gps]]);
    const seasonGps = (year: number) => {
        if (!seasons.has(year)) {
            const exists = existsSync(new URL(`seasons/season${year}.json`, dataDir));
            seasons.set(year, exists ? loadSeason(dataDir, year, teams) : []);
        }
        return seasons.get(year)!;
    };
    /**
     * The race distance in laps: the most laps a winner of this Grand Prix
     * completed on its current layout (a race cut short doesn't lower it).
     * Same Grand Prix only: the Sakhir GP 2020 ran on Bahrain's outer loop
     * under the same circuitId.
     */
    const raceLaps = (gp: GrandPrix, from: number) => {
        let laps = 0;
        for (let year = from; year <= season; year++) {
            for (const g of seasonGps(year)) {
                if (g.id !== gp.id || g.circuitId !== gp.circuitId) continue;
                laps = Math.max(laps, race(g)?.results.find((r) => r.pos === 1)?.laps ?? 0);
            }
        }
        return laps || null;
    };

    const raced = (gp: GrandPrix) => (race(gp)?.results.length ?? 0) > 0;
    const nextId = gps.find((gp) => !gp.cancelled && !raced(gp))?.id;

    const rounds = gps.map((gp): CalendarRound => {
        const circuit = gp.circuitId ? circuits[gp.circuitId] : undefined;
        const city = circuit ? cities[circuit.location.city] : undefined;
        const iso = city ? countries[city.country]?.isoCode.toLowerCase() : undefined;
        const flag = iso && existsSync(new URL(`img/flags/${iso}.svg`, repoRoot)) ? `img/flags/${iso}.svg` : null;
        const layout = circuit
            ? Object.values(circuit.layouts).find((l) => l.validFrom <= season && (l.validTo === null || l.validTo >= season))
            : undefined;
        const starts = gp.sessions.flatMap((s) => (s.time?.kind === 'datetime' ? [s.time.start] : [])).sort();
        const raceTime = race(gp)?.time;
        const results = race(gp)?.results ?? [];
        return {
            id: gp.id,
            round: gp.round,
            name: local.gp(gp.id, gp.name),
            city: circuit && city ? local.city(circuit.location.city, city.name) : null,
            flag,
            layout: layoutFile(repoRoot, gp.circuitId),
            lengthKm: layout?.length ?? null,
            laps: layout ? raceLaps(gp, layout.validFrom) : null,
            sprint: gp.sprint,
            status: gp.cancelled ? 'cancelled' : raced(gp) ? 'done' : gp.id === nextId ? 'next' : 'upcoming',
            weekendStart: starts[0] ?? null,
            raceStart: raceTime?.kind === 'datetime' ? raceTime.start : null,
            podium: results.filter((r) => r.pos <= 3).map((r) => ({
                pos: r.pos,
                code: drivers[r.driver]?.shortName ?? r.driver.slice(0, 3).toUpperCase(),
                teamLogo: teamLogo(repoRoot, r.teamId),
                result: outcomeText(r.outcome, i18n),
            })),
        };
    });

    const running = rounds.filter((r) => r.status !== 'cancelled');
    const done = running.filter((r) => r.status === 'done').length;
    return {
        season,
        rounds,
        total: running.length,
        raced: done,
        toGo: running.length - done,
        firstCity: running[0]?.city ?? null,
        lastCity: running.at(-1)?.city ?? null,
    };
}
