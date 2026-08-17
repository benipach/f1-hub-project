// fetch-circuit-ids.js
// Reads local data/season{year}.json files, fetches each round's circuit
// from the Jolpica API, maps it to this project's circuit slug, and
// writes circuitId into every GP that's missing it.
//
// Usage: node fetch-circuit-ids.js <year> [year2 ...]
//        node fetch-circuit-ids.js all   (scans data/season*.json)

import { readFile, writeFile, readdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1';
const SEASONS_DIR = join('data', 'seasons');
const CIRCUITS_PATH = join('data', 'circuits.json');
const MISSING_LOG_PATH = 'missing-circuits.txt';
const REQUEST_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 5;

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url);
  if (res.status === 429) {
    if (attempt > MAX_RETRIES) throw new Error(`Request failed (429) after ${MAX_RETRIES} retries: ${url}`);
    const retryAfterHeader = Number(res.headers.get('retry-after'));
    const waitMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : attempt * 2000;
    console.warn(`[429] Rate limited, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES}): ${url}`);
    await sleep(waitMs);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json();
}

// Jolpica/Ergast circuitId -> this project's circuits.json slug.
// Add entries here as new circuits show up; the script warns instead of
// guessing when it hits one that's missing.
const CIRCUIT_ID_MAP = {
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
  // Older/retired circuits not in the current circuits.json — add as needed:
  // istanbul, hockenheimring, nurburgring, magny_cours, imola, valencia, etc.
};

async function circuitIdsForYear(year) {
  const data = await fetchJson(`${BASE_URL}/${year}/races.json?limit=100`);
  const races = data.MRData.RaceTable.Races;
  const byRound = {};
  for (const race of races) {
    byRound[Number(race.round)] = race.Circuit.circuitId;
  }
  return byRound;
}

async function loadCircuitSlugs() {
  try {
    const circuits = JSON.parse(await readFile(CIRCUITS_PATH, 'utf-8'));
    return new Set(Object.keys(circuits));
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`Warning: ${CIRCUITS_PATH} not found — can't validate mapped slugs, proceeding anyway`);
      return null; // null = skip validation, don't block the whole run
    }
    throw err;
  }
}

// missing entries are { year, gp, reason } — reason is either the raw
// Jolpica circuitId (unmapped) or the project slug (mapped but absent
// from circuits.json).
async function processYear(year, circuitSlugs, missing) {
  const path = join(SEASONS_DIR, `season${year}.json`);
  const season = JSON.parse(await readFile(path, 'utf-8'));

  console.log(`[${year}] fetching circuit list...`);
  await sleep(REQUEST_DELAY_MS);
  const jolpicaByRound = await circuitIdsForYear(year);

  let changed = 0;
  for (const [gpSlug, gp] of Object.entries(season)) {
    if (gp.circuitId) continue; // don't overwrite existing data

    const jolpicaId = jolpicaByRound[gp.round];
    if (!jolpicaId) {
      console.warn(`[${year}] ${gpSlug}: no round ${gp.round} found in Jolpica data, skipping`);
      continue;
    }

    const projectId = CIRCUIT_ID_MAP[jolpicaId];
    if (!projectId) {
      console.warn(`[${year}] ${gpSlug}: unmapped Jolpica circuitId "${jolpicaId}" — add it to CIRCUIT_ID_MAP`);
      missing.push({ year, gp: gpSlug, reason: `Jolpica id "${jolpicaId}" not in CIRCUIT_ID_MAP` });
      continue;
    }

    if (circuitSlugs && !circuitSlugs.has(projectId)) {
      console.warn(`[${year}] ${gpSlug}: circuit "${projectId}" not found in ${CIRCUITS_PATH}`);
      missing.push({ year, gp: gpSlug, reason: `circuit "${projectId}" missing from circuits.json` });
      continue;
    }

    // Insert `circuitId` immediately after `name` when writing back the
    // GP object so the JSON property order places it after `name`.
    const { round, name, ...otherProps } = gp;
    season[gpSlug] = { round, name, circuitId: projectId, ...otherProps };
    changed++;
  }

  if (changed > 0) {
    await writeFile(path, JSON.stringify(season, null, 2), 'utf-8');
    console.log(`[${year}] wrote circuitId to ${changed} GP(s)`);
  } else {
    console.log(`[${year}] nothing to change`);
  }
}

async function resolveYears(args) {
  if (args[0] === 'all') {
    const files = await readdir(SEASONS_DIR);
    return files
      .map((f) => f.match(/^season(\d{4})\.json$/))
      .filter(Boolean)
      .map((m) => m[1]);
  }
  return args;
}

async function writeMissingLog(missing) {
  if (missing.length === 0) return;

  const lines = missing.map((m) => `${m.year} — ${m.gp}: ${m.reason}`).join('\n') + '\n';

  try {
    // If the log file exists, append. Preserve existing content and ensure
    // there's a separating newline if the file doesn't already end with one.
    const existing = await readFile(MISSING_LOG_PATH, 'utf-8');
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    await appendFile(MISSING_LOG_PATH, prefix + lines, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist yet — create it.
      await writeFile(MISSING_LOG_PATH, lines, 'utf-8');
    } else {
      throw err;
    }
  }

  console.log(`\n${missing.length} missing circuit(s) logged to ${MISSING_LOG_PATH}`);
}

async function main() {
  const years = await resolveYears(process.argv.slice(2));
  if (years.length === 0) {
    console.error('Usage: node fetch-circuit-ids.js <year> [year2 ...]  |  node fetch-circuit-ids.js all');
    process.exit(1);
  }

  const circuitSlugs = await loadCircuitSlugs();
  const missing = [];

  for (const year of years) {
    await processYear(year, circuitSlugs, missing);
  }

  await writeMissingLog(missing);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});