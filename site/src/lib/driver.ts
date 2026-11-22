// What a driver's profile needs, prepared at build time from data/
// (_design/descartado/DESIGN-poster.md, "Driver profile"; the approved mockup is
// _design/driver/index.html in the owner's working copy).
//
// Every number comes from the season files, careers.json and
// seasons-index.json, read through the normalized layer: nothing typed by
// hand except the few personal facts in driver-facts.ts. The seasons are read
// once per build and shared by every driver's page.

import { loadCareers, loadCircuits, loadCities, loadCountries, loadDrivers, loadGrandsPrix, loadLatestYear, loadSeason, loadSeasonsIndex, loadTeams } from '@f1hub/shared/data/load';
import type { RawCareers } from '@f1hub/shared/data/raw';
import type { GrandPrix, SessionOf } from '@f1hub/shared/data/season';
import { driverCutout, driverPhoto, namesIn, teamLogo } from './home';
import { buildJourney, tally, type Journey, type StandingRow } from './driver-journey';

export type DriverTeam = {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
    /** Path inside the site, "img/teams/ferrari-logo.png", or null. */
    readonly logo: string | null;
};

export type DriverSprint = {
    readonly grid: number | null;
    readonly pos: number | null;
    /** "DNF", "DNS" or "DSQ"; null when classified. */
    readonly out: string | null;
    readonly pts: number;
};

export type DriverRound = {
    readonly round: number;
    /** "Australian Grand Prix", in the page's language. */
    readonly full: string;
    /** "Australian GP", in the page's language. */
    readonly gp: string;
    /** "Australian" ("Australia" in Spanish): the name alone, for tables. */
    readonly short: string;
    /** ISO code of the country where it's held, for the flag. */
    readonly iso: string | null;
    readonly upcoming: boolean;
    readonly missed: boolean;
    /** A sprint weekend (what's still in play counts the sprint too). */
    readonly sprintWeekend: boolean;
    readonly team: string | null;
    readonly grid: number | null;
    /** The classified position; for a retirement, where it was classified. */
    readonly pos: number | null;
    readonly out: string | null;
    /** Race and sprint together (the standings). */
    readonly pts: number;
    readonly racePts: number;
    readonly sprint: DriverSprint | null;
    readonly fl: boolean;
    readonly pole: boolean;
    /** Cars in the race. */
    readonly field: number;
};

export type DriverMate = {
    readonly id: string;
    readonly first: string;
    readonly last: string;
    /** [driver, teammate] */
    readonly race: readonly [number, number];
    readonly quali: readonly [number, number];
    readonly pts: readonly [number, number];
    readonly together: number;
};

export type DriverSeason = {
    readonly year: number;
    readonly done: boolean;
    readonly hasGrid: boolean;
    /** The last place that scored in a race that season (6 to 2002, 8 to 2009, 10 since): the chart's points line. */
    readonly pointsTo: number;
    readonly teams: readonly DriverTeam[];
    readonly pos: number | null;
    readonly pts: number;
    readonly wins: number;
    readonly podiums: number;
    readonly poles: number;
    readonly fls: number;
    /** Places gained in races (grid against finish), and its rank that year. */
    readonly gained: number;
    readonly gainedRank: number | null;
    /** The year's best at gaining places. */
    readonly racecraft: { readonly id: string; readonly first: string; readonly last: string; readonly places: number } | null;
    readonly mate: DriverMate | null;
    readonly champion: boolean;
    /** Who the standings measure him against: the leader, or the runner-up when he leads. */
    readonly rival: { readonly id: string; readonly first: string; readonly last: string; readonly pts: number } | null;
    /** The championship around him at the end (or so far): two ahead, two behind; the top five from 1st to 3rd. */
    readonly table: readonly StandingRow[];
    readonly rounds: readonly DriverRound[];
};

