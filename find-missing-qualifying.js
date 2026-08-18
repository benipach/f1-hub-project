// find-missing-qualifying.js
// Scans local data/seasons/season{year}.json files and reports every GP
// whose "qualifying" session is missing or has no results (empty/absent
// results array), along with its circuitId.
//
// Usage: node find-missing-qualifying.js <year> [year2 ...]
//        node find-missing-qualifying.js all   (scans data/seasons/season*.json)

import { readFile, readdir, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SEASONS_DIR = join('data', 'seasons');
const MISSING_LOG_PATH = join(SEASONS_DIR, 'missing-qualifying.txt');

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

function isQualifyingMissing(gp) {
  const quali = gp.sessions?.qualifying;
  if (!quali) return true;
  if (!Array.isArray(quali.results) || quali.results.length === 0) return true;
  return false;
}

async function writeMissingLog(missing) {
  if (missing.length === 0) return;

  const lines = missing
    .map((m) => `[${m.year}] ${m.gp} (${m.name ?? 'no name'}) — circuit: ${m.circuitId ?? 'unknown'}`)
    .join('\n') + '\n';

  try {
    const existing = await readFile(MISSING_LOG_PATH, 'utf-8');
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    await appendFile(MISSING_LOG_PATH, prefix + lines, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeFile(MISSING_LOG_PATH, lines, 'utf-8');
    } else {
      throw err;
    }
  }

  console.log(`\n${missing.length} missing qualifying session(s) logged to ${MISSING_LOG_PATH}`);
}

async function processYear(year, missing) {
  const path = join(SEASONS_DIR, `season${year}.json`);
  const season = JSON.parse(await readFile(path, 'utf-8'));

  for (const [gpSlug, gp] of Object.entries(season)) {
    if (gp.cancelled) continue;
    if (!isQualifyingMissing(gp)) continue;

    missing.push({
      year,
      gp: gpSlug,
      name: gp.name ?? null,
      circuitId: gp.circuitId ?? null,
    });
  }
}

async function main() {
  const years = await resolveYears(process.argv.slice(2));
  if (years.length === 0) {
    console.error('Usage: node find-missing-qualifying.js <year> [year2 ...]  |  node find-missing-qualifying.js all');
    process.exit(1);
  }

  const missing = [];
  for (const year of years) {
    await processYear(year, missing);
  }

  await writeMissingLog(missing);

  if (missing.length === 0) {
    console.log('No missing qualifying sessions found.');
    return;
  }

  console.log(`${missing.length} GP(s) with missing/empty qualifying:\n`);
  for (const m of missing) {
    console.log(`[${m.year}] ${m.gp} (${m.name ?? 'no name'}) — circuit: ${m.circuitId ?? 'unknown'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});