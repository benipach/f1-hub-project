// fetch-season.js
// Downloads race + qualifying results for a given F1 season from the Jolpica API
// (Ergast-compatible) and writes them to data/season{year}.json using the
// project's session-based structure. FP1-3 and weather are not available
// from any historical API and are intentionally omitted.
//
// Usage: node fetch-season.js <year>

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1';
const OUTPUT_DIR = 'data';
const REQUEST_DELAY_MS = 500; // stay polite with the public API's rate limit

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 5;

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url);

  if (res.status === 429) {
    if (attempt > MAX_RETRIES) {
      throw new Error(`Request failed (429) after ${MAX_RETRIES} retries: ${url}`);
    }
    const retryAfterHeader = Number(res.headers.get('retry-after'));
    const waitMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : attempt * 2000;
    console.warn(`[429] Rate limited, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES}): ${url}`);
    await sleep(waitMs);
    return fetchJson(url, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`);
  }
  return res.json();
}

// Shared slug primitive: lowercase, strip accents, collapse anything
// non-alphanumeric into single hyphens, trim edge hyphens.
function toSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function slugify(raceName) {
  return toSlug(raceName.toLowerCase().replace(/grand prix/g, 'gp'));
}

// Entity IDs (drivers, constructors) use the project convention:
// full name, lowercase, hyphen-separated. e.g. "Ayrton Senna" -> "ayrton-senna"
function driverId(driver) {
  return toSlug(`${driver.givenName} ${driver.familyName}`);
}

function teamId(constructor) {
  return toSlug(constructor.name);
}

const LAPPED_STATUS = /^\+\d+\s+Laps?$/;

function mapRaceResult(result) {
  const pos = Number(result.position);

  let time;
  if (result.Time?.time) {
    time = pos === 1 ? result.Time.time : `+${result.Time.time.replace(/^\+/, '')}`;
  } else if (result.status === 'Finished' || LAPPED_STATUS.test(result.status)) {
    time = result.status; // classified but no explicit gap, e.g. "+1 Lap"
  } else {
    time = 'DNF'; // Retired, Accident, Disqualified, DNS, Not classified, etc.
  }

  const mapped = {
    pos,
    driver: driverId(result.Driver),
    number: Number(result.number),
    team: teamId(result.Constructor),
    laps: Number(result.laps),
    pts: Number(result.points),
    time,
  };

  if (result.FastestLap?.Time?.time) {
    mapped.bestLap = result.FastestLap.Time.time;
    if (result.FastestLap.rank === '1') {
      mapped.fastestLap = true;
    }
  }

  return mapped;
}

// Calcula un endDate aproximado sumando una duracion tipica al inicio de la sesion.
// Jolpica no provee endDate, asi que lo estimamos para que el frontend pueda
// determinar si una sesion ya termino sin necesitar logica de fallback extra.
function addEndDate(isoStart, durationMs) {
  if (!isoStart) return null;
  return new Date(new Date(isoStart).getTime() + durationMs).toISOString();
}

const QUALIFYING_DURATION_MS = 1 * 60 * 60 * 1000; // 1 h
const RACE_DURATION_MS       = 4 * 60 * 60 * 1000; // 4 h (margen para safety cars, banderas rojas, etc.)

function bestQualiTime(result) {
  return result.Q3 ?? result.Q2 ?? result.Q1 ?? null;
}

function mapQualiResult(result) {
  return {
    pos: Number(result.position),
    driver: driverId(result.Driver),
    number: Number(result.number),
    team: teamId(result.Constructor),
    lapTime: bestQualiTime(result) ?? 'No time',
  };
}

async function fetchSeason(year) {
  const racesData = await fetchJson(`${BASE_URL}/${year}/races.json?limit=100`);
  const races = racesData.MRData.RaceTable.Races;

  const season = {};

  for (const race of races) {
    const round = Number(race.round);
    const slug = slugify(race.raceName);

    console.log(`[${year}] Round ${round}: ${race.raceName}`);

    await sleep(REQUEST_DELAY_MS);
    const resultsData = await fetchJson(`${BASE_URL}/${year}/${round}/results.json?limit=100`);
    const raceResults = resultsData.MRData.RaceTable.Races[0]?.Results ?? [];

    await sleep(REQUEST_DELAY_MS);
    const qualiData = await fetchJson(`${BASE_URL}/${year}/${round}/qualifying.json?limit=100`);
    const qualiResults = qualiData.MRData.RaceTable.Races[0]?.QualifyingResults ?? [];

    season[slug] = {
      round,
      name: race.raceName,
      sprint: Boolean(race.Sprint),
      cancelled: raceResults.length === 0 && qualiResults.length === 0,
      sessions: {
        ...(qualiResults.length > 0 && {
          qualifying: (() => {
            const date = race.Qualifying ? `${race.Qualifying.date}T${race.Qualifying.time ?? '00:00:00Z'}` : null;
            return {
              date,
              endDate: addEndDate(date, QUALIFYING_DURATION_MS),
              results: qualiResults.map(mapQualiResult),
            };
          })(),
        }),
        ...(raceResults.length > 0 && {
          race: (() => {
            const date = `${race.date}T${race.time ?? '00:00:00Z'}`;
            return {
              date,
              endDate: addEndDate(date, RACE_DURATION_MS),
              results: raceResults.map(mapRaceResult),
            };
          })(),
        }),
      },
    };
  }

  return season;
}

async function main() {
  const year = process.argv[2];
  if (!year || Number.isNaN(Number(year))) {
    console.error('Usage: node fetch-season.js <year>');
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const season = await fetchSeason(year);
  const outPath = join(OUTPUT_DIR, `season${year}.json`);
  await writeFile(outPath, JSON.stringify(season, null, 2), 'utf-8');

  console.log(`\nDone: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});