export type DriverEra = DriverTeam & {
    readonly from: number;
    readonly to: number;
    readonly races: number;
    readonly wins: number;
    readonly podiums: number;
    readonly points: number;
    readonly best: number | null;
    readonly titles: readonly number[];
};

export type DriverMilestone = {
    /** careers.json's label, in English ("First win"): the page translates it. */
    readonly label: string;
    readonly year: number;
    readonly date: string;
    /** The round it happened in, to find it in the grid; null if not found. */
    readonly round: number | null;
    readonly gp: string;
    readonly team: string;
    readonly pos: number;
    readonly grid: number | null;
    readonly streak: number | null;
};

export const BOARD_STATS = ['wins', 'podiums', 'poles', 'points', 'fastestLaps', 'races'] as const;
export type BoardStat = (typeof BOARD_STATS)[number];
type RankStat = BoardStat | 'titles';

export type BoardRow = {
    readonly id: string; readonly first: string; readonly last: string; readonly value: number; readonly rank: number;
    /** The team he last added to this stat with (owner, 20/11: Räikkönen's last race was with Alfa Romeo, his last win with Ferrari). */
    readonly team: DriverTeam | null;
};

export type DriverProfile = {
    readonly id: string;
    readonly first: string;
    readonly last: string;
    readonly code: string | null;
    readonly nationality: string | null;
    readonly iso: string | null;
    readonly born: string | null;
    readonly died: string | null;
    readonly number: number;
    /** Every race number used, in the order first carried. */
    readonly numbers: readonly number[];
    /** The seasons he carried each number, in the same order. */
    readonly numberYears: readonly { readonly number: number; readonly years: readonly number[] }[];
    readonly debut: string;
    readonly active: boolean;
    /** The latest season's Grands Prix held in the driver's country. */
    readonly homeRaces: readonly string[];
    readonly latest: number;
    readonly photo: string | null;
    /** The full-body cutout on a transparent background (img/drivers/<last name>.png), same rule as the photo. */
    readonly cutout: string | null;
    readonly totals: {
        readonly races: number;
        readonly points: number;
        readonly wins: number;
        readonly podiums: number;
        readonly poles: number;
        readonly fastestLaps: number;
        readonly titles: number;
        readonly titleYears: readonly number[];
        readonly seasons: number;
    };
    /** All-time rank of each total among every driver in careers.json. */
    readonly ranks: Readonly<Record<RankStat, number>>;
    readonly eras: readonly DriverEra[];
    readonly milestones: readonly DriverMilestone[];
    /** Section 6, the milestones, each kind with what its drawing needs (lib/driver-journey.ts). */
    readonly journey: Journey;
    readonly seasons: readonly DriverSeason[];
    /** Five rows of each all-time board around him (owner, 22/11): the two ahead and the two behind; the top five when he's 1st to 3rd. */
    readonly boards: Readonly<Record<BoardStat, readonly BoardRow[]>>;
    /** His own row on every board, titles included. */
    readonly mine: Readonly<Record<RankStat, BoardRow>>;
    /** Drivers on the boards: everyone in careers.json. */
    readonly onRecord: number;
    /** The champions' table, five rows around him the same way, each title with the team it was won with. Empty when he has no title. */
    readonly champions: readonly (BoardRow & { readonly titles: readonly { readonly year: number; readonly team: DriverTeam }[] })[];
};

// ---- A season's rounds, once per build -------------------------------------

export type Row = {
    readonly driver: string;
    readonly team: string;
    readonly number: number;
    readonly quali: number | null;
    readonly pos: number;
    readonly out: string | null;
    readonly grid: number | null;
    readonly pts: number;
    readonly racePts: number;
    readonly sprint: DriverSprint | null;
    readonly fl: boolean;
};

