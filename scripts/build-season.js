// ── build-season.js: builds a complete data/seasons/season{year}.json in 1 run ──
//
// Unifies what used to be four separate scripts in the repo root:
//   fetch-season.js          → race + qualifying from Jolpica (Ergast)
//   fetch-circuit-ids.js     → circuitId for each GP (now without an extra request:
//                              it comes from the same Jolpica races payload)
//   fetch-practice.js        → FP1-3 scraped from formula1.com
//   find-missing-qualifying.js → detects the qualifying sessions Jolpica doesn't have
//
// Usage:
//   node scripts/build-season.js <year>              # full season
//   node scripts/build-season.js <year> --no-practice # without scraping FP (old years / offline)
//   node scripts/build-season.js <year> --force       # clean rebuild (overwrites EVERYTHING)
//   node scripts/build-season.js <year> --dry-run     # writes nothing, only reports
//   node scripts/build-season.js <year> --out <path>  # writes to another path
//   node scripts/build-season.js <year> --grid        # only fill in the starting grid
//
// --grid: fast mode for seasons that are already complete. It asks Jolpica
// only for race (and sprint) results, and to every result row
// without a `grid` it adds the REAL starting position, which isn't the
// qualifying one: penalties, engine changes and pit lane starts
// set them apart. It doesn't touch any other data. It costs ~1 request per GP, so with
// Jolpica's limit (500/hour) about 20 seasons fit per hour.
//
// By default it does NOT overwrite data already loaded by hand: if the season file
// exists, every session with results is kept and only the gaps are filled.
// With --force the previous data is discarded and rebuilt from the sources.
//
// Whatever remains incomplete (unmapped circuits, qualifying missing in Jolpica) is
// dumped to data/seasons/_incomplete-{year}.txt, one file per year that's
// overwritten on every run, so it never piles up old entries.

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEASONS_DIR = join(ROOT, 'data', 'seasons');
const CIRCUITS_PATH = join(ROOT, 'data', 'circuits.json');

const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1';
const F1_BASE = 'https://www.formula1.com/en/results';
const REQUEST_DELAY_MS = 500;   // Jolpica and F1.com: stay well within the rate limit
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP ───────────────────────────────────────────────────────────────────
async function fetchJson(url, attempt = 1) {
  const res = await fetch(url);
  if (res.status === 429) {
    if (attempt > MAX_RETRIES) throw new Error(`429 after ${MAX_RETRIES} retries: ${url}`);
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
    console.warn(`  [429] rate limit, retrying in ${waitMs}ms (${attempt}/${MAX_RETRIES})`);
    await sleep(waitMs);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; F1HubBot/1.0; +personal project)' },
  });
  if (res.status === 404) return null;   // session that doesn't exist (e.g. a sprint weekend without FP2/FP3)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// ── Slugs (same criteria across all sources so the ids line up) ─────────────
function toSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // saca acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
const gpSlug = (raceName) => toSlug(raceName.toLowerCase().replace(/grand prix/g, 'gp'));

// Jolpica uses the full name → slug. When that doesn't match the id we
// want in drivers.json, we map it here so the re-fetch doesn't revert it.
const DRIVER_ID_OVERRIDES = {
  'andrea-kimi-antonelli': 'kimi-antonelli',
};
const driverId = (d) => {
  const slug = toSlug(`${d.givenName} ${d.familyName}`);
  return DRIVER_ID_OVERRIDES[slug] ?? slug;
};

const teamId = (name) => toSlug(typeof name === 'string' ? name : name.name);

// ── 1 · Race + qualifying from Jolpica ──────────────────────────────────────
const LAPPED_STATUS = /^\+\d+\s+Laps?$/;

