// fetch-practice.js
// Scrapea los resultados de Practice 1-3 desde la web oficial de F1
// (formula1.com/en/results) y los mergea dentro de data/season{year}.json,
// agregando sessions.fp1 / fp2 / fp3 sin tocar qualifying/race (que vienen
// de fetch-season.js / Jolpica).
//
// La pagina de resultados de F1.com viene server-rendered, asi que no hace
// falta un browser headless: alcanza con fetch + cheerio.
//
// Usage: node fetch-practice.js <year>

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.formula1.com/en/results';
const OUTPUT_DIR = 'data';
const REQUEST_DELAY_MS = 600; // no queremos hacer flood a la web oficial

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      // algunos CDNs devuelven una version reducida sin este header
      'User-Agent': 'Mozilla/5.0 (compatible; F1HubBot/1.0; +personal project)',
    },
  });
  if (res.status === 404) return null; // sesion no existe (ej: sprint weekend sin FP2/FP3)
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.text();
}

// Mismo criterio de slug que usa fetch-season.js, para que driver ids calcen
// con los que ya vienen de Jolpica (ej: "Lando Norris" -> "lando-norris").
function toSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// La celda de piloto en la tabla de F1.com viene como "Lando NorrisNOR"
// (nombre completo pegado al codigo de 3 letras, sin espacio, por como
// esta armado el markup). Separamos el codigo y de paso normalizamos.
function parseDriverCell(rawText) {
  const match = rawText.trim().match(/^(.*\S)\s*([A-Z]{3})$/);
  const fullName = match ? match[1].trim() : rawText.trim();
  return {
    fullName,
    slug: toSlug(fullName),
  };
}

function parseTeamCell(rawText) {
  return rawText.trim();
}

function teamId(teamName) {
  return toSlug(teamName);
}

// Arma el mapeo round -> { roundId, slug } scrapeando la pagina indice
// de carreras del año. roundId es el ID interno de F1.com (ej: 1267),
// no el numero de ronda del calendario.
async function fetchRoundMap(year) {
  const html = await fetchHtml(`${BASE_URL}/${year}/races`);
  if (!html) throw new Error(`No pude cargar el indice de carreras de ${year}`);

  const $ = cheerio.load(html);
  const roundMap = [];
  const seen = new Set();

  // Los links de cada carrera apuntan a .../races/{roundId}/{slug}/race-result
  $('a[href*="/race-result"]').each((_, el) => {
    const href = $(el).attr('href');
    const match = href?.match(/\/races\/(\d+)\/([a-z0-9-]+)\/race-result/);
    if (match) {
      const [, roundId, slug] = match;
      const key = `${roundId}-${slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        roundMap.push({ roundId, slug });
      }
    }
  });

  if (roundMap.length === 0) {
    throw new Error(
      `No encontre carreras en el indice de ${year}. Puede que F1.com haya cambiado el markup: revisar selector 'a[href*="/race-result"]'.`
    );
  }

  return roundMap;
}

// Parsea la tabla de resultados de una sesion de practica.
function parsePracticeTable(html) {
  const $ = cheerio.load(html);
  const table = $('table').first();
  if (table.length === 0) return null; // sesion no jugada / pagina vacia

  const results = [];

  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return; // fila invalida, skip

    const pos = Number($(cells[0]).text().trim());
    const number = Number($(cells[1]).text().trim());
    const { slug: driverSlug } = parseDriverCell($(cells[2]).text());
    const team = parseTeamCell($(cells[3]).text());
    const time = $(cells[4]).text().trim();
    const laps = cells.length > 5 ? Number($(cells[5]).text().trim()) : null;

    if (!pos || !driverSlug) return;

    results.push({
      pos,
      driver: driverSlug,
      number: Number.isFinite(number) ? number : null,
      team: teamId(team),
      time: time || 'No time',
      ...(laps !== null && Number.isFinite(laps) ? { laps } : {}),
    });
  });

  return results.length > 0 ? results : null;
}

async function fetchSeasonPractice(year) {
  const roundMap = await fetchRoundMap(year);
  const practiceByRound = {}; // round number -> { slug (de F1.com, solo para logs), sessions }

  for (let i = 0; i < roundMap.length; i++) {
    const { roundId, slug } = roundMap[i];
    const round = i + 1;
    const sessions = {};

    for (const n of [1, 2, 3]) {
      await sleep(REQUEST_DELAY_MS);
      const url = `${BASE_URL}/${year}/races/${roundId}/${slug}/practice/${n}`;
      console.log(`[${year}] Round ${round} (${slug}): Practice ${n}`);

      let html;
      try {
        html = await fetchHtml(url);
      } catch (err) {
        console.warn(`  ! error en Practice ${n}: ${err.message}`);
        continue;
      }

      if (!html) {
        console.log(`  - Practice ${n} no existe para este finde (probablemente sprint weekend)`);
        continue;
      }

      const results = parsePracticeTable(html);
      if (!results) {
        console.log(`  - Practice ${n} sin datos (sesion no jugada / tabla vacia)`);
        continue;
      }

      sessions[`fp${n}`] = { results };
    }

    if (Object.keys(sessions).length > 0) {
      // Guardamos por numero de ronda, NO por slug: F1.com usa el nombre del
      // pais en la URL (ej: "australia") mientras que fetch-season.js/Jolpica
      // slugifica el nombre del GP (ej: "australian-gp"). No matchean como
      // string, pero ambas fuentes procesan las carreras en el mismo orden
      // cronologico, asi que el numero de ronda es la clave comun confiable.
      practiceByRound[round] = { slug, sessions };
    }
  }

  return practiceByRound;
}

async function main() {
  const year = process.argv[2];
  if (!year || Number.isNaN(Number(year))) {
    console.error('Usage: node fetch-practice.js <year>');
    process.exit(1);
  }

  const seasonPath = join(OUTPUT_DIR, `season${year}.json`);

  let season;
  try {
    season = JSON.parse(await readFile(seasonPath, 'utf-8'));
  } catch {
    console.error(
      `No encontre ${seasonPath}. Corre primero fetch-season.js ${year} para tener la base de carrera/quali antes de agregar las practicas.`
    );
    process.exit(1);
  }

  const practiceByRound = await fetchSeasonPractice(year);

  // Armamos un indice round -> slug de season.json (ese es el slug que
  // realmente hay que usar para escribir, aunque no coincida con el de F1.com).
  const seasonSlugByRound = new Map();
  for (const [seasonSlug, race] of Object.entries(season)) {
    seasonSlugByRound.set(race.round, seasonSlug);
  }

  let merged = 0;
  for (const [round, { slug: f1Slug, sessions }] of Object.entries(practiceByRound)) {
    const seasonSlug = seasonSlugByRound.get(Number(round));
    if (!seasonSlug) {
      console.warn(`  ! Ronda ${round} (${f1Slug} en F1.com) no tiene match por numero de ronda en ${seasonPath}, skip`);
      continue;
    }
    season[seasonSlug].sessions = {
      ...season[seasonSlug].sessions,
      ...sessions,
    };
    merged++;
  }

  await writeFile(seasonPath, JSON.stringify(season, null, 2), 'utf-8');
  console.log(`\nListo: ${merged} carreras actualizadas con FP en ${seasonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});