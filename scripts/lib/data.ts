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

export const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

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

// ── Output ──────────────────────────────────────────────────────────────────
// Where a build script writes: --out <file> if given (the tests use it, see
// test/scripts.test.js), otherwise its file in data/.
export function outputPath(fileInData: string): string {
    const i = process.argv.indexOf('--out');
    return i > -1 ? path.resolve(process.argv[i + 1]) : path.join(DATA, fileInData);
}