function mapRaceResult(r) {
  const pos = Number(r.position);
  let time;
  if (r.Time?.time) time = pos === 1 ? r.Time.time : `+${r.Time.time.replace(/^\+/, '')}`;
  else if (r.status === 'Finished' || LAPPED_STATUS.test(r.status)) time = r.status;
  else time = 'DNF';

  const mapped = {
    pos,
    driver: driverId(r.Driver),
    number: Number(r.number),
    team: teamId(r.Constructor),
    laps: Number(r.laps),
    pts: Number(r.points),
    time,
  };
  // Actual starting position (Ergast: "0" = started from the pit lane). It's
  // different from the qualifying position when there were penalties.
  if (r.grid !== undefined && r.grid !== '') mapped.grid = Number(r.grid);
  if (r.FastestLap?.Time?.time) {
    mapped.bestLap = r.FastestLap.Time.time;
    if (r.FastestLap.rank === '1') mapped.fastestLap = true;
  }
  return mapped;
}

const bestQualiTime = (r) => r.Q3 ?? r.Q2 ?? r.Q1 ?? null;
const mapQualiResult = (r) => ({
  pos: Number(r.position),
  driver: driverId(r.Driver),
  number: Number(r.number),
  team: teamId(r.Constructor),
  lapTime: bestQualiTime(r) ?? 'No time',
});

// Jolpica doesn't provide endDate; we estimate it by adding a typical duration to the start,
// so the frontend knows whether the session has ended without extra logic.
const QUALI_DURATION_MS = 60 * 60 * 1000;        // 1 h
const RACE_DURATION_MS = 4 * 60 * 60 * 1000;     // 4 h (margin for SC / red flags)
const addEndDate = (isoStart, durMs) =>
  isoStart ? new Date(new Date(isoStart).getTime() + durMs).toISOString() : null;

async function fetchFromJolpica(year, { gridOnly = false } = {}) {
  const racesData = await fetchJson(`${JOLPICA_BASE}/${year}/races.json?limit=100`);
  const races = racesData.MRData.RaceTable.Races;
  if (!races.length) throw new Error(`Jolpica has no races for ${year}`);

  const season = {};
  const circuitByRound = {};

  for (const race of races) {
    const round = Number(race.round);
    const slug = gpSlug(race.raceName);
    circuitByRound[round] = race.Circuit?.circuitId ?? null;
    console.log(`[${year}] R${round} ${race.raceName}`);

    await sleep(REQUEST_DELAY_MS);
    const rd = await fetchJson(`${JOLPICA_BASE}/${year}/${round}/results.json?limit=100`);
    const raceResults = rd.MRData.RaceTable.Races[0]?.Results ?? [];

    // In --grid mode qualifying isn't needed: only the `grid`
    // inside the race and sprint results matters.
    let qualiResults = [];
    if (!gridOnly) {
      await sleep(REQUEST_DELAY_MS);
      const qd = await fetchJson(`${JOLPICA_BASE}/${year}/${round}/qualifying.json?limit=100`);
      qualiResults = qd.MRData.RaceTable.Races[0]?.QualifyingResults ?? [];
    }

    // Sprint: same format as the race (with its own `grid`, which comes from
    // Sprint Qualifying). Only requested on weekends that have one.
    let sprintResults = [];
    if (race.Sprint) {
      await sleep(REQUEST_DELAY_MS);
      const sd = await fetchJson(`${JOLPICA_BASE}/${year}/${round}/sprint.json?limit=100`);
      sprintResults = sd.MRData.RaceTable.Races[0]?.SprintResults ?? [];
    }

    const sessions = {};
    if (qualiResults.length) {
      const date = race.Qualifying ? `${race.Qualifying.date}T${race.Qualifying.time ?? '00:00:00Z'}` : null;
      sessions.qualifying = {
        date,
        endDate: addEndDate(date, QUALI_DURATION_MS),
        results: qualiResults.map(mapQualiResult),
      };
    }
    if (sprintResults.length) {
      const date = race.Sprint ? `${race.Sprint.date}T${race.Sprint.time ?? '00:00:00Z'}` : null;
      sessions.sprintRace = {
        date,
        endDate: addEndDate(date, QUALI_DURATION_MS),
        results: sprintResults.map(mapRaceResult),
      };
    }
    if (raceResults.length) {
      const date = `${race.date}T${race.time ?? '00:00:00Z'}`;
      sessions.race = {
        date,
        endDate: addEndDate(date, RACE_DURATION_MS),
        results: raceResults.map(mapRaceResult),
      };
    }

    season[slug] = {
      round,
      name: race.raceName,
      sprint: Boolean(race.Sprint),
      cancelled: raceResults.length === 0 && qualiResults.length === 0,
      sessions,
    };
  }

  return { season, circuitByRound };
}

