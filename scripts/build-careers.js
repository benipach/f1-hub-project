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

// La resolución de equipo (alias + recorte de tokens) vive en js/shared/teams.js,
// que es un script clásico para el navegador. Se lo evalúa acá tal cual para
// que el precálculo y el front resuelvan exactamente igual — si no, un piloto
// podía tener una era "Mercedes-AMG" separada de "Mercedes" sólo porque las
// carreras de 2026 las cargó el adapter de OpenF1 con otro nombre.
const teamHelpers = new Function(
    fs.readFileSync(path.join(ROOT, 'js', 'shared', 'teams.js'), 'utf8')
    + '\nreturn { resolveTeamId };'
)();

function resolveTeam(rawId) {
    const id = teamHelpers.resolveTeamId(rawId, teams);
    const meta = teams[id] || null;
    return {
        id,
        name: meta?.name || id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
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
                // quali: posición en la clasificación (de acá salen las poles).
                // grid:  posición real de largada, con penalizaciones (0 = pit
                //        lane); si la temporada no la tiene, la quali.
                quali: q?.pos ?? null,
                grid: typeof r.grid === 'number' ? r.grid : (q?.pos ?? null),
                pts: (r.pts || 0) + (s?.pts || 0),
                dnf: isRetired(r),
                // Figura en la carrera pero no largó: no cuenta como largada
                // para el récord de "most race starts".
                dns: /DNS/i.test(String(r.time || '')),
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
            poles: e.races.filter(r => r.quali === 1).length,
            best: bestRace ? bestRace.pos : null,
            bestRace,                            // insumo del hito "best result in the team"
            firstWin: eraWins[0] ?? null,        // insumos de "first/last win with the team"
            lastWin: eraWins[eraWins.length - 1] ?? null,
            titles: years.filter(y => seasonChampions.get(y) === e.driverId),
        };
    });
}

// ── RÉCORDS HISTÓRICOS ──────────────────────────────────────────────────────
// Se repasan todas las carreras de la base en orden, llevando el total de cada
// piloto en cada categoría, y se anota cuándo alguien pasa a tener el récord.
// "All-time" quiere decir all-time *dentro de la base*: no se agrega ningún
// número de afuera. Hoy la base arranca en 1990 y no tiene qualy completa antes
// de 2003 ni vueltas rápidas antes de 2004, así que los primeros récords de cada
// categoría salen de lo que haya; a medida que se amplíen los season files, el
// resultado se corrige solo.
//
// Estados de un piloto en una categoría: sin récord, co-dueño (empatado arriba)
// o único dueño. Los hitos salen de los cambios de estado:
//   · sin récord → co-dueño     "Equalled all-time record"
//   · sin récord → único dueño  "Broke all-time record"
//   · co-dueño → único dueño    "Broke", salvo que en esa misma racha ya hubiera
//     sido único dueño (estiró un récord que ya era suyo: no se repite).
// Estirar un récord propio no genera hito; perderlo y recuperarlo, sí.
//
// Cuando nadie tenía todavía nada en la categoría (la primera carrera de la base,
// o el primer año con poles o vueltas rápidas cargadas) no hay récord previo que
// batir ni igualar: se toma como punto de partida, sin hito.
const RECORDS = [
    { key: 'titles',      amount: null },   // se suma en el GP donde se selló el título
    { key: 'wins',        amount: r => !r.dnf && r.pos === 1 ? 1 : 0 },
    { key: 'podiums',     amount: r => !r.dnf && r.pos <= 3 ? 1 : 0 },
    { key: 'poles',       amount: r => r.quali === 1 ? 1 : 0 },
    { key: 'points',      amount: r => r.pts || 0 },
    { key: 'fastestLaps', amount: r => r.fl ? 1 : 0 },
    { key: 'starts',      amount: r => r.dns ? 0 : 1 },
];

const raceKey = r => `${r.year}-${String(r.round).padStart(2, '0')}`;

// Todas las filas de todas las carreras, agrupadas por carrera.
const raceRows = new Map();   // raceKey → [{ driverId, race }]
for (const [driverId, races] of byDriver) {
    for (const race of races) {
        const k = raceKey(race);
        if (!raceRows.has(k)) raceRows.set(k, []);
        raceRows.get(k).push({ driverId, race });
    }
}

// Títulos: cuentan en la carrera donde quedaron sellados. Si no se puede
// determinar esa carrera, el título no entra en el récord (no se inventa fecha).
const clinchByRace = new Map();   // raceKey → { driverId, race }
for (const [year, champId] of seasonChampions) {
    const race = findClinchRace(year, champId);
    if (race) clinchByRace.set(raceKey(race), { driverId: champId, race });
}

const recordMilestones = new Map();   // driverId → [milestone]
const addRecordMilestone = (driverId, m) => {
    if (!recordMilestones.has(driverId)) recordMilestones.set(driverId, []);
    recordMilestones.get(driverId).push(m);
};

const placeOf = race => ({ year: race.year, gp: race.gp, date: race.date });

