// Jolpica (https://jolpi.ca, the successor of the Ergast API): a season's
// races, qualifying and sprints, as season-file GPs.

import { spacedFetch } from './http.ts';

const BASE = 'https://api.jolpi.ca/ergast/f1';
const request = spacedFetch(500);   // well within Jolpica's 4 a second and 500 an hour

async function get<T>(path: string): Promise<T> {
    const url = `${BASE}/${path}`;
    const res = await request(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json() as T;
}

// ── What Jolpica sends (only the fields used here) ──────────────────────────
interface Person { givenName: string; familyName: string }
interface Result {
    position: string;
    number: string;
    Driver: Person;
    Constructor: { name: string };
    laps?: string;
    points?: string;
    grid?: string;
    status?: string;
    Time?: { time?: string };
    FastestLap?: { rank?: string; Time?: { time?: string } };
    Q1?: string; Q2?: string; Q3?: string;
}
interface Race {
    round: string;
    raceName: string;
    date: string;
    time?: string;
    Circuit?: { circuitId?: string };
    Qualifying?: { date: string; time?: string };
    Sprint?: { date: string; time?: string };
    Results?: Result[];
    QualifyingResults?: Result[];
    SprintResults?: Result[];
}
type Table = { MRData: { RaceTable: { Races: Race[] } } };

// ── Ids ─────────────────────────────────────────────────────────────────────
// Every source turns names into the same slugs, so ids line up across them.
export const toSlug = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Where a driver's full name gives a slug other than their id in drivers.json.
const DRIVER_IDS: Record<string, string> = {
    'andrea-kimi-antonelli': 'kimi-antonelli',
};
const driverId = (d: Person) => {
    const slug = toSlug(`${d.givenName} ${d.familyName}`);
    return DRIVER_IDS[slug] ?? slug;
};

// Jolpica's circuitId → data/circuits.json. The historical ones at the end
// aren't in circuits.json yet: the id is written anyway, and the season's
// report says which circuits to create.
const CIRCUIT_IDS: Record<string, string> = {
    albert_park: 'albert-park-circuit',
    sepang: 'sepang-international-circuit',
    shanghai: 'shanghai-international-circuit',
    bahrain: 'bahrain-international-circuit',
    catalunya: 'circuit-de-barcelona-catalunya',
    monaco: 'circuit-de-monaco',
    villeneuve: 'circuit-gilles-villeneuve',
    red_bull_ring: 'red-bull-ring',
    silverstone: 'silverstone-circuit',
    hungaroring: 'hungaroring',
    spa: 'circuit-de-spa-francorchamps',
    monza: 'autodromo-nazionale-di-monza',
    marina_bay: 'marina-bay-street-circuit',
    suzuka: 'suzuka-international-racing-course',
    sochi: 'sochi-autodrom',
    americas: 'cota',
    rodriguez: 'hermanos-rodriguez',
    interlagos: 'autodromo-jose-carlos-pace',
    yas_marina: 'yas-marina-circuit',
    baku: 'baku-city-circuit',
    jeddah: 'jeddah-corniche-circuit',
    losail: 'lusail-international-circuit',
    miami: 'miami-international-autodrome',
    vegas: 'las-vegas-strip-circuit',
    zandvoort: 'circuit-zandvoort',
    madring: 'madring',
    // Historical, not in circuits.json yet:
    istanbul: 'istanbul-park',
    hockenheimring: 'hockenheimring',
    nurburgring: 'nurburgring',
    imola: 'autodromo-enzo-e-dino-ferrari',
    magny_cours: 'circuit-de-nevers-magny-cours',
    valencia: 'valencia-street-circuit',
    indianapolis: 'indianapolis-motor-speedway',
    fuji: 'fuji-speedway',
    yeongam: 'korea-international-circuit',
    buddh: 'buddh-international-circuit',
    ricard: 'circuit-paul-ricard',
    portimao: 'autodromo-internacional-do-algarve',
    mugello: 'autodromo-internazionale-del-mugello',
};

// ── Rows ────────────────────────────────────────────────────────────────────
const LAPPED = /^\+\d+\s+Laps?$/;

function raceRow(r: Result) {
    const pos = Number(r.position);
    const time = r.Time?.time ? (pos === 1 ? r.Time.time : `+${r.Time.time.replace(/^\+/, '')}`)
        : r.status === 'Finished' || LAPPED.test(r.status ?? '') ? r.status
        : 'DNF';
    const row: Record<string, unknown> = {
        pos,
        driver: driverId(r.Driver),
        number: Number(r.number),
        team: toSlug(r.Constructor.name),
        laps: Number(r.laps),
        pts: Number(r.points),
        time,
    };
    // Actual starting position ("0" = from the pit lane); it isn't the
    // qualifying one when there were penalties.
    if (r.grid !== undefined && r.grid !== '') row.grid = Number(r.grid);
    if (r.FastestLap?.Time?.time) {
        row.bestLap = r.FastestLap.Time.time;
        if (r.FastestLap.rank === '1') row.fastestLap = true;
    }
    return row;
}

const qualifyingRow = (r: Result) => ({
    pos: Number(r.position),
    driver: driverId(r.Driver),
    number: Number(r.number),
    team: toSlug(r.Constructor.name),
    lapTime: r.Q3 ?? r.Q2 ?? r.Q1 ?? 'No time',
});

// Jolpica has no end times: a typical length is added to the start, so pages
// can tell whether a session is over.
const HOUR = 60 * 60 * 1000;
function session(date: string | null, length: number, results: Record<string, unknown>[]) {
    return { date, endDate: date ? new Date(Date.parse(date) + length).toISOString() : null, results };
}
const start = (d?: { date: string; time?: string }) => d ? `${d.date}T${d.time ?? '00:00:00Z'}` : null;

// ── A season ────────────────────────────────────────────────────────────────
export interface CircuitIssue { slug: string; round: number; jolpicaId: string; projectId?: string; note: string }

// Every GP of the year, keyed by slug ("Bahrain Grand Prix" → "bahrain-gp").
// gridOnly skips qualifying: the --grid mode only needs the races' grid.
// knownCircuits (from circuits.json, if any) flags circuit ids still to create.
export async function fetchSeason(year: number, { gridOnly = false, knownCircuits = null as Set<string> | null } = {}) {
    const races = (await get<Table>(`${year}/races.json?limit=100`)).MRData.RaceTable.Races;
    if (!races.length) throw new Error(`Jolpica has no races for ${year}`);

    const season: Record<string, Record<string, unknown>> = {};
    const circuitIssues: CircuitIssue[] = [];
    for (const race of races) {
        const round = Number(race.round);
        const slug = toSlug(race.raceName.toLowerCase().replace(/grand prix/g, 'gp'));
        console.log(`[${year}] R${round} ${race.raceName}`);

        const results = (await get<Table>(`${year}/${round}/results.json?limit=100`)).MRData.RaceTable.Races[0]?.Results ?? [];
        const qualifying = gridOnly ? []
            : (await get<Table>(`${year}/${round}/qualifying.json?limit=100`)).MRData.RaceTable.Races[0]?.QualifyingResults ?? [];
        const sprint = !race.Sprint ? []
            : (await get<Table>(`${year}/${round}/sprint.json?limit=100`)).MRData.RaceTable.Races[0]?.SprintResults ?? [];

        const sessions: Record<string, unknown> = {};
        if (qualifying.length) sessions.qualifying = session(start(race.Qualifying), HOUR, qualifying.map(qualifyingRow));
        if (sprint.length) sessions.sprintRace = session(start(race.Sprint), HOUR, sprint.map(raceRow));
        if (results.length) sessions.race = session(start(race), 4 * HOUR, results.map(raceRow));   // 4 h: room for SC and red flags

        const gp: Record<string, unknown> = { round, name: race.raceName };
        const jolpicaId = race.Circuit?.circuitId;
        if (jolpicaId && !gridOnly) {
            const projectId = CIRCUIT_IDS[jolpicaId];
            if (!projectId) circuitIssues.push({ slug, round, jolpicaId, note: 'no proposed slug in CIRCUIT_IDS' });
            else {
                if (knownCircuits && !knownCircuits.has(projectId)) {
                    circuitIssues.push({ slug, round, jolpicaId, projectId, note: `"${projectId}" missing from circuits.json` });
                }
                gp.circuitId = projectId;
            }
        }
        gp.sprint = Boolean(race.Sprint);
        gp.cancelled = results.length === 0 && qualifying.length === 0;
        gp.sessions = sessions;
        season[slug] = gp;
    }
    return { season, circuitIssues };
}