// ── 2 · circuitId for each GP ───────────────────────────────────────────────
// Jolpica/Ergast circuitId → data/circuits.json slug.
// The commented-out ones DON'T exist in circuits.json yet: the report
// lists them with the proposed slug so you know which one to create.
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
  madring: 'madring',

  // ── Historical / occasional circuits: proposed slug, NOT in
  //    circuits.json yet. The circuitId is written anyway; the report tells you which one to create. ──
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

function resolveCircuitIds(season, circuitByRound, circuitSlugs, report) {
  for (const [slug, gp] of Object.entries(season)) {
    if (gp.circuitId) continue;   // keep what's already there

    const jolpicaId = circuitByRound[gp.round];
    if (!jolpicaId) continue;

    const projectId = CIRCUIT_ID_MAP[jolpicaId];
    if (!projectId) {
      report.circuits.push({ slug, round: gp.round, jolpicaId, note: 'no proposed slug in CIRCUIT_ID_MAP' });
      continue;
    }
    if (circuitSlugs && !circuitSlugs.has(projectId)) {
      report.circuits.push({ slug, round: gp.round, jolpicaId, projectId, note: `"${projectId}" missing from circuits.json` });
      // write it anyway: the data is correct, the circuit just needs to be created
    }

    // circuitId goes right after name to keep the property order
    const { round, name, ...rest } = gp;
    season[slug] = { round, name, circuitId: projectId, ...rest };
  }
}

async function loadCircuitSlugs() {
  try {
    return new Set(Object.keys(JSON.parse(await readFile(CIRCUITS_PATH, 'utf-8'))));
  } catch (err) {
    if (err.code === 'ENOENT') return null;   // no circuits.json: no validation
    throw err;
  }
}

// ── 3 · FP1-3 scrapeadas de formula1.com ───────────────────────────────────
function parseDriverCell(rawText) {
  // The cell comes as "Lando NorrisNOR" (name glued to the 3-letter code).
  const m = rawText.trim().match(/^(.*\S)\s*([A-Z]{3})$/);
  return { fullName: m ? m[1].trim() : rawText.trim() };
}

function parsePracticeTable(html) {
  const $ = cheerio.load(html);
  const table = $('table').first();
  if (!table.length) return null;

  const results = [];
  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;

    const pos = Number($(cells[0]).text().trim());
    const number = Number($(cells[1]).text().trim());
    const { fullName } = parseDriverCell($(cells[2]).text());
    const team = $(cells[3]).text().trim();
    const time = $(cells[4]).text().trim();
    const laps = cells.length > 5 ? Number($(cells[5]).text().trim()) : null;
    if (!pos || !fullName) return;

    results.push({
      pos,
      driver: toSlug(fullName),
      number: Number.isFinite(number) ? number : null,
      team: toSlug(team),
      time: time || 'No time',
      ...(laps !== null && Number.isFinite(laps) ? { laps } : {}),
    });
  });

  return results.length ? results : null;
}

