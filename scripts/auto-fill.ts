// Fills a season file with what OpenF1 has published: the official session
// times, and the results and weather of the sessions already run. GitHub
// Actions runs it every 30 minutes on race weekends (.github/workflows/auto-fill-f1.yml).
//
//   node scripts/auto-fill.ts                    the current season (data/latest.json)
//   node scripts/auto-fill.ts data/seasons/season2025.json
//   --out=<file>      write somewhere else (the tests use it, see test/autofill.test.js)
//   --dry-run         say what would change, write nothing
//   --force-weather   request the weather again even for sessions that have it

import fs from 'node:fs';
import path from 'node:path';
import { DATA, readJson } from './lib/data.ts';
import { RESULT_KEY, findMeeting, get, meetingSessions, sessionRows, sessionWeather, type OpenF1Session } from './lib/openf1.ts';

interface Row {
    driver?: unknown;
    number?: number;
    team?: unknown;
    grid?: number;
}

interface Session {
    date?: string | null;
    endDate?: string | null;
    weather?: object | null;
    results?: Row[];
}

interface GrandPrix {
    name?: string;
    round?: number | null;
    cancelled?: boolean;
    sessions?: Record<string, Session>;
}

// ── Command line ────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
    const options = { out: '', dryRun: false, forceWeather: false };
    let file = '';
    for (const arg of argv) {
        if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
        else if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--force-weather') options.forceWeather = true;
        else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
        else file = arg;
    }
    file ||= path.join(DATA, 'seasons', `season${readJson<{ latestSeason: number }>(path.join(DATA, 'latest.json')).latestSeason}.json`);
    const year = Number(path.basename(file).match(/\d{4}/)?.[0]);
    if (!year) throw new Error(`Can't tell the season's year from ${file}`);
    return { file, year, out: options.out || file, dryRun: options.dryRun, forceWeather: options.forceWeather };
}

const args = parseArgs(process.argv.slice(2));

// ── Time ────────────────────────────────────────────────────────────────────
const time = (value?: string | null) => {
    const t = value ? Date.parse(value) : NaN;
    return Number.isNaN(t) ? null : t;
};
// Without a date, a session counts as started (better to ask OpenF1 for
// nothing than to miss it) and as not ended.
const started = (t: number | null) => (t ?? -Infinity) <= Date.now();
const ended = (t: number | null) => (t ?? Infinity) < Date.now();

const hasResults = (s: Session) => Array.isArray(s.results) && s.results.length > 0;
const noWeather = (s: Session) => s.weather == null || (typeof s.weather === 'object' && Object.keys(s.weather).length === 0);

// A row written before OpenF1 knew who the driver was ("#30"), their team or,
// in a race, where they started. It sometimes publishes them late (Mexico
// 2026: a driver and a team; the starting grid, some weekends), so the
// session is asked again while the workflow still runs for that weekend:
// from a Friday practice to the last run on Monday. After that it's left
// for a human. The workflow's "is there pending work" check uses the same rule.
const RACES = new Set(['race', 'sprintRace']);
const incomplete = (key: string) => (row: Row) =>
    typeof row.driver !== 'string' || row.driver.startsWith('#') || !row.team || (RACES.has(key) && row.grid == null);
const RETRY_MS = 4 * 24 * 60 * 60 * 1000;
const wantsResults = (key: string, s: Session, end: number | null) => !hasResults(s)
    || (s.results!.some(incomplete(key)) && (end ?? Infinity) + RETRY_MS > Date.now());

// Drivers the site has a profile for. A new one (a rookie in FP1, a
// replacement) is loaded anyway, and said in the log so someone adds them.
const knownDrivers = new Set(Object.keys(readJson<Record<string, unknown>>(path.join(DATA, 'drivers.json'))));

