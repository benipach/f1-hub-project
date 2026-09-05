// ── 2026 CHAMPIONSHIP — progresión de puntos + tabla de posiciones ──
//
// Se alimenta de data/seasons/season2026.json + drivers/teams/circuits/cities/
// countries. Reemplaza al gráfico SVG hecho a mano que había antes: el eje, el
// tooltip y el resaltado ahora son los mismos de la curva de forma del piloto
// (Chart.js), así las dos páginas se leen igual.
//
// La idea del gráfico: una tabla dice quién va ganando, una línea dice *cómo* se
// llegó hasta ahí. Con 22 pilotos superpuestos eso sólo se lee si se puede aislar
// uno, así que tocar una línea (o una fila de la tabla) enfoca ese piloto y
// muestra cuántos puntos sumó en cada carrera.
//
// gpCode()/gpShortLabel() vienen de js/shared/gp.js.

(function(){
    const SEASON_YEAR = 2026;
    const BASE = './data';
    const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

    const root = document.getElementById('championship');
    if(!root) return;

    // ── Helpers de datos ───────────────────────────────────────────────────
    const sessionResults = (gp, key) => {
        const r = gp?.sessions?.[key]?.results;
        return Array.isArray(r) ? r : [];
    };

    const isRetired = row => /DN[FS]/i.test(String(row?.time || ''));

    // Los resultados traen el equipo a veces como slug ("red-bull-racing") y a
    // veces como nombre ("Racing Bulls"); normalizamos a slug para el color.
    const teamSlug = t => String(t || '').trim().toLowerCase().replace(/\s+/g, '-');

    const esc = v => String(v)
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    // #RRGGBB → rgba(). Los colores de teams.json son hex; para atenuar una línea
    // hace falta el canal alfa.
    function withAlpha(hex, alpha){
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
        if(!m) return `rgba(255,255,255,${alpha})`;
        const [r, g, b] = m.slice(1).map(h => parseInt(h, 16));
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // ISO de 2 letras → SVG de bandera de Twemoji. Mismo cálculo que
    // driver-header.js: cada letra del ISO se corre al bloque Unicode de
    // "regional indicator" y el par de códigos es el nombre del archivo.
    function isoFlagUrl(iso){
        if(!iso || iso.length !== 2) return null;
        const code = [...iso.toUpperCase()]
            .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
            .join('-');
        return `${TWEMOJI_BASE}${code}.svg`;
    }

    // GP → circuito → ciudad → país → ISO de 2 letras → bandera.
    // Mismo recorrido que driver-season.js.
    function flagUrlFor(gp, refs){
        const city = refs.circuits?.[gp.circuitId]?.location?.city;
        const iso = refs.countries?.[refs.cities?.[city]?.country]?.isoCode;
        return isoFlagUrl(iso);
    }

    // ── Cálculo ────────────────────────────────────────────────────────────

    // Las rondas del gráfico son sólo las que ya se corrieron: una línea plana
    // hasta fin de año sobre carreras que no existen no dice nada. Las canceladas
    // se descartan siempre (2026 perdió Bahrein y Arabia Saudita).
    function buildRounds(season, refs){
        return Object.entries(season)
            .map(([gpId, gp]) => ({ gpId, ...gp }))
            .filter(gp => !gp.cancelled)
            .sort((a, b) => a.round - b.round)
            .filter(gp => sessionResults(gp, 'race').length)
            .map(gp => ({
                round: gp.round,
                gpId: gp.gpId,
                name: gpShortLabel(gp.name),
                code: gpCode(gp.name),
                flag: flagUrlFor(gp, refs),
                sprint: sessionResults(gp, 'sprintRace').length > 0,
                gp,
            }));
    }

    const totalScheduled = season => Object.values(season).filter(gp => !gp.cancelled).length;

    // Serie = una línea del gráfico + una fila de la tabla. Se arma igual para
    // pilotos y para equipos; lo único que cambia es de dónde sale cada punto.
    function buildSeries(rounds, { keyOf, groupOf, metaOf }){
        const byKey = new Map();

        const ensure = key => {
            if(!byKey.has(key)){
                byKey.set(key, {
                    id: key,
                    perRound: rounds.map(() => null),
                    data: [],
                    total: 0,
                    wins: 0,
                    podiums: 0,
                });
            }
            return byKey.get(key);
        };

        rounds.forEach((round, i) => {
            const rows = [
                ...sessionResults(round.gp, 'race').map(r => ({ ...r, sprint: false })),
                ...sessionResults(round.gp, 'sprintRace').map(r => ({ ...r, sprint: true })),
            ];

            for(const row of rows){
                const key = keyOf(row);
                if(!key) continue;
                const entry = ensure(key);
                const slot = entry.perRound[i] || { pts: 0, sprintPts: 0, pos: null, retired: false };

                slot.pts += row.pts || 0;
                if(row.sprint){
                    slot.sprintPts += row.pts || 0;
                } else {
                    // El puesto y el abandono son los de la carrera larga; el sprint
                    // sólo aporta puntos.
                    slot.pos = groupOf ? null : row.pos ?? null;
                    slot.retired = groupOf ? false : isRetired(row);
                    if(!groupOf && !isRetired(row)){
                        if(row.pos === 1) entry.wins++;
                        if(row.pos <= 3) entry.podiums++;
                    }
                }

                entry.perRound[i] = slot;
                entry.meta = entry.meta || metaOf(row);
                if(row.team) entry.meta = { ...entry.meta, ...metaOf(row) };
            }
        });

        // Acumulado: los que no largaron una carrera mantienen su total (línea
        // plana), no un hueco, para que la posición relativa siga siendo legible.
        for(const entry of byKey.values()){
            let sum = 0;
            entry.data = entry.perRound.map(slot => {
                sum += slot?.pts || 0;
                return sum;
            });
            entry.total = sum;
        }

        return [...byKey.values()].sort((a, b) => b.total - a.total);
    }

    // Los dos autos de un equipo comparten color: el segundo va punteado para
    // poder seguirlos por separado sin inventar un color que no es del equipo.
    function markTeammates(series){
        const seen = new Map();
        for(const s of series){
            const slug = s.meta?.teamSlug || '';
            const n = (seen.get(slug) || 0) + 1;
            seen.set(slug, n);
            s.dashed = n > 1;
        }
        return series;
    }

    // ── Tabla ──────────────────────────────────────────────────────────────
    function renderTable(wrap, series, kind){
        const leader = series[0]?.total ?? 0;

        const rows = series.map((s, i) => {
            const pos = i + 1;
            const gap = pos === 1 ? '—' : `−${leader - s.total}`;
            const color = s.meta.color || 'rgba(255,255,255,0.4)';
            const logo = s.meta.teamSlug
                ? `<img class="st-team-logo" src="img/teams/${esc(s.meta.teamSlug)}-logo.png" alt="" onerror="this.remove()">`
                : '';

            const nameCell = kind === 'drivers'
                ? `<div class="st-driver">
                       ${s.meta.number ? `<span class="st-driver-num" style="color:${color}">#${s.meta.number}</span>` : ''}
                       <span class="driver-lastname">${esc(s.meta.lastName)}</span>
                   </div>`
                : `<div class="st-driver">${logo}<span class="constructor-fullname">${esc(s.meta.teamName)}</span><span class="constructor-short">${esc(s.meta.shortTeamName)}</span></div>`;

            const countryCell = kind === 'drivers'
                ? `<td class="st-col-country">
                       <div class="st-country">
                           ${s.meta.flagUrl ? `<img class="st-flag" src="${esc(s.meta.flagUrl)}" alt="" loading="lazy">` : ''}
                           <span>${esc(s.meta.countryName || '—')}</span>
                       </div>
                   </td>`
                : '';

            const teamCell = kind === 'drivers'
                ? `<td class="st-col-team"><div class="st-team-cell">${logo}<span class="team-name">${esc(s.meta.teamName)}</span></div></td>`
                : '';

            return `
                <tr class="st-row" data-series="${esc(s.id)}" style="--row-color:${color}" tabindex="0" role="button" aria-pressed="false">
                    <td class="st-pos">${pos}</td>
                    <td>${nameCell}</td>
                    ${countryCell}
                    ${teamCell}
                    <td class="st-pts">${s.total}</td>
                    <td class="st-gap">${gap}</td>
                </tr>`;
        }).join('');

        wrap.innerHTML = `
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>${kind === 'drivers' ? 'Driver' : 'Constructor'}</th>
                        ${kind === 'drivers' ? '<th class="st-col-country">Country</th>' : ''}
                        ${kind === 'drivers' ? '<th class="st-col-team">Team</th>' : ''}
                        <th style="text-align:center">Pts</th>
                        <th>Gap</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // ── Gráfico ────────────────────────────────────────────────────────────
    //
    // Mismo gráfico que la curva de forma del piloto (js/driver-season.js):
    // Chart.js de líneas, misma relación de aspecto, mismos puntos sobre la
    // línea, misma grilla, mismo tooltip. Lo único propio de esta página es que
    // hay 22 series en vez de 2, así que el radio de los puntos arranca más
    // chico y crece al enfocar una.

    // Dibuja, sobre la serie enfocada, cuántos puntos sumó en cada carrera. Es el
    // dato que la curva acumulada esconde: la línea sube, pero no dice de cuánto
    // fue cada escalón. Equivale a la banda del podio del gráfico del piloto:
    // una capa editorial encima de los datos crudos.
    const roundPointsPlugin = {
        id: 'roundPoints',
        afterDatasetsDraw(chart, _args, opts){
            const focus = opts.focus?.();
            if(!focus) return;

            const index = chart.data.datasets.findIndex(d => d.seriesId === focus.id);
            const meta = index >= 0 && chart.getDatasetMeta(index);
            if(!meta || meta.hidden) return;

            const { ctx } = chart;
            ctx.save();
            ctx.font = "10px 'F1-Regular', sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            meta.data.forEach((point, i) => {
                const slot = focus.perRound[i];
                if(!slot) return;

                const dnf = slot.retired;
                const label = dnf ? 'DNF' : `+${slot.pts}`;
                if(!dnf && !slot.pts) return;          // un cero no merece una etiqueta

                const w = ctx.measureText(label).width + 12;
                const h = 15;
                const x = point.x;
                const y = point.y - 17;

                ctx.fillStyle = dnf ? 'rgba(217,86,79,0.92)' : 'rgba(10,10,20,0.9)';
                ctx.strokeStyle = dnf ? 'rgba(217,86,79,0.92)' : withAlpha(focus.meta.color, 0.85);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(x - w / 2, y - h / 2, w, h, 7);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = dnf ? '#fff' : withAlpha(focus.meta.color, 1);
                ctx.fillText(label, x, y + 0.5);
            });

            ctx.restore();
        },
    };

    function makeChart(canvas, rounds, series, getFocus){
        // En celular la tarjeta es angosta: el gráfico va casi cuadrado (más alto)
        // y con puntos/tipografía más chicos para que no quede apretado.
        const isPhone = window.matchMedia('(max-width: 700px)').matches;

        const datasets = series.map(s => ({
            seriesId: s.id,
            label: s.meta.label,
            data: s.data,
            borderColor: s.meta.color,
            borderWidth: isPhone ? 2 : 2.5,
            borderDash: s.dashed ? [7, 5] : [],
            pointBackgroundColor: s.meta.color,
            pointBorderColor: s.meta.color,
            pointRadius: isPhone ? 2 : 3,
            pointHoverRadius: 7,
            pointHitRadius: 14,
            tension: 0.25,
            spanGaps: true,
        }));

        return new Chart(canvas.getContext('2d'), {
            type: 'line',
            plugins: [roundPointsPlugin],
            data: { labels: rounds.map(r => r.code), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: isPhone ? 0.95 : 2.9,
                // 'index' mostraría las 22 series juntas; con esta cantidad de
                // líneas el tooltip tiene que hablar de una sola.
                interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: isPhone ? 10 : 11 },
                            maxTicksLimit: isPhone ? 6 : 9,
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    },
                    x: {
                        ticks: {
                            font: { size: isPhone ? 9 : 11 },
                            maxRotation: isPhone ? 90 : 50,
                            autoSkip: false,
                        },
                        grid: { display: false },
                    },
                },
                plugins: {
                    legend: { display: false },
                    roundPoints: { focus: getFocus },
                    tooltip: {
                        backgroundColor: 'rgba(10,10,20,0.94)',
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        callbacks: {
                            title: items => {
                                const r = rounds[items[0].dataIndex];
                                return `R${r.round} · ${r.name} GP`;
                            },
                            label: () => '',
                            afterBody: items => {
                                const item = items[0];
                                const s = series.find(x => x.id === item.dataset.seriesId);
                                const slot = s?.perRound[item.dataIndex];
                                const lines = [s?.meta.label || item.dataset.label];
                                if(slot?.pos) lines.push(`Finish  ${slot.retired ? 'DNF' : 'P' + slot.pos}`);
                                lines.push(`Round   +${slot?.pts ?? 0}${slot?.sprintPts ? ` (incl. ${slot.sprintPts} sprint)` : ''}`);
                                lines.push(`Total   ${item.parsed.y} pts`);
                                return lines;
                            },
                        },
                    },
                },
            },
        });
    }

    // ── Panel (pilotos o equipos) ──────────────────────────────────────────
    // Cada pestaña es una instancia de esto: gráfico + tabla compartiendo el
    // mismo enfoque. Las piezas del recuadro son las mismas que en la página del
    // piloto: cabecera, franja, lienzo y una nota al pie sacada de los datos.
    function mountPanel({ panel, kind, rounds, series }){
        const canvas = panel.querySelector('.champ-form-canvas canvas');
        const tableWrap = panel.querySelector('.standings-table-wrap');
        const badge = panel.querySelector('.champ-form-badge');
        const note = panel.querySelector('.champ-form-note');

        let focusId = null;
        const focused = () => series.find(s => s.id === focusId) || null;

        renderTable(tableWrap, series, kind);
        const chart = makeChart(canvas, rounds, series, focused);
        const isPhone = window.matchMedia('(max-width: 700px)').matches;
        const basePointRadius = isPhone ? 2 : 3;

        // Nota al pie: una línea editorial calculada, igual que la del piloto.
        // Es lo que se lee cuando no hay nada enfocado.
        (function writeNote(){
            const leader = series[0];
            const second = series[1];
            if(!leader) return;

            const winners = new Set();
            rounds.forEach((_, i) => {
                const best = series.find(s => s.perRound[i]?.pos === 1);
                if(best) winners.add(best.id);
            });

            const gap = second ? leader.total - second.total : 0;
            const subject = kind === 'drivers' ? 'driver' : 'team';
            note.innerHTML = `<b>${esc(leader.meta.label)}</b> leads on <b>${leader.total}</b> points`
                + (second ? `, <b>${gap}</b> clear of ${esc(second.meta.label)}` : '')
                + ` after <b>${rounds.length}</b> rounds.`
                + (winners.size ? ` <b>${winners.size}</b> different ${winners.size > 1 ? `${subject}s have` : `${subject} has`} won a race so far.` : '')
                + ` Tap a line — or a row in the table — to follow one ${subject}.`;
        })();

        function paint(){
            const active = focused();

            chart.data.datasets.forEach(ds => {
                const s = series.find(x => x.id === ds.seriesId);
                const isActive = active && ds.seriesId === active.id;
                const dim = active && !isActive;

                ds.borderColor = dim ? withAlpha(s.meta.color, 0.13) : s.meta.color;
                ds.borderWidth = isActive ? 3.2 : dim ? 1.2 : (isPhone ? 2 : 2.5);
                ds.pointRadius = isActive ? 5 : dim ? 0 : basePointRadius;
                ds.pointBackgroundColor = s.meta.color;
                ds.pointBorderColor = s.meta.color;
                ds.order = isActive ? -1 : 0;
            });
            chart.update();

            tableWrap.querySelectorAll('.st-row').forEach(row => {
                const on = active && row.dataset.series === active.id;
                row.classList.toggle('is-focused', Boolean(on));
                row.classList.toggle('is-dimmed', Boolean(active && !on));
                row.setAttribute('aria-pressed', on ? 'true' : 'false');
            });

            if(!active){
                badge.hidden = true;
                return;
            }

            const pos = series.indexOf(active) + 1;
            const best = active.perRound.reduce((m, s) => Math.max(m, s?.pts || 0), 0);
            const scored = active.perRound.filter(s => s?.pts > 0).length;
            const dnfs = active.perRound.filter(s => s?.retired).length;

            badge.hidden = false;
            panel.querySelector('.champ-form').style.setProperty('--focus-color', active.meta.color);
            badge.innerHTML = `
                ${esc(active.meta.label)}
                <span class="champ-form-badge-sub">
                    P${pos} · ${active.total} pts · best round +${best}
                    · scored in ${scored} of ${rounds.length}${dnfs ? ` · ${dnfs} DNF${dnfs > 1 ? 's' : ''}` : ''}
                </span>
                <button type="button" class="champ-form-badge-clear">Clear</button>`;
        }

        const setFocus = id => { focusId = focusId === id ? null : id; paint(); };
        const clearFocus = () => { focusId = null; paint(); };

        // Tocar la línea (o cerca de ella) enfoca; tocar el vacío suelta el foco.
        canvas.addEventListener('click', event => {
            const hit = chart.getElementsAtEventForMode(event, 'nearest', { intersect: false, axis: 'xy' }, true)[0];
            if(!hit) return clearFocus();

            const rect = canvas.getBoundingClientRect();
            const dx = (event.clientX - rect.left) - hit.element.x;
            const dy = (event.clientY - rect.top) - hit.element.y;
            const id = chart.data.datasets[hit.datasetIndex]?.seriesId;

            if(id && Math.hypot(dx, dy) <= 45) setFocus(id);
            else clearFocus();
        });

        badge.addEventListener('click', e => {
            if(e.target.closest('.champ-form-badge-clear')) clearFocus();
        });

        tableWrap.addEventListener('click', e => {
            const row = e.target.closest('.st-row');
            if(row) setFocus(row.dataset.series);
        });

        tableWrap.addEventListener('keydown', e => {
            if(e.key !== 'Enter' && e.key !== ' ') return;
            const row = e.target.closest('.st-row');
            if(!row) return;
            e.preventDefault();
            setFocus(row.dataset.series);
        });

        document.addEventListener('keydown', e => {
            if(e.key === 'Escape' && focusId) clearFocus();
        });

        paint();
        return chart;
    }

    // ── Pestañas ───────────────────────────────────────────────────────────
    function initTabs(){
        const bar = root.querySelector('.champ-tab-bar');
        if(!bar) return;

        const indicator = document.createElement('span');
        indicator.className = 'tab-indicator';
        bar.appendChild(indicator);

        const move = btn => {
            indicator.style.left = `${btn.offsetLeft}px`;
            indicator.style.width = `${btn.offsetWidth}px`;
        };

        bar.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                root.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                root.querySelector(`#tab-${btn.dataset.tab}`)?.classList.add('active');
                move(btn);
            });
        });

        const active = bar.querySelector('.tab-btn.active') || bar.querySelector('.tab-btn');
        if(active) requestAnimationFrame(() => move(active));
        window.addEventListener('resize', () => {
            const current = bar.querySelector('.tab-btn.active');
            if(current) move(current);
        });
    }

    // ── Arranque ───────────────────────────────────────────────────────────
    (async function init(){
        initTabs();

        let season, drivers, teams, circuits, cities, countries;
        try {
            [season, drivers, teams, circuits, cities, countries] = await Promise.all([
                fetch(`${BASE}/seasons/season${SEASON_YEAR}.json`).then(r => r.json()),
                fetch(`${BASE}/drivers.json`).then(r => r.json()),
                fetch(`${BASE}/teams.json`).then(r => r.json()),
                fetch(`${BASE}/circuits.json`).then(r => r.json()),
                fetch(`${BASE}/cities.json`).then(r => r.json()),
                fetch(`${BASE}/countries.json`).then(r => r.json()),
            ]);
        } catch (err) {
            console.error('No se pudo cargar el campeonato', SEASON_YEAR, err);
            root.classList.add('is-empty');
            return;
        }

        const rounds = buildRounds(season, { circuits, cities, countries });
        if(!rounds.length){ root.classList.add('is-empty'); return; }

        const teamMeta = slug => {
            const team = teams[slug];
            return {
                teamSlug: slug,
                teamName: team?.name || slug.replace(/-/g, ' '),
                shortTeamName: (team?.name || slug).split(' ').slice(0, 2).join(' '),
                color: team?.color || '#ffffff',
            };
        };

        const driverSeries = markTeammates(buildSeries(rounds, {
            keyOf: row => row.driver,
            metaOf: row => {
                const d = drivers[row.driver];
                const slug = teamSlug(row.team);
                const country = countries[d?.nationality] || null;
                return {
                    ...teamMeta(slug),
                    label: d?.lastName || row.driver.replace(/-/g, ' '),
                    lastName: d?.lastName || row.driver.replace(/-/g, ' '),
                    number: row.number ?? null,
                    countryName: country?.name || null,
                    flagUrl: isoFlagUrl(country?.isoCode),
                };
            },
        }));

        const teamSeries = buildSeries(rounds, {
            keyOf: row => teamSlug(row.team),
            groupOf: true,
            metaOf: row => {
                const meta = teamMeta(teamSlug(row.team));
                return { ...meta, label: meta.teamName };
            },
        });

        // Cabecera: cuántas rondas van de las que quedan en pie.
        const scheduled = totalScheduled(season);
        const sub = root.parentElement?.querySelector('#champHeaderSub');
        if(sub) sub.textContent = `After ${rounds.length} of ${scheduled} rounds`;

        if(typeof Chart === 'undefined'){
            console.error('Chart.js no está disponible');
            root.classList.add('is-empty');
            return;
        }

        await (document.fonts?.ready ?? Promise.resolve());
        Chart.defaults.font.family = "'F1-Regular', sans-serif";
        Chart.defaults.color = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-dim').trim() || '#888';

        mountPanel({
            panel: root.querySelector('#tab-drivers'),
            kind: 'drivers',
            rounds,
            series: driverSeries,
        });

        mountPanel({
            panel: root.querySelector('#tab-constructors'),
            kind: 'constructors',
            rounds,
            series: teamSeries,
        });
    })();
})();