// F1.com's race index uses F1.com's internal ID (not the round number)
// and the country name in the URL, so we return [{ roundId, slug }] in
// chronological order. The round number is i+1.
async function fetchRoundMap(year) {
  const html = await fetchHtml(`${F1_BASE}/${year}/races`);
  if (!html) throw new Error(`couldn't load the F1.com race index for ${year}`);

  const $ = cheerio.load(html);
  const map = [];
  const seen = new Set();
  $('a[href*="/race-result"]').each((_, el) => {
    const m = $(el).attr('href')?.match(/\/races\/(\d+)\/([a-z0-9-]+)\/race-result/);
    if (m && !seen.has(m[1] + m[2])) {
      seen.add(m[1] + m[2]);
      map.push({ roundId: m[1], slug: m[2] });
    }
  });
  if (!map.length) throw new Error(`F1.com returned no races for ${year} (did the markup change?)`);
  return map;
}

async function fetchPractice(year) {
  const roundMap = await fetchRoundMap(year);
  const byRound = {};

  for (let i = 0; i < roundMap.length; i++) {
    const { roundId, slug } = roundMap[i];
    const round = i + 1;
    const sessions = {};

    for (const n of [1, 2, 3]) {
      await sleep(REQUEST_DELAY_MS);
      let html;
      try {
        html = await fetchHtml(`${F1_BASE}/${year}/races/${roundId}/${slug}/practice/${n}`);
      } catch (err) {
        console.warn(`  ! R${round} FP${n}: ${err.message}`);
        continue;
      }
      if (!html) continue;   // 404 → that session didn't happen

      const results = parsePracticeTable(html);
      if (results) sessions[`fp${n}`] = { results };
    }

    if (Object.keys(sessions).length) byRound[round] = sessions;
  }

  return byRound;
}

// ── 4 · Merge with what was already there (keeps what was loaded by hand) ───
const hasResults = (s) => Array.isArray(s?.results) && s.results.length > 0;

// Copies Jolpica's `grid` to the rows of a session we already had
// saved (and that therefore isn't overwritten), matching by driver and, if the id doesn't
// match, by car number. It only adds where it's missing: it never changes a grid
// that was already there. Returns how many rows it filled.
function backfillGrid(existingSession, freshSession) {
  if (!hasResults(existingSession) || !hasResults(freshSession)) return 0;
  const byDriver = new Map(freshSession.results.map((r) => [r.driver, r.grid]));
  const byNumber = new Map(freshSession.results.map((r) => [r.number, r.grid]));
  let n = 0;
  for (const row of existingSession.results) {
    if (row.grid !== undefined) continue;
    const grid = byDriver.get(row.driver) ?? byNumber.get(Number(row.number));
    if (grid === undefined || grid === null || Number.isNaN(grid)) continue;
    row.grid = grid;
    n++;
  }
  return n;
}

const GRID_SESSIONS = ['race', 'sprintRace'];

function mergeSeasons(fresh, existing, { force }, stats = { gridAdded: 0 }) {
  if (force || !existing) return fresh;

  for (const [slug, freshGp] of Object.entries(fresh)) {
    const oldGp = existing[slug];
    if (!oldGp) continue;

    if (oldGp.circuitId && !freshGp.circuitId) {
      const { round, name, ...rest } = freshGp;
      fresh[slug] = { round, name, circuitId: oldGp.circuitId, ...rest };
    }
    // We keep every previous session that already has results (qualifying/FP by hand,
    // OpenF1 data in 2026, etc.). The fresh one only fills what's missing.
    const merged = { ...freshGp.sessions };
    for (const [key, sess] of Object.entries(oldGp.sessions ?? {})) {
      if (hasResults(sess) || !merged[key]) {
        // The saved session wins, but if it's a race/sprint its starting grid
        // is filled in with what Jolpica returned.
        if (GRID_SESSIONS.includes(key)) stats.gridAdded += backfillGrid(sess, freshGp.sessions?.[key]);
        merged[key] = sess;
      }
    }
    fresh[slug].sessions = merged;
  }
  return fresh;
}

