// Schemas for the JSON files in data/, exactly as they are on disk today.
//
// The old pages read these files directly, so they can't change until the
// last old page is gone. These schemas don't clean anything up: they pin
// down every shape the files really have, quirks included, so that anything
// new (a field a script starts writing, a type that changes) fails the build
// instead of reaching a page. Turning this into clean data is normalize's
// job. Every quirk below was found by walking all 37 season files (1990–2026)
// on 2026-10-08.
//
// Objects are strict on purpose: an unknown key is an error, not ignored.

import * as z from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const isoDate = z.iso.date();

// Two conventions live side by side: 1990–2025 come from Ergast in UTC
// ("2025-03-16T04:00:00Z", endDate with milliseconds), while 2026 is written
// by the OpenF1 adapter in Argentina time (UTC−3) with no offset
// ("2026-03-08T01:00:00"). `local: true` accepts both.
const dateTime = z.iso.datetime({ local: true });

// "1:20.267", and "53.377" for laps under a minute (Sakhir 2020, on
// Bahrain's outer loop). Also "24:34.899": the whole race in Australia 1991.
const LAP = String.raw`(?:\d+:)?\d{1,2}\.\d{3}`;
const lapTime = z.string().regex(new RegExp(`^${LAP}$`));

// Gap to the leader: "+8.685" and "+1:08.358" in Ergast races, with an "s"
// in practice sessions scraped from formula1.com ("+0.599s") and in 2026
// races (OpenF1 adapter). Over a minute it can also come as plain seconds
// ("+1206.389s", "+104.684s").
const GAP = String.raw`\+(?:\d+:\d{2}|\d+)\.\d{3}s?`;

// The race `time` field carries the winner's time, a gap, laps behind or
// a status. There's no separate status field. Five winners' times only have
// hours and minutes ("1:31", 1998 and 2002).
const raceTime = z.string().regex(
    new RegExp(`^(?:\\d+:\\d{2}:\\d{2}\\.\\d{3}|\\d+:\\d{2}|${LAP}|${GAP}|\\+\\d+ Laps?|DNF|DNS|DSQ)$`),
);

// laps is a number up to 2025 and a numeric string in 2026 (OpenF1 adapter).
const laps = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]);

const position = z.number().int().positive();
const carNumber = z.number().int().nonnegative(); // Damon Hill ran #0 in 1993–94

// Free-form on purpose: 203 variants across the dataset ("ferrari",
// "Ferrari", "red-bull-racing-honda-rbpt", "Mercedes-AMG"…). Resolved to a
// teams.json id by resolveTeamId.
const rawTeam = z.string().min(1);

// Practice: two shapes. Scraped from formula1.com (≤2025): `time` is the
// leader's lap and a gap for everyone else, or "No time". OpenF1 (2026):
// `lapTime` is each driver's own best lap. No laps before 1994.
const PracticeRow = z
    .strictObject({
        pos: position,
        driver: slug,
        number: carNumber,
        team: rawTeam,
        laps: laps.optional(),
        time: z.union([lapTime, z.string().regex(new RegExp(`^${GAP}$`)), z.literal('No time')]).optional(),
        lapTime: z.union([lapTime, z.literal('No time')]).optional(),
    })
    .refine((row) => (row.time === undefined) !== (row.lapTime === undefined), {
        message: 'a practice row has exactly one of time or lapTime',
    });

// No time set: "" up to 2025 (211 rows), "No time" in 2026.
const QualifyingRow = z.strictObject({
    pos: position,
    driver: slug,
    number: carNumber,
    team: rawTeam,
    lapTime: z.union([lapTime, z.literal(''), z.literal('No time')]),
});

// Race and sprint. bestLap and fastestLap from 2004, grid from 2010
// (always in sprints).
const RaceRow = z.strictObject({
    pos: position,
    driver: slug,
    number: carNumber,
    team: rawTeam,
    laps,
    time: raceTime,
    pts: z.number().nonnegative(),
    bestLap: lapTime.optional(),
    fastestLap: z.literal(true).optional(),
    grid: z.number().int().nonnegative().optional(),
});

// Only 2026 has weather (OpenF1). Sessions that haven't run yet have {}.
const Weather = z.union([
    z.strictObject({}),
    z.strictObject({
        air_temperature: z.number(),
        track_temperature: z.number(),
        humidity: z.number(),
        wind_speed: z.number(),
        wind_direction: z.number().optional(),
        rainfall: z.number(),
    }),
]);

