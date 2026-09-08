// ── CAREER STATS — la carrera medida contra todos los demás ──
//
// Un número solo no dice nada: "3 victorias" puede ser mucho o poco. Como
// data/careers.json trae los 120 pilotos del dataset, cada cifra se muestra con
// su puesto en el ranking y una tabla de posiciones donde se ve dónde cae.
//
// Reemplaza al viejo js/driver.js, que traía la temporada hardcodeada e inventada
// (80 victorias, títulos 2021-2023) y dibujaba un heatmap de 382 celdas cuyo
// calendario se repetía idéntico durante 19 temporadas.

(function(){
    const root = document.getElementById('driverCareer');
    if(!root) return;

    const driverId = new URLSearchParams(location.search).get('driver') || 'max-verstappen';

    const CATEGORIES = [
        { key: 'wins',    label: 'Race wins' },
        { key: 'podiums', label: 'Podiums' },
        { key: 'poles',   label: 'Poles' },
        { key: 'points',  label: 'Points' },
        { key: 'races',   label: 'Races' },
    ];

    const ordinal = n => {
        const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const fmt = n => Number(n).toLocaleString('en-US');

    // Ranking descendente por categoría, desempatado por antigüedad: entre dos
    // pilotos con la misma cifra va primero el que la alcanzó antes. Ejemplo:
    // con 5 títulos cada uno, Schumacher (2004) queda por encima de Hamilton
    // (2018), porque llegó a ese número catorce años antes.
    //
    // La fecha sale de careers[id].achievedAt[key], que precalcula
    // scripts/build-careers.js: es el día del último evento que hizo subir ese
    // contador, o sea cuándo el piloto llegó al total que muestra hoy.
    //
    // Sin fecha (piloto en 0, o dato ausente) se va al fondo del empate: no hay
    // "cuándo lo consiguió" si nunca lo consiguió. Último desempate por id,
    // para que el orden sea siempre el mismo entre recargas.
    function compareAchieved(a, b){
        if(a.achievedAt && b.achievedAt) return a.achievedAt < b.achievedAt ? -1 : a.achievedAt > b.achievedAt ? 1 : 0;
        if(a.achievedAt) return -1;
        if(b.achievedAt) return 1;
        return 0;
    }

    // Empates reales (misma cifra Y misma fecha) comparten puesto: 1,2,2,4.
    function buildRanking(careers, key){
        const rows = Object.entries(careers)
            .map(([id, c]) => ({ id, value: c[key] || 0, achievedAt: (c.achievedAt && c.achievedAt[key]) || null }))
            .sort((a, b) => (b.value - a.value) || compareAchieved(a, b) || a.id.localeCompare(b.id));
        let rank = 0, prevValue = null, prevDate = null;
        rows.forEach((row, i) => {
            if(row.value !== prevValue || row.achievedAt !== prevDate){
                rank = i + 1;
                prevValue = row.value;
                prevDate = row.achievedAt;
            }
            row.rank = rank;
        });
        return rows;
    }

    // Ser campeón no es una estadística más, así que cuando hay títulos la sección
    // abre con un bloque dorado que domina la pantalla, y cada copa trae el detalle
    // de esa temporada en lugar de ser puro adorno.
    function renderTitles(el, career){
        const titles = career.titles || [];
        if(titles.length){
            el.classList.add('is-champion');
            el.innerHTML = `
                <div class="career-champion">
                    <div class="career-champion-mark">
                        <img src="../img/wc1.png" alt="" class="career-champion-laurel">
                        <span class="career-champion-count">${titles.length}<i>&times;</i></span>
                        <img src="../img/wc2.png" alt="" class="career-champion-laurel career-champion-laurel--right">
                    </div>
                    <p class="career-champion-title">World Champion</p>

                    <ul class="career-champion-list">
                        ${titles.map(t => `
                            <li class="career-champion-year" style="--title-color:${t.color || 'var(--gold, #e8b923)'}">
                                ${t.teamId ? `<img src="../img/teams/${t.teamId}-logo.png" alt="${t.team}" class="career-champion-teamlogo" onerror="this.remove()">` : ''}
                                <img src="../img/trophies/wdc.png" alt="World Championship ${t.year}" class="career-champion-trophy">
                                <span class="career-champion-season">${t.year}</span>
                                <span class="career-champion-team">${t.team}</span>
                                <span class="career-champion-detail">${t.wins} ${t.wins === 1 ? 'win' : 'wins'} &middot; ${fmt(t.points)} pts</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
            return;
        }
        // Sin títulos igual hay algo que decir: el mejor campeonato que hizo,
        // con todos los años en que lo consiguió.
        el.classList.remove('is-champion');
        const best = career.bestFinish;
        const years = best?.years ?? (best?.year != null ? [best.year] : []);
        el.innerHTML = best
            ? `<p class="career-crown-label career-crown-label--modest">
                   Best championship finish
                   <strong>P${best.pos}</strong>
                   <span>in ${years.join(', ')}</span>
               </p>`
            : '';
    }

    function renderStanding(el, career, rankings){
        el.innerHTML = CATEGORIES.map(({ key, label }) => {
            const row = rankings[key].find(r => r.id === driverId);
            const total = rankings[key].length;
            return `
                <div class="career-stat">
                    <strong class="career-stat-value">${fmt(career[key] || 0)}</strong>
                    <span class="career-stat-label">${label}</span>
                    <span class="career-stat-rank">${ordinal(row?.rank ?? total)} <i>of ${total}</i></span>
                </div>
            `;
        }).join('');
    }

    // Top 5 más el piloto si quedó afuera, para que siempre se vea dónde cae.
    function boardRows(ranking, topN = 5){
        const top = ranking.slice(0, topN);
        if(top.some(r => r.id === driverId)) return { rows: top, gap: false };
        const mine = ranking.find(r => r.id === driverId);
        return mine ? { rows: [...top, mine], gap: true } : { rows: top, gap: false };
    }

    function renderBoard(el, ranking, names){
        const { rows, gap } = boardRows(ranking);
        const leader = ranking[0]?.value || 1;
        el.innerHTML = rows.map((r, i) => {
            const name = names[r.id] || { full: r.id, last: r.id };
            return `
            ${gap && i === rows.length - 1 ? '<li class="career-board-gap" aria-hidden="true"><span></span></li>' : ''}
            <li class="career-board-row${r.id === driverId ? ' is-self' : ''}">
                <span class="career-board-rank">${r.rank}</span>
                <span class="career-board-name">
                    <span class="career-board-name-full">${name.full}</span>
                    <span class="career-board-name-last">${name.last}</span>
                </span>
                <span class="career-board-bar"><span style="width:${leader ? (r.value / leader) * 100 : 0}%"></span></span>
                <span class="career-board-value">${fmt(r.value)}</span>
            </li>
        `;
        }).join('');
    }

    (async function init(){
        let careers, drivers;
        try {
            ({ careers, drivers } = await window.driverData);
        } catch (err) {
            console.error('No se pudo cargar careers.json', err);
            root.classList.add('is-empty');
            return;
        }

        const career = careers[driverId];
        if(!career){ root.classList.add('is-empty'); return; }

        // Los resaltes de la sección (puestos, fila propia, pestaña activa) usan
        // el color del equipo actual en vez de un rojo fijo.
        const currentColor = career.eras?.[career.eras.length - 1]?.color;
        if(currentColor) root.style.setProperty('--team-color', currentColor);

        const names = {};
        for(const id of Object.keys(careers)){
            const d = drivers[id];
            names[id] = d
                ? { full: `${d.firstName} ${d.lastName}`, last: d.lastName }
                : { full: id.replace(/-/g, ' '), last: id.replace(/-/g, ' ') };
        }

        const rankings = {};
        for(const { key } of CATEGORIES) rankings[key] = buildRanking(careers, key);

        renderTitles(root.querySelector('#careerCrown'), career);
        renderStanding(root.querySelector('#careerStanding'), career, rankings);

        // Cuántos pilotos llegaron a ganar alguna vez: le da escala al número.
        const winners = Object.values(careers).filter(c => c.wins > 0).length;
        const note = root.querySelector('#careerNote');
        if(note){
            note.innerHTML = `Only <b>${winners}</b> of the <b>${Object.keys(careers).length}</b> drivers
                in the database have ever won a race.`;
        }

        const board = root.querySelector('#careerBoard');
        const tabs = [...root.querySelectorAll('.career-board-tab')];
        const ORDER = CATEGORIES.map(c => c.key);
        let current = null;

        function show(key){
            if(key === current) return;                 // tocar la pestaña activa no hace nada
            const prev = current ? ORDER.indexOf(current) : -1;
            const next = ORDER.indexOf(key);
            const dir = prev === -1 || next === prev ? 0 : (next > prev ? 1 : -1);
            current = key;

            tabs.forEach(t => t.classList.toggle('is-active', t.dataset.cat === key));
            renderBoard(board, rankings[key], names);

            board.classList.remove('is-switching');
            void board.offsetWidth;
            board.style.setProperty('--board-slide-x', dir > 0 ? '24px' : dir < 0 ? '-24px' : '0px');
            board.classList.add('is-switching');
        }

        tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.cat)));
        show('wins');
    })();
})();