// A GP is worth asking OpenF1 about once one of its sessions has started
// and is missing results (or has incomplete ones) or weather.
const needsWork = (gp: GrandPrix) => Object.entries(gp.sessions ?? {}).some(([key, s]) =>
    s && typeof s === 'object' && started(time(s.date)) && (wantsResults(key, s, time(s.endDate)) || noWeather(s) || args.forceWeather));

// Weather is asked for while a session runs, and once more if it ended without any.
function wantsWeather(s: Session, o: OpenF1Session) {
    if (!started(time(o.date_start) ?? time(s.date))) return false;
    if (!ended(time(o.date_end) ?? time(s.endDate))) return true;
    return args.forceWeather || noWeather(s);
}

// ── Session times ───────────────────────────────────────────────────────────
// Times are stored in UTC ("2026-10-25T19:00:00Z"); pages show them in the visitor's zone.
const utc = (value?: string) => {
    const t = time(value);
    return t === null ? null : new Date(t).toISOString().replace('.000Z', 'Z');
};

// A schedule change moves a session by hours, not days. Anything bigger is
// more likely a meeting matched to the wrong GP, so it's left for a human.
const MAX_SHIFT_MS = 36 * 60 * 60 * 1000;

// Copies every session's official start and end from OpenF1. The season file
// is written before the season and F1 moves sessions (2026: Las Vegas brought
// forward two hours, among others); without this the site kept the
// provisional times. Returns how many sessions changed.
async function syncTimes(season: Record<string, GrandPrix>): Promise<number> {
    const official = new Map<number, Record<string, OpenF1Session>>();
    for (const s of await get<OpenF1Session>('/sessions', { year: args.year })) {
        const key = RESULT_KEY[s.session_name];
        if (!key) continue;
        if (!official.has(s.meeting_key)) official.set(s.meeting_key, {});
        official.get(s.meeting_key)![key] = s;
    }

    let changed = 0;
    for (const [gpKey, gp] of Object.entries(season)) {
        if (gp.cancelled || !gp.sessions) continue;
        const meeting = await findMeeting(args.year, gpKey, gp).catch((err: Error) => {
            console.warn(`⚠️ ${gpKey}: times not synced, meeting not found (${err.message})`);
        });
        if (!meeting || meeting.is_cancelled) continue;
        for (const [key, session] of Object.entries(gp.sessions)) {
            if (!session || typeof session !== 'object') continue;
            const o = official.get(meeting.meeting_key)?.[key];
            if (!o) {
                console.warn(`⚠️ ${gpKey}/${key}: not in OpenF1's schedule, time left as is`);
                continue;
            }
            const date = utc(o.date_start), endDate = utc(o.date_end);
            if (!date || !endDate || (date === session.date && endDate === session.endDate)) continue;
            const current = time(session.date);
            if (current !== null && Math.abs(current - time(date)!) > MAX_SHIFT_MS) {
                console.warn(`⚠️ ${gpKey}/${key}: OpenF1 says ${date}, saved ${session.date}; too far apart, left as is`);
                continue;
            }
            console.log(`🕒 ${gpKey}/${key}: ${session.date} → ${date} (end ${session.endDate} → ${endDate})`);
            session.date = date;
            session.endDate = endDate;
            changed++;
        }
    }
    return changed;
}

