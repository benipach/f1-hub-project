// Generates data/seasons-index.json from all the data/seasons/season*.json files.
//
// Why precompute: Archive shows one card per season (champion,
// champion team, how many races) and the year selectors in Results and
// Championship need to know which seasons exist and which sessions they have.
// Resolving that in the browser would mean downloading ~37 files of 500 KB; here it's done
// once and the page requests a JSON of a few KB.
//
// Regenerate whenever season data changes:  node scripts/build-seasons-index.ts
// (--out <file> writes somewhere else; the tests use it, see test/scripts.test.js)

import fs from 'node:fs';
import path from 'node:path';
import { DATA, loadSeasons, outputPath, readJson, resolveTeamId, runningOrder, sessionResults, teamName, type Season } from './lib/data.ts';

const drivers = readJson<Record<string, { firstName: string; lastName: string }>>(path.join(DATA, 'drivers.json'));

const SESSION_KEYS = ['fp1', 'fp2', 'fp3', 'sprintQualy', 'sprintRace', 'qualifying', 'race'];

const add = (map: Map<string, number>, key: string, amount: number) => map.set(key, (map.get(key) ?? 0) + amount);

function summarize(year: number, season: Season) {
    const gps = runningOrder(season).filter(gp => gp.round != null);
    const raced = gps.filter(gp => sessionResults(gp, 'race').length);
    const sessions = SESSION_KEYS.filter(key => gps.some(gp => sessionResults(gp, key).length));

    // Race + sprint points, same as buildSeries in js/championship.js.
    const driverPts = new Map<string, number>();
    const teamPts = new Map<string, number>();
    const driverTeam = new Map<string, string>();
    const wins = new Map<string, number>();
    for (const gp of raced) {
        for (const key of ['race', 'sprintRace']) {
            for (const row of sessionResults(gp, key)) {
                if (!row.driver) continue;
                const teamId = resolveTeamId(row.team);
                add(driverPts, row.driver, row.pts || 0);
                add(teamPts, teamId, row.pts || 0);
                driverTeam.set(row.driver, teamId);
                if (key === 'race' && row.pos === 1) add(wins, row.driver, 1);
            }
        }
    }

    const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const champ = top(driverPts);
    const teamChamp = top(teamPts);

    const driverName = (id: string) => {
        const d = drivers[id];
        return d ? `${d.firstName} ${d.lastName}` : id.replace(/-/g, ' ');
    };

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
            teamName: driverTeam.has(champ[0]) ? teamName(driverTeam.get(champ[0])!) : null,
        } : null,
        teamChampion: teamChamp ? {
            id: teamChamp[0],
            name: teamName(teamChamp[0]),
            points: teamChamp[1],
        } : null,
    };
}

const seasons = loadSeasons().map(({ year, season }) => summarize(year, season));

fs.writeFileSync(outputPath('seasons-index.json'), JSON.stringify({ seasons }, null, 2) + '\n');
console.log(`seasons-index.json: ${seasons.length} seasons (${seasons[0].year}–${seasons.at(-1)!.year})`);
