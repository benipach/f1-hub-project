// ── TEMPORADA ACTIVA — cambiá esto el año que viene ──────────────
const CURRENT_SEASON_FILE = '../data/season2026.json';
const CURRENT_SEASON_YEAR = 2026;

// ── COLORES POR EQUIPO ────────────────────────────────────────────
const TEAM_COLORS = {
    'Mercedes':       '#00d2be',
    'Ferrari':        '#ff1b2e',
    'McLaren':        '#ff8800',
    'Red Bull Racing':'#2723ad',
    'Aston Martin':   '#006f62',
    'Alpine':         '#0093cc',
    'Williams':       '#00a0dc',
    'Racing Bulls':   '#6692ff',
    'Haas F1 Team':   '#b6babd',
    'Audi':           '#f51941',
    'Cadillac':       '#ffd139',
};

// ── EQUIPO → CSS VAR ──────────────────────────────────────────────
const TEAM_CSS_VARS = {
    'Mercedes':       '--f1-mercedes',
    'Ferrari':        '--f1-ferrari',
    'McLaren':        '--f1-mclaren',
    'Red Bull Racing':'--f1-red-bull',
    'Aston Martin':   '--f1-aston-martin',
    'Alpine':         '--f1-alpine',
    'Williams':       '--f1-williams',
    'Racing Bulls':   '--f1-racing-bulls',
    'Haas F1 Team':   '--f1-haas',
    'Audi':           '--f1-audi',
    'Cadillac':       '--f1-cadillac',
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
        const history  = driverInfo.history || [];

        // ── STATS 2026 desde season2026.json ─────────────────────
        const races = Object.values(season)
            .filter(gp => {
                const name = gp.name.toLowerCase();
                return !name.includes('bahrain') && !name.includes('saudi');
            })
            .sort((a, b) => a.round - b.round);

        const raceLabels  = [];
        const racePoints  = [];
        const raceWins    = []; // índices donde ganó
        let total2026 = 0, wins2026 = 0, podiums2026 = 0;
        let dnfs2026 = 0, starts2026 = 0, currentTeam = '—';

        races.forEach((gp, i) => {
            raceLabels.push(
                gp.name.replace(' Grand Prix', '').replace('Grand Prix', '').trim().substring(0, 3).toUpperCase()
            );

            if (!gp.results?.length) { racePoints.push(null); return; }

            const result = gp.results.find(r => r.driver === fullName);
            if (!result) { racePoints.push(null); return; }

            const pts   = result.pts || 0;
            const pos   = parseInt(result.pos);
            const isDNF = result.time === 'DNF' || result.time === 'DNS';

            racePoints.push(pts);
            total2026   += pts;
            currentTeam  = result.team;
            if (!isDNF) starts2026++;
            if (isDNF)  dnfs2026++;
            if (pos === 1) { wins2026++; raceWins.push(i); }
            if (!isNaN(pos) && pos <= 3) podiums2026++;
        });

        // ── POSICIÓN EN EL CAMPEONATO 2026 ───────────────────────
        const driverPoints = {};
        Object.values(season).forEach(gp => {
            (gp.results || []).forEach(r => {
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
            totalWins        += s.wins        || 0;
            totalPodiums     += s.podiums     || 0;
            totalPoles       += s.poles       || 0;
            totalPoints      += s.points      || 0;
            totalStarts      += s.starts      || 0;
            totalFastestLaps += s.fastestLaps || 0;
            if (s.position === 1) worldTitles++;
        });

        // ── EDAD ──────────────────────────────────────────────────
        const dob   = new Date(driverInfo.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        if (today.getMonth() < dob.getMonth() ||
           (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;

        // ── COLOR DEL EQUIPO ──────────────────────────────────────
        const teamColor  = TEAM_COLORS[currentTeam]   || '#e10600';
        const teamCssVar = TEAM_CSS_VARS[currentTeam] || '--primary-red';

        const teamBadge = document.getElementById('hero-team-badge');
        if (teamBadge) {
            teamBadge.style.background = teamColor + '26';
            teamBadge.style.color      = teamColor;
            teamBadge.style.border     = `1px solid ${teamColor}66`;
        }

        const driverContent = document.querySelector('.driver-content');
        if (driverContent) driverContent.style.setProperty('--team-color', `var(${teamCssVar})`);

        // ── INYECCIÓN EN EL DOM ───────────────────────────────────
        document.getElementById('page-title').textContent             = `F1 Hub | ${fullName}`;
        document.getElementById('hero-img').src                      = `../img/drivers/${driverInfo.image.replace('.png', '-2.png')}`;
        document.getElementById('hero-number').textContent            = driverInfo.number;
        document.getElementById('driver-hero-first-name').textContent = driverInfo.firstName;
        document.getElementById('driver-hero-last-name').textContent  = driverInfo.lastName;
        document.getElementById('hero-team-name').textContent         = currentTeam;

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
        document.getElementById('stat-poles').textContent       = '—';
        document.getElementById('stat-fastest').textContent     = '—';
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

        // Estilos globales de Chart.js — igual que championship.js
        const dimColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-dim').trim() || '#888888';
        Chart.defaults.font.family = "'F1-Regular', sans-serif";
        Chart.defaults.color       = dimColor;
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

        initRaceChart(raceLabels, racePoints, raceWins, teamColor);
        initCareerChart(history, total2026, teamColor);

    } catch (err) {
        console.error('Error cargando datos del piloto:', err);
    }
});

// ── GRÁFICO 1: Puntos por carrera (temporada activa) ─────────────
function initRaceChart(labels, points, winIndexes, teamColor) {
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

    const trophyPlugin = {
        id: 'raceTrophyPlugin',
        afterDatasetDraw(chart) {
            const { ctx: c, data } = chart;
            // Solo aplica al dataset de barras (index 0)
            const meta = chart.getDatasetMeta(0);
            c.save();
            c.font = '12px serif';
            c.textAlign = 'center';
            data.labels.forEach((_, i) => {
                if (!winSet.has(i)) return;
                const bar = meta.data[i];
                if (!bar) return;
                c.fillText('🏆', bar.x, bar.y - 6);
            });
            c.restore();
        }
    };

    new Chart(ctx, {
        type: 'bar',
        plugins: [trophyPlugin],
        data: {
            labels,
            datasets: [
                {
                    label: 'Points',
                    data: completedPoints,
                    backgroundColor: isCompleted.map(c => c ? teamColor + '99' : 'transparent'),
                    borderColor:     isCompleted.map(c => c ? teamColor : 'transparent'),
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: teamColor,
                    order: 2
                },
                {
                    label: 'Cumulative',
                    data: cumulativePoints,
                    type: 'line',
                    borderColor: teamColor,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: teamColor,
                    pointHoverRadius: 7,
                    tension: 0.3,
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
                    callbacks: {
                        label: ctx => ctx.dataset.label === 'Points'
                            ? ` ${ctx.parsed.y} pts this race`
                            : ` ${ctx.parsed.y} pts total`
                    }
                }
            },
            scales: {
                x: { ticks: { maxRotation: 45 } },
                y: { beginAtZero: true }
            }
        }
    });
}

// ── GRÁFICO 2: Puntos por temporada (carrera completa) ────────────
function initCareerChart(history, points2026, teamColor) {
    const ctx = document.getElementById('pointsChart')?.getContext('2d');
    if (!ctx) return;

    // Temporadas históricas de drivers.json
    const historicalSeasons = [...history].sort((a, b) => a.year - b.year);

    // Añadir 2026 al final
    const seasons = [
        ...historicalSeasons.map(s => String(s.year)),
        String(CURRENT_SEASON_YEAR)
    ];
    const points = [
        ...historicalSeasons.map(s => s.points || 0),
        points2026
    ];

    // Años WDC — solo de historial (position === 1); 2026 aún no se sabe
    const wdcYears = new Set(
        historicalSeasons
            .filter(s => s.position === 1)
            .map(s => String(s.year))
    );

    const trophyPlugin = {
        id: 'careerTrophyPlugin',
        afterDatasetDraw(chart) {
            const { ctx: c, data } = chart;
            const meta = chart.getDatasetMeta(0);
            c.save();
            c.font = '12px serif';
            c.textAlign = 'center';
            data.labels.forEach((label, i) => {
                if (!wdcYears.has(label)) return;
                const bar = meta.data[i];
                if (!bar) return;
                c.fillText('🏆', bar.x, bar.y - 6);
            });
            c.restore();
        }
    };

    new Chart(ctx, {
        type: 'bar',
        plugins: [trophyPlugin],
        data: {
            labels: seasons,
            datasets: [{
                data: points,
                backgroundColor: seasons.map(y =>
                    wdcYears.has(y) ? teamColor : teamColor + '59'),
                borderColor: teamColor,
                borderWidth: 1,
                borderRadius: 4,
                hoverBackgroundColor: teamColor
            }]
        },
        options: {
            responsive: true,
            layout: { padding: { top: 24 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgb(22,22,34)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    titleColor: '#ffffff',
                    bodyColor: 'rgba(255,255,255,0.5)',
                    padding: 12,
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y} pts`,
                        afterLabel: ctx => wdcYears.has(seasons[ctx.dataIndex])
                            ? ' 🏆 World Champion' : ''
                    }
                }
            },
            scales: {
                x: { ticks: { maxRotation: 45 } },
                y: { beginAtZero: true }
            }
        }
    });
}