// ── Results and weather ─────────────────────────────────────────────────────
// Fills what's missing in one GP. Returns how many sessions changed.
async function fillGrandPrix(gpKey: string, gp: GrandPrix): Promise<number> {
    const meeting = await findMeeting(args.year, gpKey, gp);
    if (meeting.is_cancelled) {
        console.log(`⏭️ ${gpKey}: cancelled in OpenF1`);
        return 0;
    }
    const sessions = await meetingSessions(meeting.meeting_key);

    let changed = 0;
    for (const [key, session] of Object.entries(gp.sessions!)) {
        if (!session || typeof session !== 'object') continue;
        if (!Array.isArray(session.results)) session.results = [];
        if (!('weather' in session)) session.weather = null;
        const o = sessions[key];
        if (!o?.session_key) continue;
        let sessionChanged = false;

        if (wantsWeather(session, o)) {
            try {
                const weather = await sessionWeather(o.session_key);
                if (weather) {
                    session.weather = weather;
                    sessionChanged = true;
                    console.log(`🌤️ ${gpKey}/${key}: weather updated`);
                }
            } catch (err) {
                console.warn(`⚠️ ${gpKey}/${key}: weather (${(err as Error).message})`);
            }
        }

        if (wantsResults(key, session, time(o.date_end) ?? time(session.endDate))) {
            const had = hasResults(session);
            try {
                const results = await get<Parameters<typeof sessionRows>[2][number]>('/session_result', { session_key: o.session_key });
                const rows = results.length ? await sessionRows(key, o.session_key, results, sessions) : [];
                if (rows.length && JSON.stringify(rows) !== JSON.stringify(session.results)) {
                    session.results = rows;
                    sessionChanged = true;
                    console.log(`✅ ${gpKey}/${key}: results ${had ? 'completed' : 'added'}`);
                    const unknown = rows.map(row => row.driver)
                        .filter((id): id is string => typeof id === 'string' && !id.startsWith('#') && !knownDrivers.has(id));
                    if (unknown.length) console.warn(`⚠️ ${gpKey}/${key}: not in drivers.json: ${unknown.join(', ')}`);
                } else if (!rows.length && ended(time(o.date_end) ?? time(session.endDate))) {
                    console.log(`⏳ ${gpKey}/${key}: ended without OpenF1 results`);
                }
            } catch (err) {
                console.warn(`⚠️ ${gpKey}/${key}: results (${(err as Error).message})`);
            }
        }
        const missing = (session.results ?? []).filter(incomplete(key));
        if (missing.length) {
            const who = missing.map(row => [
                `#${row.number}`,
                typeof row.driver === 'string' && !row.driver.startsWith('#') ? row.driver : '',
                row.team ? '' : '(no team)',
                RACES.has(key) && row.grid == null ? '(no grid)' : '',
            ].filter(Boolean).join(' '));
            console.warn(`⚠️ ${gpKey}/${key}: OpenF1 hasn't said who drove, for whom or from where: ${who.join(', ')}`);
        }
        if (sessionChanged) changed++;
    }
    return changed;
}

// ── Run ─────────────────────────────────────────────────────────────────────
const season = readJson<Record<string, GrandPrix>>(args.file);
let updates = 0;
console.log(`🏁 Auto-fill OpenF1 ${args.year}`);

// First, so the started/ended checks below use the official times.
try {
    const synced = await syncTimes(season);
    console.log(synced ? `🕒 Session times: ${synced} updated from OpenF1` : '🕒 Session times: up to date');
    updates += synced;
} catch (err) {
    console.warn(`⚠️ Session times not synced (${(err as Error).message})`);
}

for (const [gpKey, gp] of Object.entries(season)) {
    if (gp.cancelled) console.log(`⏭️ ${gpKey}: cancelled`);
    else if (!gp.sessions || typeof gp.sessions !== 'object') console.warn(`⚠️ ${gpKey}: has no sessions; skipped`);
    else if (!Object.values(gp.sessions).some(s => started(time(s?.date)))) console.log(`⏭️ ${gpKey}: hasn't started yet, skipped without querying OpenF1`);
    else if (!needsWork(gp)) console.log(`⏭️ ${gpKey}: already complete, skipped without querying OpenF1`);
    else {
        try {
            updates += await fillGrandPrix(gpKey, gp);
        } catch (err) {
            console.warn(`⚠️ ${gpKey}: ${(err as Error).message}`);
        }
    }
}

if (!updates) console.log('✔️ No changes.');
else if (args.dryRun) console.log(`🧪 Dry run: ${updates} update(s), nothing written.`);
else {
    fs.writeFileSync(args.out, JSON.stringify(season, null, 2) + '\n');
    console.log(`✅ ${args.out} updated (${updates} update(s))`);
}
