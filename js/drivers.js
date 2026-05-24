const CURRENT_SEASON_FILE = '../data/season2026.json';
const CURRENT_SEASON_YEAR = 2026;

// ── EQUIPO → COLORES OFICIALES UNIFICADOS AL 90% DE INTENSIDAD (CON ALIAS) ──

const TEAM_COLORS = {
    'Mercedes':        'rgba(43, 255, 219, 0.9)',  'mercedes':        'rgba(43, 255, 219, 0.9)',
    'Ferrari':         'rgba(255, 0, 25, 0.9)',   'ferrari':         'rgba(255, 0, 25, 0.9)',
    'McLaren':         'rgba(255, 127, 0, 0.9)',  'mclaren':         'rgba(255, 127, 0, 0.9)',
    'Red Bull Racing': 'rgba(34, 71, 122, 0.9)',  'Red Bull': 'rgba(34, 71, 122, 0.9)', 'red-bull': 'rgba(34, 71, 122, 0.9)', 'red-bull-racing': 'rgba(34, 71, 122, 0.9)',
    'Aston Martin':    'rgba(34, 153, 113, 0.9)', 'aston-martin':    'rgba(34, 153, 113, 0.9)',
    'Alpine':          'rgba(0, 178, 255, 0.9)',  'alpine':          'rgba(0, 178, 255, 0.9)',
    'Williams':        'rgba(28, 122, 255, 0.9)', 'williams':        'rgba(28, 122, 255, 0.9)',
    'Racing Bulls':    'rgba(102, 125, 255, 0.9)','racing-bulls':    'rgba(102, 125, 255, 0.9)',
    'Haas F1 Team':    'rgba(222, 225, 226, 0.9)', 'Haas': 'rgba(222, 225, 226, 0.9)', 'haas': 'rgba(222, 225, 226, 0.9)',
    'Audi':            'rgba(255, 46, 46, 0.9)',   'audi':            'rgba(255, 46, 46, 0.9)',
    'Cadillac':        'rgba(170, 170, 173, 0.9)','cadillac':        'rgba(170, 170, 173, 0.9)',
};

const TEAM_CSS_VARS = {
    'Mercedes':       '--f1-mercedes',    'mercedes':       '--f1-mercedes',
    'Ferrari':        '--f1-ferrari',     'ferrari':        '--f1-ferrari',
    'McLaren':        '--f1-mclaren',     'mclaren':        '--f1-mclaren',
    'Red Bull Racing':'--f1-red-bull',    'red-bull':       '--f1-red-bull', 'red-bull-racing':'--f1-red-bull', 'Red Bull':'--f1-red-bull',
    'Aston Martin':   '--f1-aston-martin','aston-martin':   '--f1-aston-martin',
    'Alpine':         '--f1-alpine',      'alpine':         '--f1-alpine',
    'Williams':       '--f1-williams',    'williams':       '--f1-williams',
    'Racing Bulls':   '--f1-racing-bulls','racing-bulls':   '--f1-racing-bulls',
    'Haas F1 Team':   '--f1-haas',        'Haas': '--f1-haas', 'haas': '--f1-haas',
    'Audi':           '--f1-audi',        'audi':           '--f1-audi',
    'Cadillac':       '--f1-cadillac',    'cadillac':       '--f1-cadillac',
};

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
        const racePositions = []; 
        
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
                return; 
            }

            const result = gp.results.race.find(r => r.driver === fullName);
            if (!result) { 
                racePoints.push(null); 
                racePositions.push(null);
                return; 
            }

            const pts   = result.pts || 0;
            const pos   = result.pos;
            const isDNF = result.time === 'DNF' || result.time === 'DNS' || pos === 'DNF' || pos === 'DNS';

            let posDisplay = pos;
            if (isDNF) posDisplay = 'DNF';
            else if (!isNaN(parseInt(pos))) posDisplay = `P${pos}`;

            racePoints.push(pts);
            racePositions.push(posDisplay);
            total2026 += pts;
            
            if (!isDNF) starts2026++;
            if (isDNF)  dnfs2026++;
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
        const teamColor  = TEAM_COLORS[currentTeam]   || 'rgba(225, 6, 0, 0.9)';
        const teamCssVar = TEAM_CSS_VARS[currentTeam] || '--primary-red';

        const driverContent = document.querySelector('.driver-content');
        if (driverContent) driverContent.style.setProperty('--team-color', `var(${teamCssVar})`);

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

        initRaceChart(raceLabels, racePoints, raceWins, teamColor, racePositions, raceFullNames);
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