// --grid mode: the existing file is the base and NOTHING is replaced; only
// `grid` is added to race/sprint rows that don't have it.
function applyGridOnly(existing, fresh) {
  const stats = { gridAdded: 0, rowsMissing: 0, gpsTouched: 0 };
  for (const [slug, gp] of Object.entries(existing)) {
    let touched = false;
    for (const key of GRID_SESSIONS) {
      const added = backfillGrid(gp.sessions?.[key], fresh[slug]?.sessions?.[key]);
      if (added) { stats.gridAdded += added; touched = true; }
      for (const row of gp.sessions?.[key]?.results ?? []) if (row.grid === undefined) stats.rowsMissing++;
    }
    if (touched) stats.gpsTouched++;
  }
  return stats;
}

function attachPractice(season, practiceByRound) {
  const slugByRound = new Map(Object.entries(season).map(([slug, gp]) => [gp.round, slug]));
  let n = 0;
  for (const [round, fpSessions] of Object.entries(practiceByRound)) {
    const slug = slugByRound.get(Number(round));
    if (!slug) continue;
    const current = season[slug].sessions ?? {};
    // Don't overwrite an FP that already has results.
    for (const [key, sess] of Object.entries(fpSessions)) {
      if (!hasResults(current[key])) current[key] = sess;
    }
    season[slug].sessions = current;
    n++;
  }
  return n;
}

// ── 5 · Report of what remained incomplete ──────────────────────────────────
function findMissingQualifying(season) {
  const missing = [];
  for (const [slug, gp] of Object.entries(season)) {
    if (gp.cancelled) continue;
    const q = gp.sessions?.qualifying;
    if (!q || !Array.isArray(q.results) || q.results.length === 0) {
      missing.push({ slug, round: gp.round, name: gp.name, circuitId: gp.circuitId ?? null });
    }
  }
  return missing;
}

async function writeReport(year, report) {
  const path = join(SEASONS_DIR, `_incomplete-${year}.txt`);
  const { circuits, missingQualifying } = report;

  if (!circuits.length && !missingQualifying.length) {
    await unlink(path).catch(() => {});   // already complete: delete the old report
    console.log(`\n✅ ${year}: no gaps.`);
    return;
  }

  const lines = [
    `# season${year} — incomplete data`,
    `# generated ${new Date().toISOString()}`,
    '',
  ];

  if (circuits.length) {
    lines.push('## Circuits to add (create them in data/circuits.json; the circuitId was already written if there was a proposed slug)');
    for (const c of circuits) {
      const proposed = c.projectId ? ` → proposed slug: ${c.projectId}` : '';
      lines.push(`${c.slug.padEnd(22)} R${c.round}  Jolpica "${c.jolpicaId}"${proposed}  (${c.note})`);
    }
    lines.push('');
  }

  if (missingQualifying.length) {
    lines.push('## Qualifying sessions missing from Jolpica (fill in sessions.qualifying by hand)');
    for (const m of missingQualifying) {
      lines.push(`${m.slug.padEnd(22)} R${m.round}  circuit: ${m.circuitId ?? 'unknown'}`);
    }
    lines.push('');
  }

  await writeFile(path, lines.join('\n'), 'utf-8');
  console.log(`\n⚠  ${circuits.length} circuit(s) + ${missingQualifying.length} qualifying session(s) without data → ${path}`);
}

// ── main ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = { noPractice: false, force: false, dryRun: false, out: null, grid: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-practice') flags.noPractice = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--grid') flags.grid = true;
    else if (a === '--out') flags.out = argv[++i];
    else positional.push(a);
  }
  return { year: positional[0], flags };
}