export type Round = {
    readonly round: number;
    readonly id: string;
    /** Three letters for tight rows ("MIA", "GBR"): the GP's own, else its country's. */
    readonly code: string;
    /** The sprint's day, on a sprint weekend. */
    readonly sprintDate: string | null;
    /** On pole, who was second and by how much (ms), from qualifying times. */
    readonly poleGap: { readonly second: string; readonly ms: number } | null;
    /** The English name without "Grand Prix": careers.json's milestones use it. */
    readonly short: string;
    readonly name: string;
    readonly date: string;
    readonly iso: string | null;
    readonly raced: boolean;
    readonly sprint: boolean;
    readonly rows: readonly Row[];
    readonly pole: string | null;
    readonly field: number;
};

export type Season = {
    readonly rounds: readonly Round[];
    readonly standing: ReadonlyMap<string, number>;
    readonly pts: ReadonlyMap<string, number>;
    readonly gained: ReadonlyMap<string, number>;
    readonly gainedRank: ReadonlyMap<string, number>;
    readonly best: { readonly id: string; readonly places: number } | null;
    readonly done: boolean;
    readonly hasGrid: boolean;
    readonly pointsTo: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const outOf = (kind: string) => (kind === 'dnf' || kind === 'dns' || kind === 'dsq' ? kind.toUpperCase() : null);
const session = <K extends 'race' | 'sprintRace' | 'qualifying' | 'sprintQualy'>(gp: GrandPrix, key: K) =>
    gp.sessions.find((s): s is SessionOf<K> => s.key === key);
const dayOf = (gp: GrandPrix) => {
    const time = session(gp, 'race')?.time;
    return time?.kind === 'datetime' ? time.start.slice(0, 10) : time?.kind === 'date' ? time.date : '';
};

function buildSeason(dataDir: URL, year: number, ctx: Context): Season {
    const rounds = loadSeason(dataDir, year, ctx.teams)
        .filter((gp) => !gp.cancelled)
        .map((gp): Round => {
            const race = session(gp, 'race')?.results ?? [];
            const quali = session(gp, 'qualifying')?.results ?? [];
            const sprint = session(gp, 'sprintRace')?.results ?? [];
            const sprintQ = session(gp, 'sprintQualy')?.results ?? [];
            const field = race.length;
            const qpos = new Map(quali.map((q) => [q.driver, q.pos]));
            const sprintOf = (driver: string): DriverSprint | null => {
                const s = sprint.find((x) => x.driver === driver);
                if (!s) return null;
                // Its own grid, or the sprint qualifying where the season has none; 0 is the pit lane
                let grid = s.grid ?? sprintQ.find((x) => x.driver === driver)?.pos ?? null;
                if (grid === 0) grid = sprint.length;
                return { grid, pos: s.pos, out: outOf(s.outcome.kind), pts: s.points };
            };
            const rows = race.map((r): Row => {
                // The grid from 2010; before, the qualifying position. 0 is a pit lane start: last
                let grid = r.grid ?? qpos.get(r.driver) ?? null;
                if (grid === 0) grid = field;
                const sp = sprintOf(r.driver);
                return {
                    driver: r.driver, team: r.teamId, number: r.number, quali: qpos.get(r.driver) ?? null,
                    pos: r.pos, out: outOf(r.outcome.kind), grid,
                    pts: r.points + (sp?.pts ?? 0), racePts: r.points, sprint: sp, fl: r.fastestLap,
                };
            });
            const pole = quali.find((q) => q.pos === 1)?.driver ?? rows.find((x) => x.grid === 1)?.driver ?? null;
            const [q1, q2] = [...quali].sort((a, b) => a.pos - b.pos);
            const poleGap = q1?.best && q2?.best && q1.driver === pole ? { second: q2.driver, ms: q2.best - q1.best } : null;
            const sprintTime = session(gp, 'sprintRace')?.time;
            const sprintDate = sprintTime?.kind === 'datetime' ? sprintTime.start.slice(0, 10) : sprintTime?.kind === 'date' ? sprintTime.date : null;
            // Where it's held: GP → circuit → city → country, as the old page does
            // (the Bahrain GP in Malaysia is Malaysian)
            const city = gp.circuitId ? ctx.circuits[gp.circuitId]?.location.city : undefined;
            const country = (city && ctx.cities[city]?.country) ?? ctx.grandsPrix[gp.id]?.country;
            const name = gp.name.replace(/^Formula 1 /, '');
            return {
                round: gp.round ?? 0, id: gp.id, code: ctx.grandsPrix[gp.id]?.code ?? (country && ctx.countries[country]?.code) ?? gp.id.slice(0, 3).toUpperCase(), sprintDate: sprint.length ? sprintDate : null, poleGap, name, short: name.replace(/ Grand Prix$/, ''), date: dayOf(gp),
                iso: (country && ctx.countries[country]?.isoCode) || null,
                raced: race.length > 0, sprint: gp.sprint, rows, pole, field,
            };
        });
    const pts = new Map<string, number>();
    const gained = new Map<string, number>();
    for (const r of rounds) for (const x of r.rows) {
        pts.set(x.driver, (pts.get(x.driver) ?? 0) + x.pts);
        if (x.grid && !x.out && x.grid > x.pos) gained.set(x.driver, (gained.get(x.driver) ?? 0) + (x.grid - x.pos));
    }
    const gainers = [...gained].sort((a, b) => b[1] - a[1]);
    return {
        rounds,
        standing: new Map([...pts].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1])),
        pts,
        gained,
        gainedRank: new Map(gainers.map(([id], i) => [id, i + 1])),
        best: gainers[0] ? { id: gainers[0][0], places: gainers[0][1] } : null,
        done: rounds.every((r) => r.raced),
        hasGrid: rounds.some((r) => r.rows.some((x) => x.grid)),
        pointsTo: Math.max(0, ...rounds.flatMap((r) => r.rows.filter((x) => !x.out && x.racePts > 0).map((x) => x.pos))),
    };
}

