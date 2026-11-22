// The driver profile's section 6, the milestones (approved 22/11/2026, mockup
// in the owner's copy: _design/driver-f1/journey.html, made by gen-journey.cjs).
//
// careers.json lists the milestones; each kind gets its own drawing ("cada uno
// con su distintivo"), so each carries what its drawing needs, worked out here
// from the seasons already read for the profile (lib/driver.ts context):
//   streak  the run of wins, race by race
//   title   where it was decided, the runner-up, every round he won
//   firsts  the firsts of one race together: age, grid against finish, the pole gap
//   teamWin a team's first or last win, and what came before and after it there
//   best    best result at a team he never won with, and every time he got it
//   record  the all-time table on the day he took a record, and what became of it
// No "since 1990" anywhere (owner, 22/11): the all-time tables count every
// season on file, so they fill in by themselves as older seasons come in.

import type { DriverTeam } from './driver';
import type { Context, Round, Row } from './driver';

/** What every milestone row shows on the left: the day, his race number, the Grand Prix, the team. */
export type JourneyBase = {
    readonly date: string;
    /** His race number on that day (his 1st start is 1). */
    readonly raceNo: number;
    readonly gp: string;
    readonly iso: string | null;
    readonly team: DriverTeam;
};

/** One race of his, as the hover cards and drawings show it. */
export type JourneyRace = {
    readonly year: number;
    readonly round: number;
    readonly date: string;
    readonly gp: string;
    /** "Miami" ("Miami" in Spanish too): the name alone, for tight labels. */
    readonly short: string;
    readonly code: string;
    readonly iso: string | null;
    readonly grid: number | null;
    readonly pos: number;
    readonly out: string | null;
    readonly pts: number;
    readonly sprint: number | null;
    readonly won: boolean;
};

/** One line of the championship after a race: gap to the leader, places moved in that race (0 = same). */
export type StandingRow = { readonly pos: number; readonly last: string; readonly team: DriverTeam | null; readonly pts: number; readonly gap: number; readonly move: number; readonly me: boolean };

export type JourneyItem = JourneyBase & (
    | { readonly kind: 'streak'; readonly length: number; readonly run: readonly JourneyRace[]; readonly startNo: number; readonly startDate: string }
    | {
        readonly kind: 'title';
        readonly no: number;
        readonly pts: number;
        readonly wins: number;
        /** Where it was decided: the round's index in `rounds`, in a sprint or not, and races still to go. */
        readonly at: number;
        readonly sprint: boolean;
        readonly toGo: number;
        readonly rival: { readonly last: string; readonly team: DriverTeam | null; readonly margin: number };
        /** After each race: the championship around him (the one ahead, him, the one behind; the top three when he leads or is 2nd). */
        readonly rounds: readonly (JourneyRace & { readonly table: readonly StandingRow[] })[];
    }
    | {
        readonly kind: 'firsts';
        /** careers.json's labels, best first: "First win", "First podium". */
        readonly labels: readonly string[];
        readonly age: { readonly years: number; readonly days: number } | null;
        readonly field: number;
        readonly grid: number | null;
        readonly pos: number;
        readonly out: string | null;
        readonly pts: number;
        readonly pole: { readonly over: string; readonly ms: number } | null;
    }
    | {
        readonly kind: 'teamWin';
        readonly first: boolean;
        /** His latest win while he still races. */
        readonly latest: boolean;
        readonly winNo: number;
        readonly wins: number;
        /** Races there before and after this one. */
        readonly before: number;
        readonly after: number;
        /** Still at that team: "no win yet". */
        readonly still: boolean;
        /** Where this win sits along the spell, 0 to 1. */
        readonly x: number;
    }
    | { readonly kind: 'best'; readonly pos: number; readonly races: number; readonly still: boolean; readonly times: readonly JourneyRace[] }
    | {
        readonly kind: 'record';
        readonly stat: string;
        readonly broke: boolean;
        readonly prev: { readonly last: string; readonly value: number } | null;
        readonly table: readonly { readonly id: string; readonly last: string; readonly team: DriverTeam | null; readonly value: number; readonly rank: number }[];
        readonly then: { readonly current: true; readonly peak: number } | { readonly current: false; readonly peak: number; readonly by: string; readonly gp: string; readonly year: number } | null;
    }
    | { readonly kind: 'plain'; readonly label: string; readonly pos: number; readonly grid: number | null }
);

