// What the build scripts share: where data/ is, the shape of a season file,
// reading every season once, and resolving a result's team.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = path.join(ROOT, 'data');

// ── Season files (data/seasons/season{year}.json) ───────────────────────────
// Only the fields the scripts read; the files have more.
export interface ResultRow {
    driver: string;
    team: string;
    pos: number;
    pts?: number;
    grid?: number | null;
    time?: string | null;
    fastestLap?: boolean;
    number?: number | null;
}

export interface Session {
    date?: string;
    results?: ResultRow[];
}

export interface GrandPrix {
    round: number | null;   // null on a cancelled GP
    name: string;
    cancelled?: boolean;
    sprint?: boolean;
    circuitId: string;
    sessions: Record<string, Session>;
}

export type Season = Record<string, GrandPrix>;

// A race row whose driver wasn't classified as a finisher: its `time` is
// "DNF", "DNS" or "DSQ" (formula1.com's labels); null otherwise. The site's
// pages use the same rule (notFinished in js/shared/gp.js).
export const notFinished = (row: ResultRow): string | null =>
    /^(DNF|DNS|DSQ)$/.test(String(row?.time ?? '')) ? String(row.time) : null;

export const readJson =<T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

// Every season, oldest first.
export function loadSeasons(): { year: number; season: Season }[] {
    const dir = path.join(DATA, 'seasons');
    return fs.readdirSync(dir)
        .filter(f => /^season\d{4}\.json$/.test(f))
        .sort()
        .map(f => ({ year: Number(f.slice(6, 10)), season: readJson<Season>(path.join(dir, f)) }));
}

// The GPs that weren't cancelled, in round order.
export const runningOrder = (season: Season): GrandPrix[] =>
    Object.values(season).filter(gp => !gp.cancelled).sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

export function sessionResults(gp: GrandPrix | undefined, key: string): ResultRow[] {
    const results = gp?.sessions?.[key]?.results;
    return Array.isArray(results) ? results : [];
}

// ── Teams ───────────────────────────────────────────────────────────────────
export interface TeamMeta {
    name?: string;
    color?: string;
}

export const teams = readJson<Record<string, TeamMeta>>(path.join(DATA, 'teams.json'));

// Team resolution (aliases + token trimming) lives in js/shared/teams.js,
// which is a classic browser script. It's evaluated here as-is so that
// the precomputation and the frontend resolve exactly the same way; otherwise a driver
// could have a "Mercedes-AMG" era separate from "Mercedes" just because the
// 2026 races were loaded by the OpenF1 adapter under another name.
const teamHelpers = new Function(
    fs.readFileSync(path.join(ROOT, 'js', 'shared', 'teams.js'), 'utf8')
    + '\nreturn { resolveTeamId };'
)() as { resolveTeamId: (rawTeam: string, teamsData: Record<string, TeamMeta>) => string };

export const resolveTeamId = (rawTeam: string): string => teamHelpers.resolveTeamId(rawTeam, teams);

// "andrea-moda" → "Andrea Moda", for teams missing from teams.json.
export const titleCase = (id: string): string => id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const teamName = (id: string): string => teams[id]?.name ?? titleCase(id);

// ── Championships ───────────────────────────────────────────────────────────
// Teams excluded from a year's constructors' championship
// (data/exclusions.json, with the reason): their results and their drivers'
// points stand, but the team scores nothing. 2007: McLaren.
const exclusions = readJson<Record<string, { constructors?: Record<string, string> }>>(path.join(DATA, 'exclusions.json'));
export const excludedTeams = (year: number): Set<string> => new Set(Object.keys(exclusions[year]?.constructors ?? {}));

// The most points still to be won, with today's scoring: a weekend counts as
// done once its race is in (its sprint too). Only the season being run has
// any left, so older scoring systems never come into it.
export const DRIVER_MAX = { race: 25, sprint: 8 };
export const TEAM_MAX = { race: 25 + 18, sprint: 8 + 7 };   // first and second
export function pointsLeft(gps: GrandPrix[], max: { race: number; sprint: number }): number {
    return gps.filter(gp => !sessionResults(gp, 'race').length)
        .reduce((left, gp) => left + max.race + (gp.sprint ? max.sprint : 0), 0);
}

// A title is decided once the season is over or nobody can catch the leader.
// `standings`: points, best first.
export function titleDecided(standings: number[], left: number): boolean {
    if (!standings.length) return false;
    return left === 0 || standings[0] - (standings[1] ?? 0) > left;
}

// ── Output ──────────────────────────────────────────────────────────────────
// Where a build script writes: --out <file> if given (the tests use it, see
// test/scripts.test.js), otherwise its file in data/.
export function outputPath(fileInData: string): string {
    const i = process.argv.indexOf('--out');
    return i > -1 ? path.resolve(process.argv[i + 1]) : path.join(DATA, fileInData);
}