async function main() {
  const { year, flags } = parseArgs(process.argv.slice(2));
  if (!year || Number.isNaN(Number(year))) {
    console.error('Usage: node scripts/build-season.js <year> [--no-practice] [--force] [--dry-run] [--grid] [--out <path>]');
    process.exit(1);
  }

  await mkdir(SEASONS_DIR, { recursive: true });
  const outPath = flags.out ?? join(SEASONS_DIR, `season${year}.json`);
  const report = { circuits: [], missingQualifying: [] };

  if (flags.grid) {
    await runGridOnly(year, outPath, flags);
    return;
  }

  console.log(`\n── 1/4 · Jolpica: race + qualifying ──`);
  const { season, circuitByRound } = await fetchFromJolpica(year);

  console.log(`\n── 2/4 · circuitId per GP ──`);
  const circuitSlugs = await loadCircuitSlugs();
  resolveCircuitIds(season, circuitByRound, circuitSlugs, report);

  let existing = null;
  try {
    existing = JSON.parse(await readFile(outPath, 'utf-8'));
  } catch { /* didn't exist: it's a new season */ }
  const mergeStats = { gridAdded: 0 };
  const merged = mergeSeasons(season, existing, flags, mergeStats);
  if (mergeStats.gridAdded) console.log(`  starting grid filled in on ${mergeStats.gridAdded} existing row(s)`);

  if (flags.noPractice) {
    console.log(`\n── 3/4 · practice (FP1-3): skipped (--no-practice) ──`);
  } else {
    console.log(`\n── 3/4 · practice (FP1-3) from formula1.com ──`);
    try {
      const practiceByRound = await fetchPractice(year);
      const n = attachPractice(merged, practiceByRound);
      console.log(`  ${n} race(s) with FP added`);
    } catch (err) {
      console.warn(`  ! couldn't scrape practice: ${err.message}`);
    }
  }

  console.log(`\n── 4/4 · gaps ──`);
  report.missingQualifying = findMissingQualifying(merged);

  if (flags.dryRun) {
    console.log('\n(--dry-run: nothing is written)');
    const gp = Object.keys(merged).length;
    const withQuali = Object.values(merged).filter((g) => g.sessions?.qualifying?.results?.length).length;
    const withFp = Object.values(merged).filter((g) => g.sessions?.fp1?.results?.length).length;
    console.log(`  ${gp} GP · ${withQuali} with qualifying · ${withFp} with FP1`);
    if (report.circuits.length)
      console.log('  circuits:', report.circuits.map((c) => `${c.slug}(${c.jolpicaId})`).join(', '));
    if (report.missingQualifying.length)
      console.log('  missing qualifying:', report.missingQualifying.map((m) => m.slug).join(', '));
  } else {
    await writeFile(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    console.log(`\nWritten: ${outPath}`);
    await writeReport(year, report);
  }

  console.log('\nRemember to regenerate careers.json:  node scripts/build-careers.js');
}

// ── --grid: starting grid only ─────────────────────────────────────────────
async function runGridOnly(year, outPath, flags) {
  let existing;
  try {
    existing = JSON.parse(await readFile(outPath, 'utf-8'));
  } catch {
    console.error(`--grid needs an existing season file: ${outPath} doesn't exist. Run the full season first.`);
    process.exit(1);
  }

  console.log(`\n── Jolpica: race + sprint starting grid ──`);
  const { season: fresh } = await fetchFromJolpica(year, { gridOnly: true });
  const stats = applyGridOnly(existing, fresh);

  console.log(`\n  ${stats.gridAdded} row(s) filled in across ${stats.gpsTouched} GP(s)`);
  if (stats.rowsMissing) {
    console.log(`  ${stats.rowsMissing} row(s) still without a grid (Jolpica doesn't have them or the driver doesn't match)`);
  } else {
    console.log('  every race/sprint row has a grid');
  }

  if (flags.dryRun) {
    console.log('\n(--dry-run: nothing is written)');
    return;
  }
  if (!stats.gridAdded) {
    console.log('\nNothing to write.');
    return;
  }
  await writeFile(outPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  console.log(`\nWritten: ${outPath}`);
  console.log('\nRemember to regenerate careers.json:  node scripts/build-careers.js');
}

main().catch((err) => {
  console.error('\n❌', err);
  process.exit(1);
});
