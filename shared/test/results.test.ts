// Result values: the parsers on their own, and against every value in data/.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatLapTime, parseGap, parseLaps, parseLapTime, parseRaceOutcome, practiceBestLaps, type RawPracticeTiming } from '../src/data/results';

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

describe('practiceBestLaps', () => {
    it('formula1.com shape: the leader plus each gap', () => {
        expect(practiceBestLaps([
            { pos: 1, time: '1:20.000' },
            { pos: 2, time: '+0.599s' },
            { pos: 3, time: '+1:02.001' },
            { pos: 4, time: 'No time' },
        ])).toEqual([80_000, 80_599, 142_001, null]);
    });

    it("OpenF1 shape: each driver's own lap", () => {
        expect(practiceBestLaps([
            { pos: 1, lapTime: '1:19.500' },
            { pos: 2, lapTime: '1:19.812' },
            { pos: 3, lapTime: 'No time' },
        ])).toEqual([79_500, 79_812, null]);
    });

    it('a gap with no leader time is an error, not a guess', () => {
        expect(() => practiceBestLaps([{ pos: 1, time: 'No time' }, { pos: 2, time: '+0.100s' }])).toThrow('no leader time');
    });

    // Every practice session in data/, grouped back into sessions.
    const sessions = new Map<string, { pos: number; row: RawPracticeTiming }[]>();
    for (const r of rows) {
        if (!r.key.startsWith('fp')) continue;
        const id = `${r.year} ${r.gp} ${r.key}`;
        const list = sessions.get(id) ?? [];
        list.push({ pos: r.row['pos'] as number, row: r.row as RawPracticeTiming });
        sessions.set(id, list);
    }

    it('finds every practice session', () => {
        expect(sessions.size).toBe(1755); // on 2026-10-12; grows with each new practice session
    });

    // Errors in the source data, not in practiceBestLaps (found 2026-10-12,
    // to check against formula1.com; see "Arreglos de datos" B.9 in the plan):
    //   - 1992 Spain FP2: Grouillard is P20 at +48.121 and Berger P21 at
    //     +24.854, so one of the two gaps is wrong.
    //   - 1998 Canada FP2: Coulthard is P2 with "No time" after 32 laps.
    // When they're fixed in data/, this test fails: drop them from the list.
    const KNOWN_SOURCE_ERRORS = ['1992 spanish-gp fp2 P21', '1998 canadian-gp fp2 P3'];

    // If adding the gap to the leader's lap were the wrong reading, the laps
    // wouldn't come out in classification order.
    it('in every session, the laps come out in classification order, untimed drivers last', () => {
        const off: string[] = [];
        for (const [id, list] of sessions) {
            const sorted = [...list].sort((a, b) => a.pos - b.pos);
            const laps = practiceBestLaps(sorted.map((entry) => entry.row));
            let seenUntimed = false;
            for (const [i, lap] of laps.entries()) {
                if (lap === null) { seenUntimed = true; continue; }
                const previous = laps[i - 1];
                if (seenUntimed || (previous != null && lap < previous)) {
                    off.push(`${id} P${sorted[i]!.pos}`);
                    break;
                }
            }
        }
        expect(off.sort()).toEqual(KNOWN_SOURCE_ERRORS);
    });
});
