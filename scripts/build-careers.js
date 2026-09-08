// Genera data/careers.json a partir de todos los data/seasons/season*.json.
//
// Por qué precalcular: los season files suman ~7 MB. La sección Biography sólo
// necesita hitos y eras por piloto, así que se resuelven una vez acá y la página
// hace un único fetch chico en vez de 20 grandes.
//
// Regenerar cuando cambien los datos de temporada:  node scripts/build-careers.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEASONS_DIR = path.join(ROOT, 'data', 'seasons');
const OUT = path.join(ROOT, 'data', 'careers.json');

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const teams = readJson(path.join(ROOT, 'data', 'teams.json'));
const circuits = readJson(path.join(ROOT, 'data', 'circuits.json'));
const cities = readJson(path.join(ROOT, 'data', 'cities.json'));
const countries = readJson(path.join(ROOT, 'data', 'countries.json'));

// Los resultados viejos usan ids de equipo que teams.json ya no tiene con ese
// nombre exacto (2016-2017 traen "red-bull", el JSON sólo tiene "red-bull-racing").
const TEAM_ALIASES = {
    'red-bull': 'red-bull-racing',
    'force-india': 'racing-point',
    'toro-rosso': 'toro-rosso',
};

function resolveTeam(rawId) {
    const slug = String(rawId || '').trim().toLowerCase().replace(/\s+/g, '-');
    const id = teams[slug] ? slug : (TEAM_ALIASES[slug] && teams[TEAM_ALIASES[slug]] ? TEAM_ALIASES[slug] : null);
    const meta = id ? teams[id] : null;
    return {
        id: id || slug,
        name: meta?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        color: meta?.color || null,
    };
}

// GP → circuito → ciudad → país → ISO de 2 letras, para la bandera.
function isoFor(gp) {
    const city = circuits[gp.circuitId]?.location?.city;
    return countries[cities[city]?.country]?.isoCode || null;
}

const sessionResults = (gp, key) => {
    const r = gp?.sessions?.[key]?.results;
    return Array.isArray(r) ? r : [];
};

const isRetired = row => /DN[FS]/i.test(String(row?.time || ''));

// ── Recorrer todas las temporadas y juntar cada carrera por piloto ──────────
const files = fs.readdirSync(SEASONS_DIR)
    .filter(f => /^season\d{4}\.json$/.test(f))
    .sort();

const byDriver = new Map();          // driverId → [race, …] en orden cronológico
const seasonChampions = new Map();   // year → driverId
const seasonStandings = new Map();   // driverId → { year: posición en el campeonato }

for (const file of files) {
    const year = Number(file.match(/\d{4}/)[0]);
    const season = readJson(path.join(SEASONS_DIR, file));
    const gps = Object.values(season).sort((a, b) => a.round - b.round);

    const seasonPoints = {};

    for (const gp of gps) {
        const race = sessionResults(gp, 'race');
        if (!race.length) continue;

        const quali = sessionResults(gp, 'qualifying');
        const sprint = sessionResults(gp, 'sprintRace');

        for (const key of ['race', 'sprintRace']) {
            for (const r of sessionResults(gp, key)) {
                seasonPoints[r.driver] = (seasonPoints[r.driver] || 0) + (r.pts || 0);
            }
        }

        for (const r of race) {
            const q = quali.find(x => x.driver === r.driver);
            const s = sprint.find(x => x.driver === r.driver);
            if (!byDriver.has(r.driver)) byDriver.set(r.driver, []);
            byDriver.get(r.driver).push({
                year,
                round: gp.round,
                gp: gp.name.replace(/ Grand Prix$/, ''),
                iso: isoFor(gp),
                date: (gp.sessions.race.date || '').slice(0, 10),
                pos: r.pos,
                grid: q?.pos ?? null,
                pts: (r.pts || 0) + (s?.pts || 0),
                dnf: isRetired(r),
                fl: Boolean(r.fastestLap),
                team: r.team,
                number: r.number ?? null,
            });
        }
    }

    const standings = Object.entries(seasonPoints).sort((a, b) => b[1] - a[1]);
    standings.forEach(([id], i) => {
        if (!seasonStandings.has(id)) seasonStandings.set(id, {});
        seasonStandings.get(id)[year] = i + 1;
    });

    // Puntos que todavía quedan por repartir. Un fin de semana se cuenta como
    // pendiente sólo si su carrera no se corrió; si la carrera ya está, el sprint
    // (de haberlo) también, aunque falten sus resultados en el JSON. 25 por
    // carrera + 8 por sprint (F1 2026 no da punto por vuelta rápida).
    let pointsLeft = 0;
    for (const gp of gps) {
        if (gp.cancelled) continue;
        if (sessionResults(gp, 'race').length) continue;   // finde terminado
        pointsLeft += 25;
        if (gp.sprint) pointsLeft += 8;
    }

    // Campeón sólo si el título está definido: o la temporada terminó (nada por
    // repartir), o la ventaja del líder sobre el 2º ya supera todos los puntos en
    // juego, así que es imposible alcanzarlo.
    const gap = standings.length >= 2 ? standings[0][1] - standings[1][1] : Infinity;
    const decided = standings.length > 0 && (pointsLeft === 0 || gap > pointsLeft);
    if (decided) seasonChampions.set(year, standings[0][0]);
}

