// ── build-season.js — arma un data/seasons/season{year}.json completo en 1 corrida ──
//
// Unifica lo que antes eran cuatro scripts sueltos en la raíz:
//   fetch-season.js          → carrera + clasificación desde Jolpica (Ergast)
//   fetch-circuit-ids.js     → circuitId de cada GP (ahora sin request extra:
//                              sale del mismo payload de races de Jolpica)
//   fetch-practice.js        → FP1-3 scrapeadas de formula1.com
//   find-missing-qualifying.js → detecta las quali que Jolpica no tiene
//
// Uso:
//   node scripts/build-season.js <year>              # temporada completa
//   node scripts/build-season.js <year> --no-practice # sin scrapear FP (años viejos / offline)
//   node scripts/build-season.js <year> --force       # rebuild limpio (pisa TODO)
//   node scripts/build-season.js <year> --dry-run     # no escribe nada, solo reporta
//   node scripts/build-season.js <year> --out <path>  # escribe a otra ruta
//
// Por defecto NO pisa datos que ya estén cargados a mano: si el season file
// existe, cada sesión con resultados se conserva y sólo se completan los huecos.
// Con --force se descarta lo anterior y se reconstruye desde las fuentes.
//
// Lo que queda incompleto (circuitos sin mapear, quali sin datos en Jolpica) se
// vuelca a data/seasons/_incomplete-{year}.txt — un archivo por año que se
// sobreescribe en cada corrida, así nunca junta entradas viejas.

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEASONS_DIR = join(ROOT, 'data', 'seasons');
const CIRCUITS_PATH = join(ROOT, 'data', 'circuits.json');

