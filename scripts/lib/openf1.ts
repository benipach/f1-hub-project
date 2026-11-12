// OpenF1 (https://openf1.org) for the auto-fill: requests, finding a GP's
// meeting, and turning sessions into the rows of a season file.

// ── Requests ────────────────────────────────────────────────────────────────
const BASE = 'https://api.openf1.org/v1';
const GAP_MS = 250;        // requests start at least this far apart, so OpenF1 doesn't answer 429
const RETRIES = 5;         // on 429 or 5xx, with exponential backoff
const BACKOFF_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let nextStart = 0;

// An endpoint's rows; [] when OpenF1 has nothing (it answers 404 then).
export async function get<T>(endpoint: string, params: Record<string, string | number>): Promise<T[]> {
    const url = `${BASE}${endpoint}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    for (let attempt = 0; ; attempt++) {
        const wait = nextStart - Date.now();
        nextStart = Math.max(Date.now(), nextStart) + GAP_MS;
        if (wait > 0) await sleep(wait);

        const res = await fetch(url);
        if (res.status === 404) return [];
        if (res.ok) return await res.json() as T[];
        if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
            const retryAfter = Number(res.headers.get('retry-after'));
            const delay = retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS * 2 ** attempt + Math.random() * BACKOFF_MS;
            console.warn(`⏳ OpenF1 ${res.status} on ${url}, retry ${attempt + 1}/${RETRIES} in ${Math.round(delay)}ms`);
            await sleep(delay);
            continue;
        }
        throw new Error(`OpenF1 ${res.status} ${res.statusText} (${url})`);
    }
}

// ── What OpenF1 sends (only the fields used here) ───────────────────────────
export interface Meeting {
    meeting_key: number;
    meeting_name?: string;
    meeting_official_name?: string;
    location?: string;
    circuit_short_name?: string;
    date_start: string;
    is_cancelled?: boolean;
}

export interface OpenF1Session {
    session_key: number;
    meeting_key: number;
    session_name: string;
    date_start?: string;
    date_end?: string;
}

interface ResultRow {
    driver_number: number;
    position?: number | null;
    points?: number;
    number_of_laps?: number;
    duration?: number | (number | null)[] | null;
    gap_to_leader?: number | string | null;
    dnf?: boolean;
    dns?: boolean;
    dsq?: boolean;
}

interface Driver {
    driver_number: number;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    broadcast_name?: string;
    team_name?: string;
}

interface Lap { driver_number: number; lap_duration?: number | null; is_pit_out_lap?: boolean }
interface GridRow { driver_number?: number | null; position?: number | string }
interface WeatherSample { [field: string]: number | undefined }

// ── Sessions ────────────────────────────────────────────────────────────────
// OpenF1's session names → the keys of a season file's `sessions`.
export const RESULT_KEY: Record<string, string> = {
    'Practice 1': 'fp1',
    'Practice 2': 'fp2',
    'Practice 3': 'fp3',
    'Sprint Qualifying': 'sprintQualy',
    'Sprint Shootout': 'sprintQualy',
    'Sprint': 'sprintRace',
    'Qualifying': 'qualifying',
    'Race': 'race',
};

const RACE_LIKE = new Set(['race', 'sprintRace']);
const QUALY_LIKE = new Set(['qualifying', 'sprintQualy']);
// For a race, the session whose grid it starts from. OpenF1 hangs the
// starting grid off that session (Qualifying, Sprint Qualifying), not the race:
// verified against Monza 2026, the race's own key returns nothing.
const GRID_SOURCE: Record<string, string> = { race: 'qualifying', sprintRace: 'sprintQualy' };

const meetingSessionsCache = new Map<number, Record<string, OpenF1Session>>();

// A meeting's sessions, by result key.
export async function meetingSessions(meetingKey: number): Promise<Record<string, OpenF1Session>> {
    if (!meetingSessionsCache.has(meetingKey)) {
        const byKey: Record<string, OpenF1Session> = {};
        for (const s of await get<OpenF1Session>('/sessions', { meeting_key: meetingKey })) {
            const key = RESULT_KEY[s.session_name];
            if (key) byKey[key] = s;
        }
        meetingSessionsCache.set(meetingKey, byKey);
    }
    return meetingSessionsCache.get(meetingKey)!;
}

// ── Finding a GP's meeting ──────────────────────────────────────────────────
// How each GP of a season file appears in OpenF1, to match its meeting.
const GP_LOOKUP: Record<string, { location: string; circuitShortName: string; aliases: string[] }> = {
    'australian-gp': { location: 'Melbourne', circuitShortName: 'Melbourne', aliases: ['Australian Grand Prix'] },
    'chinese-gp': { location: 'Shanghai', circuitShortName: 'Shanghai', aliases: ['Chinese Grand Prix'] },
    'japanese-gp': { location: 'Suzuka', circuitShortName: 'Suzuka', aliases: ['Japanese Grand Prix'] },
    'bahrain-gp': { location: 'Sakhir', circuitShortName: 'Sakhir', aliases: ['Bahrain Grand Prix'] },
    'saudi-arabian-gp': { location: 'Jeddah', circuitShortName: 'Jeddah', aliases: ['Saudi Arabian Grand Prix'] },
    'miami-gp': { location: 'Miami Gardens', circuitShortName: 'Miami', aliases: ['Miami Grand Prix'] },
    'canadian-gp': { location: 'Montréal', circuitShortName: 'Montreal', aliases: ['Canadian Grand Prix', 'Grand Prix du Canada'] },
    'monaco-gp': { location: 'Monte Carlo', circuitShortName: 'Monte Carlo', aliases: ['Monaco Grand Prix', 'Grand Prix de Monaco'] },
    'barcelona-gp': { location: 'Barcelona', circuitShortName: 'Catalunya', aliases: ['Barcelona Grand Prix', 'Barcelona-Catalunya Grand Prix'] },
    'austrian-gp': { location: 'Spielberg', circuitShortName: 'Spielberg', aliases: ['Austrian Grand Prix'] },
    'british-gp': { location: 'Silverstone', circuitShortName: 'Silverstone', aliases: ['British Grand Prix'] },
    'belgian-gp': { location: 'Spa-Francorchamps', circuitShortName: 'Spa-Francorchamps', aliases: ['Belgian Grand Prix'] },
    'hungarian-gp': { location: 'Budapest', circuitShortName: 'Hungaroring', aliases: ['Hungarian Grand Prix'] },
    'dutch-gp': { location: 'Zandvoort', circuitShortName: 'Zandvoort', aliases: ['Dutch Grand Prix'] },
    'italian-gp': { location: 'Monza', circuitShortName: 'Monza', aliases: ['Italian Grand Prix'] },
    'spanish-gp': { location: 'Madrid', circuitShortName: 'Madring', aliases: ['Spanish Grand Prix', 'Madrid Grand Prix'] },
    'azerbaijan-gp': { location: 'Baku', circuitShortName: 'Baku', aliases: ['Azerbaijan Grand Prix'] },
    'singapore-gp': { location: 'Marina Bay', circuitShortName: 'Singapore', aliases: ['Singapore Grand Prix'] },
    'united-states-gp': { location: 'Austin', circuitShortName: 'Austin', aliases: ['United States Grand Prix', 'US Grand Prix'] },
    'mexican-gp': { location: 'Mexico City', circuitShortName: 'Mexico City', aliases: ['Mexico City Grand Prix', 'Mexican Grand Prix'] },
    'brazilian-gp': { location: 'São Paulo', circuitShortName: 'Interlagos', aliases: ['São Paulo Grand Prix', 'Brazilian Grand Prix'] },
    'las-vegas-gp': { location: 'Las Vegas', circuitShortName: 'Las Vegas', aliases: ['Las Vegas Grand Prix'] },
    'qatar-gp': { location: 'Lusail', circuitShortName: 'Lusail', aliases: ['Qatar Grand Prix'] },
    'abu-dhabi-gp': { location: 'Yas Marina', circuitShortName: 'Yas Marina Circuit', aliases: ['Abu Dhabi Grand Prix'] },
};

const plain = (value: unknown) => String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

const meetingsCache = new Map<number, Meeting[]>();
const meetingCache = new Map<string, Meeting>();

// The year's Grands Prix (no testing), in date order.
async function grandsPrix(year: number): Promise<Meeting[]> {
    if (!meetingsCache.has(year)) {
        const all = await get<Meeting>('/meetings', { year });
        meetingsCache.set(year, all
            .filter(m => /grand prix/i.test(`${m.meeting_name ?? ''} ${m.meeting_official_name ?? ''}`))
            .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start)));
    }
    return meetingsCache.get(year)!;
}

// The meeting that best matches the GP by place, circuit and name; if none
// matches well enough, the one in the GP's round order.
export async function findMeeting(year: number, gpKey: string, gp: { name?: string; round?: number | null }): Promise<Meeting> {
    const cacheKey = `${year}:${gpKey}`;
    if (meetingCache.has(cacheKey)) return meetingCache.get(cacheKey)!;

    const meetings = await grandsPrix(year);
    const lookup = GP_LOOKUP[gpKey];
    const location = plain(lookup?.location);
    const circuit = plain(lookup?.circuitShortName);
    const names = [gp.name, ...(lookup?.aliases ?? [])].filter(Boolean).map(plain);
    const score = (m: Meeting) => {
        const mLocation = plain(m.location), mCircuit = plain(m.circuit_short_name);
        const mName = plain(m.meeting_name), mOfficial = plain(m.meeting_official_name);
        let s = 0;
        if (location && mLocation === location) s += 100;
        else if (location && mLocation.includes(location)) s += 75;
        if (circuit && mCircuit === circuit) s += 100;
        else if (circuit && mCircuit.includes(circuit)) s += 70;
        if (names.some(n => n && mName === n)) s += 80;
        else if (names.some(n => n && (mName.includes(n) || mOfficial.includes(n)))) s += 50;
        return s;
    };

    let best: Meeting | undefined, bestScore = -1;
    for (const m of meetings) {
        const s = score(m);
        if (s > bestScore) { best = m; bestScore = s; }
    }
    if ((!best || bestScore < 50) && Number.isInteger(gp.round)) best = meetings[gp.round! - 1] ?? best;
    if (!best) throw new Error(`No meeting found for ${gpKey} ${year}`);
    meetingCache.set(cacheKey, best);
    return best;
}

// ── Results ─────────────────────────────────────────────────────────────────
// team_name as OpenF1 sends it → the short name stored in the season files.
const TEAM_NAMES: Record<string, string> = {
    'Red Bull Racing': 'Red Bull',
    'Haas F1 Team': 'Haas',
    'Mercedes': 'Mercedes-AMG',
};

// Points by position, only for rows OpenF1 sends without them.
const POINTS = [0, 25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [0, 8, 7, 6, 5, 4, 3, 2, 1];

// The rest of the project identifies drivers by slug (full name in
// lowercase, without accents, separated by hyphens): "valtteri-bottas".
const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const titleCase = (name: string) => name.toLowerCase().split(/\s+/).filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1)).join(' ');

async function drivers(sessionKey: number): Promise<Map<number, { name: string; team: string | null }>> {
    const byNumber = new Map<number, { name: string; team: string | null }>();
    for (const d of await get<Driver>('/drivers', { session_key: sessionKey })) {
        const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || titleCase(d.full_name ?? d.broadcast_name ?? '');
        const team = d.team_name ?? null;
        byNumber.set(d.driver_number, { name: slug(name), team: team && (TEAM_NAMES[team] ?? team) });
    }
    return byNumber;
}

// The official starting grid, penalties included: driver number → position.
async function startingGrid(sessionKey: number | undefined): Promise<Map<number, number>> {
    const grid = new Map<number, number>();
    if (!sessionKey) return grid;
    for (const r of await get<GridRow>('/starting_grid', { session_key: sessionKey })) {
        const pos = Number(r.position);
        if (Number.isFinite(pos) && r.driver_number != null) grid.set(r.driver_number, pos);
    }
    return grid;
}

// Best lap per driver, leaving out pit out-laps and laps without a valid time.
function bestLaps(laps: Lap[]): Map<number, number> {
    const best = new Map<number, number>();
    for (const lap of laps) {
        if (lap.is_pit_out_lap) continue;
        const t = Number(lap.lap_duration);
        if (!Number.isFinite(t) || t <= 0) continue;
        const current = best.get(lap.driver_number);
        if (current === undefined || t < current) best.set(lap.driver_number, t);
    }
    return best;
}

// OpenF1 sometimes sends position 0 instead of null for drivers not
// classified (DNF/DNS/DSQ); neither ever wins the sort.
const position = (row: ResultRow) => Number(row.position) > 0 ? Number(row.position) : Infinity;

// The last number of a duration (qualifying sends one per part: Q1, Q2, Q3).
function lastNumber(value: ResultRow['duration']): number | null {
    const list = Array.isArray(value) ? value : [value];
    for (let i = list.length - 1; i >= 0; i--) {
        if (typeof list[i] === 'number' && Number.isFinite(list[i])) return list[i] as number;
    }
    return null;
}

function clock(seconds: number | null): string {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3).padStart(6, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const lapTime = (row: ResultRow) => {
    const t = lastNumber(row.duration);
    return t == null ? 'No time' : clock(t);
};

const status = (row: ResultRow) => row.dsq ? 'DSQ' : row.dns ? 'DNS' : row.dnf ? 'DNF' : null;

function raceTime(row: ResultRow): string {
    const s = status(row);
    if (s) return s;
    if (Number(row.position) === 1) return clock(lastNumber(row.duration));
    const gap = row.gap_to_leader;
    if (typeof gap === 'number' && Number.isFinite(gap)) return `+${gap.toFixed(3)}s`;
    if (typeof gap === 'string' && gap.trim()) {
        const lapped = gap.trim().match(/^\+?(\d+)\s*laps?$/i);
        const laps = lapped && Number(lapped[1]);
        return lapped ? `+${laps} ${laps === 1 ? 'Lap' : 'Laps'}` : gap.trim();
    }
    return clock(lastNumber(row.duration));
}

// A session's results as season-file rows, best first. Practice and
// qualifying give each driver's lap time; races, time or gap, points, best
// lap, fastest lap and starting grid. In qualifying only DSQ is shown as a
// status: DNF/DNS read better as "No time".
export async function sessionRows(resultKey: string, sessionKey: number, results: ResultRow[], sessions: Record<string, OpenF1Session>) {
    const race = RACE_LIKE.has(resultKey);
    const [byNumber, laps, grid] = await Promise.all([
        drivers(sessionKey),
        race ? get<Lap>('/laps', { session_key: sessionKey }) : [],
        race ? startingGrid(sessions[GRID_SOURCE[resultKey]]?.session_key).catch(() => new Map<number, number>()) : new Map<number, number>(),
    ]);
    const best = bestLaps(laps);
    let fastest: number | null = null;
    for (const [num, t] of best) if (fastest === null || t < best.get(fastest)!) fastest = num;
    const points = resultKey === 'sprintRace' ? SPRINT_POINTS : POINTS;

    return [...results].sort((a, b) => position(a) - position(b)).map((row, i) => {
        const driver = byNumber.get(row.driver_number);
        const base: Record<string, unknown> = { pos: i + 1, driver: driver?.name ?? `#${row.driver_number}`, number: row.driver_number };
        if (race) {
            base.laps = String(row.number_of_laps ?? 0);
            base.time = raceTime(row);
            base.pts = row.dsq ? 0 : Number(typeof row.points === 'number' ? row.points : points[Number(row.position)] ?? 0);
        } else if (QUALY_LIKE.has(resultKey)) {
            base.lapTime = row.dsq ? 'DSQ' : lapTime(row);
        } else {
            base.lapTime = status(row) ?? lapTime(row);
            base.laps = String(row.number_of_laps ?? 0);
        }
        if (driver?.team) base.team = driver.team;
        if (race && best.has(row.driver_number)) {
            base.bestLap = clock(best.get(row.driver_number)!);
            if (row.driver_number === fastest) base.fastestLap = true;
        }
        if (race && grid.has(row.driver_number)) base.grid = grid.get(row.driver_number);
        return base;
    });
}

