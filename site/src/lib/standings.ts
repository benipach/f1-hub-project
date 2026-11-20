// The homepage standings (_design/hero-f1/standings.html, approved 20/11/2026):
// the drivers' and constructors' championships of the latest season, from
// the race and sprint points in data/.

import { loadDrivers, loadLatestYear, loadSeason, loadTeams } from '@f1hub/shared/data/load';
import type { GrandPrix, SessionOf } from '@f1hub/shared/data/season';
import { teamLogo } from './home';

export type StandingRow = {
    readonly pos: number;
    /** Driver's last name or team's name. */
    readonly name: string;
    readonly teamLogo: string | null;
    readonly points: number;
    /** Points behind the leader (0 for the leader). */
    readonly behind: number;
};

export type Standings = {
    readonly season: number;
    readonly drivers: readonly StandingRow[];
    readonly teams: readonly StandingRow[];
    /** Rounds run, and in the season (cancelled ones don't count). */
    readonly raced: number;
    readonly rounds: number;
    /** The leader's last name and their lead over P2. */
    readonly leader: string | null;
    readonly lead: number;
};

type Tally = { points: number; wins: number; team: string };

const rounded = (n: number) => Math.round(n * 10) / 10;

export function buildStandings(dataDir: URL): Standings {
    const repoRoot = new URL('../', dataDir);
    const season = loadLatestYear(dataDir);
    const teams = loadTeams(dataDir);
    const gps = loadSeason(dataDir, season, teams).filter((gp) => !gp.cancelled);
    const drivers = loadDrivers(dataDir);

    const results = (gp: GrandPrix, key: 'race' | 'sprintRace') =>
        gp.sessions.find((s): s is SessionOf<typeof key> => s.key === key)?.results ?? [];
    const raced = gps.filter((gp) => results(gp, 'race').length > 0);

    const byDriver = new Map<string, Tally>();
    const byTeam = new Map<string, Tally>();
    for (const gp of raced) {
        for (const key of ['race', 'sprintRace'] as const) {
            for (const row of results(gp, key)) {
                const win = key === 'race' && row.pos === 1 ? 1 : 0;
                const d = byDriver.get(row.driver) ?? { points: 0, wins: 0, team: row.teamId };
                byDriver.set(row.driver, { points: d.points + row.points, wins: d.wins + win, team: row.teamId });
                const t = byTeam.get(row.teamId) ?? { points: 0, wins: 0, team: row.teamId };
                byTeam.set(row.teamId, { ...t, points: t.points + row.points, wins: t.wins + win });
            }
        }
    }

    // Points, then wins (the regulations go on down the places; wins settle every case here)
    const rank = (tallies: Map<string, Tally>, name: (id: string) => string): StandingRow[] => {
        const sorted = [...tallies].sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins);
        const top = sorted[0]?.[1].points ?? 0;
        return sorted.map(([id, t], i) => ({
            pos: i + 1,
            name: name(id),
            teamLogo: teamLogo(repoRoot, t.team),
            points: rounded(t.points),
            behind: rounded(top - t.points),
        }));
    };
    const driverRows = rank(byDriver, (id) => drivers[id]?.lastName ?? id);
    const teamRows = rank(byTeam, (id) => teams[id]?.name ?? id);

    return {
        season,
        drivers: driverRows,
        teams: teamRows,
        raced: raced.length,
        rounds: gps.length,
        leader: driverRows[0]?.name ?? null,
        lead: rounded((driverRows[0]?.points ?? 0) - (driverRows[1]?.points ?? 0)),
    };
}