const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1';
const F1_BASE = 'https://www.formula1.com/en/results';
const REQUEST_DELAY_MS = 500;   // Jolpica y F1.com: quedarse tranquilo con el rate limit
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP ───────────────────────────────────────────────────────────────────
async function fetchJson(url, attempt = 1) {
  const res = await fetch(url);
  if (res.status === 429) {
    if (attempt > MAX_RETRIES) throw new Error(`429 tras ${MAX_RETRIES} reintentos: ${url}`);
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
    console.warn(`  [429] rate limit, reintento en ${waitMs}ms (${attempt}/${MAX_RETRIES})`);
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
  if (res.status === 404) return null;   // sesión inexistente (p. ej. sprint weekend sin FP2/FP3)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// ── Slugs (mismo criterio en todas las fuentes para que los ids calcen) ─────
function toSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // saca acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
const gpSlug = (raceName) => toSlug(raceName.toLowerCase().replace(/grand prix/g, 'gp'));

// Jolpica usa el nombre completo → slug. Cuando eso no coincide con el id que
// queremos en drivers.json, lo mapeamos acá para que el re-fetch no lo revierta.
const DRIVER_ID_OVERRIDES = {
  'andrea-kimi-antonelli': 'kimi-antonelli',
};
const driverId = (d) => {
  const slug = toSlug(`${d.givenName} ${d.familyName}`);
  return DRIVER_ID_OVERRIDES[slug] ?? slug;
};

const teamId = (name) => toSlug(typeof name === 'string' ? name : name.name);

// ── 1 · Carrera + clasificación desde Jolpica ───────────────────────────────
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

// Jolpica no da endDate; lo estimamos sumando una duración típica al inicio,
// para que el frontend sepa si la sesión ya terminó sin lógica extra.
const QUALI_DURATION_MS = 60 * 60 * 1000;        // 1 h
const RACE_DURATION_MS = 4 * 60 * 60 * 1000;     // 4 h (margen para SC / banderas rojas)
const addEndDate = (isoStart, durMs) =>
  isoStart ? new Date(new Date(isoStart).getTime() + durMs).toISOString() : null;

async function fetchFromJolpica(year) {
  const racesData = await fetchJson(`${JOLPICA_BASE}/${year}/races.json?limit=100`);
  const races = racesData.MRData.RaceTable.Races;
  if (!races.length) throw new Error(`Jolpica no tiene carreras para ${year}`);

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

    await sleep(REQUEST_DELAY_MS);
    const qd = await fetchJson(`${JOLPICA_BASE}/${year}/${round}/qualifying.json?limit=100`);
    const qualiResults = qd.MRData.RaceTable.Races[0]?.QualifyingResults ?? [];

    const sessions = {};
    if (qualiResults.length) {
      const date = race.Qualifying ? `${race.Qualifying.date}T${race.Qualifying.time ?? '00:00:00Z'}` : null;
      sessions.qualifying = {
        date,
        endDate: addEndDate(date, QUALI_DURATION_MS),
        results: qualiResults.map(mapQualiResult),
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

// ── 2 · circuitId de cada GP ────────────────────────────────────────────────
// Jolpica/Ergast circuitId → slug de data/circuits.json.
// Los que están comentados NO existen todavía en circuits.json: el reporte los
// lista con el slug propuesto para que sepas cuál crear.
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

  // ── Circuitos históricos / esporádicos: slug propuesto, todavía NO están en
  //    circuits.json. El circuitId igual se escribe; el reporte te dice cuál crear. ──
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
    if (gp.circuitId) continue;   // respeta lo que ya está

    const jolpicaId = circuitByRound[gp.round];
    if (!jolpicaId) continue;

    const projectId = CIRCUIT_ID_MAP[jolpicaId];
    if (!projectId) {
      report.circuits.push({ slug, round: gp.round, jolpicaId, note: 'sin slug propuesto en CIRCUIT_ID_MAP' });
      continue;
    }
    if (circuitSlugs && !circuitSlugs.has(projectId)) {
      report.circuits.push({ slug, round: gp.round, jolpicaId, projectId, note: `falta "${projectId}" en circuits.json` });
      // igual lo escribimos: el dato es correcto, sólo falta crear el circuito
    }

    // circuitId va justo después de name para mantener el orden de propiedades
    const { round, name, ...rest } = gp;
    season[slug] = { round, name, circuitId: projectId, ...rest };
  }
}

async function loadCircuitSlugs() {
  try {
    return new Set(Object.keys(JSON.parse(await readFile(CIRCUITS_PATH, 'utf-8'))));
  } catch (err) {
    if (err.code === 'ENOENT') return null;   // sin circuits.json: no validamos
    throw err;
  }
}

// ── 3 · FP1-3 scrapeadas de formula1.com ───────────────────────────────────
function parseDriverCell(rawText) {
  // La celda viene "Lando NorrisNOR" (nombre pegado al código de 3 letras).
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

// El índice de carreras de F1.com usa el ID interno de F1.com (no el nº de ronda)
// y el nombre del país en la URL, así que devolvemos [{ roundId, slug }] en orden
// cronológico. El nº de ronda es i+1.
async function fetchRoundMap(year) {
  const html = await fetchHtml(`${F1_BASE}/${year}/races`);
  if (!html) throw new Error(`no pude cargar el índice de carreras F1.com de ${year}`);

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
  if (!map.length) throw new Error(`F1.com no devolvió carreras para ${year} (¿cambió el markup?)`);
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
      if (!html) continue;   // 404 → no hubo esa sesión

      const results = parsePracticeTable(html);
      if (results) sessions[`fp${n}`] = { results };
    }

    if (Object.keys(sessions).length) byRound[round] = sessions;
  }

  return byRound;
}

// ── 4 · Merge con lo que ya había (preserva lo cargado a mano) ──────────────
const hasResults = (s) => Array.isArray(s?.results) && s.results.length > 0;

function mergeSeasons(fresh, existing, { force }) {
  if (force || !existing) return fresh;

  for (const [slug, freshGp] of Object.entries(fresh)) {
    const oldGp = existing[slug];
    if (!oldGp) continue;

    if (oldGp.circuitId && !freshGp.circuitId) {
      const { round, name, ...rest } = freshGp;
      fresh[slug] = { round, name, circuitId: oldGp.circuitId, ...rest };
    }
    // Conservamos toda sesión previa que ya tenga resultados (quali/FP a mano,
    // datos de OpenF1 en 2026, etc.). La fresca sólo rellena lo que falta.
    const merged = { ...freshGp.sessions };
    for (const [key, sess] of Object.entries(oldGp.sessions ?? {})) {
      if (hasResults(sess) || !merged[key]) merged[key] = sess;
    }
    fresh[slug].sessions = merged;
  }
  return fresh;
}

function attachPractice(season, practiceByRound) {
  const slugByRound = new Map(Object.entries(season).map(([slug, gp]) => [gp.round, slug]));
  let n = 0;
  for (const [round, fpSessions] of Object.entries(practiceByRound)) {
    const slug = slugByRound.get(Number(round));
    if (!slug) continue;
    const current = season[slug].sessions ?? {};
    // No pisar una FP que ya tenga resultados.
    for (const [key, sess] of Object.entries(fpSessions)) {
      if (!hasResults(current[key])) current[key] = sess;
    }
    season[slug].sessions = current;
    n++;
  }
  return n;
}

// ── 5 · Reporte de lo que quedó incompleto ─────────────────────────────────
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
    await unlink(path).catch(() => {});   // ya está completo: borramos el reporte viejo
    console.log(`\n✅ ${year}: sin huecos.`);
    return;
  }

  const lines = [
    `# season${year} — datos incompletos`,
    `# generado ${new Date().toISOString()}`,
    '',
  ];

  if (circuits.length) {
    lines.push('## Circuitos a agregar (crear en data/circuits.json; el circuitId ya quedó escrito si había slug propuesto)');
    for (const c of circuits) {
      const proposed = c.projectId ? ` → slug propuesto: ${c.projectId}` : '';
      lines.push(`${c.slug.padEnd(22)} R${c.round}  Jolpica "${c.jolpicaId}"${proposed}  (${c.note})`);
    }
    lines.push('');
  }

  if (missingQualifying.length) {
    lines.push('## Clasificaciones sin datos en Jolpica (completar sessions.qualifying a mano)');
    for (const m of missingQualifying) {
      lines.push(`${m.slug.padEnd(22)} R${m.round}  circuito: ${m.circuitId ?? 'desconocido'}`);
    }
    lines.push('');
  }

  await writeFile(path, lines.join('\n'), 'utf-8');
  console.log(`\n⚠  ${circuits.length} circuito(s) + ${missingQualifying.length} quali sin datos → ${path}`);
}

