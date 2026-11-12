// Practice sessions (FP1-3), read from the results pages of formula1.com:
// neither Jolpica nor OpenF1 (before 2023) has them.

import * as cheerio from 'cheerio';
import { spacedFetch } from './http.ts';
import { toSlug } from './jolpica.ts';

const BASE = 'https://www.formula1.com/en/results';
const request = spacedFetch(500);

// A page's HTML; null if it doesn't exist (a sprint weekend has no FP2/FP3).
async function page(url: string): Promise<string | null> {
    const res = await request(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; F1HubBot/1.0; +personal project)' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
}

// A results table as season-file rows; null without a table or rows.
export function practiceRows(html: string) {
    const $ = cheerio.load(html);
    const table = $('table').first();
    if (!table.length) return null;

    const rows: Record<string, unknown>[] = [];
    table.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 5) return;
        const cell = (i: number) => $(cells[i]).text().trim();
        // The driver cell glues the name to the 3-letter code: "Lando NorrisNOR".
        const driver = cell(2).match(/^(.*\S)\s*([A-Z]{3})$/)?.[1].trim() ?? cell(2);
        const pos = Number(cell(0));
        const number = Number(cell(1));
        const laps = cells.length > 5 ? Number(cell(5)) : NaN;
        if (!pos || !driver) return;
        rows.push({
            pos,
            driver: toSlug(driver),
            number: Number.isFinite(number) ? number : null,
            team: toSlug(cell(3)),
            time: cell(4) || 'No time',
            ...(Number.isFinite(laps) ? { laps } : {}),
        });
    });
    return rows.length ? rows : null;
}

// Every round's practice sessions: round → { fp1: { results }, … }. The
// season's race index gives each GP's formula1.com id and URL name, in
// calendar order (so the round is the position in it).
export async function fetchPractice(year: number) {
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

    const byRound: Record<number, Record<string, { results: Record<string, unknown>[] }>> = {};
    for (const [i, { id, name }] of gps.entries()) {
        const sessions: Record<string, { results: Record<string, unknown>[] }> = {};
        for (const n of [1, 2, 3]) {
            try {
                const html = await page(`${BASE}/${year}/races/${id}/${name}/practice/${n}`);
                const results = html && practiceRows(html);
                if (results) sessions[`fp${n}`] = { results };
            } catch (err) {
                console.warn(`  ! R${i + 1} FP${n}: ${(err as Error).message}`);
            }
        }
        if (Object.keys(sessions).length) byRound[i + 1] = sessions;
    }
    return byRound;
}