// ── Armar el registro de cada piloto ────────────────────────────────────────
function milestone(race, label) {
    if (!race) return null;
    const t = resolveTeam(race.team);
    return {
        label,
        year: race.year,
        gp: race.gp,
        iso: race.iso,
        date: race.date,
        pos: race.pos,
        grid: race.grid,
        team: t.name,
        teamColor: t.color,
    };
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// La carrera donde un título quedó matemáticamente sellado: se replay la
// temporada ronda a ronda y se busca la primera en la que la ventaja del campeón
// sobre el mejor de los demás supera todos los puntos que aún quedaban en juego.
function findClinchRace(year, champId) {
    let season;
    try { season = readJson(path.join(SEASONS_DIR, `season${year}.json`)); }
    catch { return null; }

    const gps = Object.values(season).filter(g => !g.cancelled).sort((a, b) => a.round - b.round);
    const running = {};

    for (let i = 0; i < gps.length; i++) {
        const gp = gps[i];
        for (const key of ['race', 'sprintRace']) {
            for (const r of sessionResults(gp, key)) {
                running[r.driver] = (running[r.driver] || 0) + (r.pts || 0);
            }
        }

        // Puntos máximos que un rival podría sumar en las rondas que faltan.
        let remaining = 0;
        for (let j = i + 1; j < gps.length; j++) {
            remaining += 25;
            if (gps[j].sprint) remaining += 8;
        }

        const champPts = running[champId] || 0;
        const bestOther = Math.max(0, ...Object.entries(running)
            .filter(([id]) => id !== champId)
            .map(([, p]) => p));

        if (champPts - bestOther > remaining) {
            const row = sessionResults(gp, 'race').find(r => r.driver === champId);
            return {
                year,
                round: gp.round,
                gp: gp.name.replace(/ Grand Prix$/, ''),
                iso: isoFor(gp),
                date: (gp.sessions?.race?.date || '').slice(0, 10),
                pos: row?.pos ?? null,
                grid: null,
                team: row?.team ?? null,
            };
        }
    }
    return null;   // no se pudo verificar el cierre (datos incompletos)
}

// Tramos consecutivos con el mismo equipo. Se agrupa por equipo *resuelto*, así
// "red-bull" y "red-bull-racing" cuentan como una sola era.
function buildEras(races) {
    const eras = [];
    for (const r of races) {
        const t = resolveTeam(r.team);
        const last = eras[eras.length - 1];
        if (last && last.teamId === t.id) {
            last.races.push(r);
        } else {
            eras.push({ teamId: t.id, teamName: t.name, teamColor: t.color, races: [r] });
        }
    }
    return eras.map(e => {
        const finished = e.races.filter(r => !r.dnf);
        const years = [...new Set(e.races.map(r => r.year))].sort();
        // Carrera con el mejor puesto de esa etapa (la más temprana si hay empate).
        const bestRace = finished.length
            ? finished.reduce((b, r) => (r.pos < b.pos ? r : b))
            : null;
        const eraWins = finished.filter(r => r.pos === 1);   // ya en orden cronológico
        return {
            teamId: e.teamId,
            team: e.teamName,
            color: e.teamColor,
            // seasons son los años realmente presentes en los datos: el dataset
            // no tiene 2018-2025, así que un rango from-to solo mentiría.
            seasons: years,
            from: years[0],
            to: years[years.length - 1],
            races: e.races.length,
            points: e.races.reduce((a, r) => a + r.pts, 0),
            wins: eraWins.length,
            podiums: finished.filter(r => r.pos <= 3).length,
            poles: e.races.filter(r => r.grid === 1).length,
            best: bestRace ? bestRace.pos : null,
            bestRace,                            // insumo del hito "best result in the team"
            firstWin: eraWins[0] ?? null,        // insumos de "first/last win with the team"
            lastWin: eraWins[eraWins.length - 1] ?? null,
            titles: years.filter(y => seasonChampions.get(y) === e.driverId),
        };
    });
}

const careers = {};

for (const [driverId, races] of byDriver) {
    races.sort((a, b) => a.year - b.year || a.round - b.round);
    const finished = races.filter(r => !r.dnf);

    const eras = buildEras(races);
    // titles se resuelve acá porque buildEras no conoce el driverId.
    const titleYears = [...seasonChampions.entries()]
        .filter(([, id]) => id === driverId)
        .map(([y]) => y);
    for (const era of eras) {
        era.titles = titleYears.filter(y => y >= era.from && y <= era.to);
    }

    // Mejor puesto en un campeonato (y todos los años en que lo consiguió): es lo
    // que se muestra cuando el piloto no tiene títulos, para que la sección diga
    // algo igual.
    const standings = seasonStandings.get(driverId) || {};
    const standingYears = Object.entries(standings).map(([year, pos]) => ({ year: Number(year), pos }));
    const bestPos = standingYears.length ? Math.min(...standingYears.map(s => s.pos)) : null;
    const bestFinish = bestPos == null ? null : {
        pos: bestPos,
        years: standingYears.filter(s => s.pos === bestPos).map(s => s.year).sort((a, b) => a - b),
    };

    // Cada título con el detalle de esa temporada: sin esto las copas serían
    // sólo decoración, y la idea es que cada una cuente algo.
    const titles = titleYears.map(year => {
        const seasonRaces = races.filter(r => r.year === year);
        const seasonFinished = seasonRaces.filter(r => !r.dnf);
        const team = resolveTeam(seasonRaces[seasonRaces.length - 1]?.team);
        return {
            year,
            teamId: team.id,
            team: team.name,
            color: team.color,
            races: seasonRaces.length,
            wins: seasonFinished.filter(r => r.pos === 1).length,
            podiums: seasonFinished.filter(r => r.pos <= 3).length,
            points: seasonRaces.reduce((a, r) => a + r.pts, 0),
        };
    });

    // Número de auto: el de la temporada más reciente en la que corrió.
    const lastNumbered = [...races].reverse().find(r => r.number != null);

    // Racha de victorias más larga: corrida más larga de carreras consecutivas
    // ganadas. Sólo tiene sentido a partir de 2 (una victoria suelta no es racha).
    // Se emite como un hito más de la línea de tiempo, en el GP donde terminó.
    let streakMilestone = null, streakRace = null;
    {
        let run = 0, endRace = null, best = 0, bestEnd = null;
        for (const r of races) {
            if (!r.dnf && r.pos === 1) {
                run++; endRace = r;
                if (run > best) { best = run; bestEnd = endRace; }
            } else {
                run = 0;
            }
        }
        if (best >= 2) {
            streakMilestone = { ...milestone(bestEnd, 'Longest winning streak'), streakLength: best };
            streakRace = bestEnd;
        }
    }

    const firstWinRace = finished.find(r => r.pos === 1) || null;
    const lastWinRace = [...finished].reverse().find(r => r.pos === 1) || null;
    const sameRace = (a, b) => a && b && a.year === b.year && a.round === b.round;

    // Equipos con 2+ victorias: son los únicos que emiten hitos de primera/última
    // victoria con el equipo.
    const winEras = eras.filter(e => e.wins >= 2);

    // Todas las carreras que ya emiten un hito de victoria. "Best result in the
    // team" es siempre esa misma victoria cuando cae acá, así que se omite: decir
    // "first win & best result in the team" es redundante.
    const winRaces = [
        firstWinRace,
        ...winEras.map(e => e.firstWin),
        ...winEras.map(e => e.lastWin),
        streakRace,
    ].filter(Boolean);
    const isWinRace = r => winRaces.some(w => sameRace(w, r));

    const milestones = [
        milestone(races[0], 'Debut'),
        milestone(races.find(r => r.pts > 0), 'First points'),
        milestone(finished.find(r => r.pos <= 3), 'First podium'),
        milestone(firstWinRace, 'First win'),
        milestone(races.find(r => r.grid === 1), 'First pole'),
        streakMilestone,
        // Un hito por cada título, en el GP donde quedó sellado.
        ...titleYears
            .sort((a, b) => a - b)
            .map((y, i) => milestone(findClinchRace(y, driverId), `${ordinal(i + 1)} World Title`)),
        // Primera y última victoria con cada equipo, sólo si ahí ganó 2+ veces.
        // La "primera con el equipo" se omite si coincide con la primera de la
        // carrera (si no, "first win" siempre la arrastraría).
        ...winEras
            .filter(e => !sameRace(e.firstWin, firstWinRace))
            .map(e => milestone(e.firstWin, 'First win with the team')),
        // Cuando la última victoria con el equipo es además la última de toda
        // su carrera, aclarar "with the team" sobra y suena a que después ganó
        // con otro: ahí el hito es, sin más, la última victoria.
        ...winEras
            .map(e => milestone(e.lastWin, sameRace(e.lastWin, lastWinRace) ? 'Last win' : 'Last win with the team')),
        // Mejor resultado en cada equipo. Último en prioridad. Se omite si esa
        // carrera ya es un hito de victoria: la victoria lo dice todo y el par
        // "first win & best result in the team" sobra.
        ...eras
            .filter(e => e.bestRace && !isWinRace(e.bestRace))
            .map(e => milestone(e.bestRace, 'Best result in the team')),
    ].filter(Boolean);

    // Insumos que no van al JSON.
    for (const e of eras) { delete e.bestRace; delete e.firstWin; delete e.lastWin; }

    // ── CUÁNDO LLEGÓ A CADA CIFRA ──────────────────────────────────────────
    // Fecha del último evento que hizo subir cada contador, o sea el día en
    // que el piloto alcanzó el total que hoy muestra su ficha. Sirve para
    // desempatar rankings: entre dos con el mismo número, va primero el que
    // llegó antes (Schumacher llegó a 5 títulos en 2004, Hamilton a 5 en
    // 2018, así que con 5 y 5 iría Schumacher arriba).
    //
    // Se calcula acá y no en el front porque el front sólo baja careers.json:
    // recalcularlo allá obligaría a leer los ~7 MB de season files.
    const lastDateOf = list => list.length ? list[list.length - 1].date || null : null;

    const achievedAt = {
        races:   lastDateOf(races),
        wins:    lastDateOf(finished.filter(r => r.pos === 1)),
        podiums: lastDateOf(finished.filter(r => r.pos <= 3)),
        poles:   lastDateOf(races.filter(r => r.grid === 1)),
        // Los puntos suben sólo en las carreras donde sumó, así que la fecha
        // del total es la de la última vez que puntuó.
        points:  lastDateOf(races.filter(r => r.pts > 0)),
        // Para los títulos vale el día en que quedó sellado el último, que es
        // justo el hito que ya se calcula arriba.
        titles: titleYears.length
            ? (milestones.find(m => m.label === `${ordinal(titleYears.length)} World Title`)?.date ?? null)
            : null,
    };

    careers[driverId] = {
        races: races.length,
        // Fecha del debut. Se usa como desempate en los rankings para los
        // pilotos que todavía tienen 0 en una categoría: no hay "cuándo lo
        // consiguió", pero sí "desde cuándo viene intentándolo".
        debut: races[0]?.date ?? null,
        seasons: [...new Set(races.map(r => r.year))].sort(),
        number: lastNumbered?.number ?? null,
        points: races.reduce((a, r) => a + r.pts, 0),
        wins: finished.filter(r => r.pos === 1).length,
        podiums: finished.filter(r => r.pos <= 3).length,
        poles: races.filter(r => r.grid === 1).length,
        titleYears,
        titles,
        bestFinish,
        eras,
        milestones,
        achievedAt,
    };
}

fs.writeFileSync(OUT, JSON.stringify(careers));
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`careers.json escrito: ${Object.keys(careers).length} pilotos, ${kb} KB`);
