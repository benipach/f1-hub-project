// Checks every file in data/ against its schema. This is what makes a
// script that writes a new field, or a type that changes, fail here
// instead of on a page.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import {
    RawCircuits,
    RawCities,
    RawCountries,
    RawDrivers,
    RawGrandsPrix,
    RawLatest,
    RawNames,
    RawSeason,
    RawTeams,
} from '../src/data/raw';

const DATA = new URL('../../data/', import.meta.url);

function readJson(path: string): unknown {
    return JSON.parse(readFileSync(new URL(path, DATA), 'utf8'));
}

// Fails with the list of problems (path and message), not just "invalid".
function expectValid(schema: z.ZodType, path: string) {
    const result = schema.safeParse(readJson(path));
    expect(result.success, result.success ? '' : `${path}\n${z.prettifyError(result.error)}`).toBe(true);
}

describe('catalogs', () => {
    it.each([
        ['teams.json', RawTeams],
        ['drivers.json', RawDrivers],
        ['circuits.json', RawCircuits],
        ['grandsPrix.json', RawGrandsPrix],
        ['countries.json', RawCountries],
        ['cities.json', RawCities],
        ['latest.json', RawLatest],
    ] as const)('%s', (path, schema) => expectValid(schema, path));
});

describe('seasons', () => {
    const files = readdirSync(new URL('seasons/', DATA))
        .filter((name) => /^season\d{4}\.json$/.test(name))
        .sort();

    it('finds every season from 1990', () => {
        expect(files[0]).toBe('season1990.json');
        expect(files.length).toBeGreaterThanOrEqual(37);
    });

    it.each(files)('%s', (name) => expectValid(RawSeason, `seasons/${name}`));
});

describe('the schemas reject what they should', () => {
    const row = { pos: 1, driver: 'george-russell', number: 63, team: 'mercedes', laps: 58, time: '1:23:06.801', pts: 25 };
    const gp = (race: object) => ({
        'australian-gp': {
            round: 1, name: 'Australian Grand Prix', sprint: false, cancelled: false,
            sessions: { race: { date: '2026-03-08T01:00:00', results: [race] } },
        },
    });

    it('accepts a valid race row', () => {
        expect(RawSeason.safeParse(gp(row)).success).toBe(true);
    });

    it('rejects an unknown field', () => {
        expect(RawSeason.safeParse(gp({ ...row, status: 'Finished' })).success).toBe(false);
    });

    it('rejects a race time it does not know', () => {
        expect(RawSeason.safeParse(gp({ ...row, time: 'Retired' })).success).toBe(false);
    });

    it('rejects laps that are not a whole number', () => {
        expect(RawSeason.safeParse(gp({ ...row, laps: '58 laps' })).success).toBe(false);
    });

    it('rejects a catalog entry whose id does not match its key', () => {
        expect(RawTeams.safeParse({ ferrari: { id: 'mercedes', name: 'Ferrari' } }).success).toBe(false);
    });
});

// data/i18n/<locale>.json: the catalogs' names in each language. Every
// Grand Prix, city and country needs one, or a page in that language would
// fall back to English for it.
describe('names in other languages', () => {
    const files = readdirSync(new URL('i18n/', DATA)).filter((name) => name.endsWith('.json'));

    it('has at least one language', () => expect(files.length).toBeGreaterThan(0));

    it.each(files)('%s', (file) => {
        expectValid(RawNames, `i18n/${file}`);
        const names = RawNames.parse(readJson(`i18n/${file}`));
        const missing = (catalog: string, own: Record<string, string>) =>
            Object.keys(readJson(catalog) as object).filter((id) => !(id in own)).map((id) => `${catalog}: ${id}`);
        expect([
            ...missing('grandsPrix.json', names.grandsPrix),
            ...missing('cities.json', names.cities),
            ...missing('countries.json', names.countries),
        ]).toEqual([]);
    });
});
