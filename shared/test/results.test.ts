// Result values: the parsers on their own, and against every value in data/.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatLapTime, parseGap, parseLaps, parseLapTime, parseRaceOutcome } from '../src/data/results';

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

describe('parseGap', () => {
    it.each([
        ['+8.685', 8_685],
        ['+1:08.358', 68_358],
        ['+0.599s', 599],
        ['+104.684s', 104_684],
        ['+1206.389s', 1_206_389],
    ])('%s → %s', (raw, ms) => {
        expect(parseGap(raw)).toBe(ms);
    });

    it('rejects what is not a gap', () => {
        expect(() => parseGap('+1 Lap')).toThrow('Not a gap');
        expect(() => parseGap('8.685')).toThrow('Not a gap');
    });

    it('reads every practice gap in data/', () => {
        const gaps = rows.filter((r) => r.key.startsWith('fp') && typeof r.row['time'] === 'string' && r.row['time'].startsWith('+'));
        expect(gaps.length).toBeGreaterThan(0);
        const bad = gaps.filter((r) => {
            try { parseGap(r.row['time'] as string); return false; } catch { return true; }
        });
        expect(bad.map(where)).toEqual([]);
    });
});

describe('parseRaceOutcome', () => {
    it.each([
        ['1:52:32.829', { kind: 'time', time: 6_752_829 }],
        ['24:34.899', { kind: 'time', time: 1_474_899 }],
        ['1:31', { kind: 'time', time: null }],
        ['+8.685', { kind: 'gap', gap: 8_685 }],
        ['+2.974s', { kind: 'gap', gap: 2_974 }],
        ['+1 Lap', { kind: 'lapped', laps: 1 }],
        ['+3 Laps', { kind: 'lapped', laps: 3 }],
        ['DNF', { kind: 'dnf' }],
        ['DNS', { kind: 'dns' }],
        ['DSQ', { kind: 'dsq' }],
    ])('%s', (raw, outcome) => {
        expect(parseRaceOutcome(raw)).toEqual(outcome);
    });

    const raced = rows.filter((r) => r.key === 'race' || r.key === 'sprintRace');

    it('reads every race and sprint row in data/', () => {
        expect(raced.length).toBeGreaterThan(15_000); // 15,386 on 2026-10-12
        const bad = raced.filter((r) => {
            try { parseRaceOutcome(r.row['time'] as string); return false; } catch { return true; }
        });
        expect(bad.map(where)).toEqual([]);
    });

    it('only the winner has a total time, and every winner has one', () => {
        const off = raced.filter((r) => (parseRaceOutcome(r.row['time'] as string).kind === 'time') !== (r.row['pos'] === 1));
        expect(off.map(where)).toEqual([]);
    });

    // Fixed on main by fix/data-catalogs (B.4). When the big merge brings
    // those season files, this fails: then drop the cut-time case from
    // parseRaceOutcome and this test.
    it('the only cut winner times are the five still pending from main', () => {
        const cut = raced.filter((r) => {
            const outcome = parseRaceOutcome(r.row['time'] as string);
            return outcome.kind === 'time' && outcome.time === null;
        });
        expect(cut.map((r) => `${r.year} ${r.gp}`)).toEqual([
            '1998 australian-gp', '1998 french-gp', '1998 austrian-gp', '1998 german-gp', '2002 united-states-gp',
        ]);
    });
});
