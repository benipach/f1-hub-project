// A season file as clean, typed Grand Prix objects: what the new pages read.
//
// Takes the raw data exactly as raw.ts describes it and puts together the
// pieces in this folder: dates in UTC (dates.ts), team ids (teams.ts), times
// in milliseconds and race outcomes (results.ts). The JSON files themselves
// don't change while old pages still read them.

import { normalizeSessionTime, type SessionTime } from './dates';
import type { RawGrandPrix, RawSeason, RawSessions } from './raw';
import { parseLaps, parseLapTime, parseRaceOutcome, practiceBestLaps, type RaceOutcome } from './results';
import { resolveTeamId } from './teams';

export type SessionKey = keyof RawSessions;

export type Weather = {
    readonly airTemperature: number;
    readonly trackTemperature: number;
    readonly humidity: number;
    readonly windSpeed: number;
    readonly windDirection: number | null;
    readonly rainfall: boolean;
};

type ResultBase = {
    readonly pos: number;
    readonly driver: string;
    readonly number: number;
    readonly teamId: string;
};

export type PracticeResult = ResultBase & {
    /** Best lap in ms; null when no time was set. */
    readonly best: number | null;
    /** Not recorded before 1994. */
    readonly laps: number | null;
};

export type QualifyingResult = ResultBase & {
    /** Best lap in ms; null when no time was set. */
    readonly best: number | null;
};

export type RaceResult = ResultBase & {
    readonly outcome: RaceOutcome;
    readonly laps: number;
    readonly points: number;
    /** Best lap in ms, from 2004. */
    readonly bestLap: number | null;
    readonly fastestLap: boolean;
    /** Starting position, from 2010 (always in sprints). 0 is a pit lane start, as Ergast writes it. */
    readonly grid: number | null;
};

type SessionBase = {
    readonly time: SessionTime | null;
    /** 2026 only (OpenF1); null before the session has run. */
    readonly weather: Weather | null;
};

export type Session =
    | (SessionBase & { readonly kind: 'practice'; readonly key: 'fp1' | 'fp2' | 'fp3'; readonly results: readonly PracticeResult[] })
    | (SessionBase & { readonly kind: 'qualifying'; readonly key: 'qualifying' | 'sprintQualy'; readonly results: readonly QualifyingResult[] })
    | (SessionBase & { readonly kind: 'race'; readonly key: 'race' | 'sprintRace'; readonly results: readonly RaceResult[] });

/** A result row of any session: what every kind has in common, plus its own fields. */
export type SessionResult = PracticeResult | QualifyingResult | RaceResult;

/** The session for a given key: SessionOf<'race'> has race results. */
export type SessionOf<Key extends SessionKey> = Session & { readonly key: Key };

export type GrandPrix = {
    /** Key in the season file: "australian-gp". */
    readonly id: string;
    readonly year: number;
    /**
     * The round among the Grands Prix that are run: a cancelled one has none
     * (null) and the rest count on without it (2026: Miami is round 4, not 6;
     * the owner's call, 14/10). The data's own number is `slot`.
     */
    readonly round: number | null;
    /** The Grand Prix's place in the calendar (by the race's date), cancelled ones included. */
    readonly slot: number;
    readonly name: string;
    /** Missing on 95 GPs, mostly 1990–1999. */
    readonly circuitId: string | null;
    readonly sprint: boolean;
    readonly cancelled: boolean;
    /** Editorial note for the GP page (2026 only). */
    readonly info: { readonly title: string; readonly text: string; readonly date: string } | null;
    /** In the order they ran. */
    readonly sessions: readonly Session[];
};

// The usual order. Sprint weekends changed it over the years (in 2021–22
// qualifying ran on Friday, before the sprint), so it's only the fallback.
const SESSION_ORDER: readonly SessionKey[] = ['fp1', 'fp2', 'fp3', 'sprintQualy', 'sprintRace', 'qualifying', 'race'];

type Teams = Readonly<Record<string, unknown>>;
type RawSession<Key extends SessionKey> = NonNullable<RawSessions[Key]>;

function normalizeWeather(raw: RawSession<SessionKey>['weather']): Weather | null {
    if (!raw || !('air_temperature' in raw)) return null;
    return {
        airTemperature: raw.air_temperature,
        trackTemperature: raw.track_temperature,
        humidity: raw.humidity,
        windSpeed: raw.wind_speed,
        windDirection: raw.wind_direction ?? null,
        rainfall: raw.rainfall > 0,
    };
}

