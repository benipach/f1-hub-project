const CURRENT_SEASON_FILE = '../data/season2026.json';
const CURRENT_SEASON_YEAR = 2026;

// teamColor(), teamCssVar(), teamLogo() vienen de teams.js (cargado antes)

document.addEventListener('DOMContentLoaded', async () => {
    const teamId = new URLSearchParams(window.location.search).get('team');
    if (!teamId) { console.error('No ?team= en la URL'); return; }

    try {
        const [teamsData, driversData, season] = await Promise.all([
            fetch('../data/teams.json').then(r => r.json()),
            fetch('../data/drivers.json').then(r => r.json()),
            fetch(CURRENT_SEASON_FILE).then(r => r.json()),
        ]);

        const teamInfo = teamsData.teams.find(t => t.id === teamId);
        if (!teamInfo) { console.error('Equipo no encontrado:', teamId); return; }

        const history = teamInfo.history || [];

        // ── PILOTOS 2026 DE ESTE EQUIPO ───────────────────────────
        const teamDrivers = driversData.drivers.filter(d => {
            const entry = (d.history || []).find(h => h.year === CURRENT_SEASON_YEAR);
            return entry?.teamId?.toLowerCase() === teamId.toLowerCase();
        });

        // ── STATS 2026 (suma de ambos pilotos) ────────────────────
        const races = Object.values(season)
            .filter(gp => {
                const name = gp.name.toLowerCase();
                return !name.includes('bahrain') && !name.includes('saudi');
            })
            .sort((a, b) => a.round - b.round);

        const driverNames = new Set(
            teamDrivers.map(d => `${d.firstName} ${d.lastName}`)
        );

        const raceLabels    = [];
        const raceFullNames = [];
        const racePoints    = [];    // puntos combinados del equipo por carrera
        const raceWins      = [];    // índices con alguna victoria del equipo
        const racePositions = [];    // puntos totales del fin de semana (para label en barra)
        const raceSprintPts = [];    // sprint pts combinados, null si no aplica

        let total2026 = 0, wins2026 = 0, podiums2026 = 0;
        let dnfs2026 = 0, starts2026 = 0, poles2026 = 0, fastest2026 = 0;

        races.forEach((gp, i) => {
            raceLabels.push(
                gp.name.replace(' Grand Prix', '').replace('Grand Prix', '').trim().substring(0, 3).toUpperCase()
            );
            raceFullNames.push(gp.name);

            if (!gp.results?.race?.length) {
                racePoints.push(null);
                racePositions.push(null);
                raceSprintPts.push(null);
                return;
            }

            const teamRaceResults = gp.results.race.filter(r => driverNames.has(r.driver));
            if (!teamRaceResults.length) {
                racePoints.push(null);
                racePositions.push(null);
                raceSprintPts.push(null);
                return;
            }

            let gpPts = 0, gpSprintPts = 0, hasWin = false;

            teamRaceResults.forEach(result => {
                const racePts = result.pts || 0;
                const pos     = result.pos;
                const isDNF   = result.time === 'DNF' || result.time === 'DNS'
                             || pos === 'DNF' || pos === 'DNS';

                const sprintResult = (gp.results?.sprintRace || []).find(r => r.driver === result.driver);
                const sprintPts    = sprintResult?.pts || 0;

                gpPts       += racePts + sprintPts;
                gpSprintPts += sprintPts;

                starts2026++;
                if (isDNF) dnfs2026++;
                if (parseInt(pos) === 1) { wins2026++; hasWin = true; }
                if (!isNaN(parseInt(pos)) && parseInt(pos) <= 3) podiums2026++;
                if (result.fastestLap) fastest2026++;
            });

            if (hasWin) raceWins.push(i);

            const qualy = gp.results?.qualifying;
            if (qualy?.length && driverNames.has(qualy[0].driver)) poles2026++;

            total2026 += gpPts;
            racePoints.push(gpPts);
            racePositions.push(gpPts);
            raceSprintPts.push(gpSprintPts > 0 ? gpSprintPts : null);
        });

        // ── POSICIÓN EN EL CAMPEONATO DE CONSTRUCTORES 2026 ──────
        const constructorPoints = {};
        Object.values(season).forEach(gp => {
            (gp.results?.race || []).forEach(r => {
                // Para asociar el piloto a su equipo en 2026 buscamos en driversData
                const driver = driversData.drivers.find(d => `${d.firstName} ${d.lastName}` === r.driver);
                if (!driver) return;
                const entry = (driver.history || []).find(h => h.year === CURRENT_SEASON_YEAR);
                if (!entry?.teamId) return;
                const tid = entry.teamId.toLowerCase();
                constructorPoints[tid] = (constructorPoints[tid] || 0) + (r.pts || 0);
            });
            (gp.results?.sprintRace || []).forEach(r => {
                const driver = driversData.drivers.find(d => `${d.firstName} ${d.lastName}` === r.driver);
                if (!driver) return;
                const entry = (driver.history || []).find(h => h.year === CURRENT_SEASON_YEAR);
                if (!entry?.teamId) return;
                const tid = entry.teamId.toLowerCase();
                constructorPoints[tid] = (constructorPoints[tid] || 0) + (r.pts || 0);
            });
        });

        const champPos = Object.entries(constructorPoints)
            .sort((a, b) => b[1] - a[1])
            .findIndex(([id]) => id === teamId.toLowerCase()) + 1;

        // ── CAREER STATS desde teams.json history ────────────────
        let totalWins = wins2026, totalPodiums = podiums2026;
        let totalPoles = poles2026, totalPoints = total2026;
        let totalStarts = starts2026, championships = 0;

        history.forEach(s => {
            if (s.year === CURRENT_SEASON_YEAR) return;
            totalWins    += s.wins     || 0;
            totalPodiums += s.podiums  || 0;
            totalPoles   += s.poles    || 0;
            totalPoints  += s.points   || 0;
            totalStarts  += s.starts   || 0;
            if (s.position === 1) championships++;
        });

        const debutYear = history.length
            ? Math.min(...history.map(s => s.year))
            : CURRENT_SEASON_YEAR;

        // ── COLOR DEL EQUIPO ──────────────────────────────────────
        const _teamCssVar = teamCssVar(teamId);
        const _teamColor  = getComputedStyle(document.documentElement)
                            .getPropertyValue(_teamCssVar).trim() || '#e10600';

        const teamContent = document.getElementById('team-content');
        if (teamContent) teamContent.style.setProperty('--team-color', `var(${_teamCssVar})`);

        // ── DOM: HERO ─────────────────────────────────────────────
        document.getElementById('page-title').textContent    = `F1 Hub | ${teamInfo.name}`;
        document.getElementById('hero-img').src              = `../img/teams/${teamId}-team.png`;
        const heroYearEl = document.getElementById('hero-year');
        if (heroYearEl) {
            const logoName = teamLogo(teamId);
            heroYearEl.src = logoName ? `../img/teams/${logoName}.png` : '';
        }
        document.getElementById('team-hero-name').textContent = teamInfo.name;

        const currentSeasonEntry = history.find(s => s.year === CURRENT_SEASON_YEAR);

        document.getElementById('meta-country').textContent   = teamInfo.country;
        document.getElementById('meta-base').textContent      = teamInfo.city;
        document.getElementById('meta-founded').textContent   = debutYear;
        document.getElementById('meta-principal').textContent = currentSeasonEntry?.principal || teamInfo.principal || '—';
        document.getElementById('meta-titles').textContent    = championships;

        // ── DOM: STATS 2026 ───────────────────────────────────────
        const podiumRate = starts2026 > 0
            ? Math.round((podiums2026 / starts2026) * 100) : 0;

        document.getElementById('stat-points').textContent      = total2026;
        document.getElementById('stat-pos').textContent         = champPos || '—';
        document.getElementById('stat-wins').textContent        = wins2026;
        document.getElementById('stat-races').textContent       = races.filter(gp => gp.results?.race?.length).length;
        document.getElementById('stat-podiums').textContent     = podiums2026;
        document.getElementById('stat-podium-rate').textContent = `${podiumRate}%`;
        document.getElementById('stat-poles').textContent       = poles2026;
        document.getElementById('stat-fastest').textContent     = fastest2026;
        document.getElementById('stat-dnfs').textContent        = dnfs2026;

        // ── DOM: CONSTRUCTOR HISTORY ──────────────────────────────
        document.getElementById('info-fullname').textContent  = teamInfo.fullName || teamInfo.name;
        document.getElementById('info-chassis').textContent   = currentSeasonEntry?.chassis || '—';
        document.getElementById('info-engine').textContent    = currentSeasonEntry?.engine  || '—';
        document.getElementById('info-seasons').textContent   = history.length ? history.length + 1 : 1;
        document.getElementById('info-races').textContent     = totalStarts;
        document.getElementById('info-wins').textContent      = totalWins;
        document.getElementById('info-podiums').textContent   = totalPodiums;
        document.getElementById('info-titles').textContent    = championships;

        // ── DOM: DRIVER CARDS ─────────────────────────────────────
        teamDrivers.forEach((driver, idx) => {
            const n    = idx + 1;
            const name = `${driver.firstName} ${driver.lastName}`;
            const card = document.getElementById(`driver-card-${n}`);
            if (!card) return;

            card.href = `../drivers/driver.html?driver=${driver.id}`;
            card.style.setProperty('--team-color', `var(${_teamCssVar})`);

            const numEl = document.getElementById(`tdc-number-${n}`);
            const imgEl = document.getElementById(`tdc-img-${n}`);
            const nameEl = document.getElementById(`tdc-name-${n}`);
            const natEl  = document.getElementById(`tdc-nat-${n}`);

            // Fondo de equipo
            card.classList.add(`team-${teamId}`);

            if (numEl)  numEl.textContent  = driver.number || '';
            if (imgEl)  imgEl.src          = `../img/drivers/${driver.image}`;
            if (nameEl) nameEl.textContent = driver.lastName;
            if (natEl)  natEl.textContent  = driver.nationality || '';
        });

        // Ocultar segunda card si el equipo tiene un solo piloto
        if (teamDrivers.length < 2) {
            const card2 = document.getElementById('driver-card-2');
            if (card2) card2.style.display = 'none';
        }

        // ── DOM: GALLERY ──────────────────────────────────────────
        for (let i = 1; i <= 6; i++) {
            const imgEl = document.getElementById(`gallery-img-${i}`);
            if (!imgEl) continue;
            const src = `../img/teams/${teamId}-team.png`;
            imgEl.src = src;
            imgEl.alt = teamInfo.name;
            imgEl.onerror = () => {
                const galleryItem = imgEl.closest('.gallery-item');
                if (galleryItem) galleryItem.style.display = 'none';
            };
        }

        // ── GRÁFICOS ──────────────────────────────────────────────
        await document.fonts.ready;

        Chart.defaults.font.family = "'F1-Regular', sans-serif";
        Chart.defaults.color = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-dim').trim() || '#888888';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';

        initRaceChart(raceLabels, racePoints, raceWins, _teamColor, racePositions, raceFullNames, raceSprintPts);
        initCareerChart(history, total2026, teamId, champPos, teamsData);
        initLineage(teamId, teamsData);

    } catch (err) {
        console.error('Error cargando datos del equipo:', err);
    }
});

