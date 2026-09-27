// ── 2026 SEASON — curva de forma + resultados ronda a ronda ──
//
// Se alimenta de data/seasons/season2026.json + data/drivers.json + data/teams.json
// (+ circuits/cities/countries para la bandera de cada GP).
// gpCode()/gpShortLabel() vienen de js/shared/gp.js, compartidos con el gráfico
// del campeonato.
// Reemplaza al viejo js/drivers.js, que apuntaba a rutas y formas de datos que ya
// no existen (data/season2026.json en la raíz, driversData.drivers como array, y
// match de resultados por nombre completo cuando el JSON usa slugs).

(function(){
    const SEASON_YEAR = 2026;
    // drivers/careers/countries/teams vienen del loader compartido (driver-data.js);
    // acá sólo se piden los archivos propios de la temporada.
    const SEASON_URL   = '../data/seasons/season2026.json';
    const CIRCUITS_URL = '../data/circuits.json';
    const CITIES_URL   = '../data/cities.json';
    const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

    const root = document.getElementById('season2026');
    if(!root) return;

    // Sin ?driver= la página cae al piloto de referencia, así abre igual desde el disco.
    const driverId = new URLSearchParams(location.search).get('driver') || 'max-verstappen';

    const sessionResults = (gp, key) => {
        const r = gp?.sessions?.[key]?.results;
        return Array.isArray(r) ? r : [];
    };

    const isRetired = row => /DN[FS]/i.test(String(row?.time || ''));

    // resolveTeamId() viene de js/shared/teams.js: los resultados traen el
    // equipo a veces como slug, a veces como nombre ("Red Bull") y a veces
    // como chasis ("red-bull-racing-honda"), y ahí se resuelve al ID real.

    // GP → circuito → ciudad → país → ISO de 2 letras → SVG de Twemoji.
    // Mismo recorrido que shared/resolve.js, mismo CDN que archive.js.
    function flagUrlFor(gp, refs){
        const city = refs.circuits?.[gp.circuitId]?.location?.city;
        const iso = refs.countries?.[refs.cities?.[city]?.country]?.isoCode;
        if(!iso || iso.length !== 2) return null;
        const code = [...iso.toUpperCase()]
            .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
            .join('-');
        return `${TWEMOJI_BASE}${code}.svg`;
    }

    // ── Cálculo ────────────────────────────────────────────────────────────
    function buildRounds(season, id, refs){
        const rounds = [];
        const gps = Object.values(season).sort((a, b) => a.round - b.round);

        for(const gp of gps){
            const race = sessionResults(gp, 'race');
            if(!race.length) continue;                        // todavía no se corrió
            const me = race.find(r => r.driver === id);
            if(!me) continue;

            const sprint = sessionResults(gp, 'sprintRace').find(r => r.driver === id);
            const retired = isRetired(me);
            // Parrilla real (con penalizaciones), o la quali si la temporada
            // todavía no tiene el campo — ver shared/grid.js.
            const start = startingGridFor(gp, 'race')[id] ?? null;

            rounds.push({
                round: gp.round,
                name: gpShortLabel(gp.name),
                fullName: gp.name,           // "Hungarian Grand Prix", para el texto corrido
                code: gpCode(gp.name),
                flag: flagUrlFor(gp, refs),
                grid: start?.pos ?? null,
                gridLabel: gridLabel(start),
                finish: me.pos,
                retired,
                pts: (me.pts || 0) + (sprint?.pts || 0),
                sprintPts: sprint?.pts || 0,
                fastestLap: Boolean(me.fastestLap),
                team: me.team,
            });
        }
        return rounds;
    }

    function buildStandings(season){
        const totals = {};
        for(const gp of Object.values(season)){
            for(const key of ['race', 'sprintRace']){
                for(const r of sessionResults(gp, key)){
                    totals[r.driver] = (totals[r.driver] || 0) + (r.pts || 0);
                }
            }
        }
        return Object.entries(totals).sort((a, b) => b[1] - a[1]);
    }

    // El piloto que más puestos ganó en carrera durante la temporada (suma de
    // grid − finish cuando adelantó). Se marca en su página como el mejor racecraft.
    function bestRacecraft(season){
        const gained = {};
        for(const gp of Object.values(season)){
            const grid = startingGridFor(gp, 'race');
            for(const r of sessionResults(gp, 'race')){
                if(isRetired(r) || typeof r.pos !== 'number') continue;
                const g = grid[r.driver]?.pos;
                if(typeof g !== 'number') continue;
                const delta = g - r.pos;
                if(delta > 0) gained[r.driver] = (gained[r.driver] || 0) + delta;
            }
        }
        const top = Object.entries(gained).sort((a, b) => b[1] - a[1])[0];
        return top ? { id: top[0], gained: top[1] } : null;
    }

    function summarise(rounds){
        const scored = rounds.filter(r => !r.retired && r.grid != null);
        const deltas = scored.map(r => r.grid - r.finish);   // + = ganó puestos
        return {
            points:      rounds.reduce((a, r) => a + r.pts, 0),
            starts:      rounds.length,
            podiums:     rounds.filter(r => !r.retired && r.finish <= 3).length,
            wins:        rounds.filter(r => !r.retired && r.finish === 1).length,
            dnfs:        rounds.filter(r => r.retired).length,
            fastestLaps: rounds.filter(r => r.fastestLap).length,
            best:        rounds.filter(r => !r.retired).reduce((m, r) => Math.min(m, r.finish), 99),
            avgGain:     deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0,
            bestGain:    scored.reduce((best, r) => (r.grid - r.finish) > (best ? best.grid - best.finish : -99) ? r : best, null),
        };
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function renderBand(el, { champPos, fieldSize, points, gap, raced, totalRounds, teamName }){
        el.innerHTML = `
            <div class="season-band-cell season-band-cell--pos">
                <span class="season-band-key">Championship</span>
                <span class="season-band-pos">P${champPos}</span>
                <span class="season-band-sub">of ${fieldSize} drivers</span>
            </div>
            <div class="season-band-cell season-band-cell--pts">
                <span class="season-band-key">Points</span>
                <span class="season-band-pts">${points}</span>
                <span class="season-band-sub">${gap > 0 ? `${gap} behind the leader` : 'Championship leader'}</span>
            </div>
            <div class="season-band-cell season-band-cell--progress">
                <div class="season-band-progress-head">
                    <span class="season-band-key">Season progress</span>
                    <span class="season-band-progress-count">${raced} / ${totalRounds}</span>
                </div>
                <div class="season-band-progress-track">
                    <span class="season-band-progress-fill" style="width:${(raced / totalRounds) * 100}%"></span>
                </div>
                <span class="season-band-sub">${totalRounds - raced} rounds still to run</span>
            </div>
            <div class="season-band-cell season-band-cell--team">
                <span class="season-band-key">Team</span>
                <span class="season-band-team">${teamName}</span>
            </div>
        `;
    }

    // Chevron del indicador de posición, igual que el que usa la tabla del GP.
    const deltaArrowSvg = direction =>
        `<svg class="res-delta-arrow" viewBox="0 0 24 24" style="transform:rotate(${direction === 'down' ? 180 : 0}deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    // delta > 0 = ganó puestos respecto de la largada; null = sin dato (DNF o sin grilla).
    const deltaHtml = delta => {
        if(delta === null) return `<span class="res-delta res-delta--none">—</span>`;
        if(delta > 0) return `<span class="res-delta res-delta--up">${deltaArrowSvg('up')}${delta}</span>`;
        if(delta < 0) return `<span class="res-delta res-delta--down">${deltaArrowSvg('down')}${Math.abs(delta)}</span>`;
        return `<span class="res-delta res-delta--same">—</span>`;
    };

    // Las filas van de la ronda 1 hacia abajo, en el orden en que se corrieron.
    function renderRounds(tbody, rounds){
        tbody.innerHTML = rounds.map(r => {
            const delta = r.grid != null && !r.retired ? r.grid - r.finish : null;
            // Cada escalón del podio con su color: oro, plata, bronce.
            const outcome = r.retired ? 'dnf'
                : r.finish === 1 ? 'p1'
                : r.finish === 2 ? 'p2'
                : r.finish === 3 ? 'p3'
                : r.pts > 0 ? 'points'
                : 'none';
            return `
                <tr class="season-round" data-outcome="${outcome}">
                    <td class="season-round-num season-col-round">R${r.round}</td>
                    <th scope="row" class="season-round-name">${r.flag ? `<img class="season-round-flag" src="${r.flag}" alt="" loading="lazy">` : ''}<span class="season-round-name-full">${r.fullName}</span><span class="season-round-name-code">${r.code}</span></th>
                    <td class="season-round-result">
                        <span class="season-round-grid">${r.gridLabel}</span>
                        <span class="season-round-arrow" aria-hidden="true"></span>
                        <span class="season-round-finish">${r.retired ? 'DNF' : 'P' + r.finish}</span>
                    </td>
                    <td class="is-center">${deltaHtml(delta)}</td>
                    <td class="season-round-pts is-right">${r.pts}</td>
                </tr>
            `;
        }).join('');
    }

    // Banda dorada del podio + línea de corte de puntos, dibujadas bajo las series.
    const zonesPlugin = {
        id: 'seasonZones',
        beforeDatasetsDraw(chart){
            const { ctx, chartArea, scales } = chart;
            if(!chartArea || !scales.y) return;
            const yPodium = scales.y.getPixelForValue(3.5);
            const yPoints = scales.y.getPixelForValue(10.5);
            ctx.save();
            ctx.fillStyle = 'rgba(232,185,35,0.07)';
            ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, yPodium - chartArea.top);
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(chartArea.left, yPoints);
            ctx.lineTo(chartArea.right, yPoints);
            ctx.stroke();
            ctx.restore();
        }
    };

    // ── Trazado de izquierda a derecha ──
    // Las líneas (y sus puntos) se dibujan dentro de un recorte que se abre de
    // izquierda a derecha según chart.$drawProgress (0 → 1); ejes, grilla y las
    // zonas de arriba quedan fijos. Va después de zonesPlugin en la lista, así
    // el recorte no las tapa. chart.$drawIn() lo anima: lo llama
    // driver-reveal.js cuando el gráfico entra en pantalla.
    const DRAW_IN_MS = 1200;

    const drawInPlugin = {
        id: 'seasonDrawIn',
        beforeDatasetsDraw(chart){
            const p = chart.$drawProgress ?? 1;
            if(p >= 1) return;
            const { ctx, chartArea } = chart;
            // Desde el borde del canvas (no del área) para que el primer punto
            // no aparezca cortado por la mitad.
            const x = chartArea.left + (chartArea.right - chartArea.left) * p;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, x, chart.height);
            ctx.clip();
            chart.$drawClipped = true;
        },
        afterDatasetsDraw(chart){
            if(!chart.$drawClipped) return;
            chart.$drawClipped = false;
            chart.ctx.restore();
        },
    };

    function addDrawIn(chart){
        const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        chart.$drawIn = (delay = 0) => {
            chart.$drawProgress = 0;
            chart.draw();
            let start = null;
            const tick = now => {
                if(start === null) start = now + delay;
                const t = Math.min(Math.max((now - start) / DRAW_IN_MS, 0), 1);
                chart.$drawProgress = ease(t);
                chart.draw();
                if(t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };

        // Si la sección todavía espera su animación de entrada, el gráfico queda
        // vacío hasta que driver-reveal.js lo dispare. Si ya entró (las fuentes
        // tardaron más que el scroll), se traza ahora. Sin animaciones de
        // entrada (no hay data-reveal), se muestra completo.
        const block = chart.canvas.closest('[data-reveal]');
        if(!block) return;
        if(block.classList.contains('reveal') && !block.classList.contains('is-in')) {
            chart.$drawProgress = 0;
            chart.draw();
        } else {
            chart.$drawIn();
        }
    }

    // La parrilla 2026 es de 22 autos: el eje va siempre P1→P22, fijo, para que
    // todos los pilotos usen la misma escala y la línea nunca quede cortada.
    const GRID_SIZE = 22;
    const Y_PAD = 0.6;

    // ── Tooltip del Form curve ──
    // Tarjeta con la ronda, largada → llegada con los puestos ganados/perdidos,
    // los puntos y las insignias (vuelta rápida, abandono). Vive dentro de
    // .season-form-canvas y sigue al punto de la carrera.
    function formTipHtml(r){
        const delta = r.grid != null && !r.retired ? r.grid - r.finish : null;
        const deltaChip = delta === null ? ''
            : delta > 0 ? `<span class="form-tip-delta is-up">▲ ${delta}</span>`
            : delta < 0 ? `<span class="form-tip-delta is-down">▼ ${-delta}</span>`
            : `<span class="form-tip-delta">=</span>`;
        const finishCls = r.retired ? 'is-dnf' : r.finish <= 3 ? 'is-podium' : '';

        return `
            <div class="form-tip-head">
                ${r.flag ? `<img class="form-tip-flag" src="${r.flag}" alt="">` : ''}
                <span class="form-tip-round">R${r.round}</span>
                <span class="form-tip-gp">${r.name} GP</span>
            </div>
            <div class="form-tip-race">
                <div>
                    <span class="form-tip-key">Grid</span>
                    <span class="form-tip-pos">${r.gridLabel}</span>
                </div>
                <svg class="form-tip-arrow" viewBox="0 0 24 12" aria-hidden="true"><path d="M0 6h20M15 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
                <div>
                    <span class="form-tip-key">Finish</span>
                    <span class="form-tip-pos ${finishCls}">${r.retired ? 'DNF' : 'P' + r.finish}</span>
                </div>
                ${deltaChip}
            </div>
            <div class="form-tip-foot">
                <span class="form-tip-pts"><b>${r.pts}</b> pts</span>
                ${r.sprintPts ? `<span class="form-tip-sprint">incl. ${r.sprintPts} sprint</span>` : ''}
                ${r.fastestLap ? `<span class="form-tip-badge is-fl">Fastest lap</span>` : ''}
                ${r.retired ? `<span class="form-tip-badge is-dnf">Classified P${r.finish}</span>` : ''}
            </div>
        `;
    }

    function formTooltip(rounds, teamColor){
        return ({ chart, tooltip }) => {
            const wrap = chart.canvas.parentNode;
            let el = wrap.querySelector('.form-tip');
            if(!el){
                el = document.createElement('div');
                el.className = 'form-tip';
                wrap.appendChild(el);
            }

            if(tooltip.opacity === 0){
                el.classList.remove('is-visible');
                return;
            }

            // Se ancla al punto de la carrera (dataset 1), no al de la largada.
            const point = tooltip.dataPoints.find(p => p.datasetIndex === 1) || tooltip.dataPoints[0];
            const r = rounds[point.dataIndex];
            el.style.setProperty('--c', teamColor);
            el.innerHTML = formTipHtml(r);

            // Abajo del punto; si no entra, arriba. Horizontalmente centrada y
            // sin salirse del gráfico.
            const gap = 14;
            const w = el.offsetWidth, h = el.offsetHeight;
            const { x, y } = point.element;
            const left = Math.min(Math.max(x - w / 2, 0), wrap.clientWidth - w);
            const top = y + gap + h <= wrap.clientHeight ? y + gap : Math.max(y - gap - h, 0);

            // Si estaba oculta aparece en su lugar (sin viajar desde el punto
            // anterior); si ya se veía, se desliza.
            if(!el.classList.contains('is-visible')){
                el.style.transition = 'none';
                el.style.transform = `translate(${left}px, ${top}px)`;
                void el.offsetWidth;
                el.style.transition = '';
            } else {
                el.style.transform = `translate(${left}px, ${top}px)`;
            }
            el.classList.add('is-visible');
        };
    }

    function renderChart(canvas, rounds, teamColor){
        const labels = rounds.map(r => r.code);

        // En celular la tarjeta es angosta: el gráfico va casi cuadrado (más alto)
        // y con puntos/tipografía más chicos para que no quede apretado.
        const isPhone = window.matchMedia('(max-width: 700px)').matches;

        const pointColors = rounds.map(r => r.retired ? '#d9564f' : teamColor);
        const pointRadius = rounds.map(r => (r.retired ? 6 : 5) - (isPhone ? 2 : 0));

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            plugins: [zonesPlugin, drawInPlugin],
            data: {
                labels,
                datasets: [
                    {
                        label: 'Grid slot',
                        data: rounds.map(r => r.grid),
                        borderColor: 'rgba(255,255,255,0.28)',
                        borderDash: [5, 4],
                        borderWidth: 1.5,
                        pointBackgroundColor: 'transparent',
                        pointBorderColor: 'rgba(255,255,255,0.45)',
                        pointRadius: isPhone ? 2.5 : 3.5,
                        pointHoverRadius: 5,
                        cubicInterpolationMode: 'monotone',
                        spanGaps: true,
                        order: 2,
                    },
                    {
                        label: 'Race finish',
                        data: rounds.map(r => r.finish),
                        borderColor: teamColor,
                        borderWidth: isPhone ? 2 : 2.5,
                        pointBackgroundColor: pointColors,
                        pointBorderColor: pointColors,
                        pointRadius,
                        pointHoverRadius: 7,
                        // Monótona: la curva nunca se pasa del dato, así no se
                        // escapa por encima de P1 ni por debajo de P22.
                        cubicInterpolationMode: 'monotone',
                        order: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: isPhone ? 0.95 : 2.9,
                // Sin la animación de carga de Chart.js (los puntos subiendo
                // desde abajo): la entrada la hace drawInPlugin. El hover
                // conserva la suya, que va por transitions.active.
                animation: { duration: 0 },
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        reverse: true,
                        // Medio puesto de aire en cada punta: si el eje termina
                        // justo en P1/P22, el trazo y los puntos de un ganador (o
                        // del último) quedan cortados contra el borde.
                        min: 1 - Y_PAD,
                        max: GRID_SIZE + Y_PAD,
                        // Con ese margen las marcas se armarían en decimales:
                        // se fijan a mano en P1, P4 … P22 (P1, P8 … en celular).
                        afterBuildTicks: axis => {
                            const step = isPhone ? 7 : 3;
                            axis.ticks = Array.from(
                                { length: Math.floor((GRID_SIZE - 1) / step) + 1 },
                                (_, i) => ({ value: 1 + i * step }),
                            );
                        },
                        ticks: {
                            callback: v => 'P' + v,
                            font: { size: isPhone ? 10 : 11 },
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
                    // Tarjeta propia en HTML en lugar del tooltip de texto de Chart.js.
                    tooltip: {
                        enabled: false,
                        external: formTooltip(rounds, teamColor),
                    },
                },
            },
        });
        addDrawIn(chart);
        return chart;
    }

    // ── Arranque ───────────────────────────────────────────────────────────
    (async function init(){
        let season, teams, circuits, cities, countries;
        try {
            const [shared, ...own] = await Promise.all([
                window.driverData,
                fetch(SEASON_URL).then(r => r.json()),
                fetch(CIRCUITS_URL).then(r => r.json()),
                fetch(CITIES_URL).then(r => r.json()),
            ]);
            teams = shared.teams;
            countries = shared.countries;
            [season, circuits, cities] = own;
        } catch (err) {
            console.error('No se pudo cargar la temporada', SEASON_YEAR, err);
            root.classList.add('is-empty');
            return;
        }

        const rounds = buildRounds(season, driverId, { circuits, cities, countries });
        if(!rounds.length){ root.classList.add('is-empty'); return; }

        const stats = summarise(rounds);
        const standings = buildStandings(season);
        const champIndex = standings.findIndex(([id]) => id === driverId);
        const leaderPts = standings.length ? standings[0][1] : 0;

        const totalRounds = Object.keys(season).length;
        const raced = Object.values(season).filter(gp => sessionResults(gp, 'race').length).length;

        const slug = resolveTeamId(rounds[rounds.length - 1].team, teams);
        const team = teams[slug];
        const teamColor = team?.color || '#e10600';
        root.style.setProperty('--team-color', teamColor);

        renderBand(root.querySelector('#seasonBand'), {
            champPos:    champIndex >= 0 ? champIndex + 1 : '—',
            fieldSize:   standings.length,
            points:      stats.points,
            gap:         leaderPts - stats.points,
            raced,
            totalRounds,
            teamName:    team?.name || rounds[rounds.length - 1].team,
        });

        // Marca de mejor racecraft de la temporada, si le corresponde a este piloto.
        const racecraftKing = bestRacecraft(season);
        const badge = root.querySelector('#seasonRacecraftBadge');
        if(badge && racecraftKing && racecraftKing.id === driverId){
            badge.innerHTML = `<span class="season-racecraft-badge-star" aria-hidden="true">★</span>Best racecraft of the season <span class="season-racecraft-badge-sub">+${racecraftKing.gained} places gained in races</span>`;
            badge.hidden = false;
        }

        // Una línea editorial que resume la temporada, calculada de los datos.
        const note = root.querySelector('#seasonFormNote');
        if(note){
            const avg = stats.avgGain;
            const bg = stats.bestGain;
            // En pasado: son carreras ya corridas, no una tendencia en curso.
            const gainText = avg > 0.2 ? `gained <b>${avg.toFixed(1)}</b> places per race on average`
                : avg < -0.2 ? `lost <b>${Math.abs(avg).toFixed(1)}</b> places per race on average`
                : `finished roughly where he started`;
            const bgText = bg && (bg.grid - bg.finish) > 0
                ? ` Best drive: <b>${bg.fullName}</b>, ${bg.gridLabel} to P${bg.finish}.`
                : '';
            note.innerHTML = `The gap between the two lines is racecraft — he ${gainText}.${bgText}`
                + (stats.dnfs ? ` <b>${stats.dnfs}</b> retirement${stats.dnfs > 1 ? 's' : ''} shown in red.` : '');
        }

        renderRounds(root.querySelector('#seasonRounds'), rounds);

        const canvas = root.querySelector('#seasonFormChart');
        if(canvas && typeof Chart !== 'undefined'){
            if(document.fonts?.ready) await document.fonts.ready;
            Chart.defaults.font.family = "'F1-Regular', sans-serif";
            Chart.defaults.color = getComputedStyle(document.documentElement)
                .getPropertyValue('--text-dim').trim() || '#888';
            renderChart(canvas, rounds, teamColor);
        }
    })();
})();