// Historical practice sessions have no dates at all; qualifying has null
// dates from 1994 to 2005.
function session<Row extends z.ZodType>(row: Row) {
    return z.strictObject({
        date: dateTime.nullable().optional(),
        endDate: dateTime.nullable().optional(),
        weather: Weather.optional(),
        results: z.array(row),
    });
}

export const RawSessions = z.strictObject({
    fp1: session(PracticeRow).optional(),
    fp2: session(PracticeRow).optional(),
    fp3: session(PracticeRow).optional(),
    sprintQualy: session(QualifyingRow).optional(),
    sprintRace: session(RaceRow).optional(),
    qualifying: session(QualifyingRow).optional(),
    race: session(RaceRow),
});

export const RawGrandPrix = z.strictObject({
    round: z.number().int().positive(),
    name: z.string().min(1),
    // Missing on 95 GPs, mostly 1990–1999 (data/seasons/missing-circuits.txt).
    circuitId: slug.optional(),
    sprint: z.boolean(),
    cancelled: z.boolean(),
    // Editorial note shown on the GP page (2026 only).
    info: z.strictObject({ title: z.string(), text: z.string(), date: isoDate }).optional(),
    sessions: RawSessions,
});

// data/seasons/season{year}.json, keyed by GP id ("australian-gp").
export const RawSeason = z.record(slug, RawGrandPrix);

// Catalogs keyed by id. Where the entry repeats its id, it must match the key.
function catalog<Entry extends z.ZodType<object>>(entry: Entry, key: z.ZodString = slug) {
    return z.record(key, entry).refine(
        (entries) => Object.entries(entries).every(([key, value]) => !('id' in value) || value.id === key),
        { message: "an entry's id doesn't match its key" },
    );
}

export const RawTeams = catalog(
    z.strictObject({
        id: slug,
        name: z.string().min(1),
        base: slug.optional(), // a cities.json id
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }),
);

// Covers 154 drivers; results name 156 more who aren't here. One key has a
// capital letter, "heinz-Harald-frentzen", so it doesn't match the
// "heinz-harald-frentzen" in the results.
const driverKey = z.string().regex(/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/);

export const RawDrivers = catalog(
    z.strictObject({
        id: driverKey,
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        shortName: z.string().regex(/^[A-Z]{3}$/),
        nationality: slug, // a countries.json id
        dateOfBirth: isoDate,
        dateOfDeath: isoDate.nullable(),
        dateOfRetirement: isoDate.nullable(),
        image: z.string().min(1),
        coverImage: z.string().min(1),
    }),
    driverKey,
);

export const RawCircuits = catalog(
    z.strictObject({
        id: slug,
        name: z.string().min(1),
        location: z.strictObject({ city: slug }),
        // Keyed by year span ("1996-2020", "2021-present").
        layouts: z.record(
            z.string(),
            z.strictObject({
                length: z.number().positive(),
                turns: z.number().int().positive().nullable(),
                validFrom: z.number().int(),
                validTo: z.number().int().nullable(),
            }),
        ),
        // Missing for Imola.
        characteristics: z
            .strictObject({
                downforce: z.number(),
                overtaking: z.number(),
                tyreDeg: z.number(),
                trackType: z.string().min(1),
            })
            .optional(),
    }),
);

// code and place only where the GP needs its own (js/shared/gp.js in the old
// site); country is missing where no single country fits ("european-gp",
// "stirling-moss-trophy") or wasn't filled in ("moroccan-gp", "vietnamese-gp").
export const RawGrandsPrix = catalog(
    z.strictObject({
        name: z.string().min(1),
        country: slug.optional(),
        code: z.string().regex(/^[A-Z0-9]{3}$/).optional(),
        place: z.string().min(1).optional(),
    }),
);

export const RawCountries = catalog(
    z.strictObject({
        name: z.string().min(1),
        code: z.string().min(1),
        isoCode: z.string().regex(/^[A-Z]{2}$/),
    }),
);

export const RawCities = catalog(
    z.strictObject({
        name: z.string().min(1),
        country: slug,
    }),
);

export const RawLatest = z.strictObject({
    latestSeason: z.number().int(),
});

export type RawSeason = z.infer<typeof RawSeason>;
export type RawGrandPrix = z.infer<typeof RawGrandPrix>;
export type RawSessions = z.infer<typeof RawSessions>;
export type RawTeams = z.infer<typeof RawTeams>;
export type RawDrivers = z.infer<typeof RawDrivers>;
export type RawCircuits = z.infer<typeof RawCircuits>;
export type RawGrandsPrix = z.infer<typeof RawGrandsPrix>;
export type RawCountries = z.infer<typeof RawCountries>;
export type RawCities = z.infer<typeof RawCities>;
export type RawLatest = z.infer<typeof RawLatest>;