for (const { key, amount } of RECORDS) {
    const totals = new Map();       // driverId → total acumulado
    let recordValue = 0;
    let holders = new Set();
    // Racha de cada dueño actual: sus hitos, si ya fue único dueño en ella y
    // quién lo igualó por última vez (se borra si él vuelve a despegarse).
    const tenures = new Map();      // driverId → { events, everSole, equalledBy }

    // Al cerrar una racha (o al final, si sigue abierta) se completa el último
    // hito con lo que pasó después: hasta dónde lo estiró y quién lo alcanzó.
    // Si lo superaron, el tope es el récord que tenía antes de esa carrera: lo
    // que haya sumado en la misma carrera en que lo pasaron ya no fue récord.
    const closeTenure = (driverId, surpassedBy, heldValue) => {
        const t = tenures.get(driverId);
        tenures.delete(driverId);
        const last = t?.events[t.events.length - 1];
        if (!last) return;
        const peak = heldValue ?? (totals.get(driverId) || 0);
        if (peak > last.record.value) last.record.peak = peak;
        if (surpassedBy) last.record.after = { type: 'surpassed', ...surpassedBy };
        else if (t.equalledBy) last.record.after = { type: 'equalled', ...t.equalledBy };
        else last.record.current = true;
    };

    for (const k of [...raceRows.keys()].sort()) {
        const changed = [];
        const bump = (driverId, race, n) => {
            if (!n) return;
            totals.set(driverId, (totals.get(driverId) || 0) + n);
            changed.push({ driverId, race });
        };

        if (key === 'titles') {
            const c = clinchByRace.get(k);
            if (c) bump(c.driverId, c.race, 1);
        } else {
            for (const { driverId, race } of raceRows.get(k)) bump(driverId, race, amount(race));
        }
        if (!changed.length) continue;

        const top = Math.max(recordValue, ...changed.map(c => totals.get(c.driverId)));
        const atTop = changed.filter(c => totals.get(c.driverId) === top);
        const prevValue = recordValue;
        const prevHolders = holders;

        if (top > prevValue) {
            holders = new Set(atTop.map(c => c.driverId));
            // Los que quedaron abajo pierden el récord: superado por quien lo pasó.
            const by = atTop[0];
            for (const id of prevHolders) {
                if (!holders.has(id)) closeTenure(id, { by: by.driverId, ...placeOf(by.race) }, prevValue);
            }
        } else if (top === prevValue) {
            holders = new Set([...prevHolders, ...atTop.map(c => c.driverId)]);
        } else {
            continue;
        }
        recordValue = top;

        const sole = holders.size === 1;
        for (const { driverId, race } of atTop) {
            const wasHolder = prevHolders.has(driverId);
            let t = tenures.get(driverId);
            if (!t) {
                t = { events: [], everSole: false, equalledBy: null };
                tenures.set(driverId, t);
            }

            // Pasar la cifra del récord anterior es romperlo, aunque otro que
            // tampoco lo tenía llegue al mismo número en esa carrera. Sólo es
            // "equalled" si queda empatado con alguien que ya era dueño.
            const passedOldOwners = top > prevValue && ![...prevHolders].some(id => holders.has(id));
            let kind = null;
            if (prevValue > 0) {
                if (!wasHolder) kind = sole || passedOldOwners ? 'broke' : 'equalled';
                else if (sole && !t.everSole) kind = 'broke';
            }
            if (sole || kind === 'broke') t.everSole = true;
            if (sole) t.equalledBy = null;

            if (kind) {
                const m = milestone(race, kind === 'broke' ? 'Broke all-time record' : 'Equalled all-time record');
                m.record = { key, kind, value: totals.get(driverId) };
                t.events.push(m);
                addRecordMilestone(driverId, m);
            }

            // Quien lo alcanza deja anotado, en la racha de los que ya lo tenían,
            // que lo igualaron.
            if (!wasHolder && !sole) {
                for (const id of prevHolders) {
                    if (holders.has(id)) tenures.get(id).equalledBy = { by: driverId, ...placeOf(race) };
                }
            }
        }
    }

    for (const id of [...tenures.keys()]) closeTenure(id, null);
}

// Si un piloto igualó un récord y más adelante lo rompió (aunque en el medio lo
// haya perdido), queda sólo "Broke": el "Equalled" previo sobra.
for (const [driverId, list] of recordMilestones) {
    recordMilestones.set(driverId, list.filter(m =>
        m.record.kind !== 'equalled'
        || !list.some(b => b.record.kind === 'broke' && b.record.key === m.record.key && b.date > m.date)
    ));
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
        milestone(races.find(r => r.quali === 1), 'First pole'),
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
        // Récords históricos (ver RÉCORDS HISTÓRICOS más arriba).
        ...(recordMilestones.get(driverId) || []),
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
        poles:   lastDateOf(races.filter(r => r.quali === 1)),
        fastestLaps: lastDateOf(races.filter(r => r.fl)),
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
        poles: races.filter(r => r.quali === 1).length,
        fastestLaps: races.filter(r => r.fl).length,
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
