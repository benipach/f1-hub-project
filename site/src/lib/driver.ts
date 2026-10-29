// What a driver's profile needs, prepared at build time from data/
// (_design/DESIGN.md, "Driver profile"; the approved mockup is
// _design/driver/index.html in the owner's working copy).
//
// Every number comes from the season files, careers.json and
// seasons-index.json, read through the normalized layer: nothing typed by
// hand except the few personal facts in driver-facts.ts. The seasons are read
// once per build and shared by every driver's page.

import { loadCareers, loadCircuits, loadCities, loadCountries, loadDrivers, loadGrandsPrix, loadLatestYear, loadSeason, loadSeasonsIndex, loadTeams } from '@f1hub/shared/data/load';
import type { RawCareers } from '@f1hub/shared/data/raw';
import type { GrandPrix, SessionOf } from '@f1hub/shared/data/season';
import { driverPhoto, namesIn, teamLogo } from './home';

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
    /** ISO code of the country where it's held, for the flag. */
    readonly iso: string | null;
    readonly upcoming: boolean;
    readonly missed: boolean;
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

export type BoardRow = { readonly id: string; readonly first: string; readonly last: string; readonly value: number; readonly rank: number };

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
    readonly debut: string;
    readonly active: boolean;
    /** The latest season's Grands Prix held in the driver's country. */
    readonly homeRaces: readonly string[];
    readonly latest: number;
    readonly photo: string | null;
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
    readonly seasons: readonly DriverSeason[];
    /** The all-time top five of each board stat. */
    readonly boards: Readonly<Record<BoardStat, readonly BoardRow[]>>;
};

// ---- A season's rounds, once per build -------------------------------------

type Row = {
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

type Round = {
    readonly round: number;
    readonly id: string;
    /** The English name without "Grand Prix": careers.json's milestones use it. */
    readonly short: string;
    readonly name: string;
    readonly date: string;
    readonly iso: string | null;
    readonly raced: boolean;
    readonly rows: readonly Row[];
    readonly pole: string | null;
    readonly field: number;
};

type Season = {
    readonly rounds: readonly Round[];
    readonly standing: ReadonlyMap<string, number>;
    readonly pts: ReadonlyMap<string, number>;
    readonly gained: ReadonlyMap<string, number>;
    readonly gainedRank: ReadonlyMap<string, number>;
    readonly best: { readonly id: string; readonly places: number } | null;
    readonly done: boolean;
    readonly hasGrid: boolean;
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
            // Where it's held: GP → circuit → city → country, as the old page does
            // (the Bahrain GP in Malaysia is Malaysian)
            const city = gp.circuitId ? ctx.circuits[gp.circuitId]?.location.city : undefined;
            const country = (city && ctx.cities[city]?.country) ?? ctx.grandsPrix[gp.id]?.country;
            const name = gp.name.replace(/^Formula 1 /, '');
            return {
                round: gp.round ?? 0, id: gp.id, name, short: name.replace(/ Grand Prix$/, ''), date: dayOf(gp),
                iso: (country && ctx.countries[country]?.isoCode) || null,
                raced: race.length > 0, rows, pole, field,
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
    };
}

// ---- Everything shared by the profiles, read once per build ----------------

type Context = {
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
    // got there first, then the id
    const boards = {} as Record<RankStat, BoardRow[]>;
    for (const k of [...BOARD_STATS, 'titles'] as const) {
        const val = (id: string) => (k === 'titles' ? careers[id]!.titleYears.length : careers[id]![k]);
        const when = (id: string) => careers[id]!.achievedAt[k] ?? careers[id]!.debut;
        boards[k] = Object.keys(careers)
            .sort((a, b) => val(b) - val(a) || when(a).localeCompare(when(b)) || a.localeCompare(b))
            .map((id, i) => ({ id, ...nameOf(base.drivers, id), value: round1(val(id)), rank: i + 1 }));
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

/** Every driver with a profile: everyone in careers.json. */
export function driverIds(dataDir: URL): string[] {
    return Object.keys(context(dataDir).careers);
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
    const seasonOf = (year: number) => ctx.seasons.get(year)!;

    const numbers: number[] = [];
    for (const year of c.seasons) for (const r of seasonOf(year).rounds) {
        const n = r.rows.find((x) => x.driver === id)?.number;
        if (n !== undefined && !numbers.includes(n)) numbers.push(n);
    }

    // Home races: the latest calendar's Grands Prix in the driver's country
    // (owner, 18/10: "cuántas carreras tiene actualmente el país de su nacionalidad")
    const homeRaces = d ? seasonOf(ctx.latest).rounds.filter((r) => ctx.grandsPrix[r.id]?.country === d.nationality).map(gpOf) : [];

    const seasons = c.seasons.map((year): DriverSeason => {
        const S = seasonOf(year);
        const rounds = S.rounds.map((r): DriverRound => {
            const x = r.rows.find((row) => row.driver === id);
            const common = { round: r.round, full: fullOf(r), gp: gpOf(r), iso: r.iso, field: r.field };
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
        return {
            year, done, hasGrid: S.hasGrid,
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
        debut: c.debut,
        active: c.seasons.at(-1) === ctx.latest,
        homeRaces,
        latest: ctx.latest,
        // The photos are the current grid's, filed by last name: only for a
        // driver on it, or Jos Verstappen would get Max's
        photo: c.seasons.at(-1) === ctx.latest ? driverPhoto(ctx.repoRoot, id) : null,
        totals: {
            races: c.races, points: round1(c.points), wins: c.wins, podiums: c.podiums, poles: c.poles, fastestLaps: c.fastestLaps,
            titles: c.titleYears.length, titleYears: c.titleYears, seasons: c.seasons.length,
        },
        ranks: Object.fromEntries([...BOARD_STATS, 'titles'].map((k) => [k, rankOf(k as RankStat)])) as Record<RankStat, number>,
        eras: c.eras.map((e) => ({ ...teamOf(e.teamId), name: ctx.teams[e.teamId]?.name ?? e.team, from: e.from, to: e.to, races: e.races, wins: e.wins, podiums: e.podiums, points: e.points, best: e.best, titles: e.titles })),
        milestones,
        seasons,
        boards: Object.fromEntries(BOARD_STATS.map((k) => [k, ctx.boards[k].slice(0, 5)])) as Record<BoardStat, BoardRow[]>,
    };
}
