const CURRENT_SEASON_FILE = '../data/season2026.json';
const CURRENT_SEASON_YEAR = 2026;

// TEAMS, teamColor(), teamCssVar() y la inyección de --f1-* vars
// vienen de teams.js, que debe cargarse antes que este archivo.


document.addEventListener('DOMContentLoaded', async () => {
    const driverId = new URLSearchParams(window.location.search).get('driver');
    if (!driverId) { console.error('No ?driver= en la URL'); return; }

    try {
        const [driversData, season] = await Promise.all([
            fetch('../data/drivers.json').then(r => r.json()),
            fetch(CURRENT_SEASON_FILE).then(r => r.json())
        ]);

        const driverInfo = driversData.drivers.find(d => d.id === driverId);
        if (!driverInfo) { console.error('Piloto no encontrado:', driverId); return; }

        const fullName = `${driverInfo.firstName} ${driverInfo.lastName}`;
        const history    = driverInfo.history || [];
        const entry2026  = history.find(h => h.year === CURRENT_SEASON_YEAR);
        const currentTeam = entry2026?.teamId || '—';

        // ── STATS 2026 desde season2026.json ─────────────────────
        const races = Object.values(season)
            .filter(gp => {
                const name = gp.name.toLowerCase();
                return !name.includes('bahrain') && !name.includes('saudi');
            })
            .sort((a, b) => a.round - b.round);

        const raceLabels    = [];
        const raceFullNames = []; 
        const racePoints    = [];
        const raceWins      = []; 
        const racePositions = []; // now stores total weekend pts (race + sprint) for bar label
        const raceSprintPts = []; // sprint pts per race, null if no sprint or 0 pts
        
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

            const result = gp.results.race.find(r => r.driver === fullName);
            if (!result) { 
                racePoints.push(null); 
                racePositions.push(null);
                raceSprintPts.push(null);
                return; 
            }

            const racePts = result.pts || 0;
            const pos     = result.pos;
            const isDNF   = result.time === 'DNF' || result.time === 'DNS' || pos === 'DNF' || pos === 'DNS';

            const sprintResult = (gp.results?.sprintRace || []).find(r => r.driver === fullName);
            const sprintPts    = sprintResult?.pts || 0;

            const totalPts = racePts + sprintPts;

            racePoints.push(totalPts);
            racePositions.push(totalPts);
            raceSprintPts.push(sprintPts > 0 ? sprintPts : null);
            total2026 += totalPts;

            starts2026++;
            if (isDNF) dnfs2026++;
            if (parseInt(pos) === 1) { wins2026++; raceWins.push(i); }
            if (!isNaN(parseInt(pos)) && parseInt(pos) <= 3) podiums2026++;
            if (result.fastestLap) fastest2026++;

            const qualy = gp.results?.qualifying;
            if (qualy?.length && qualy[0].driver === fullName) poles2026++;
        });

        // ── POSICIÓN EN EL CAMPEONATO 2026 ───────────────────────
        const driverPoints = {};
        Object.values(season).forEach(gp => {
            (gp.results?.race || []).forEach(r => {
                driverPoints[r.driver] = (driverPoints[r.driver] || 0) + (r.pts || 0);
            });
            (gp.results?.sprintRace || []).forEach(r => {
                driverPoints[r.driver] = (driverPoints[r.driver] || 0) + (r.pts || 0);
            });
        });
        const champPos = Object.entries(driverPoints)
            .sort((a, b) => b[1] - a[1])
            .findIndex(([name]) => name === fullName) + 1;

        // ── CAREER STATS desde drivers.json ──────────────────────
        let totalWins = wins2026, totalPodiums = podiums2026;
        let totalPoles = 0, totalPoints = total2026;
        let totalStarts = starts2026, totalFastestLaps = 0, worldTitles = 0;
        const debutYear = history.length
            ? Math.min(...history.map(s => s.year))
            : CURRENT_SEASON_YEAR;

        history.forEach(s => {
            if (s.year === CURRENT_SEASON_YEAR) return;
            totalWins        += s.wins        || 0;
            totalPodiums     += s.podiums     || 0;
            totalPoles       += s.poles       || 0;
            totalPoints      += s.points      || 0;
            totalStarts      += s.starts      || 0;
            totalFastestLaps += s.fastestLaps || 0;
            if (s.position === 1) worldTitles++;
        });

        totalPoles += poles2026;

        // ── EDAD ──────────────────────────────────────────────────
        const dob   = new Date(driverInfo.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        if (today.getMonth() < dob.getMonth() ||
           (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;

        // ── COLOR DEL EQUIPO ──────────────────────────────────────
        const _teamCssVar = teamCssVar(currentTeam);
        const _teamColor  = getComputedStyle(document.documentElement)
                            .getPropertyValue(_teamCssVar)
                            .trim() || '#e10600';

        const driverContent = document.querySelector('.driver-content');
        if (driverContent) driverContent.style.setProperty('--team-color', `var(${_teamCssVar})`);

        // ── INYECCIÓN EN EL DOM ───────────────────────────────────
        document.getElementById('page-title').textContent             = `F1 Hub | ${fullName}`;
        document.getElementById('hero-img').src                      = `../img/drivers/${driverInfo.image.replace('.png', '-2.png')}`;
        document.getElementById('hero-number').textContent            = driverInfo.number;
        document.getElementById('driver-hero-first-name').textContent = driverInfo.firstName;
        document.getElementById('driver-hero-last-name').textContent  = driverInfo.lastName;

        document.getElementById('meta-nationality').textContent = driverInfo.nationality;
        document.getElementById('meta-dob').textContent         = driverInfo.dateOfBirth;
        document.getElementById('meta-age').textContent         = age;
        document.getElementById('meta-number').textContent      = `#${driverInfo.number}`;
        document.getElementById('meta-titles').textContent      = worldTitles;

        const podiumRate = starts2026 > 0
            ? Math.round((podiums2026 / starts2026) * 100) : 0;

        document.getElementById('stat-points').textContent      = total2026;
        document.getElementById('stat-pos').textContent         = champPos || '—';
        document.getElementById('stat-wins').textContent        = wins2026;
        document.getElementById('stat-races').textContent       = starts2026;
        document.getElementById('stat-podiums').textContent     = podiums2026;
        document.getElementById('stat-podium-rate').textContent = `${podiumRate}%`;
        document.getElementById('stat-poles').textContent       = poles2026;
        document.getElementById('stat-fastest').textContent     = fastest2026;
        document.getElementById('stat-dnfs').textContent        = dnfs2026;

        document.getElementById('info-team').textContent    = currentTeam;
        document.getElementById('info-debut').textContent   = debutYear;
        document.getElementById('info-races').textContent   = totalStarts;
        document.getElementById('info-wins').textContent    = totalWins;
        document.getElementById('info-podiums').textContent = totalPodiums;
        document.getElementById('info-poles').textContent   = totalPoles;
        document.getElementById('info-points').textContent  = totalPoints;
        document.getElementById('info-titles2').textContent = worldTitles;

        const infoFastest = document.getElementById('info-fastest');
        if (infoFastest) infoFastest.textContent = totalFastestLaps;

        // ── GRÁFICOS ──────────────────────────────────────────────
        await document.fonts.ready;

        const dimColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-dim').trim() || '#888888';
        Chart.defaults.font.family = "'F1-Regular', sans-serif";
        Chart.defaults.color       = dimColor;
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

        initRaceChart(raceLabels, racePoints, raceWins, _teamColor, racePositions, raceFullNames, raceSprintPts);
        initCareerChart(history, total2026, currentTeam, champPos);

    } catch (err) {
        console.error('Error cargando datos del piloto:', err);
    }
});

// ── GRÁFICO 1: Puntos por carrera (temporada activa) ─────────────
// ── RESPONSIVE ASPECT RATIO ──────────────────────────────────────
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

    const isMobile = window.matchMedia('(max-width: 500px)').matches;

    const isCompleted     = points.map(p => p !== null);
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

                const bw = bar.width;
                const bx = bar.x;
                const by = bar.y;
                const ptsValue = completedPoints[i];
                const posVal = positions[i];

                if (winSet.has(i)) {
                    c.font = '12px serif';
                    c.textAlign = 'center';
                    c.fillStyle = '#ffffff';
                    c.fillText('🏆', bx, by - 6);
                }

                if (posVal !== null && posVal !== undefined) {
                    const label = String(posVal);
                    const fontSize = Math.min(Math.floor(bw * 0.8), 32); 
                    c.font = `${fontSize}px 'F1-Black', sans-serif`;
                    c.fillStyle = ptsValue > 0 ? '#ffffff' : '#888888';

                    const textWidth = c.measureText(label).width;
                    let textY = by + 10;
                    const bottomLimit = zeroY - 10; 

                    if (textY + textWidth > bottomLimit) {
                        textY = bottomLimit - textWidth;
                    }

                    c.save();
                    c.translate(bx, textY);
                    c.rotate(-Math.PI / 2);
                    c.textAlign = 'right';
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
                    categoryPercentage: 0.95
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
                    order: 1
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
                        title: (context) => {
                            return fullNames[context[0].dataIndex];
                        },
                        label: ctx => {
                            if (ctx.dataset.label === 'Points') {
                                const i = ctx.dataIndex;
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

// ── GRÁFICO 2: Puntos por temporada (carrera completa) ────────────
async function initCareerChart(history, points2026, currentTeam, currentChampPos) {
    const ctx = document.getElementById('pointsChart')?.getContext('2d');
    if (!ctx) return;

    const historicalSeasons = history
        .filter(s => s.year !== CURRENT_SEASON_YEAR)
        .sort((a, b) => a.year - b.year);

    const allSeasons = [
        ...historicalSeasons.map(s => ({
            year:     String(s.year),
            points:   s.points   || 0,
            teamId:   s.teamId   || '',
            isWDC:    s.position === 1,
            position: s.position,
            // datos extra para el info-card
            wins:        s.wins        ?? null,
            podiums:     s.podiums     ?? null,
            poles:       s.poles       ?? null,
            starts:      s.starts      ?? null,
            fastestLaps: s.fastestLaps ?? null,
        })),
        {
            year:     String(CURRENT_SEASON_YEAR),
            points:   points2026,
            teamId:   currentTeam,
            isWDC:    false,
            position: currentChampPos,
            wins: null, podiums: null, poles: null, starts: null, fastestLaps: null,
        }
    ];

    const WINDOW_SIZE = screen.width <= 500 ? 8 : 15;
    const total = allSeasons.length;
    let winStart = Math.max(0, total - WINDOW_SIZE);
    let view     = allSeasons.slice(winStart, winStart + WINDOW_SIZE);

    // ── Estado de selección ───────────────────────────────────
    let selectedGlobalIdx = null;
    let careerSnap        = null;

    // ── Info-card helpers ─────────────────────────────────────
    const infoIds = ['team','debut','races','wins','podiums','poles','points','titles2','fastest'];

    const snapInfo = () => Object.fromEntries(
        infoIds.map(id => [id, document.getElementById(`info-${id}`)?.textContent ?? ''])
    );

    const setInfo = (vals) => {
        infoIds.forEach(id => {
            const el = document.getElementById(`info-${id}`);
            if (!el) return;
            el.style.transition = 'opacity 0.18s ease';
            el.style.opacity    = '0';
            setTimeout(() => {
                el.textContent  = vals[id] ?? '';
                el.style.opacity = '1';
            }, 90);
        });
    };

    // ── Logo cache ────────────────────────────────────────────
    const logoCache = {};
    await Promise.all(allSeasons.map(s => {
        const name = teamLogo(s.teamId);
        if (!name || logoCache[name]) return Promise.resolve();
        return new Promise(resolve => {
            const img = new Image();
            img.onload  = () => { logoCache[name] = img; resolve(); };
            img.onerror = () => {
                const fallback = new Image();
                fallback.onload  = () => { logoCache[name] = fallback; resolve(); };
                fallback.onerror = resolve;
                fallback.src = `../img/teams/${name}.png`;
            };
            img.src = `../img/teams/${name}-2.png`;
        });
    }));

    // ── Plugin: textos y logos sobre las barras ───────────────
    const careerPlugin = {
        id: 'careerPlugin',
        afterDatasetDraw(chart) {
            const { ctx: c } = chart;
            const meta  = chart.getDatasetMeta(0);
            const zeroY = chart.scales.y.getPixelForValue(0);

            view.forEach((season, i) => {
                const bar = meta.data[i];
                if (!bar) return;
                const { width: bw, x: bx, y: by } = bar;
                const logoSize = Math.min(Math.floor(bw * 0.8), 32);

                c.save();
                if (season.points > 0) {
                    const fontSize  = Math.min(Math.floor(bw * 0.8), 32);
                    c.font          = `${fontSize}px 'F1-Black', sans-serif`;
                    const textStr   = String(season.points);
                    const textWidth = c.measureText(textStr).width;
                    let textY       = by + 10;
                    const bottomLimit = zeroY - logoSize - 10;
                    if (textY + textWidth > bottomLimit) textY = bottomLimit - textWidth;

                    c.translate(bx, textY);
                    c.rotate(-Math.PI / 2);
                    c.textAlign    = 'right';
                    c.textBaseline = 'middle';

                    if (season.isWDC) {
                        const grad = c.createLinearGradient(-textWidth, -fontSize/2, 0, fontSize/2);
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

    // ── Helpers de color ──────────────────────────────────────
    const barColors = (selGlobalIdx) =>
        view.map(s => {
            const base = teamColor(s.teamId);
            if (selGlobalIdx === null) return base;
            return allSeasons.indexOf(s) === selGlobalIdx
                ? base.replace('0.9)', '1)')
                : base.replace('0.9)', '0.5)');
        });

    // ── Chart ─────────────────────────────────────────────────
    const careerChart = new Chart(ctx, {
        type: 'bar',
        plugins: [careerPlugin],
        data: {
            labels: view.map(s => s.year),
            datasets: [{
                data:                 view.map(s => s.points),
                backgroundColor:      barColors(null),
                hoverBackgroundColor: view.map(s => teamColor(s.teamId).replace('0.9)', '1)')),
                borderWidth:      0,
                borderRadius:     0,
                barPercentage:    0.95,
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
                    borderColor:     'rgba(255,255,255,0.08)',
                    borderWidth:     1,
                    titleColor:      '#ffffff',
                    bodyColor:       'rgba(255,255,255,0.5)',
                    padding:         12,
                    displayColors:   false,
                    callbacks: {
                        title: (context) => `${context[0].label} Season`,
                        label: (context) => {
                            const s   = view[context.dataIndex];
                            const pos = s.position === 1
                                ? '🏆 World Champion'
                                : `Position: P${s.position || '-'}`;
                            return [pos, `Points: ${context.parsed.y}`];
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
                        callback: function(value, index) {
                            const label    = view[index]?.year ?? '';
                            const isMobile = this.chart.width <= 500;
                            return isMobile ? `'${String(label).slice(-2)}` : label;
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid:  { color: 'rgba(255,255,255,0.05)' },
                    ticks: { display: false }
                }
            }
        }
    });

    // ── Selección por temporada ───────────────────────────────
    const selectSeason = (seasonData) => {
        if (!careerSnap) careerSnap = snapInfo();
        const globalIdx = allSeasons.indexOf(seasonData);

        if (selectedGlobalIdx === globalIdx) {
            selectedGlobalIdx = null;
            careerChart.data.datasets[0].backgroundColor = barColors(null);
            careerChart.update('none');
            setInfo(careerSnap);
            return;
        }

        selectedGlobalIdx = globalIdx;
        careerChart.data.datasets[0].backgroundColor = barColors(globalIdx);
        careerChart.update('none');

        const s   = seasonData;
        const pos = s.position === 1 ? '1 🏆' : (s.position ? `P${s.position}` : '—');

        setInfo({
            team:     s.teamId   || '—',
            debut:    careerSnap.debut,
            races:    s.starts   != null ? String(s.starts)      : '—',
            wins:     s.wins     != null ? String(s.wins)        : '—',
            podiums:  s.podiums  != null ? String(s.podiums)     : '—',
            poles:    s.poles    != null ? String(s.poles)       : '—',
            points:   String(s.points),
            titles2:  pos,
            fastest:  s.fastestLaps != null ? String(s.fastestLaps) : '—',
        });
    };

    // ── Click: solo si mousedown empezó en la misma barra ────
    let mouseDownOnBar = false;
    careerChart.canvas.addEventListener('mousedown', (e) => {
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

    // ── Cursor ────────────────────────────────────────────────
    let isDragging = false;
    careerChart.canvas.addEventListener('mousemove', (e) => {
        if (isDragging) return;
        const hits = careerChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
        careerChart.canvas.style.cursor = hits.length ? 'pointer' : 'default';
    });

    // ── Drag to scroll ────────────────────────────────────────
    if (total > WINDOW_SIZE) {
        const canvas     = careerChart.canvas;
        let dragStartX   = 0;
        let dragStartWin = 0;

        const pxPerBar = () => canvas.offsetWidth / WINDOW_SIZE;

        const applyWindow = (rawStart) => {
            const clamped = Math.max(0, Math.min(total - WINDOW_SIZE, rawStart));
            const s = Math.round(clamped);
            if (s === winStart) return;
            winStart = s;
            view     = allSeasons.slice(s, s + WINDOW_SIZE);

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