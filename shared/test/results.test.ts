// Result values: the parsers on their own, and against every value in data/.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatLapTime, parseLaps, parseLapTime } from '../src/data/results';

const SEASONS = new URL('../../data/seasons/', import.meta.url);

type RawRow = Record<string, unknown>;
type Row = { year: number; gp: string; key: string; row: RawRow };

// Every result row of every session of every season.
const rows: Row[] = readdirSync(SEASONS)
    .filter((name) => /^season\d{4}\.json$/.test(name))
    .flatMap((name) => {
        const year = Number(name.slice(6, 10));
        const season = JSON.parse(readFileSync(new URL(name, SEASONS), 'utf8')) as Record<string, { sessions: Record<string, { results: RawRow[] }> }>;
        return Object.entries(season).flatMap(([gp, { sessions }]) =>
            Object.entries(sessions).flatMap(([key, { results }]) => results.map((row) => ({ year, gp, key, row }))),
        );
    });

const where = ({ year, gp, key, row }: Row) => `${year} ${gp} ${key} P${String(row['pos'])}`;

describe('parseLaps', () => {
    it.each([
        [58, 58],
        ['58', 58],
        [0, 0],
        [undefined, null],
    ] as const)('%s → %s', (raw, laps) => {
        expect(parseLaps(raw)).toBe(laps);
    });

    it('rejects what is not a lap count', () => {
        expect(() => parseLaps('58 laps')).toThrow('Not a lap count');
        expect(() => parseLaps(-1)).toThrow('Not a lap count');
    });

    it('reads every laps value in data/', () => {
        const bad = rows.filter((r) => {
            try { parseLaps(r.row['laps'] as number | string | undefined); return false; } catch { return true; }
        });
        expect(bad.map(where)).toEqual([]);
    });
});

describe('parseLapTime', () => {
    it.each([
        ['1:20.267', 80_267],
        ['53.377', 53_377],
        ['24:34.899', 1_474_899],
        ['1:42:00.785', 6_120_785],
        ['', null],
        ['No time', null],
        [undefined, null],
    ] as const)('%s → %s', (raw, ms) => {
        expect(parseLapTime(raw)).toBe(ms);
    });

    it('rejects gaps and statuses (they are not lap times)', () => {
        expect(() => parseLapTime('+0.599s')).toThrow('Not a lap time');
        expect(() => parseLapTime('DNF')).toThrow('Not a lap time');
    });
});

describe('formatLapTime', () => {
    it.each([
        [80_267, '1:20.267'],
        [53_377, '53.377'],
        [60_005, '1:00.005'],
        [6_120_785, '1:42:00.785'],
    ])('%s → %s', (ms, text) => {
        expect(formatLapTime(ms)).toBe(text);
    });

    // Every lap time in data/ (qualifying, best laps, 2026 practice) must read
    // and print back exactly, so nothing is lost in the conversion.
    it('round-trips every lap time in data/', () => {
        const times = rows.flatMap((r) => {
            const values: string[] = [];
            const { row, key } = r;
            if (typeof row['lapTime'] === 'string') values.push(row['lapTime']);
            if (typeof row['bestLap'] === 'string') values.push(row['bestLap']);
            if (key.startsWith('fp') && typeof row['time'] === 'string' && !row['time'].startsWith('+')) values.push(row['time']);
            return values.filter((v) => v !== '' && v !== 'No time').map((value) => ({ r, value }));
        });
        expect(times.length).toBeGreaterThan(23_000); // 23,395 on 2026-10-12
        const off = times.filter(({ value }) => formatLapTime(parseLapTime(value)!) !== value);
        expect(off.map(({ r, value }) => `${where(r)}: ${value}`)).toEqual([]);
    });
});
