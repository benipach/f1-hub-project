// Sessions read from the results pages of formula1.com: practice (FP1-3),
// which neither Jolpica nor OpenF1 (before 2023) has, and the qualifying
// Jolpica is missing (most GPs of 1990-2002).

import * as cheerio from 'cheerio';
import { spacedFetch } from './http.ts';
import { toSlug } from './jolpica.ts';

const BASE = 'https://www.formula1.com/en/results';
const request = spacedFetch(500);

type Row = Record<string, unknown>;

// A page's HTML; null if it doesn't exist (a sprint weekend has no FP2/FP3).
async function page(url: string): Promise<string | null> {
    const res = await request(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; F1HubBot/1.0; +personal project)' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
}

// The rows of a results table: Pos. | No. | Driver | Team | Time [| Laps].
// The driver cell glues the name to the 3-letter code: "Lando NorrisNOR".
// A row without a numeric position ("NC": outside the 107% in qualifying)
// has pos 0.
function tableRows(html: string) {
    const $ = cheerio.load(html);
    const rows: { pos: number; driver: string; number: number | null; team: string; time: string; laps: number | null }[] = [];
    $('table').first().find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 5) return;
        const cell = (i: number) => $(cells[i]).text().trim();
        const driver = cell(2).match(/^(.*\S)\s*([A-Z]{3})$/)?.[1].trim() ?? cell(2);
        const pos = Number(cell(0));
        const number = Number(cell(1));
        const laps = cells.length > 5 ? Number(cell(5)) : NaN;
        if (!driver) return;
        rows.push({
            pos: pos || 0,
            driver: toSlug(driver),
            number: Number.isFinite(number) ? number : null,
            team: toSlug(cell(3)),
            time: cell(4),
            laps: Number.isFinite(laps) ? laps : null,
        });
    });
    return rows;
}

// A practice table as season-file rows; null without a table or rows.
export function practiceRows(html: string) {
    const rows = tableRows(html).filter(row => row.pos).map(({ pos, driver, number, team, time, laps }) => ({
        pos, driver, number, team,
        time: time || 'No time',
        ...(laps !== null ? { laps } : {}),
    }));
    return rows.length ? rows : null;
}

const lapMs = (t: string) => {
    const m = t.match(/^(?:(\d+):)?(\d+)\.(\d+)$/);
    return m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 + Number(m[3].padEnd(3, '0')) : Infinity;
};

// Qualifying as season-file rows, from one table (1996 on: one session) or
// from several (up to 1995 there were two sessions, Friday and Saturday,
// and each car's best lap of either counted). formula1.com's "overall"
// table for those years is mixed with pre-qualifying, so it isn't used.
// Sorted by time; a car without one goes last. Null without rows.
export function qualifyingRows(pages: string[]) {
    const best = new Map<number | string, ReturnType<typeof tableRows>[number]>();
    for (const html of pages) {
        for (const row of tableRows(html)) {
            const key = row.number ?? row.driver;
            const saved = best.get(key);
            if (!saved || lapMs(row.time) < lapMs(saved.time)) best.set(key, row);
        }
    }
    const rows = [...best.values()]
        .map((row, order) => ({ row, order }))
        .sort((a, b) => lapMs(a.row.time) - lapMs(b.row.time) || a.order - b.order)
        .map(({ row }, i) => ({
            pos: i + 1,
            driver: row.driver,
            number: row.number,
            team: row.team,
            lapTime: lapMs(row.time) === Infinity ? 'No time' : row.time,
        }));
    return rows.length ? rows : null;
}

// The season's GPs on formula1.com, in calendar order (so the round is the
// position in it), with each one's id and URL name.
async function raceIndex(year: number) {
    const index = await page(`${BASE}/${year}/races`);
    if (!index) throw new Error(`couldn't load the F1.com race index for ${year}`);
    const $ = cheerio.load(index);
    const gps: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    $('a[href*="/race-result"]').each((_, a) => {
        const m = $(a).attr('href')?.match(/\/races\/(\d+)\/([a-z0-9-]+)\/race-result/);
        if (m && !seen.has(m[1] + m[2])) {
            seen.add(m[1] + m[2]);
            gps.push({ id: m[1], name: m[2] });
        }
    });
    if (!gps.length) throw new Error(`F1.com returned no races for ${year} (did the markup change?)`);
    return gps;
}

// A results page's HTML, or null if it doesn't exist or has no table.
async function results(url: string): Promise<string | null> {
    const html = await page(url);
    return html && tableRows(html).length ? html : null;
}

// Every round's practice sessions: round → { fp1: { results }, … }.
export async function fetchPractice(year: number) {
    const byRound: Record<number, Record<string, { results: Row[] }>> = {};
    for (const [i, { id, name }] of (await raceIndex(year)).entries()) {
        const sessions: Record<string, { results: Row[] }> = {};
        for (const n of [1, 2, 3]) {
            try {
                const html = await page(`${BASE}/${year}/races/${id}/${name}/practice/${n}`);
                const rows = html && practiceRows(html);
                if (rows) sessions[`fp${n}`] = { results: rows };
            } catch (err) {
                console.warn(`  ! R${i + 1} FP${n}: ${(err as Error).message}`);
            }
        }
        if (Object.keys(sessions).length) byRound[i + 1] = sessions;
    }
    return byRound;
}

// The qualifying of the given rounds: round → rows. Two-session years have
// qualifying/1 and /2; the rest, a single qualifying/0.
export async function fetchQualifying(year: number, rounds: Set<number>) {
    const byRound: Record<number, Row[]> = {};
    for (const [i, { id, name }] of (await raceIndex(year)).entries()) {
        if (!rounds.has(i + 1)) continue;
        const url = (n: number) => `${BASE}/${year}/races/${id}/${name}/qualifying/${n}`;
        try {
            let pages = [await results(url(1)), await results(url(2))].filter((h): h is string => !!h);
            if (!pages.length) pages = [await results(url(0))].filter((h): h is string => !!h);
            const rows = qualifyingRows(pages);
            if (rows) byRound[i + 1] = rows;
        } catch (err) {
            console.warn(`  ! R${i + 1} qualifying: ${(err as Error).message}`);
        }
    }
    return byRound;
}
