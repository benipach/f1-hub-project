// Session dates: the conversion itself, and the assumptions it rests on,
// checked against every session in data/ so a change in a producer (the
// OpenF1 adapter, build-season.js) shows up here.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAdapterLocal, normalizeSessionTime, toUtc } from '../src/data/dates';

const SEASONS = new URL('../../data/seasons/', import.meta.url);

type RawSession = { date?: string | null; endDate?: string | null };
type Row = { year: number; gp: string; key: string; session: RawSession };

// Every session of every season, in file order.
const sessions: Row[] = readdirSync(SEASONS)
    .filter((name) => /^season\d{4}\.json$/.test(name))
    .sort()
    .flatMap((name) => {
        const year = Number(name.slice(6, 10));
        const season = JSON.parse(readFileSync(new URL(name, SEASONS), 'utf8')) as Record<string, { sessions: Record<string, RawSession> }>;
        return Object.entries(season).flatMap(([gp, { sessions }]) =>
            Object.entries(sessions).map(([key, session]) => ({ year, gp, key, session })),
        );
    });

const HOUR = 60 * 60 * 1000;

describe('toUtc', () => {
    it.each([
        // Adapter dates: Argentina time, no offset.
        ['2026-03-08T01:00:00', '2026-03-08T04:00:00Z'], // Australia 2026, lights out at 04:00 UTC
        ['2026-10-11T09:00:00', '2026-10-11T12:00:00Z'], // Singapore 2026, 20:00 local
        ['2026-10-25T22:30:00', '2026-10-26T01:30:00Z'], // crosses midnight UTC
        // Already UTC, or with an explicit offset.
        ['2025-03-16T04:00:00Z', '2025-03-16T04:00:00Z'],
        ['2025-03-16T08:00:00.000Z', '2025-03-16T08:00:00Z'],
        ['2025-03-16T01:00:00-03:00', '2025-03-16T04:00:00Z'],
    ])('%s → %s', (raw, utc) => {
        expect(toUtc(raw)).toBe(utc);
    });

    it('rejects what is not a date', () => {
        expect(() => toUtc('soon')).toThrow('Not a date');
    });
});

describe('normalizeSessionTime', () => {
    it('adapter dates keep their real end', () => {
        expect(normalizeSessionTime('2026-10-25T16:00:00', '2026-10-25T18:00:00')).toEqual({
            kind: 'datetime', start: '2026-10-25T19:00:00Z', end: '2026-10-25T21:00:00Z',
        });
    });

    it("Ergast dates drop the made-up end", () => {
        expect(normalizeSessionTime('2025-03-16T04:00:00Z', '2025-03-16T08:00:00.000Z')).toEqual({
            kind: 'datetime', start: '2025-03-16T04:00:00Z', end: null,
        });
    });

    it('midnight UTC means only the day is known', () => {
        expect(normalizeSessionTime('1998-03-08T00:00:00Z', '1998-03-08T04:00:00.000Z')).toEqual({ kind: 'date', date: '1998-03-08' });
    });

    it('no date, no time', () => {
        expect(normalizeSessionTime(null)).toBeNull();
        expect(normalizeSessionTime(undefined)).toBeNull();
    });
});

describe('the data still looks the way these rules assume', () => {
    const dated = sessions.filter((row) => row.session.date);

    it('finds the sessions', () => {
        expect(dated.length).toBeGreaterThan(1200); // 1213 on 2026-10-12
    });

    it('only 2026 has dates without an offset (the adapter writes them in Argentina time)', () => {
        const local = dated.filter((row) => isAdapterLocal(row.session.date!));
        expect(new Set(local.map((row) => row.year))).toEqual(new Set([2026]));
        const utcIn2026 = dated.filter((row) => row.year === 2026 && !isAdapterLocal(row.session.date!));
        expect(utcIn2026.map((row) => `${row.gp} ${row.key}`)).toEqual([]);
    });

    it('Ergast end dates are made up: start + 1 h, or + 4 h for races', () => {
        const odd = dated
            .filter((row) => row.session.endDate && !isAdapterLocal(row.session.date!))
            .filter((row) => {
                const hours = (Date.parse(row.session.endDate!) - Date.parse(row.session.date!)) / HOUR;
                return hours !== (row.key === 'race' ? 4 : 1);
            });
        expect(odd.map((row) => `${row.year} ${row.gp} ${row.key}`)).toEqual([]);
    });

    it('every race from 2005 on has a start time', () => {
        const dayOnly = dated.filter((row) => row.year >= 2005 && row.key === 'race'
            && normalizeSessionTime(row.session.date, row.session.endDate)?.kind === 'date');
        expect(dayOnly.map((row) => `${row.year} ${row.gp}`)).toEqual([]);
    });

    it('every dated session normalizes, and 2026 weekends run in order', () => {
        const order = ['fp1', 'sprintQualy', 'fp2', 'sprintRace', 'fp3', 'qualifying', 'race'];
        const byGp = new Map<string, { key: string; start: string; end: string | null }[]>();
        for (const row of dated) {
            const time = normalizeSessionTime(row.session.date, row.session.endDate);
            expect(time, `${row.year} ${row.gp} ${row.key}`).not.toBeNull();
            if (row.year !== 2026 || time?.kind !== 'datetime') continue;
            const list = byGp.get(row.gp) ?? [];
            list.push({ key: row.key, start: time.start, end: time.end });
            byGp.set(row.gp, list);
        }
        expect(byGp.size).toBeGreaterThan(20);
        for (const [gp, list] of byGp) {
            const sorted = [...list].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
            for (const [i, s] of sorted.entries()) {
                expect(s.end !== null && s.end > s.start, `${gp} ${s.key} ends after it starts`).toBe(true);
                const next = sorted[i + 1];
                if (next) expect(s.end! <= next.start, `${gp}: ${s.key} ends before ${next.key} starts`).toBe(true);
            }
        }
    });
});