function normalizeSession(key: SessionKey, raw: RawSession<SessionKey>, teams: Teams): Session {
    const base = { time: normalizeSessionTime(raw.date, raw.endDate), weather: normalizeWeather(raw.weather) };
    const row = (r: { pos: number; driver: string; number: number; team: string }) => ({
        pos: r.pos, driver: r.driver, number: r.number, teamId: resolveTeamId(r.team, teams),
    });

    switch (key) {
        case 'fp1':
        case 'fp2':
        case 'fp3': {
            const rows = (raw as RawSession<'fp1'>).results;
            const best = practiceBestLaps(rows);
            return { ...base, kind: 'practice', key, results: rows.map((r, i) => ({ ...row(r), best: best[i] ?? null, laps: parseLaps(r.laps) })) };
        }
        case 'qualifying':
        case 'sprintQualy': {
            const rows = (raw as RawSession<'qualifying'>).results;
            return { ...base, kind: 'qualifying', key, results: rows.map((r) => ({ ...row(r), best: parseLapTime(r.lapTime) })) };
        }
        case 'race':
        case 'sprintRace': {
            const rows = (raw as RawSession<'race'>).results;
            return {
                ...base, kind: 'race', key, results: rows.map((r) => ({
                    ...row(r),
                    outcome: parseRaceOutcome(r.time),
                    laps: parseLaps(r.laps) ?? 0,
                    points: r.pts,
                    bestLap: parseLapTime(r.bestLap),
                    fastestLap: r.fastestLap === true,
                    grid: r.grid ?? null,
                })),
            };
        }
    }
}

function sortSessions(sessions: Session[]): Session[] {
    const byUsualOrder = [...sessions].sort((a, b) => SESSION_ORDER.indexOf(a.key) - SESSION_ORDER.indexOf(b.key));
    const starts = byUsualOrder.map((s) => (s.time?.kind === 'datetime' ? s.time.start : null));
    if (starts.some((start) => start === null)) return byUsualOrder;
    return byUsualOrder
        .map((session, i) => ({ session, start: starts[i]! }))
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
        .map(({ session }) => session);
}

export function normalizeGrandPrix(id: string, year: number, raw: RawGrandPrix, teams: Teams): GrandPrix {
    const sessions = (Object.keys(raw.sessions) as SessionKey[])
        .flatMap((key) => {
            const session = raw.sessions[key];
            return session ? [normalizeSession(key, session, teams)] : [];
        });
    return {
        id,
        year,
        round: raw.cancelled ? null : raw.round,
        // Set by normalizeSeason, from the calendar order
        slot: 0,
        name: raw.name,
        circuitId: raw.circuitId ?? null,
        sprint: raw.sprint,
        cancelled: raw.cancelled,
        info: raw.info ?? null,
        sessions: sortSessions(sessions),
    };
}

/**
 * Every Grand Prix of a season file, in calendar order (cancelled ones in
 * their place), with the rounds counted again over the ones that are run:
 * cancelled Grands Prix get no round.
 */
export function normalizeSeason(year: number, raw: RawSeason, teams: Teams): GrandPrix[] {
    // The order comes from the race's date, not from the data's round: a
    // cancelled GP has none in the files since 16/10 ("round": null), while
    // the data frozen in next still numbers it. Both read the same.
    const raceDay = (gp: GrandPrix): string => {
        const time = gp.sessions.find((s) => s.key === 'race')?.time;
        return time?.kind === 'datetime' ? time.start : time?.kind === 'date' ? time.date : '';
    };
    let round = 0;
    return Object.entries(raw)
        .map(([id, gp], i) => ({ gp: normalizeGrandPrix(id, year, gp, teams), day: '', order: gp.round ?? Infinity, i }))
        .map((entry) => ({ ...entry, day: raceDay(entry.gp) }))
        // ISO dates sort as text; ties (or no date) keep the data's round, then the file's order
        .sort((a, b) => (a.day && b.day && a.day !== b.day ? (a.day < b.day ? -1 : 1) : a.order - b.order || a.i - b.i))
        .map(({ gp }, i) => ({ ...gp, slot: i + 1, round: gp.cancelled ? null : ++round }));
}
