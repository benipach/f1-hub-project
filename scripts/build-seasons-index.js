// Genera data/seasons-index.json a partir de todos los data/seasons/season*.json.
//
// Por qué precalcular: Archive muestra una tarjeta por temporada (campeón,
// equipo campeón, cuántas carreras) y los selectores de año de Results y
// Championship necesitan saber qué temporadas existen y qué sesiones tienen.
// Resolver eso en el navegador sería bajar ~37 archivos de 500 KB; acá se hace
// una vez y la página pide un JSON de unos pocos KB.
//
// Regenerar cuando cambien los datos de temporada:  node scripts/build-seasons-index.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEASONS_DIR = path.join(ROOT, 'data', 'seasons');
const OUT = path.join(ROOT, 'data', 'seasons-index.json');

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const teams = readJson(path.join(ROOT, 'data', 'teams.json'));
const drivers = readJson(path.join(ROOT, 'data', 'drivers.json'));

// Misma resolución de equipo que el front (ver build-careers.js).
const teamHelpers = new Function(
    fs.readFileSync(path.join(ROOT, 'js', 'shared', 'teams.js'), 'utf8')
    + '\nreturn { resolveTeamId };'
)();

const SESSION_KEYS = ['fp1', 'fp2', 'fp3', 'sprintQualy', 'sprintRace', 'qualifying', 'race'];

const results = (gp, key) => {
    const r = gp?.sessions?.[key]?.results;
    return Array.isArray(r) ? r : [];
};

function summarize(year, season) {
    const gps = Object.values(season)
        .filter(gp => gp && typeof gp === 'object' && gp.round != null && !gp.cancelled)
        .sort((a, b) => a.round - b.round);

    const raced = gps.filter(gp => results(gp, 'race').length);
    const sessions = SESSION_KEYS.filter(key => gps.some(gp => results(gp, key).length));

    // Puntos de carrera + sprint, igual que buildSeries en js/championship.js.
    const driverPts = new Map();
    const teamPts = new Map();
    const driverTeam = new Map();
    const wins = new Map();
    for (const gp of raced) {
        for (const key of ['race', 'sprintRace']) {
            for (const row of results(gp, key)) {
                if (!row.driver) continue;
                const teamId = teamHelpers.resolveTeamId(row.team, teams);
                driverPts.set(row.driver, (driverPts.get(row.driver) || 0) + (row.pts || 0));
                teamPts.set(teamId, (teamPts.get(teamId) || 0) + (row.pts || 0));
                driverTeam.set(row.driver, teamId);
                if (key === 'race' && row.pos === 1) wins.set(row.driver, (wins.get(row.driver) || 0) + 1);
            }
        }
    }

    const top = map => [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const champ = top(driverPts);
    const teamChamp = top(teamPts);

    const driverName = id => {
        const d = drivers[id];
        return d ? `${d.firstName} ${d.lastName}` : id.replace(/-/g, ' ');
    };
    const teamName = id => teams[id]?.name
        ?? id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return {
        year,
        rounds: gps.length,
        raced: raced.length,
        sessions,
        driverChampion: champ ? {
            id: champ[0],
            name: driverName(champ[0]),
            points: champ[1],
            wins: wins.get(champ[0]) || 0,
            teamId: driverTeam.get(champ[0]) ?? null,
            teamName: driverTeam.has(champ[0]) ? teamName(driverTeam.get(champ[0])) : null,
        } : null,
        teamChampion: teamChamp ? {
            id: teamChamp[0],
            name: teamName(teamChamp[0]),
            points: teamChamp[1],
        } : null,
    };
}

const files = fs.readdirSync(SEASONS_DIR).filter(f => /^season\d{4}\.json$/.test(f));
const seasons = files
    .map(f => summarize(Number(f.match(/\d{4}/)[0]), readJson(path.join(SEASONS_DIR, f))))
    .sort((a, b) => a.year - b.year);

fs.writeFileSync(OUT, JSON.stringify({ seasons }, null, 2) + '\n');
console.log(`seasons-index.json: ${seasons.length} temporadas (${seasons[0].year}–${seasons.at(-1).year})`);
