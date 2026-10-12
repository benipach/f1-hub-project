// The normalized Grand Prix: every season in data/ loads, and a few real
// weekends come out the way they ran.
//
// Note: `next` doesn't get the automatic data commits (they go to main), so
// data/ here stops at 09/10. The 2026 examples use races run before that.

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadLatestYear, loadSeason, loadTeams } from '../src/data/load';
import type { GrandPrix, SessionKey, SessionOf, SessionResult } from '../src/data/season';

const DATA = new URL('../../data/', import.meta.url);
const teams = loadTeams(DATA);

const years = readdirSync(new URL('seasons/', DATA))
    .filter((name) => /^season\d{4}\.json$/.test(name))
    .map((name) => Number(name.slice(6, 10)))
    .sort((a, b) => a - b);

const seasons = new Map(years.map((year) => [year, loadSeason(DATA, year, teams)]));
const all: GrandPrix[] = [...seasons.values()].flat();

function gp(year: number, id: string): GrandPrix {
    const found = seasons.get(year)?.find((g) => g.id === id);
    if (!found) throw new Error(`No ${id} in ${year}`);
    return found;
}

function session<Key extends SessionKey>(grandPrix: GrandPrix, key: Key): SessionOf<Key> {
    const found = grandPrix.sessions.find((s): s is SessionOf<Key> => s.key === key);
    if (!found) throw new Error(`No ${key} in ${grandPrix.year} ${grandPrix.id}`);
    return found;
}

/** Every result row of some Grand Prix, whatever the session. */
function results(gps: readonly GrandPrix[]): SessionResult[] {
    return gps.flatMap((g) => g.sessions.flatMap((s): readonly SessionResult[] => s.results));
}

// Teams in the results that aren't in teams.json yet. Added on main by
// fix/data-catalogs (B.2): when the big merge brings that teams.json, this
// fails as a reminder to empty the list.
const TEAMS_PENDING_FROM_MAIN = ['leyton-house', 'leyton-house-ilmor', 'leyton-house-judd', 'onyx', 'onyx-ford'];

describe('every season', () => {
    it('loads, validated and normalized', () => {
        // On 2026-10-12: 37 seasons, 690 GPs, 3,049 sessions, 65,401 results.
        expect(years[0]).toBe(1990);
        expect(all.length).toBeGreaterThanOrEqual(690);
        expect(results(all).length).toBeGreaterThanOrEqual(65_401);
    });

    it('the latest season is one of them', () => {
        expect(years).toContain(loadLatestYear(DATA));
    });

    it('rounds go 1, 2, 3… in every season', () => {
        for (const [year, gps] of seasons) {
            expect(gps.map((g) => g.round), String(year)).toEqual(gps.map((_, i) => i + 1));
        }
    });

    it('every team resolves to teams.json, except the ones still pending from main', () => {
        const unresolved = new Set(results(all).map((r) => r.teamId).filter((id) => !(id in teams)));
        expect([...unresolved].sort()).toEqual(TEAMS_PENDING_FROM_MAIN);
    });

    it('2026 weekends with times are sorted by when each session starts', () => {
        for (const g of seasons.get(2026) ?? []) {
            const starts = g.sessions.map((s) => (s.time?.kind === 'datetime' ? s.time.start : null));
            if (starts.some((start) => start === null)) continue;
            expect(starts, g.id).toEqual([...starts].sort());
        }
    });
});

describe('Azerbaijan 2026', () => {
    const baku = gp(2026, 'azerbaijan-gp');

    it('has the usual weekend, in order', () => {
        expect(baku.sessions.map((s) => s.key)).toEqual(['fp1', 'fp2', 'fp3', 'qualifying', 'race']);
        expect(baku.sprint).toBe(false);
    });

    it('race: Russell wins for Mercedes, Verstappen 0.196 s behind', () => {
        const [p1, p2] = session(baku, 'race').results;
        expect(p1).toMatchObject({ pos: 1, driver: 'george-russell', teamId: 'mercedes', outcome: { kind: 'time' } });
        expect(p2).toMatchObject({ pos: 2, driver: 'max-verstappen', teamId: 'red-bull-racing', outcome: { kind: 'gap', gap: 196 } });
    });

    it('race time in UTC, and the weather it ran in', () => {
        const race = session(baku, 'race');
        expect(race.time).toMatchObject({ kind: 'datetime' });
        expect(race.time?.kind === 'datetime' && race.time.start.endsWith('Z')).toBe(true);
        expect(race.weather).not.toBeNull();
    });
});

describe('historical weekends', () => {
    it('1998 Australia: the race only has a day, and the cut winner time is null', () => {
        const race = session(gp(1998, 'australian-gp'), 'race');
        expect(race.time).toEqual({ kind: 'date', date: '1998-03-08' });
        expect(race.results[0]?.outcome).toEqual({ kind: 'time', time: null });
    });

    it('2021 Britain (first sprint): undated practice, so the usual order', () => {
        const silverstone = gp(2021, 'british-gp');
        expect(silverstone.sprint).toBe(true);
        expect(silverstone.sessions.map((s) => s.key)).toEqual(['fp1', 'fp2', 'sprintRace', 'qualifying', 'race']);
    });

    it('1991: the Lambo chassis is the Modena team', () => {
        const lambo = results(seasons.get(1991) ?? []).filter((r) => r.teamId === 'modena');
        expect(lambo.length).toBeGreaterThan(0);
    });
});
