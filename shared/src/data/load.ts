// Reading data/ from disk: validate against raw.ts, then normalize. This is
// the entry point for the Astro build (and later the relay and scripts).
//
// Validation runs on every load on purpose: a season file that drifts from
// its schema stops the build instead of reaching a page.

import { readFileSync } from 'node:fs';
import { RawLatest, RawSeason, RawTeams } from './raw';
import { normalizeSeason, type GrandPrix } from './season';

function readJson(dataDir: URL, path: string): unknown {
    return JSON.parse(readFileSync(new URL(path, dataDir), 'utf8'));
}

/** The season the site shows by default (data/latest.json). */
export function loadLatestYear(dataDir: URL): number {
    return RawLatest.parse(readJson(dataDir, 'latest.json')).latestSeason;
}

/** data/teams.json, validated. */
export function loadTeams(dataDir: URL): RawTeams {
    return RawTeams.parse(readJson(dataDir, 'teams.json'));
}

/** Every Grand Prix of a season, validated and normalized, by round. */
export function loadSeason(dataDir: URL, year: number, teams: RawTeams = loadTeams(dataDir)): GrandPrix[] {
    const raw = RawSeason.parse(readJson(dataDir, `seasons/season${year}.json`));
    return normalizeSeason(year, raw, teams);
}