// ---- Everything shared by the profiles, read once per build ----------------

export type Context = {
    readonly repoRoot: URL;
    readonly latest: number;
    readonly teams: ReturnType<typeof loadTeams>;
    readonly drivers: ReturnType<typeof loadDrivers>;
    readonly careers: RawCareers;
    readonly countries: ReturnType<typeof loadCountries>;
    readonly cities: ReturnType<typeof loadCities>;
    readonly circuits: ReturnType<typeof loadCircuits>;
    readonly grandsPrix: ReturnType<typeof loadGrandsPrix>;
    readonly champions: ReadonlyMap<number, string>;
    readonly seasons: ReadonlyMap<number, Season>;
    readonly boards: Readonly<Record<RankStat, readonly BoardRow[]>>;
};

let cached: Context | null = null;

function context(dataDir: URL): Context {
    if (cached) return cached;
    const careers = loadCareers(dataDir);
    const index = loadSeasonsIndex(dataDir).seasons;
    const base = {
        repoRoot: new URL('../', dataDir),
        latest: loadLatestYear(dataDir),
        teams: loadTeams(dataDir),
        drivers: loadDrivers(dataDir),
        careers,
        countries: loadCountries(dataDir),
        cities: loadCities(dataDir),
        circuits: loadCircuits(dataDir),
        grandsPrix: loadGrandsPrix(dataDir),
        champions: new Map(index.flatMap((s) => (s.driverChampion ? [[s.year, s.driverChampion.id] as const] : []))),
    };
    const seasons = new Map<number, Season>();
    const partial = { ...base, seasons, boards: {} as Context['boards'] };
    for (const { year } of index) seasons.set(year, buildSeason(dataDir, year, partial));
    // All-time boards, ranked as the old page ranks them: the value, then who
    // got there first, then the id; the logo is the team of his last one
    const teamOf = (teamId: string | undefined): DriverTeam | null => (teamId
        ? { id: teamId, name: base.teams[teamId]?.name ?? titleCase(teamId), color: base.teams[teamId]?.color ?? null, logo: teamLogo(base.repoRoot, teamId) }
        : null);
    const boards = {} as Record<RankStat, BoardRow[]>;
    for (const k of [...BOARD_STATS, 'titles'] as const) {
        const val = (id: string) => (k === 'titles' ? careers[id]!.titleYears.length : careers[id]![k]);
        const when = (id: string) => careers[id]!.achievedAt[k] ?? careers[id]!.debut;
        const last = tally(partial, k);
        boards[k] = Object.keys(careers)
            .sort((a, b) => val(b) - val(a) || when(a).localeCompare(when(b)) || a.localeCompare(b))
            .map((id, i) => ({ id, ...nameOf(base.drivers, id), value: round1(val(id)), rank: i + 1, team: teamOf(last.get(id)?.team) }));
    }
    cached = { ...partial, boards };
    return cached;
}