export type Journey = {
    readonly years: readonly { readonly year: number; readonly items: readonly JourneyItem[] }[];
    /** Milestones as careers.json counts them (the firsts of one race are one row, but count apart). */
    readonly count: number;
    readonly from: number;
    readonly to: number;
    /** The header: how many races each first took, and the first title. */
    readonly facts: readonly { readonly label: string; readonly raceNo: number; readonly gp: string; readonly year: number }[];
    readonly firstTitle: { readonly year: number; readonly season: number } | null;
};

const FIRSTS = ['First win', 'First pole', 'First podium', 'First points', 'Debut'];
const TEAM_WINS = ['First win with the team', 'Last win with the team', 'Last win'];

/** What buildDriver lends the journey: names in the page's language, teams as DriverTeam. */
export type JourneyHelpers = {
    readonly gpOf: (r: Round) => string;
    readonly shortOf: (r: Round) => string;
    readonly teamOf: (teamId: string) => DriverTeam;
    readonly lastOf: (id: string) => string;
};

type Ran = { readonly year: number; readonly r: Round; readonly x: Row };

export function buildJourney(ctx: Context, id: string, h: JourneyHelpers): Journey {
    const c = ctx.careers[id]!;
    const active = c.seasons.at(-1) === ctx.latest;
    // Every race he started, in order
    const ran: Ran[] = c.seasons.flatMap((year) => ctx.seasons.get(year)!.rounds.flatMap((r) => {
        const x = r.rows.find((row) => row.driver === id);
        return x ? [{ year, r, x }] : [];
    }));
    const raceNo = (date: string) => ran.filter((e) => e.r.date <= date).length;
    const race = (e: Ran): JourneyRace => ({
        year: e.year, round: e.r.round, date: e.r.date, gp: h.gpOf(e.r), short: h.shortOf(e.r), code: e.r.code, iso: e.r.iso,
        grid: e.x.grid, pos: e.x.pos, out: e.x.out, pts: e.x.pts, sprint: e.x.sprint?.pos ?? null, won: !e.x.out && e.x.pos === 1,
    });
    const find = (m: { year: number; date: string; gp: string }) =>
        ran.find((e) => e.year === m.year && e.r.date === m.date) ?? ran.find((e) => e.year === m.year && e.r.short === m.gp);
    const eraOf = (m: { team: string; year: number }) => c.eras.find((e) => e.team === m.team && e.seasons.includes(m.year)) ?? c.eras.find((e) => e.seasons.includes(m.year))!;
    const baseOf = (m: { year: number; date: string; gp: string; iso: string | null; team: string }, e = find(m)): JourneyBase => ({
        date: e?.r.date ?? m.date, raceNo: raceNo(e?.r.date ?? m.date), gp: e ? h.gpOf(e.r) : `${m.gp} GP`,
        iso: e?.r.iso ?? m.iso, team: h.teamOf(eraOf(m).teamId),
    });
    // His races at one team in one spell (a season split between two teams keeps only this one's)
    const spellOf = (m: { team: string; year: number }) => {
        const era = eraOf(m);
        const shared = (y: number) => c.eras.filter((e) => e.seasons.includes(y)).length > 1;
        const own = new Set(ran.filter((e) => era.seasons.includes(e.year) && !shared(e.year)).map((e) => e.x.team));
        const anchor = ran.find((e) => era.seasons.includes(e.year) && (!shared(e.year) || own.size === 0))?.x.team;
        if (!own.size && anchor) own.add(anchor);
        return { era, races: ran.filter((e) => era.seasons.includes(e.year) && (!shared(e.year) || own.has(e.x.team))) };
    };

    // careers.json names a race by its short English name: find it to name it in the page's language
    const gpIn = (year: number, short: string, date: string) => {
        const r = ctx.seasons.get(year)?.rounds.find((x) => x.date === date || x.short === short);
        return r ? h.gpOf(r) : `${short} GP`;
    };
    const ms = [...c.milestones].sort((a, b) => a.date.localeCompare(b.date) || (a.label === 'Debut' ? -1 : 0));
    const items: (JourneyItem & { year: number })[] = [];
    const done = new Set<string>();

    for (const m of ms) {
        const e = find(m);
        const base = baseOf(m, e);
        const title = /^(\d+)\w* World Title$/.exec(m.label);

        if (FIRSTS.includes(m.label)) {
            if (done.has(m.date)) continue;
            done.add(m.date);
            const labels = ms.filter((x) => FIRSTS.includes(x.label) && x.date === m.date).map((x) => x.label).sort((a, b) => FIRSTS.indexOf(a) - FIRSTS.indexOf(b));
            const born = ctx.drivers[id]?.dateOfBirth;
            let age = null;
            if (born) {
                const b = new Date(born), on = new Date(base.date);
                const bday = (y: number) => Date.UTC(y, b.getUTCMonth(), b.getUTCDate());
                let years = on.getUTCFullYear() - b.getUTCFullYear();
                if (on.getTime() < bday(on.getUTCFullYear())) years--;
                age = { years, days: Math.round((on.getTime() - bday(b.getUTCFullYear() + years)) / 864e5) };
            }
            const pole = e && e.r.pole === id && e.r.poleGap ? { over: h.lastOf(e.r.poleGap.second), ms: e.r.poleGap.ms } : null;
            items.push({
                ...base, year: m.year, kind: 'firsts', labels, age, pole,
                field: e ? Math.max(e.r.field, ...e.r.rows.map((x) => x.grid ?? 0)) : 20,
                grid: e?.x.grid ?? m.grid, pos: e?.x.pos ?? m.pos, out: e?.x.out ?? null, pts: e?.x.pts ?? 0,
            });
            continue;
        }

        if (m.label === 'Longest winning streak' && m.streakLength) {
            const end = base.raceNo, start = end - m.streakLength + 1;
            const run = ran.slice(start - 1, end).map(race);
            items.push({ ...base, year: m.year, kind: 'streak', length: m.streakLength, run, startNo: start, startDate: run[0]?.date ?? base.date });
            continue;
        }

        if (title) {
            const S = ctx.seasons.get(m.year)!;
            const rounds = S.rounds.filter((r) => r.raced);
            // Every sprint and race in order; it's decided after the first one
            // where his lead beats every point still to be had
            const ev = rounds.flatMap((r) => [
                ...(r.sprintDate ? [{ r, sprint: true, pts: (x: Row) => x.sprint?.pts ?? 0 }] : []),
                { r, sprint: false, pts: (x: Row) => x.racePts },
            ]);
            const most = { sprint: 0, race: 0 };
            for (const v of ev) for (const x of v.r.rows) { const k = v.sprint ? 'sprint' : 'race'; most[k] = Math.max(most[k], v.pts(x)); }
            const tot = new Map<string, number>(), car = new Map<string, string>();
            const after = new Map<string, StandingRow[]>();
            let was = new Map<string, number>();
            let at: (typeof ev)[number] | null = null;
            ev.forEach((v, i) => {
                for (const x of v.r.rows) { tot.set(x.driver, (tot.get(x.driver) ?? 0) + v.pts(x)); car.set(x.driver, x.team); }
                const st = [...tot].sort((a, b) => b[1] - a[1]);
                if (!v.sprint) {
                    const me = st.findIndex(([d]) => d === id);
                    const from = Math.max(0, Math.min(me - 1, st.length - 3));
                    const lead = st[0]?.[1] ?? 0;
                    after.set(v.r.id, st.slice(from, from + 3).map(([d, p]) => {
                        const pos = st.findIndex(([x]) => x === d) + 1;
                        return { pos, last: h.lastOf(d), team: car.has(d) ? h.teamOf(car.get(d)!) : null, pts: Math.round(p * 10) / 10, gap: Math.round((lead - p) * 10) / 10, move: was.has(d) ? was.get(d)! - pos : 0, me: d === id };
                    }));
                    was = new Map(st.map(([d], k) => [d, k + 1]));
                }
                if (at) return;
                const left = ev.slice(i + 1).reduce((a, x) => a + (x.sprint ? most.sprint : most.race), 0);
                if (st[0]?.[0] === id && st[0][1] - (st[1]?.[1] ?? 0) > left) at = v;
            });
            const decided = (at ?? ev.at(-1)!) as (typeof ev)[number];
            const idx = rounds.indexOf(decided.r);
            const st = [...tot].sort((a, b) => b[1] - a[1]);
            const second = st.find(([d]) => d !== id);
            const rTeam = second ? ctx.careers[second[0]]?.eras.find((x) => x.seasons.includes(m.year))?.teamId : undefined;
            const mine = (r: Round) => r.rows.find((x) => x.driver === id);
            items.push({
                ...base, year: m.year, kind: 'title', no: Number(title[1]),
                date: decided.sprint ? decided.r.sprintDate ?? decided.r.date : decided.r.date, raceNo: raceNo(decided.r.date),
                gp: h.gpOf(decided.r), iso: decided.r.iso,
                pts: Math.round((tot.get(id) ?? 0) * 10) / 10,
                wins: rounds.filter((r) => { const x = mine(r); return x && !x.out && x.pos === 1; }).length,
                at: idx, sprint: decided.sprint, toGo: rounds.length - idx - 1 + (decided.sprint ? 1 : 0),
                rival: { last: second ? h.lastOf(second[0]) : '', team: rTeam ? h.teamOf(rTeam) : null, margin: Math.round(((tot.get(id) ?? 0) - (second?.[1] ?? 0)) * 10) / 10 },
                rounds: rounds.map((r) => {
                    const x = mine(r);
                    return {
                        year: m.year, round: r.round, date: r.date, gp: h.gpOf(r), short: h.shortOf(r), code: r.code, iso: r.iso,
                        grid: x?.grid ?? null, pos: x?.pos ?? 0, out: x ? x.out : 'DNS', pts: x?.pts ?? 0, sprint: x?.sprint?.pos ?? null,
                        won: !!x && !x.out && x.pos === 1, table: after.get(r.id) ?? [],
                    };
                }),
            });
            continue;
        }

        if (TEAM_WINS.includes(m.label)) {
            const { races } = spellOf(m);
            const i = races.findIndex((r) => r.r.date === base.date);
            const wins = races.filter((r) => !r.x.out && r.x.pos === 1);
            const era = eraOf(m);
            items.push({
                ...base, year: m.year, kind: 'teamWin', first: m.label === 'First win with the team', latest: m.label === 'Last win' && active,
                winNo: wins.findIndex((r) => r.r.date === base.date) + 1, wins: wins.length,
                before: Math.max(0, i), after: races.length - Math.max(0, i) - 1,
                still: active && era === c.eras.at(-1) && era.seasons.includes(ctx.latest),
                x: (Math.max(0, i) + 0.5) / Math.max(1, races.length),
            });
            continue;
        }

        if (m.label === 'Best result in the team') {
            const { era, races } = spellOf(m);
            items.push({
                ...base, year: m.year, kind: 'best', pos: m.pos, races: races.length,
                still: active && era === c.eras.at(-1) && era.seasons.includes(ctx.latest),
                times: races.filter((r) => !r.x.out && r.x.pos === m.pos).map(race),
            });
            continue;
        }

        if (m.record && /all-time record/.test(m.label)) {
            const R = m.record;
            const dayBefore = new Date(Date.parse(base.date) - 864e5).toISOString().slice(0, 10);
            const now = ranked(tally(ctx, R.key, base.date)), before = ranked(tally(ctx, R.key, dayBefore));
            const prev = before.find(([d]) => d !== id);
            const top = now.slice(0, 3);
            if (!top.some(([d]) => d === id)) { const me = now.find(([d]) => d === id); if (me) top[2] = me; }
            items.push({
                ...base, year: m.year, kind: 'record', stat: R.key, broke: R.kind === 'broke',
                prev: prev ? { last: h.lastOf(prev[0]), value: prev[1].value } : null,
                table: top.map(([d, v]) => ({ id: d, last: h.lastOf(d), team: h.teamOf(v.team), value: Math.round(v.value * 10) / 10, rank: now.findIndex(([x]) => x === d) + 1 })),
                then: R.current && R.peak !== undefined ? { current: true, peak: R.peak }
                    : R.after && R.peak !== undefined ? { current: false, peak: R.peak, by: h.lastOf(R.after.by), gp: gpIn(R.after.year, R.after.gp, R.after.date), year: R.after.year } : null,
            });
            continue;
        }

        items.push({ ...base, year: m.year, kind: 'plain', label: m.label, pos: m.pos, grid: m.grid });
    }

    const firstOf = (label: string) => ms.find((m) => m.label === label);
    const facts = ['First points', 'First podium', 'First win', 'First pole'].flatMap((label) => {
        const m = firstOf(label);
        return m ? [{ label, raceNo: raceNo(m.date), gp: baseOf(m).gp, year: m.year }] : [];
    });
    const t1 = ms.find((m) => /^1st World Title$/.test(m.label));
    const years = [...new Set(items.map((i) => i.year))];
    return {
        years: years.map((year) => ({ year, items: items.filter((i) => i.year === year) })),
        count: c.milestones.length,
        from: c.seasons[0]!,
        to: c.seasons.at(-1)!,
        facts,
        firstTitle: t1 ? { year: t1.year, season: c.seasons.indexOf(t1.year) + 1 } : null,
    };
}