function initRaceChart(labels, points, winIndexes, teamColor, positions, fullNames) {
    const ctx = document.getElementById('raceChart')?.getContext('2d');
    if (!ctx) return;

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
                const posStr = positions[i];

                if (winSet.has(i)) {
                    c.font = '12px serif';
                    c.textAlign = 'center';
                    c.fillStyle = '#ffffff';
                    c.fillText('🏆', bx, by - 6);
                }

                if (posStr !== null && posStr !== undefined) {
                    const fontSize = Math.min(Math.floor(bw * 0.8), 32); 
                    c.font = `${fontSize}px 'F1-Black', sans-serif`;
                    c.fillStyle = ptsValue > 0 ? '#ffffff' : '#888888';

                    const textWidth = c.measureText(posStr).width;
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
                    c.fillText(posStr, 0, 0);
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
                    borderWidth: 3,           
                    pointRadius: 3,           
                    pointBackgroundColor: teamColor,
                    pointHoverRadius: 6,      
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
                        label: ctx => ctx.dataset.label === 'Points'
                            ? `Race: ${ctx.parsed.y} points`
                            : `Total: ${ctx.parsed.y} points`
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

    const TEAM_LOGO_MAP = {
        'Mercedes': 'mercedes-logo',    'mercedes': 'mercedes-logo',
        'Ferrari': 'ferrari-logo',      'ferrari': 'ferrari-logo',
        'McLaren': 'mclaren-logo',      'mclaren': 'mclaren-logo',
        'Red Bull Racing': 'redbull-logo', 'Red Bull': 'redbull-logo', 'red-bull': 'redbull-logo', 'red-bull-racing': 'redbull-logo',
        'Aston Martin': 'astonmartin-logo', 'aston-martin': 'astonmartin-logo',
        'Alpine': 'alpine-logo',        'alpine': 'alpine-logo',
        'Williams': 'williams-logo',    'williams': 'williams-logo',
        'Racing Bulls': 'racingbulls-logo', 'racing-bulls': 'racingbulls-logo',
        'Haas F1 Team': 'haas-logo',    'Haas': 'haas-logo',    'haas': 'haas-logo',
        'Audi': 'audi-logo',            'audi': 'audi-logo',
        'Cadillac': 'cadillac-logo',    'cadillac': 'cadillac-logo',
    };

    // ── ACÁ ESTÁ LA MAGIA QUE EVITA DUPLICADOS A FUTURO ──
    // Filtramos explícitamente el CURRENT_SEASON_YEAR del array del JSON (history)
    const historicalSeasons = history
        .filter(s => s.year !== CURRENT_SEASON_YEAR) 
        .sort((a, b) => a.year - b.year);

    const allSeasons = [
        ...historicalSeasons.map(s => ({
            year:     String(s.year),
            points:   s.points  || 0,
            teamId:   s.teamId  || '',
            isWDC:    s.position === 1,
            position: s.position
        })),
        {
            year:     String(CURRENT_SEASON_YEAR),
            points:   points2026,
            teamId:   currentTeam,
            isWDC:    false, 
            position: currentChampPos 
        }
    ];

    const seasons = allSeasons.map(s => s.year);
    const points  = allSeasons.map(s => s.points);
    const colors  = allSeasons.map(s => TEAM_COLORS[s.teamId] || 'rgba(136, 136, 136, 0.9)');

    const logoCache = {};
    await Promise.all(allSeasons.map(s => {
        const name = TEAM_LOGO_MAP[s.teamId];
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

                const bw  = bar.width;
                const bx  = bar.x;
                const by  = bar.y;

                c.save();

                const logoSize = Math.min(Math.floor(bw * 0.8), 32); 

                if (season.points > 0) {
                    const fontSize = Math.min(Math.floor(bw * 0.8), 32); 
                    c.font = `${fontSize}px 'F1-Black', sans-serif`;

                    const textStr = String(season.points);
                    const textWidth = c.measureText(textStr).width;
                    
                    let textY = by + 10;
                    const bottomLimit = zeroY - logoSize - 10;

                    if (textY + textWidth > bottomLimit) {
                        textY = bottomLimit - textWidth;
                    }

                    c.translate(bx, textY);
                    c.rotate(-Math.PI / 2);
                    c.textAlign = 'right';
                    c.textBaseline = 'middle';

                    if (season.isWDC) {
                        // gradient in rotated coordinate space: text goes from 0 to -textWidth on x axis
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

                const logoName = TEAM_LOGO_MAP[season.teamId];
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
                hoverBackgroundColor: colors.map(color => color.replace('0.9)', '1)')),
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
                        title: (context) => {
                            return `${context[0].label} Season`;
                        },
                        label: (context) => {
                            const seasonData = allSeasons[context.dataIndex];
                            
                            const posText = seasonData.position === 1 
                                ? '🏆 World Champion' 
                                : `Position: P${seasonData.position || '-'}`;
                            
                            return [
                                posText,
                                `Points: ${context.parsed.y}`
                            ];
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
                            const label = seasons[index];
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