// ── GRÁFICO 1: Puntos por carrera (temporada activa) ─────────────
function watchChartAspect(chart, breakpoint, normalRatio, mobileRatio) {
    const observer = new ResizeObserver(entries => {
        const width = entries[0].contentRect.width;
        const newRatio = width <= breakpoint ? mobileRatio : normalRatio;
        if (chart.options.aspectRatio !== newRatio) {
            chart.options.aspectRatio = newRatio;
            chart.resize();
        }
    });
    observer.observe(chart.canvas.parentElement);
}

function initRaceChart(labels, points, winIndexes, teamColor, positions, fullNames, sprintPts) {
    const ctx = document.getElementById('raceChart')?.getContext('2d');
    if (!ctx) return;

    const isMobile       = window.matchMedia('(max-width: 500px)').matches;
    const isCompleted    = points.map(p => p !== null);
    const completedPoints = points.map(p => p ?? 0);

    let cumulative = 0;
    const cumulativePoints = points.map(p => {
        if (p === null) return null;
        cumulative += p;
        return cumulative;
    });

    const winSet = new Set(winIndexes);

    const raceChartPlugin = {
        id: 'raceChartPlugin',
        afterDatasetDraw(chart) {
            const { ctx: c, data } = chart;
            const meta = chart.getDatasetMeta(0);
            const zeroY = chart.scales.y.getPixelForValue(0);

            c.save();
            data.labels.forEach((_, i) => {
                const bar = meta.data[i];
                if (!bar) return;

                const bw      = bar.width;
                const bx      = bar.x;
                const by      = bar.y;
                const ptsValue = completedPoints[i];
                const posVal   = positions[i];

                if (winSet.has(i)) {
                    c.font = '12px serif';
                    c.textAlign = 'center';
                    c.fillStyle = '#ffffff';
                    c.fillText('🏆', bx, by - 6);
                }

                if (posVal !== null && posVal !== undefined) {
                    const label    = String(posVal);
                    const fontSize = Math.min(Math.floor(bw * 0.8), 32);
                    c.font      = `${fontSize}px 'F1-Black', sans-serif`;
                    c.fillStyle = ptsValue > 0 ? '#ffffff' : '#888888';

                    const textWidth  = c.measureText(label).width;
                    let   textY      = by + 10;
                    const bottomLimit = zeroY - 10;
                    if (textY + textWidth > bottomLimit) textY = bottomLimit - textWidth;

                    c.save();
                    c.translate(bx, textY);
                    c.rotate(-Math.PI / 2);
                    c.textAlign    = 'right';
                    c.textBaseline = 'middle';
                    c.fillText(label, 0, 0);
                    c.restore();
                }
            });
            c.restore();
        }
    };

    const raceChart = new Chart(ctx, {
        type: 'bar',
        plugins: [raceChartPlugin],
        data: {
            labels,
            datasets: [
                {
                    label: 'Points',
                    data: completedPoints,
                    backgroundColor: isCompleted.map(c => c ? teamColor : 'transparent'),
                    hoverBackgroundColor: isCompleted.map(c => c ? teamColor.replace('0.9)', '1)') : 'transparent'),
                    borderWidth: 0,
                    borderRadius: 0,
                    order: 2,
                    barPercentage: 0.95,
                    categoryPercentage: 0.95,
                },
                {
                    label: 'Cumulative',
                    data: cumulativePoints,
                    type: 'line',
                    borderColor: teamColor,
                    backgroundColor: 'transparent',
                    borderWidth: isMobile ? 1.5 : 3,
                    pointRadius: isMobile ? 1 : 3,
                    pointBackgroundColor: teamColor,
                    pointHoverRadius: isMobile ? 3 : 6,
                    tension: 0,
                    spanGaps: false,
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            layout: { padding: { top: 24 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgb(22,22,34)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    titleColor: '#ffffff',
                    bodyColor: 'rgba(255,255,255,0.5)',
                    padding: 12,
                    displayColors: false,
                    itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
                    callbacks: {
                        title: (context) => fullNames[context[0].dataIndex],
                        label: ctx => {
                            if (ctx.dataset.label === 'Points') {
                                const i      = ctx.dataIndex;
                                const sprint = sprintPts?.[i];
                                const racePts = sprint != null ? ctx.parsed.y - sprint : ctx.parsed.y;
                                if (sprint != null) {
                                    return [
                                        `Race: ${racePts} points`,
                                        `Sprint: ${sprint} points`,
                                        `Weekend: ${ctx.parsed.y} points`,
                                        '',
                                    ];
                                }
                                return `Race: ${racePts} points`;
                            }
                            return `Total: ${ctx.parsed.y} points`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { drawOnChartArea: false }, ticks: { maxRotation: 45 } },
                y: { beginAtZero: true }
            }
        }
    });
    watchChartAspect(raceChart, 500, 2.25, 1.2);
}


// ── SECCIÓN: Team Lineage ─────────────────────────────────────────
function initLineage(currentTeamId, teamsData) {
    const lineage = teamLineage(currentTeamId);

    // Solo mostrar si hay predecesores (más de 1 equipo en el lineage)
    const predecessors = lineage.filter(id => id.toLowerCase() !== currentTeamId.toLowerCase());
    if (!predecessors.length) return;

    const section  = document.getElementById('lineage-section');
    const timeline = document.getElementById('lineage-timeline');
    if (!section || !timeline) return;

    section.style.display = '';

    predecessors.forEach(tid => {
        const teamInfo = teamsData.teams.find(t => t.id.toLowerCase() === tid.toLowerCase());
        if (!teamInfo) return;

        const history = teamInfo.history || [];
        if (!history.length) return;

        const sorted   = [...history].sort((a, b) => a.year - b.year);
        const firstYear = sorted[0].year;
        const lastYear  = sorted[sorted.length - 1].year;

        const totalPts     = sorted.reduce((s, h) => s + (h.points   || 0), 0);
        const totalWins    = sorted.reduce((s, h) => s + (h.wins     || 0), 0);
        const totalPodiums = sorted.reduce((s, h) => s + (h.podiums  || 0), 0);
        const totalPoles   = sorted.reduce((s, h) => s + (h.poles    || 0), 0);
        const titles       = sorted.filter(h => h.position === 1).length;

        const logoName = teamLogo(tid);
        const color    = teamColor(tid);

        const item = document.createElement('div');
        item.className = 'lineage-item';

        // Pills de temporadas
        const pillsHtml = sorted.map(s => {
            const isWCC = s.position === 1;
            return `<span class="lineage-season-pill${isWCC ? ' wcc' : ''}" title="${isWCC ? 'World Champions' : `P${s.position || '—'} · ${s.points || 0} pts`}">${s.year}${isWCC ? ' 🏆' : ''}</span>`;
        }).join('');

        item.innerHTML = `
            <div class="lineage-dot" style="border-color:${color.replace('0.9','0.3')}">
                ${logoName ? `<img src="../img/teams/${logoName}.png" alt="${teamInfo.name}">` : ''}
            </div>
            <div class="lineage-body">
                <div class="lineage-header">
                    <h3 class="lineage-name" style="color:${color.replace('0.9','1')}">${teamInfo.name}</h3>
                    <span class="lineage-years">${firstYear === lastYear ? firstYear : `${firstYear} – ${lastYear}`}</span>
                </div>
                <div class="lineage-stats">
                    <div class="lineage-stat">
                        <span class="lineage-stat-label">Seasons</span>
                        <span class="lineage-stat-value">${sorted.length}</span>
                    </div>
                    <div class="lineage-stat">
                        <span class="lineage-stat-label">Points</span>
                        <span class="lineage-stat-value">${totalPts}</span>
                    </div>
                    <div class="lineage-stat">
                        <span class="lineage-stat-label">Wins</span>
                        <span class="lineage-stat-value">${totalWins}</span>
                    </div>
                    <div class="lineage-stat">
                        <span class="lineage-stat-label">Podiums</span>
                        <span class="lineage-stat-value">${totalPodiums}</span>
                    </div>
                    <div class="lineage-stat">
                        <span class="lineage-stat-label">Poles</span>
                        <span class="lineage-stat-value">${totalPoles}</span>
                    </div>
                    ${titles ? `
                    <div class="lineage-stat">
                        <span class="lineage-stat-label">Titles</span>
                        <span class="lineage-stat-value wcc">${titles}</span>
                    </div>` : ''}
                </div>
                <div class="lineage-seasons-row" id="lineage-pills-${tid}"></div>
                <div class="lineage-season-detail" id="lineage-detail-${tid}" style="
                    max-height: 0;
                    overflow: hidden;
                    transition: max-height 0.35s ease, opacity 0.25s ease, margin-top 0.35s ease;
                    opacity: 0;
                    margin-top: 0;
                "></div>
            </div>
        `;

        timeline.appendChild(item);

        // ── Season pills con click handler ───────────────────────
        const pillsRow  = item.querySelector(`#lineage-pills-${tid}`);
        const detailBox = item.querySelector(`#lineage-detail-${tid}`);
        let activePill  = null;

        const closeDetail = () => {
            detailBox.style.maxHeight  = '0';
            detailBox.style.opacity    = '0';
            detailBox.style.marginTop  = '0';
        };

        const openDetail = (s) => {
            const isChamp = s.position === 1;
            const pos = isChamp ? '🏆 1' : (s.position ? `P${s.position}` : '—');
            const fields = [
                { label: 'Chassis',  value: s.chassis  || '—' },
                { label: 'Engine',   value: s.engine   || '—' },
                { label: 'Points',   value: s.points   != null ? s.points  : '—' },
                { label: 'Starts',   value: s.starts   != null ? s.starts  : '—' },
                { label: 'Wins',     value: s.wins     != null ? s.wins    : '—' },
                { label: 'Podiums',  value: s.podiums  != null ? s.podiums : '—' },
                { label: 'Poles',    value: s.poles    != null ? s.poles   : '—' },
                { label: 'Position', value: pos, wcc: isChamp },
            ];
            detailBox.innerHTML = `
                <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
                    ${fields.map(f => `
                        <div class="lineage-stat" style="width:auto;">
                            <span class="lineage-stat-label">${f.label}</span>
                            <span class="lineage-stat-value${f.wcc ? ' wcc' : ''}">${f.value}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            detailBox.style.marginTop = '8px';
            detailBox.style.maxHeight = '200px';
            detailBox.style.opacity   = '1';
        };

        sorted.forEach(s => {
            const isWCC = s.position === 1;
            const pill  = document.createElement('span');
            pill.className   = `lineage-season-pill${isWCC ? ' wcc' : ''}`;
            pill.title       = isWCC ? 'World Champions' : `P${s.position || '—'} · ${s.points || 0} pts`;
            pill.textContent = s.year + (isWCC ? ' 🏆' : '');

            pill.addEventListener('click', () => {
                if (activePill === pill) {
                    pill.style.outline     = '';
                    pill.style.borderColor = '';
                    pill.style.color       = '';
                    pill.style.background  = '';
                    activePill = null;
                    closeDetail();
                    return;
                }

                if (activePill) {
                    activePill.style.outline     = '';
                    activePill.style.borderColor = '';
                    activePill.style.color       = '';
                    activePill.style.background  = '';
                }
                activePill = pill;
                pill.style.outline     = `1px solid ${color.replace('0.9)', '0.8)')}`;
                pill.style.borderColor = color.replace('0.9)', '0.6)');
                pill.style.color       = '#fff';
                pill.style.background  = color.replace('0.9)', '0.12)');

                openDetail(s);
            });

            pillsRow.appendChild(pill);
        });
    });
}
async function initCareerChart(history, points2026, currentTeamId, currentChampPos, teamsData) {
    const ctx = document.getElementById('pointsChart')?.getContext('2d');
    if (!ctx) return;

    // ── Construir allSeasons solo con el equipo actual (sin predecesores) ─
    // Los ex-equipos se muestran en el Team Lineage, no aquí
    const allSeasons = [];

    // Temporadas históricas del equipo actual (sin la temporada en curso)
    history
        .filter(s => s.year !== CURRENT_SEASON_YEAR)
        .sort((a, b) => a.year - b.year)
        .forEach(s => {
            allSeasons.push({
                year:     String(s.year),
                points:   s.points  || 0,
                teamId:   currentTeamId,
                isWCC:    s.position === 1,
                position: s.position,
            });
        });

    // Temporada actual (2026)
    allSeasons.push({
        year:     String(CURRENT_SEASON_YEAR),
        points:   points2026,
        teamId:   currentTeamId,
        isWCC:    false,
        position: currentChampPos,
    });

    // Ordenar por año por si los lineages se solapan
    allSeasons.sort((a, b) => Number(a.year) - Number(b.year));

    const seasons = allSeasons.map(s => s.year);
    const points  = allSeasons.map(s => s.points);
    const colors  = allSeasons.map(s => teamColor(s.teamId));

    // Pre-carga logos
    const logoCache = {};
    await Promise.all(allSeasons.map(s => {
        const name = teamLogo(s.teamId);
        if (!name || logoCache[name]) return Promise.resolve();
        return new Promise(resolve => {
            const img = new Image();
            img.onload  = () => { logoCache[name] = img; resolve(); };
            img.onerror = resolve;
            img.src = `../img/teams/${name}.png`;
        });
    }));

    const WINDOW_SIZE = 15;
    const total = allSeasons.length;

    // winStart = índice en allSeasons del primer elemento visible
    // Arranca mostrando las últimas WINDOW_SIZE temporadas
    let winStart = Math.max(0, total - WINDOW_SIZE);

    // Vista activa: slice de allSeasons que el chart conoce en todo momento
    let view = allSeasons.slice(winStart, winStart + WINDOW_SIZE);

    // ── Estado de selección por temporada ───────────────────────
    let selectedGlobalIdx = null;
    // Snapshot de valores originales del info-card (carrera completa)
    // Se captura después de que el DOM ya tiene los valores renderizados
    let careerSnap = null;

    // ── Plugin: dibuja pts y logos sobre las barras ───────────────
    // Trabaja sobre `view` (siempre WINDOW_SIZE elementos), no sobre allSeasons,
    // por lo que meta.data[i].x siempre corresponde al season correcto.
    const careerPlugin = {
        id: 'careerPlugin',
        afterDatasetDraw(chart) {
            const { ctx: c, chartArea } = chart;
            const meta  = chart.getDatasetMeta(0);
            const zeroY = chart.scales.y.getPixelForValue(0);

            c.save();
            c.beginPath();
            c.rect(chartArea.left, chartArea.top - 40, chartArea.width, chartArea.height + 80);
            c.clip();

            view.forEach((season, i) => {
                const bar = meta.data[i];
                if (!bar) return;

                const bw = bar.width;
                const bx = bar.x;
                const by = bar.y;

                const logoSize = Math.min(Math.floor(bw * 0.8), 32);

                if (season.points > 0) {
                    c.save();
                    const fontSize = Math.min(Math.floor(bw * 0.8), 32);
                    c.font = `${fontSize}px 'F1-Black', sans-serif`;

                    const textStr   = String(season.points);
                    const textWidth = c.measureText(textStr).width;
                    let   textY     = by + 10;
                    const bottomLimit = zeroY - logoSize - 10;
                    if (textY + textWidth > bottomLimit) textY = bottomLimit - textWidth;

                    c.translate(bx, textY);
                    c.rotate(-Math.PI / 2);
                    c.textAlign    = 'right';
                    c.textBaseline = 'middle';

                    if (season.isWCC) {
                        const grad = c.createLinearGradient(-textWidth, -fontSize / 2, 0, fontSize / 2);
                        grad.addColorStop(0,    '#B78E3F');
                        grad.addColorStop(0.35, '#F5E0B5');
                        grad.addColorStop(1,    '#B78E3F');
                        c.fillStyle = grad;
                    } else {
                        c.fillStyle = '#ffffff';
                    }

                    c.fillText(textStr, 0, 0);
                    c.restore();
                }

                const logoName = teamLogo(season.teamId);
                if (logoName && logoCache[logoName]) {
                    c.imageSmoothingEnabled = true;
                    c.imageSmoothingQuality = 'high';
                    c.drawImage(logoCache[logoName], bx - logoSize / 2, zeroY - logoSize - 4, logoSize, logoSize);
                }
            });

            c.restore();
        }
    };

    // ── Inicializar chart con la vista inicial ────────────────────
    const careerChart = new Chart(ctx, {
        type: 'bar',
        plugins: [careerPlugin],
        data: {
            labels:   view.map(s => s.year),
            datasets: [{
                data:                 view.map(s => s.points),
                backgroundColor:      view.map(s => teamColor(s.teamId)),
                hoverBackgroundColor: view.map(s => teamColor(s.teamId).replace('0.9)', '1)')),
                borderWidth:      0,
                borderRadius:     0,
                barPercentage:    0.95,
                categoryPercentage: 0.95,
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 0 },
            transitions: { active: { animation: { duration: 300 } } },
            layout: { padding: { top: 32, bottom: 8 } },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawOnChartArea: false },
                    ticks: {
                        color: '#888',
                        font: { size: 10 },
                        maxRotation: 45,
                        callback(value, index) {
                            const label    = view[index]?.year ?? '';
                            const isMobile = this.chart.width <= 500;
                            return isMobile ? `'${String(label).slice(-2)}` : label;
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { display: false }
                }
            }
        }
    });

    // ── Selección por temporada ───────────────────────────────────
    const infoIds = ['fullname','chassis','engine','seasons','races','wins','podiums','titles'];

    const snapInfo = () => Object.fromEntries(
        infoIds.map(id => [id, document.getElementById(`info-${id}`)?.textContent ?? ''])
    );

    const setInfo = (vals) => {
        infoIds.forEach(id => {
            const el = document.getElementById(`info-${id}`);
            if (!el) return;
            el.style.transition = 'opacity 0.18s ease';
            el.style.opacity = '0';
            setTimeout(() => {
                el.textContent = vals[id] ?? '';
                el.style.opacity = '1';
            }, 90);
        });
    };

    // Exponer al scope global para que renderLineage pueda usarlos
    window._f1InfoCard = {
        setInfo,
        snapInfo,
        getSnap: () => careerSnap,
        ensureSnap: () => { if (!careerSnap) careerSnap = snapInfo(); return careerSnap; },
    };

    const barColors = (selGlobalIdx) =>
        view.map(s => {
            const base = teamColor(s.teamId);
            if (selGlobalIdx === null) return base;
            return allSeasons.indexOf(s) === selGlobalIdx
                ? base.replace('0.9)', '1)')
                : base.replace('0.9)', '0.5)');
        });

    const selectSeason = (seasonData) => {
        // Capturar snapshot la primera vez
        if (!careerSnap) careerSnap = snapInfo();

        const globalIdx = allSeasons.indexOf(seasonData);
        if (selectedGlobalIdx === globalIdx) {
            // Toggle: deseleccionar
            selectedGlobalIdx = null;
            careerChart.data.datasets[0].backgroundColor = barColors(null);
            careerChart.update('none');
            setInfo(careerSnap);
            return;
        }

        selectedGlobalIdx = globalIdx;
        careerChart.data.datasets[0].backgroundColor = barColors(globalIdx);
        careerChart.update('none');

        // Buscar datos de esa temporada
        const yearNum   = Number(seasonData.year);
        const histEntry = history.find(s => s.year === yearNum)
            ?? (yearNum === CURRENT_SEASON_YEAR
                ? { year: CURRENT_SEASON_YEAR, points: points2026, position: currentChampPos }
                : null);
        if (!histEntry) return;

        const pos = histEntry.position === 1 ? '1 🏆' : (histEntry.position ? `P${histEntry.position}` : '—');

        setInfo({
            fullname: careerSnap.fullname,
            chassis:  histEntry.chassis || '—',
            engine:   histEntry.engine  || '—',
            seasons:  String(yearNum),
            races:    histEntry.starts != null ? String(histEntry.starts) : '—',
            wins:     histEntry.wins    != null ? String(histEntry.wins)   : '—',
            podiums:  histEntry.podiums != null ? String(histEntry.podiums): '—',
            titles:   pos,
        });
    };

    // Click en barra — solo si mousedown y mouseup ocurrieron sobre la misma barra
    let mouseDownOnBar = false;
    careerChart.canvas.addEventListener('mousedown', (e) => {
        // Capturar snapshot antes de la primera selección
        if (!careerSnap) careerSnap = snapInfo();
        const hits = careerChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
        mouseDownOnBar = hits.length > 0;
    });

    careerChart.canvas.addEventListener('click', (e) => {
        if (!mouseDownOnBar) return;
        mouseDownOnBar = false;

        const hits = careerChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
        if (!hits.length) return;
        selectSeason(view[hits[0].index]);
    });

    // Cursor pointer sobre barras
    careerChart.canvas.addEventListener('mousemove', (e) => {
        if (isDragging) return; // dragging maneja su propio cursor
        const hits = careerChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
        careerChart.canvas.style.cursor = hits.length ? 'pointer' : 'default';
    });

    // ── Drag to scroll ────────────────────────────────────────────
    // Mutar chart.data directamente — así meta.data[i] siempre tiene coords reales
    let isDragging = false;
    if (total > WINDOW_SIZE) {
        const canvas = careerChart.canvas;
        let dragStartX   = 0;
        let dragStartWin = 0;
        // offset fraccionario acumulado para suavizar el drag
        let dragOffset   = 0;

        const pxPerBar = () => canvas.offsetWidth / WINDOW_SIZE;

        const applyWindow = (rawStart) => {
            const clamped = Math.max(0, Math.min(total - WINDOW_SIZE, rawStart));
            const s = Math.round(clamped);
            if (s === winStart) return;
            winStart = s;
            view = allSeasons.slice(s, s + WINDOW_SIZE);

            const ds = careerChart.data.datasets[0];
            careerChart.data.labels   = view.map(v => v.year);
            ds.data                   = view.map(v => v.points);
            ds.backgroundColor        = barColors(selectedGlobalIdx);
            ds.hoverBackgroundColor   = view.map(v => teamColor(v.teamId).replace('0.9)', '1)'));
            careerChart.update('none');
        };

        // Mouse
        canvas.addEventListener('mousedown', e => {
            isDragging   = true;
            dragStartX   = e.clientX;
            dragStartWin = winStart;
            dragOffset   = 0;
            if (!mouseDownOnBar) canvas.style.cursor = 'ew-resize';
            e.preventDefault();
        });
        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const delta = (dragStartX - e.clientX) / pxPerBar();
            applyWindow(dragStartWin + delta);
        });
        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            canvas.style.cursor = 'default';
        });

        // Touch
        canvas.addEventListener('touchstart', e => {
            isDragging   = true;
            dragStartX   = e.touches[0].clientX;
            dragStartWin = winStart;
            dragOffset   = 0;
        }, { passive: true });
        canvas.addEventListener('touchmove', e => {
            if (!isDragging) return;
            const delta = (dragStartX - e.touches[0].clientX) / pxPerBar();
            applyWindow(dragStartWin + delta);
        }, { passive: true });
        canvas.addEventListener('touchend', () => { isDragging = false; });
    }

    watchChartAspect(careerChart, 500, 2.25, 1.2);
}