// One all-time stat on a day, from every season on file, counted as
// build-careers counts it (a DNS is no start, points take the sprints in):
// each driver's total and the team he last added to it with. The career
// tables and the record milestones both read it, so a logo always means
// the same thing: where his last one came from
export type Tally = Map<string, { value: number; team: string }>;
export function tally(src: Pick<Context, 'seasons' | 'careers'>, key: string, until = '9999'): Tally {
    const out: Tally = new Map();
    const add = (d: string, v: number, team: string) => { if (v) out.set(d, { value: (out.get(d)?.value ?? 0) + v, team }); };
    if (key === 'titles') {
        for (const [d, c] of Object.entries(src.careers)) for (const t of c.titles) if (`${t.year}-12-31` <= until) add(d, 1, t.teamId);
        return out;
    }
    const gain = (r: Round, x: Row): number => {
        switch (key) {
            case 'points': return x.pts;
            case 'starts': return x.out === 'DNS' ? 0 : 1;
            case 'races': return 1;
            case 'wins': return !x.out && x.pos === 1 ? 1 : 0;
            case 'podiums': return !x.out && x.pos <= 3 ? 1 : 0;
            case 'poles': return r.pole === x.driver ? 1 : 0;
            case 'fastestLaps': return x.fl ? 1 : 0;
            default: return 0;
        }
    };
    for (const year of [...src.seasons.keys()].sort((a, b) => a - b)) {
        if (year > Number(until.slice(0, 4))) break;
        for (const r of src.seasons.get(year)!.rounds) {
            if (!r.raced || r.date > until) continue;
            for (const x of r.rows) add(x.driver, gain(r, x), x.team);
        }
    }
    return out;
}

/** A tally as a table, best first. */
const ranked = (t: Tally) => [...t].sort((a, b) => b[1].value - a[1].value);
