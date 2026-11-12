// Builds data/seasons/season{year}.json: races, qualifying and sprints from
// Jolpica, practice (FP1-3) from formula1.com, and each GP's circuit.
//
//   node scripts/build-season.ts <year>               the whole season
//   --no-practice    without formula1.com (old years, or offline)
//   --force          start over, discarding what the file had
//   --grid           only add the starting grid to the races of an existing file
//   --dry-run        say what it would do, write nothing
//   --out <file>     write somewhere else (the tests use it, see test/build-season.test.js)
//
// Over an existing file, nothing loaded before is lost: every session with
// results stays, and only the gaps are filled (plus the races' starting grid,
// where missing). --grid touches nothing else and costs ~1 request per GP:
// with Jolpica's 500 an hour, about 20 seasons an hour.
//
// What's left incomplete (circuits to create, qualifying Jolpica doesn't have)
// goes to _incomplete-{year}.txt next to the season file, rewritten each run.

import fs from 'node:fs';
import path from 'node:path';
import { DATA, readJson } from './lib/data.ts';
import { fetchPractice } from './lib/formula1.ts';
import { fetchSeason, type CircuitIssue } from './lib/jolpica.ts';

type Row = Record<string, unknown> & { driver?: string; number?: number; grid?: number };
type Session = { results?: Row[] } & Record<string, unknown>;
type GrandPrix = { round?: number; name?: string; circuitId?: string; cancelled?: boolean; sessions?: Record<string, Session> } & Record<string, unknown>;
type Season = Record<string, GrandPrix>;

// ── Command line ────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
    const flags = { noPractice: false, force: false, grid: false, dryRun: false, out: '' };
    let year = NaN;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--no-practice') flags.noPractice = true;
        else if (a === '--force') flags.force = true;
        else if (a === '--grid') flags.grid = true;
        else if (a === '--dry-run') flags.dryRun = true;
        else if (a === '--out') flags.out = argv[++i];
        else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
        else year = Number(a);
    }
    if (!year) {
        console.error('Usage: node scripts/build-season.ts <year> [--no-practice] [--force] [--grid] [--dry-run] [--out <file>]');
        process.exit(1);
    }
    return { year, ...flags, out: flags.out || path.join(DATA, 'seasons', `season${year}.json`) };
}

const args = parseArgs(process.argv.slice(2));
const existing: Season | null = fs.existsSync(args.out) ? readJson<Season>(args.out) : null;
const write = (season: Season) => fs.writeFileSync(args.out, JSON.stringify(season, null, 2) + '\n');

// ── Merging ─────────────────────────────────────────────────────────────────
const hasResults = (s?: Session) => Array.isArray(s?.results) && s.results.length > 0;
const RACES = ['race', 'sprintRace'];

// Copies the starting grid from a freshly fetched race to the same race
// already saved, row by row (by driver, or by car number if the ids differ),
// only where it's missing. Returns how many rows it filled.
function addGrid(saved?: Session, fresh?: Session): number {
    if (!hasResults(saved) || !hasResults(fresh)) return 0;
    const byDriver = new Map(fresh!.results!.map(r => [r.driver, r.grid]));
    const byNumber = new Map(fresh!.results!.map(r => [r.number, r.grid]));
    let added = 0;
    for (const row of saved!.results!) {
        if (row.grid !== undefined) continue;
        const grid = byDriver.get(row.driver) ?? byNumber.get(Number(row.number));
        if (grid === undefined || grid === null || Number.isNaN(grid)) continue;
        row.grid = grid;
        added++;
    }
    return added;
}

// The fetched season, keeping every saved session that has results (loaded
// by hand, from OpenF1…) and its circuit; Jolpica only fills what's missing.
function merge(fresh: Season, saved: Season) {
    let gridAdded = 0;
    for (const [slug, gp] of Object.entries(fresh)) {
        const old = saved[slug];
        if (!old) continue;
        if (old.circuitId && !gp.circuitId) {
            const { round, name, ...rest } = gp;
            fresh[slug] = { round, name, circuitId: old.circuitId, ...rest };
        }
        const sessions = { ...gp.sessions };
        for (const [key, s] of Object.entries(old.sessions ?? {})) {
            if (hasResults(s) || !sessions[key]) {
                if (RACES.includes(key)) gridAdded += addGrid(s, gp.sessions?.[key]);
                sessions[key] = s;
            }
        }
        fresh[slug].sessions = sessions;
    }
    return gridAdded;
}

