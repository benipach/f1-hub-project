// pages/drivers.js — ordena el hero y las tarjetas de drivers.html según el
// campeonato actual y pone el año de la temporada en el título.
// Los equipos van por el de constructores y, dentro de cada equipo, sus dos
// pilotos por el de pilotos. El HTML trae un orden fijo que queda como está si
// los datos no cargan.

// Puntos por clave (piloto o equipo) sumando carreras y sprints de los GP no
// cancelados, más los puestos en carrera para desempatar.
function computeStandings(season) {
    const drivers = new Map();
    const teams = new Map();
    const entry = (map, key) => {
        if (!map.has(key)) map.set(key, { pts: 0, finishes: [] });
        return map.get(key);
    };

    for (const gp of Object.values(season)) {
        if (isGpCancelled(gp)) continue;
        for (const key of ['race', 'sprintRace']) {
            for (const row of getSessionResults(gp, key)) {
                const targets = [entry(drivers, row.driver), entry(teams, resolveTeamId(row.team))];
                for (const t of targets) {
                    t.pts += row.pts || 0;
                    if (key === 'race' && typeof row.pos === 'number') t.finishes.push(row.pos);
                }
            }
        }
    }
    return { drivers, teams };
}

// Reglamento FIA: a igualdad de puntos gana quien tenga más victorias; si
// siguen iguales, más segundos puestos, y así. Sin datos, conserva el orden
// del HTML (Array.sort es estable).
function compareStanding(a, b) {
    if (!a || !b) return (b ? 1 : 0) - (a ? 1 : 0);
    if (a.pts !== b.pts) return b.pts - a.pts;
    const worst = Math.max(0, ...a.finishes, ...b.finishes);
    for (let pos = 1; pos <= worst; pos++) {
        const diff = b.finishes.filter(p => p === pos).length - a.finishes.filter(p => p === pos).length;
        if (diff) return diff;
    }
    return 0;
}

function sortHero({ drivers, teams }) {
    const strip = document.querySelector('.lv-strip');
    const driverId = slice => new URL(slice.href).searchParams.get('driver');

    const pairs = [...strip.querySelectorAll('.lv-pair')];
    pairs.sort((a, b) => compareStanding(teams.get(a.dataset.team), teams.get(b.dataset.team)));

    for (const pair of pairs) {
        const slices = [...pair.querySelectorAll('.lv-slice')];
        slices.sort((a, b) => compareStanding(drivers.get(driverId(a)), drivers.get(driverId(b))));
        // El logo va entre los dos pilotos
        pair.append(slices[0], pair.querySelector('.lv-logo-slot'), slices[1]);
        strip.append(pair);
    }
    // En celulares la franja scrollea de costado: al reordenar (o al recargar,
    // que el navegador restaura el scroll) puede quedar corrida. Se vuelve al
    // principio para que el primer equipo se vea entero.
    strip.scrollLeft = 0;
}

// Los bloques de equipo de las tarjetas, con el mismo orden que el hero
function sortGrid({ drivers, teams }) {
    const grid = document.querySelector('.drivers-grid');
    const driverId = card => new URL(card.href).searchParams.get('driver');

    const blocks = [...grid.querySelectorAll('.dc-team')];
    blocks.sort((a, b) => compareStanding(teams.get(a.dataset.team), teams.get(b.dataset.team)));

    for (const block of blocks) {
        const pair = block.querySelector('.dc-pair');
        const cards = [...pair.querySelectorAll('.drivercard')];
        cards.sort((a, b) => compareStanding(drivers.get(driverId(a)), drivers.get(driverId(b))));
        pair.append(...cards);
        grid.append(block);
    }
}

// Nombre de cada equipo en el encabezado de su bloque, tal como está en
// teams.json. El HTML trae los mismos por si los datos no cargan.
function fillTeamNames(teamsData) {
    for (const block of document.querySelectorAll('.dc-team')) {
        const name = teamsData[block.dataset.team]?.name;
        if (name) block.querySelector('.dc-team-full').textContent = name;
    }
}

// Arma el título letra por letra para la entrada escalonada. Sin año (si los
// datos no cargan) queda "The Grid".
function renderTitle(year) {
    const title = document.querySelector('.lv-copy h1');
    const words = year ? ['The', String(year), 'Grid'] : ['The', 'Grid'];
    let i = 0;
    const nodes = words.flatMap((word, w) => {
        const wordEl = Object.assign(document.createElement('span'), { className: word === String(year) ? 'lv-year' : '' });
        wordEl.append(...[...word].map(char => {
            const charEl = Object.assign(document.createElement('span'), { className: 'lv-char', textContent: char });
            charEl.style.setProperty('--i', i++);
            return charEl;
        }));
        return w ? [' ', wordEl] : [wordEl];
    });
    title.replaceChildren(...nodes);
    title.classList.add('is-ready');
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!document.querySelector('.lv-strip')) return;
    let latest;
    try {
        latest = await loadLatest('.');
    } catch (err) {
        console.error('Error loading drivers page data:', err);
    }
    renderTitle(latest?.latestSeason);
    loadTeams('.').then(fillTeamNames).catch(err => console.error('Error loading drivers page data:', err));
    if (!latest) return;
    try {
        const season = await loadSeason('.', latest.latestSeason);
        const standings = computeStandings(season);
        sortHero(standings);
        sortGrid(standings);
    } catch (err) {
        console.error('Error loading drivers page data:', err);
    }
});