// ── Weather ─────────────────────────────────────────────────────────────────
// A session's weather, averaged over all its samples; null without samples.
export async function sessionWeather(sessionKey: number) {
    const samples = await get<WeatherSample>('/weather', { session_key: sessionKey });
    if (!samples.length) return null;
    const values = (field: string) => samples.map(x => Number(x[field])).filter(Number.isFinite);
    const mean = (field: string) => {
        const v = values(field);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    // Wind direction is an angle: 350° and 10° average to 0°, not 180°.
    const meanAngle = (field: string) => {
        const rad = values(field).map(d => d * Math.PI / 180);
        if (!rad.length) return null;
        const deg = Math.atan2(rad.reduce((a, r) => a + Math.sin(r), 0), rad.reduce((a, r) => a + Math.cos(r), 0)) * 180 / Math.PI;
        return deg >= 0 ? deg : deg + 360;
    };
    const round = (value: number | null, digits: number) => value === null ? null : Number(value.toFixed(digits));
    return {
        air_temperature: round(mean('air_temperature'), 1),
        track_temperature: round(mean('track_temperature'), 1),
        humidity: round(mean('humidity'), 0),
        wind_speed: round(mean('wind_speed'), 1),
        wind_direction: round(meanAngle('wind_direction'), 0),
        rainfall: samples.some(x => Number(x.rainfall ?? 0) > 0) ? 1 : 0,
    };
}