const titleCase = (slug: string) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Name from drivers.json, or from the id for the drivers it doesn't have. */
function nameOf(drivers: ReturnType<typeof loadDrivers>, id: string): { first: string; last: string } {
    const d = drivers[id];
    if (d) return { first: d.firstName, last: d.lastName };
    const parts = titleCase(id).split(' ');
    return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) ?? id };
}

/** Five rows of a ranked board around one driver: the two ahead and the two
 *  behind, slid to stay on the board (the top five for 1st to 3rd, the last
 *  five at the foot). */
function around<T extends { readonly id: string }>(board: readonly T[], id: string): T[] {
    const i = board.findIndex((r) => r.id === id);
    const start = Math.max(0, Math.min(i - 2, board.length - 5));
    return board.slice(start, start + 5);
}

/** Every driver with a profile: everyone in careers.json. */
export function driverIds(dataDir: URL): string[] {
    return Object.keys(context(dataDir).careers);
}

/** The season the profile opens on: the one on now, or the best he finished (position, wins, latest). */
export function featuredSeason(D: Pick<DriverProfile, 'active' | 'seasons'>): DriverSeason {
    const best = [...D.seasons].filter((s) => s.done)
        .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99) || b.wins - a.wins || b.year - a.year)[0];
    return D.active ? D.seasons.at(-1)! : best ?? D.seasons.at(-1)!;
}