// ── main ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = { noPractice: false, force: false, dryRun: false, out: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-practice') flags.noPractice = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--out') flags.out = argv[++i];
    else positional.push(a);
  }
  return { year: positional[0], flags };
}

async function main() {
  const { year, flags } = parseArgs(process.argv.slice(2));
  if (!year || Number.isNaN(Number(year))) {
    console.error('Uso: node scripts/build-season.js <year> [--no-practice] [--force] [--dry-run] [--out <path>]');
    process.exit(1);
  }

  await mkdir(SEASONS_DIR, { recursive: true });
  const outPath = flags.out ?? join(SEASONS_DIR, `season${year}.json`);
  const report = { circuits: [], missingQualifying: [] };

  console.log(`\n── 1/4 · Jolpica: carrera + clasificación ──`);
  const { season, circuitByRound } = await fetchFromJolpica(year);

  console.log(`\n── 2/4 · circuitId por GP ──`);
  const circuitSlugs = await loadCircuitSlugs();
  resolveCircuitIds(season, circuitByRound, circuitSlugs, report);

  let existing = null;
  try {
    existing = JSON.parse(await readFile(outPath, 'utf-8'));
  } catch { /* no existía: es un season nuevo */ }
  const merged = mergeSeasons(season, existing, flags);

  if (flags.noPractice) {
    console.log(`\n── 3/4 · práctica (FP1-3): omitida (--no-practice) ──`);
  } else {
    console.log(`\n── 3/4 · práctica (FP1-3) desde formula1.com ──`);
    try {
      const practiceByRound = await fetchPractice(year);
      const n = attachPractice(merged, practiceByRound);
      console.log(`  ${n} carrera(s) con FP agregadas`);
    } catch (err) {
      console.warn(`  ! no se pudo scrapear práctica: ${err.message}`);
    }
  }

  console.log(`\n── 4/4 · huecos ──`);
  report.missingQualifying = findMissingQualifying(merged);

  if (flags.dryRun) {
    console.log('\n(--dry-run: no se escribe nada)');
    const gp = Object.keys(merged).length;
    const withQuali = Object.values(merged).filter((g) => g.sessions?.qualifying?.results?.length).length;
    const withFp = Object.values(merged).filter((g) => g.sessions?.fp1?.results?.length).length;
    console.log(`  ${gp} GP · ${withQuali} con quali · ${withFp} con FP1`);
    if (report.circuits.length)
      console.log('  circuitos:', report.circuits.map((c) => `${c.slug}(${c.jolpicaId})`).join(', '));
    if (report.missingQualifying.length)
      console.log('  quali faltantes:', report.missingQualifying.map((m) => m.slug).join(', '));
  } else {
    await writeFile(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    console.log(`\nEscrito: ${outPath}`);
    await writeReport(year, report);
  }

  console.log('\nRecordá regenerar careers.json:  node scripts/build-careers.js');
}

main().catch((err) => {
  console.error('\n❌', err);
  process.exit(1);
});
