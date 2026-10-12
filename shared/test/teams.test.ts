// The TypeScript resolveTeamId() must answer exactly like the legacy one in
// js/shared/teams.js, which the old pages and scripts/build-careers.js still
// use. Rather than a handful of examples, this runs both over every `team`
// value in the season files, with and without the teams.json catalog.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveTeamId, slugifyTeam, TEAM_SLUG_ALIASES, teamSlug } from '../src/data/teams';

const ROOT = new URL('../../', import.meta.url);

function readJson(path: string): unknown {
    return JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
}

type LegacyTeams = {
    resolveTeamId: (rawTeam: string, teamsData?: Record<string, unknown>) => string;
    teamSlug: (rawTeam: string) => string;
    TEAM_SLUG_ALIASES: Record<string, string>;
};

// teams.js is a classic browser script (top-level consts, no exports), so it's
// evaluated as-is, the same way scripts/build-careers.js loads it.
const legacy = new Function(
    readFileSync(new URL('js/shared/teams.js', ROOT), 'utf8')
        + '\nreturn { resolveTeamId, teamSlug, TEAM_SLUG_ALIASES };',
)() as LegacyTeams;

// Aliases that reached main with fix/data-catalogs (12/10) but not the legacy
// file on this branch yet. The big merge brings them; when it does, the
// "legacy aliases" test below starts failing as a reminder to empty this list.
const PENDING_FROM_MAIN = ['lambo', 'venturi'];

// Taken before the parity tests add PENDING_FROM_MAIN to the legacy object
// (describe bodies run at collection time, before any test).
const legacyAliasKeys = Object.keys(legacy.TEAM_SLUG_ALIASES);

const teams = readJson('data/teams.json') as Record<string, unknown>;

// Every distinct `team` value across all sessions of all seasons.
const rawTeams = (() => {
    const values = new Set<string>();
    const seasons = readdirSync(new URL('data/seasons/', ROOT)).filter((name) => /^season\d{4}\.json$/.test(name));
    for (const name of seasons) {
        const season = readJson(`data/seasons/${name}`) as Record<string, { sessions?: Record<string, { results?: { team?: string }[] }> }>;
        for (const gp of Object.values(season)) {
            for (const session of Object.values(gp.sessions ?? {})) {
                for (const row of session.results ?? []) if (row.team) values.add(row.team);
            }
        }
    }
    return [...values].sort();
})();

describe('legacy aliases', () => {
    it('the port has every alias of the legacy file, with the same target', () => {
        for (const [alias, id] of Object.entries(legacy.TEAM_SLUG_ALIASES)) {
            expect(TEAM_SLUG_ALIASES[alias], alias).toBe(id);
        }
    });

    it('the legacy file only lacks the aliases still pending from main', () => {
        const missing = Object.keys(TEAM_SLUG_ALIASES).filter((alias) => !legacyAliasKeys.includes(alias));
        expect(missing).toEqual(PENDING_FROM_MAIN);
    });
});

describe('same answers as js/shared/teams.js', () => {
    // Compare against the legacy logic with the pending aliases added, so the
    // only thing under test is the algorithm.
    const legacyAliases = legacy.TEAM_SLUG_ALIASES;
    for (const alias of PENDING_FROM_MAIN) legacyAliases[alias] ??= TEAM_SLUG_ALIASES[alias]!;

    it('finds the team values in data/', () => {
        expect(rawTeams.length).toBeGreaterThan(150);
    });

    it('resolveTeamId with teams.json, for every team value', () => {
        const diffs = rawTeams
            .map((raw) => ({ raw, legacy: legacy.resolveTeamId(raw, teams), port: resolveTeamId(raw, teams) }))
            .filter((row) => row.legacy !== row.port);
        expect(diffs).toEqual([]);
    });

    it('resolveTeamId without a catalog, for every team value', () => {
        const diffs = rawTeams.filter((raw) => legacy.resolveTeamId(raw) !== resolveTeamId(raw));
        expect(diffs).toEqual([]);
    });

    it('teamSlug, for every team value', () => {
        const diffs = rawTeams.filter((raw) => legacy.teamSlug(raw) !== teamSlug(raw));
        expect(diffs).toEqual([]);
    });
});

describe('resolveTeamId', () => {
    it.each([
        ['Mercedes-AMG', 'mercedes'],
        ['Red Bull', 'red-bull-racing'],
        ['red-bull-racing-honda-rbpt', 'red-bull-racing'],
        ['aston-martin-aramco-mercedes', 'aston-martin'],
        ['rb', 'racing-bulls'],
        ['str', 'toro-rosso'],
        ['lambo-lamborghini', 'modena'],
        ['venturi-lamborghini', 'larrousse'],
    ])('%s → %s', (raw, id) => {
        expect(resolveTeamId(raw, teams)).toBe(id);
    });

    it('falls back to the slug when no id matches', () => {
        expect(resolveTeamId('Some New Team', teams)).toBe('some-new-team');
    });

    it("doesn't match Object.prototype keys", () => {
        expect(resolveTeamId('Constructor', {})).toBe('constructor');
        expect(resolveTeamId('Constructor', { ferrari: {} })).toBe('constructor');
    });

    it('slugifyTeam trims and collapses separators', () => {
        expect(slugifyTeam('  Red Bull Racing / Honda RBPT ')).toBe('red-bull-racing-honda-rbpt');
    });
});