/** One driver's profile; Grand Prix and country names in the page's language. */
export function buildDriver(dataDir: URL, id: string, locale: string): DriverProfile {
    const ctx = context(dataDir);
    const names = namesIn(dataDir, locale);
    const c = ctx.careers[id];
    if (!c) throw new Error(`No career for ${id}`);
    const d = ctx.drivers[id];
    const country = d ? ctx.countries[d.nationality] : undefined;
    const teamOf = (teamId: string): DriverTeam => ({
        id: teamId, name: ctx.teams[teamId]?.name ?? titleCase(teamId), color: ctx.teams[teamId]?.color ?? null, logo: teamLogo(ctx.repoRoot, teamId),
    });
    // "Gran Premio de Australia" and "GP de Australia" in Spanish
    const fullOf = (r: Round) => names.gp(r.id, r.name);
    const gpOf = (r: Round) => fullOf(r).replace(/Grand Prix|Gran Premio/, 'GP');
    // "Australian Grand Prix" → "Australian", "Gran Premio de Australia" → "Australia"
    const shortOf = (r: Round) => fullOf(r).replace(/\s*Grand Prix\b/, '').replace(/^Gran Premio\s+(de\s+)?/, '').trim();
    const seasonOf = (year: number) => ctx.seasons.get(year)!;

    const numberYears: { number: number; years: number[] }[] = [];
    for (const year of c.seasons) for (const r of seasonOf(year).rounds) {
        const n = r.rows.find((x) => x.driver === id)?.number;
        if (n === undefined) continue;
        const entry = numberYears.find((e) => e.number === n) ?? numberYears[numberYears.push({ number: n, years: [] }) - 1]!;
        if (!entry.years.includes(year)) entry.years.push(year);
    }
    const numbers = numberYears.map((e) => e.number);

    // Home races: the latest calendar's Grands Prix in the driver's country
    // (owner, 18/10: "cuántas carreras tiene actualmente el país de su nacionalidad")
    const homeRaces = d ? seasonOf(ctx.latest).rounds.filter((r) => ctx.grandsPrix[r.id]?.country === d.nationality).map(gpOf) : [];

    const seasons = c.seasons.map((year): DriverSeason => {
        const S = seasonOf(year);
        const rounds = S.rounds.map((r): DriverRound => {
            const x = r.rows.find((row) => row.driver === id);
            const common = { round: r.round, full: fullOf(r), gp: gpOf(r), short: shortOf(r), iso: r.iso, field: r.field, sprintWeekend: r.sprint };
            const blank = { team: null, grid: null, pos: null, out: null, pts: 0, racePts: 0, sprint: null, fl: false, pole: false };
            if (!r.raced) return { ...common, ...blank, upcoming: true, missed: false };
            if (!x) return { ...common, ...blank, upcoming: false, missed: true };
            return {
                ...common, upcoming: false, missed: false, team: x.team, grid: x.grid, pos: x.pos, out: x.out,
                pts: x.pts, racePts: x.racePts, sprint: x.sprint, fl: x.fl, pole: r.pole === id,
            };
        });
        const raced = S.rounds.flatMap((r) => {
            const x = r.rows.find((row) => row.driver === id);
            return x ? [{ r, x, mate: r.rows.find((y) => y.team === x.team && y.driver !== id) ?? null }] : [];
        });
        // Head to head with the teammate who raced most alongside
        const together = new Map<string, number>();
        for (const { mate } of raced) if (mate) together.set(mate.driver, (together.get(mate.driver) ?? 0) + 1);
        const mateId = [...together].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        let mate: DriverMate | null = null;
        if (mateId) {
            const race: [number, number] = [0, 0], quali: [number, number] = [0, 0], pts: [number, number] = [0, 0];
            const duels = raced.filter((e) => e.mate?.driver === mateId);
            for (const { x, mate: m } of duels) {
                const me = x.out ? 99 : x.pos, him = m!.out ? 99 : m!.pos;
                if (me !== him) race[me < him ? 0 : 1]++;
                // Qualifying, pure: the session's own positions, no grid penalties
                if (x.quali && m!.quali) quali[x.quali < m!.quali ? 0 : 1]++;
                pts[0] += x.pts; pts[1] += m!.pts;
            }
            mate = { id: mateId, ...nameOf(ctx.drivers, mateId), race, quali, pts: [round1(pts[0]), round1(pts[1])], together: duels.length };
        }
        const done = S.done;
        const table = [...S.pts].sort((a, b) => b[1] - a[1]);
        const rivalId = table[0]?.[0] === id ? table[1]?.[0] : table[0]?.[0];
        const car = new Map(S.rounds.flatMap((r) => r.rows.map((x) => [x.driver, x.team] as const))); // the team of each one's last race
        const lead = table[0]?.[1] ?? 0;
        const standings = around(table.map(([d, p], k) => ({ id: d, pos: k + 1, last: nameOf(ctx.drivers, d).last, team: car.has(d) ? teamOf(car.get(d)!) : null, pts: round1(p), gap: round1(lead - p), move: 0, me: d === id })), id);
        return {
            year, done, hasGrid: S.hasGrid, pointsTo: S.pointsTo,
            teams: [...new Set(raced.map((e) => e.x.team))].map(teamOf),
            pos: S.standing.get(id) ?? null,
            pts: round1(S.pts.get(id) ?? 0),
            wins: raced.filter((e) => !e.x.out && e.x.pos === 1).length,
            podiums: raced.filter((e) => !e.x.out && e.x.pos <= 3).length,
            poles: raced.filter((e) => e.r.pole === id).length,
            fls: raced.filter((e) => e.x.fl).length,
            gained: S.gained.get(id) ?? 0,
            gainedRank: S.gainedRank.get(id) ?? null,
            racecraft: S.best ? { id: S.best.id, ...nameOf(ctx.drivers, S.best.id), places: S.best.places } : null,
            mate,
            champion: done && ctx.champions.get(year) === id,
            rival: rivalId ? { id: rivalId, ...nameOf(ctx.drivers, rivalId), pts: round1(S.pts.get(rivalId) ?? 0) } : null,
            table: standings.map(({ id: _, ...r }) => r),
            rounds,
        };
    });

    // A milestone's race: by its short English name in that year, then by date
    const milestones = c.milestones.map((m): DriverMilestone => {
        const rounds = seasonOf(m.year).rounds;
        const r = rounds.find((x) => x.short === m.gp) ?? rounds.find((x) => x.date === m.date) ?? null;
        return {
            label: m.label, year: m.year, date: m.date, round: r?.round ?? null, gp: r ? gpOf(r) : `${m.gp} GP`,
            team: m.team, pos: m.pos, grid: m.grid, streak: m.streakLength ?? null,
        };
    });

    const rankOf = (k: RankStat) => ctx.boards[k].find((x) => x.id === id)!.rank;
    return {
        id, ...nameOf(ctx.drivers, id),
        code: d?.shortName ?? null,
        nationality: d && country ? names.country(d.nationality, country.name) : null,
        iso: country?.isoCode ?? null,
        born: d?.dateOfBirth ?? null,
        died: d?.dateOfDeath ?? null,
        number: c.number,
        numbers,
        numberYears,
        debut: c.debut,
        active: c.seasons.at(-1) === ctx.latest,
        homeRaces,
        latest: ctx.latest,
        // The photos are the current grid's, filed by last name: only for a
        // driver on it, or Jos Verstappen would get Max's
        photo: c.seasons.at(-1) === ctx.latest ? driverPhoto(ctx.repoRoot, id) : null,
        cutout: c.seasons.at(-1) === ctx.latest ? driverCutout(ctx.repoRoot, id) : null,
        totals: {
            races: c.races, points: round1(c.points), wins: c.wins, podiums: c.podiums, poles: c.poles, fastestLaps: c.fastestLaps,
            titles: c.titleYears.length, titleYears: c.titleYears, seasons: c.seasons.length,
        },
        ranks: Object.fromEntries([...BOARD_STATS, 'titles'].map((k) => [k, rankOf(k as RankStat)])) as Record<RankStat, number>,
        eras: c.eras.map((e) => ({ ...teamOf(e.teamId), name: ctx.teams[e.teamId]?.name ?? e.team, from: e.from, to: e.to, races: e.races, wins: e.wins, podiums: e.podiums, points: e.points, best: e.best, titles: e.titles })),
        milestones,
        journey: buildJourney(ctx, id, { gpOf, shortOf, teamOf, lastOf: (x) => nameOf(ctx.drivers, x).last }),
        seasons,
        boards: Object.fromEntries(BOARD_STATS.map((k) => [k, around(ctx.boards[k], id)])) as Record<BoardStat, BoardRow[]>,
        mine: Object.fromEntries([...BOARD_STATS, 'titles'].map((k) => [k, ctx.boards[k as RankStat].find((x) => x.id === id)!])) as Record<RankStat, BoardRow>,
        onRecord: Object.keys(ctx.careers).length,
        champions: c.titleYears.length === 0 ? [] : (() => {
            return around(ctx.boards.titles.filter((r) => r.value > 0), id).map((r) => ({ ...r, titles: ctx.careers[r.id]!.titles.map((t) => ({ year: t.year, team: teamOf(t.teamId) })) }));
        })(),
    };
}