// ── --grid ──────────────────────────────────────────────────────────────────
if (args.grid) {
    if (!existing) {
        console.error(`--grid needs an existing season file: ${args.out} doesn't exist. Build the season first.`);
        process.exit(1);
    }
    console.log('\n── Jolpica: race and sprint starting grid ──');
    const { season: fresh } = await fetchSeason(args.year, { gridOnly: true });
    let added = 0, touched = 0, missing = 0;
    for (const [slug, gp] of Object.entries(existing)) {
        let n = 0;
        for (const key of RACES) {
            n += addGrid(gp.sessions?.[key], (fresh[slug] as GrandPrix | undefined)?.sessions?.[key]);
            missing += (gp.sessions?.[key]?.results ?? []).filter(r => r.grid === undefined).length;
        }
        added += n;
        if (n) touched++;
    }
    console.log(`\n  ${added} row(s) filled in across ${touched} GP(s)`);
    console.log(missing ? `  ${missing} row(s) still without a grid (Jolpica doesn't have them or the driver doesn't match)` : '  every race/sprint row has a grid');
    if (args.dryRun) console.log('\n(--dry-run: nothing is written)');
    else if (!added) console.log('\nNothing to write.');
    else {
        write(existing);
        console.log(`\nWritten: ${args.out}\n\nRemember to regenerate careers.json:  node scripts/build-careers.ts`);
    }
    process.exit(0);
}

// ── The whole season ────────────────────────────────────────────────────────
console.log('\n── 1/3 · Jolpica: races, qualifying, sprints and circuits ──');
const circuitsFile = path.join(DATA, 'circuits.json');
const knownCircuits = fs.existsSync(circuitsFile) ? new Set(Object.keys(readJson(circuitsFile))) : null;
const { season, circuitIssues } = await fetchSeason(args.year, { knownCircuits });
if (existing && !args.force) {
    const gridAdded = merge(season as Season, existing);
    if (gridAdded) console.log(`  starting grid filled in on ${gridAdded} existing row(s)`);
}

if (args.noPractice) console.log('\n── 2/3 · practice (FP1-3): skipped (--no-practice) ──');
else {
    console.log('\n── 2/3 · practice (FP1-3) from formula1.com ──');
    try {
        const practice = await fetchPractice(args.year);
        const slugByRound = new Map(Object.entries(season).map(([slug, gp]) => [gp.round, slug]));
        let n = 0;
        for (const [round, sessions] of Object.entries(practice)) {
            const slug = slugByRound.get(Number(round));
            if (!slug) continue;
            const current = (season[slug].sessions ?? {}) as Record<string, Session>;
            for (const [key, s] of Object.entries(sessions)) if (!hasResults(current[key])) current[key] = s;
            season[slug].sessions = current;
            n++;
        }
        console.log(`  ${n} race(s) with FP added`);
    } catch (err) {
        console.warn(`  ! couldn't scrape practice: ${(err as Error).message}`);
    }
}

console.log('\n── 3/3 · gaps ──');
const missingQualifying = Object.entries(season as Season)
    .filter(([, gp]) => !gp.cancelled && !hasResults(gp.sessions?.qualifying))
    .map(([slug, gp]) => ({ slug, round: gp.round, circuitId: gp.circuitId ?? null }));

if (args.dryRun) {
    const gps = Object.values(season as Season);
    console.log('\n(--dry-run: nothing is written)');
    console.log(`  ${gps.length} GP · ${gps.filter(g => hasResults(g.sessions?.qualifying)).length} with qualifying · ${gps.filter(g => hasResults(g.sessions?.fp1)).length} with FP1`);
    if (circuitIssues.length) console.log('  circuits:', circuitIssues.map(c => `${c.slug}(${c.jolpicaId})`).join(', '));
    if (missingQualifying.length) console.log('  missing qualifying:', missingQualifying.map(m => m.slug).join(', '));
} else {
    write(season as Season);
    console.log(`\nWritten: ${args.out}`);
    writeReport(circuitIssues, missingQualifying);
}
console.log('\nRemember to regenerate careers.json:  node scripts/build-careers.ts');

function writeReport(circuits: CircuitIssue[], qualifying: { slug: string; round?: number; circuitId: string | null }[]) {
    const file = path.join(path.dirname(args.out), `_incomplete-${args.year}.txt`);
    if (!circuits.length && !qualifying.length) {
        fs.rmSync(file, { force: true });   // complete now: the old report goes
        console.log(`\n✅ ${args.year}: no gaps.`);
        return;
    }
    const lines = [`# season${args.year} — incomplete data`, `# generated ${new Date(Date.now()).toISOString()}`, ''];
    if (circuits.length) {
        lines.push('## Circuits to add (create them in data/circuits.json; the circuitId was already written if there was a proposed slug)');
        for (const c of circuits) {
            lines.push(`${c.slug.padEnd(22)} R${c.round}  Jolpica "${c.jolpicaId}"${c.projectId ? ` → proposed slug: ${c.projectId}` : ''}  (${c.note})`);
        }
        lines.push('');
    }
    if (qualifying.length) {
        lines.push('## Qualifying sessions missing from Jolpica (fill in sessions.qualifying by hand)');
        for (const m of qualifying) lines.push(`${m.slug.padEnd(22)} R${m.round}  circuit: ${m.circuitId ?? 'unknown'}`);
        lines.push('');
    }
    fs.writeFileSync(file, lines.join('\n'));
    console.log(`\n⚠  ${circuits.length} circuit(s) + ${qualifying.length} qualifying session(s) without data → ${file}`);
}
