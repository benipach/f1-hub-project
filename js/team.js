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
        document.getElementById('hero-img').src              = `../img/teams/${teamId}-hero.jpg`;
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

        // ── GRÁFICOS ──────────────────────────────────────────────
        await document.fonts.ready;

        Chart.defaults.font.family = "'F1-Regular', sans-serif";
        Chart.defaults.color = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-dim').trim() || '#888888';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';

        initRaceChart(raceLabels, racePoints, raceWins, _teamColor, racePositions, raceFullNames, raceSprintPts);
        initCareerChart(history, total2026, teamId, champPos, teamsData);

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

// ── GRÁFICO 2: Puntos por temporada (historia completa) ───────────
async function initCareerChart(history, points2026, currentTeamId, currentChampPos, teamsData) {
    const ctx = document.getElementById('pointsChart')?.getContext('2d');
    if (!ctx) return;

    // ── Construir allSeasons recorriendo el lineage ───────────────
    // teamLineage() viene de teams.js: devuelve los ids ordenados cronológicamente
    const lineage = teamLineage(currentTeamId);
    const allSeasons = [];

    lineage.forEach(tid => {
        const isCurrent = tid.toLowerCase() === currentTeamId.toLowerCase();

        if (isCurrent) {
            // Temporadas históricas del equipo actual (sin la temporada en curso)
            const pastSeasons = history
                .filter(s => s.year !== CURRENT_SEASON_YEAR)
                .sort((a, b) => a.year - b.year);

            pastSeasons.forEach(s => {
                allSeasons.push({
                    year:     String(s.year),
                    points:   s.points  || 0,
                    teamId:   tid,
                    isWCC:    s.position === 1,
                    position: s.position,
                });
            });

            // Temporada actual (2026)
            allSeasons.push({
                year:     String(CURRENT_SEASON_YEAR),
                points:   points2026,
                teamId:   tid,
                isWCC:    false,
                position: currentChampPos,
            });
        } else {
            // Equipo predecesor: buscar su entrada en teams.json
            const predInfo = teamsData.teams.find(t => t.id.toLowerCase() === tid.toLowerCase());
            if (!predInfo?.history?.length) return;

            predInfo.history
                .filter(s => s.year !== CURRENT_SEASON_YEAR)
                .sort((a, b) => a.year - b.year)
                .forEach(s => {
                    allSeasons.push({
                        year:     String(s.year),
                        points:   s.points  || 0,
                        teamId:   tid,
                        isWCC:    s.position === 1,
                        position: s.position,
                    });
                });
        }
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

    const careerPlugin = {
        id: 'careerPlugin',
        afterDatasetDraw(chart) {
            const { ctx: c } = chart;
            const meta = chart.getDatasetMeta(0);
            const zeroY = chart.scales.y.getPixelForValue(0);

            allSeasons.forEach((season, i) => {
                const bar = meta.data[i];
                if (!bar) return;

                const bw = bar.width;
                const bx = bar.x;
                const by = bar.y;

                c.save();

                const logoSize = Math.min(Math.floor(bw * 0.8), 32);

                if (season.points > 0) {
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
                }

                c.restore();

                const logoName = teamLogo(season.teamId);
                if (logoName && logoCache[logoName]) {
                    c.imageSmoothingEnabled = true;
                    c.imageSmoothingQuality = 'high';
                    c.drawImage(logoCache[logoName], bx - logoSize / 2, zeroY - logoSize - 4, logoSize, logoSize);
                }
            });
        }
    };

    const careerChart = new Chart(ctx, {
        type: 'bar',
        plugins: [careerPlugin],
        data: {
            labels: seasons,
            datasets: [{
                data: points,
                backgroundColor: colors,
                hoverBackgroundColor: colors.map(c => c.replace('0.9)', '1)')),
                borderWidth: 0,
                borderRadius: 0,
                barPercentage: 0.95,
                categoryPercentage: 0.95,
            }]
        },
        options: {
            responsive: true,
            layout: { padding: { top: 32, bottom: 8 } },
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
                    callbacks: {
                        title: context => `${context[0].label} Season`,
                        label: context => {
                            const s = allSeasons[context.dataIndex];
                            const posText = s.position === 1
                                ? '🏆 World Champions'
                                : `Position: P${s.position || '—'}`;
                            return [posText, `Points: ${context.parsed.y}`];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawOnChartArea: false },
                    ticks: {
                        color: '#888',
                        font: { size: 10 },
                        maxRotation: 45,
                        callback(value, index) {
                            const label    = seasons[index];
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
    watchChartAspect(careerChart, 500, 2.25, 1.2);
}