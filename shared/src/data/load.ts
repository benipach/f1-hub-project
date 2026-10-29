// Reading data/ from disk: validate against raw.ts, then normalize. This is
// the entry point for the Astro build (and later the relay and scripts).
//
// Validation runs on every load on purpose: a season file that drifts from
// its schema stops the build instead of reaching a page.

import { existsSync, readFileSync } from 'node:fs';
import { RawCareers, RawCircuits, RawCities, RawCountries, RawDrivers, RawGrandsPrix, RawLatest, RawNames, RawSeason, RawSeasonsIndex, RawTeams } from './raw';
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

/** data/drivers.json, validated. */
export function loadDrivers(dataDir: URL): RawDrivers {
    return RawDrivers.parse(readJson(dataDir, 'drivers.json'));
}

/** data/careers.json, validated. */
export function loadCareers(dataDir: URL): RawCareers {
    return RawCareers.parse(readJson(dataDir, 'careers.json'));
}

/** data/seasons-index.json, validated. */
export function loadSeasonsIndex(dataDir: URL): RawSeasonsIndex {
    return RawSeasonsIndex.parse(readJson(dataDir, 'seasons-index.json'));
}

/** data/circuits.json, validated. */
export function loadCircuits(dataDir: URL): RawCircuits {
    return RawCircuits.parse(readJson(dataDir, 'circuits.json'));
}

/** data/cities.json, validated. */
export function loadCities(dataDir: URL): RawCities {
    return RawCities.parse(readJson(dataDir, 'cities.json'));
}

/** data/countries.json, validated. */
export function loadCountries(dataDir: URL): RawCountries {
    return RawCountries.parse(readJson(dataDir, 'countries.json'));
}

/** data/grandsPrix.json, validated. */
export function loadGrandsPrix(dataDir: URL): RawGrandsPrix {
    return RawGrandsPrix.parse(readJson(dataDir, 'grandsPrix.json'));
}

/**
 * The catalogs' names in a language (data/i18n/<locale>.json), validated; null
 * when the language has no file (English: the catalogs' own names).
 */
export function loadNames(dataDir: URL, locale: string): RawNames | null {
    const path = `i18n/${locale}.json`;
    return existsSync(new URL(path, dataDir)) ? RawNames.parse(readJson(dataDir, path)) : null;
}

/** Every Grand Prix of a season, validated and normalized, by round. */
export function loadSeason(dataDir: URL, year: number, teams: RawTeams = loadTeams(dataDir)): GrandPrix[] {
    const raw = RawSeason.parse(readJson(dataDir, `seasons/season${year}.json`));
    return normalizeSeason(year, raw, teams);
}
