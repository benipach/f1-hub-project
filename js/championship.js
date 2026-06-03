// ── TEAM COLORS (Se llenan dinámicamente leyendo el CSS) ─────────
const TEAM_COLORS = {};

// ── TEAM ID → LOGO FILENAME ──────────────────────────────────────────────
const TEAM_LOGO_MAP = {
    'Mercedes':        'mercedes-logo',
    'Ferrari':         'ferrari-logo',
    'McLaren':         'mclaren-logo',
    'Red Bull':        'redbull-logo',
    'Aston Martin':    'astonmartin-logo',
    'Alpine':          'alpine-logo',
    'Williams':        'williams-logo',
    'Racing Bulls':    'racingbulls-logo',
    'Haas':            'haas-logo',
    'Audi':            'audi-logo',
    'Cadillac':        'cadillac-logo',
};



// ── HELPERS ───────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
    // Si viene en formato RGB (como en tu CSS), lo transformamos a RGBA
    if (hex.startsWith('rgb')) {
        return hex.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function buildCumulative(points) {
    let sum = 0;
    return points.map(p => {
        if (p === null) return null; // Si no hay resultado, la línea se corta
        sum += p;
        return sum;
    });
}

// ── TAB SWITCHING ────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

// ── CLOSE DROPDOWNS ON OUTSIDE CLICK ─────────────────────────────────────
document.addEventListener('click', e => {
    ['driver', 'constructor'].forEach(type => {
        const btn = document.getElementById(`${type}-filter-btn`);
        const dd  = document.getElementById(`${type}-filter-dropdown`);
        if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) {
            dd.classList.remove('open');
        }
    });
});

['driver', 'constructor'].forEach(type => {
    document.getElementById(`${type}-filter-btn`).addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById(`${type}-filter-dropdown`).classList.toggle('open');
    });
});

// ── FILTERED CHART BUILDER ───────────────────────────────────────────────
function makeFilteredChart(canvasId, filterItemsId, selectAllId, datasets, labels) {
    const visible = new Set(datasets.map(d => d.id));
    const chartDatasets = () => datasets
        .filter(d => visible.has(d.id))
        .map(d => ({
            label: d.label,
            data: d.data,
            borderColor: d.color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 2,
            pointBackgroundColor: d.color,
            pointHoverRadius: 5,
            tension: 0,
            spanGaps: false,
        }));

    const ctx = document.getElementById(canvasId).getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: chartDatasets() },
        options: {
            responsive: true,
            interaction: { mode: 'nearest', intersect: false }, 
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
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y ?? '—'} pts`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    function redraw() {
        chart.data.datasets = chartDatasets();
        chart.update();
    }

    const container = document.getElementById(filterItemsId);
    datasets.forEach(d => {
        const item = document.createElement('div');
        item.className = 'filter-item';
        item.innerHTML = `
            <div class="filter-checkbox checked" id="chk-${canvasId}-${d.id}" style="background:${d.color};border-color:${d.color}"></div>
            <span class="filter-label">${d.label}</span>
        `;
        item.addEventListener('click', () => {
            const chk = document.getElementById(`chk-${canvasId}-${d.id}`);
            if (visible.has(d.id)) {
                visible.delete(d.id);
                chk.style.background = 'transparent';
                chk.style.borderColor = 'rgba(255,255,255,0.2)';
            } else {
                visible.add(d.id);
                chk.style.background = d.color;
                chk.style.borderColor = d.color;
            }
            redraw();
        });
        container.appendChild(item);
    });

    document.getElementById(selectAllId).addEventListener('click', () => {
        const allVisible = datasets.every(d => visible.has(d.id));
        datasets.forEach(d => {
            const chk = document.getElementById(`chk-${canvasId}-${d.id}`);
            if (allVisible) {
                visible.delete(d.id);
                chk.style.background = 'transparent';
                chk.style.borderColor = 'rgba(255,255,255,0.2)';
            } else {
                visible.add(d.id);
                chk.style.background = d.color;
                chk.style.borderColor = d.color;
            }
        });
        document.getElementById(selectAllId).textContent = allVisible ? 'Select all' : 'Deselect all';
        redraw();
    });
}

// ── RENDER TABLES ────────────────────────────────────────────────────────
function renderDriversTable(drivers, driverNats = {}) {
    const sorted = [...drivers].sort((a, b) => b.points - a.points);
    const leader = sorted[0].points;
    const wrap = document.getElementById('drivers-table-wrap');

    const rows = sorted.map((d, i) => {
        const pos      = i + 1;
        const gap      = pos === 1 ? '—' : `−${leader - d.points}`;
        const code     = d.driver.split(' ').pop().slice(0, 3).toUpperCase();
        const logoFile = TEAM_LOGO_MAP[d.team];
        const logoHtml = logoFile
            ? `<img class="st-team-logo" src="img/teams/${logoFile}.png" alt="${d.team}">`
            : `<span class="st-team-logo-placeholder"></span>`;
        const nat = driverNats[d.driver] || '—';

        return `
            <tr>
                <td class="st-pos">${pos}</td>
                <td>
                    <div class="st-driver">
                        ${logoHtml}
                        <span class="driver-fullname">${d.driver}</span>
                        <span class="driver-code">${code}</span>
                    </div>
                </td>
                <td class="st-nat">${nat}</td>
                <td class="st-pts">${d.points}</td>
                <td class="st-gap">${gap}</td>
            </tr>`;
    }).join('');

    wrap.innerHTML = `
        <table class="standings-table">
            <thead>
                <tr>
                    <th>Pos</th>
                    <th>Driver</th>
                    <th>Nationality</th>
                    <th style="text-align:center">Points</th>
                    <th>Gap</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;

    if (typeof twemoji !== 'undefined') {
        twemoji.parse(wrap, { folder: 'svg', ext: '.svg' });
    }
}

function renderConstructorsTable(constructors) {
    const sorted = [...constructors].sort((a, b) => b.points - a.points);
    const leader = sorted[0].points;
    const wrap = document.getElementById('constructors-table-wrap');

    const rows = sorted.map((c, i) => {
        const pos      = i + 1;
        const gap      = pos === 1 ? '—' : `−${leader - c.points}`;
        const logoFile = TEAM_LOGO_MAP[c.team];
        const logoHtml = logoFile
            ? `<img class="st-team-logo" src="img/teams/${logoFile}.png" alt="${c.team}">`
            : `<span class="st-team-logo-placeholder"></span>`;
        const shortName = c.team.split(' ').slice(0, 2).join(' ');

        return `
            <tr>
                <td class="st-pos">${pos}</td>
                <td>
                    <div class="st-driver">
                        ${logoHtml}
                        <span class="constructor-fullname">${c.team}</span>
                        <span class="constructor-short">${shortName}</span>
                    </div>
                </td>
                <td class="st-pts">${c.points}</td>
                <td class="st-gap">${gap}</td>
            </tr>`;
    }).join('');

    wrap.innerHTML = `
        <table class="standings-table">
            <thead>
                <tr>
                    <th>Pos</th>
                    <th>Constructor</th>
                    <th style="text-align:center">Pts</th>
                    <th>Gap</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// ── MAIN LOADER ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await document.fonts.ready;

    const rootStyles = getComputedStyle(document.documentElement);
    const dimColor = rootStyles.getPropertyValue('--text-dim').trim() || '#ffffff';
    const softGridColor = 'rgba(255, 255, 255, 0.1)';

    // ── OBTENER COLORES DINÁMICAMENTE DESDE EL CSS ──
    TEAM_COLORS['Mercedes']        = rootStyles.getPropertyValue('--f1-mercedes').trim() || '#27F4D2';
    TEAM_COLORS['Ferrari']         = rootStyles.getPropertyValue('--f1-ferrari').trim() || '#E8002D';
    TEAM_COLORS['McLaren']         = rootStyles.getPropertyValue('--f1-mclaren').trim() || '#FF8000';
    TEAM_COLORS['Red Bull'] = rootStyles.getPropertyValue('--f1-red-bull').trim() || '#3671C6';
    TEAM_COLORS['Aston Martin']    = rootStyles.getPropertyValue('--f1-aston-martin').trim() || '#229971';
    TEAM_COLORS['Alpine']          = rootStyles.getPropertyValue('--f1-alpine').trim() || '#FF87BC';
    TEAM_COLORS['Williams']        = rootStyles.getPropertyValue('--f1-williams').trim() || '#64C4FF';
    TEAM_COLORS['Racing Bulls']    = rootStyles.getPropertyValue('--f1-racing-bulls').trim() || '#6692FF';
    TEAM_COLORS['Haas F1 Team']    = rootStyles.getPropertyValue('--f1-haas').trim() || '#B6BABD';
    TEAM_COLORS['Audi']            = rootStyles.getPropertyValue('--f1-audi').trim() || '#ffffff';
    TEAM_COLORS['Cadillac']        = rootStyles.getPropertyValue('--f1-cadillac').trim() || '#C5003E';

    Chart.defaults.font.family = "'F1-Regular', sans-serif";
    Chart.defaults.color = dimColor;
    Chart.defaults.borderColor = softGridColor;

    try {
        const [res, driversRes] = await Promise.all([
            fetch('./data/season2026.json'),
            fetch('./data/drivers.json'),
        ]);
        const season = await res.json();
        const driversData = await driversRes.json();

        // Lookup: "Nombre Apellido" → teamId del año 2026
        const driverTeamLookup = {};
        const driverNatLookup  = {};
        driversData.drivers.forEach(d => {
            const fullName = `${d.firstName} ${d.lastName}`;
            const entry2026 = d.history.find(h => h.year === 2026);
            if (entry2026) driverTeamLookup[fullName] = entry2026.teamId;
            if (d.nationality) driverNatLookup[fullName] = d.nationality;
        });

        // 1. OBTENER CARRERAS Y FILTRAR LAS CANCELADAS
        const allRaces = Object.values(season)
            .filter(gp => {
                const name = gp.name.toLowerCase();
                return !name.includes('bahrain') && !name.includes('saudi');
            })
            .sort((a, b) => a.round - b.round);

        // Labels para las carreras restantes
        const raceLabels = allRaces.map(gp =>
            gp.name.replace(' Grand Prix', '').replace('Grand Prix', '').trim().substring(0, 3).toUpperCase()
        );

        // ── Helper: extrae el array de resultados de carrera independientemente
        //    de si gp.results es un objeto { qualifying, race } o un array vacío ──
        const getRaceResults = gp => {
            const r = gp.results;
            if (!r) return [];
            if (Array.isArray(r)) return r;          // array vacío []
            if (Array.isArray(r.race)) return r.race; // objeto { qualifying, race }
            return [];
        };

        // ── Lógica de Pilotos ──
        const driverMap = {};
        allRaces.forEach(gp => {
            getRaceResults(gp).forEach(r => {
                if (!driverMap[r.driver]) {
                    const team = r.team || driverTeamLookup[r.driver] || 'Unknown';
                    driverMap[r.driver] = { driver: r.driver, team, points: 0, racePoints: [] };
                }
            });
        });

        allRaces.forEach(gp => {
            const raceResults = getRaceResults(gp);
            Object.values(driverMap).forEach(d => {
                if (raceResults.length === 0) {
                    d.racePoints.push(null);
                } else {
                    const result = raceResults.find(r => r.driver === d.driver);
                    const pts = result ? (result.pts ?? 0) : 0;
                    d.racePoints.push(pts);
                    d.points += pts; 
                }
            });
        });

        renderDriversTable(Object.values(driverMap), driverNatLookup);

        const driverDatasets = Object.values(driverMap)
            .sort((a, b) => b.points - a.points)
            .map(d => ({
                id: d.driver,
                label: d.driver.split(' ').slice(1).join(' ').toUpperCase() || d.driver.toUpperCase(),
                color: TEAM_COLORS[d.team] || '#ffffff',
                data: buildCumulative(d.racePoints),
            }));

        makeFilteredChart('driverChart', 'driver-filter-items', 'driver-select-all', driverDatasets, raceLabels);

        // ── Lógica de Constructores ──
        // Inicializar equipos a partir del driverTeamLookup (fuente de verdad)
        const constructorMap = {};
        Object.values(driverTeamLookup).forEach(team => {
            if (!constructorMap[team]) {
                constructorMap[team] = { team, points: 0, racePoints: [] };
            }
        });

        allRaces.forEach(gp => {
            const raceResults = getRaceResults(gp);
            Object.values(constructorMap).forEach(c => {
                if (raceResults.length === 0) {
                    c.racePoints.push(null);
                } else {
                    const teamPoints = raceResults
                        .filter(r => (r.team || driverTeamLookup[r.driver]) === c.team)
                        .reduce((sum, r) => sum + (r.pts ?? 0), 0);
                    c.racePoints.push(teamPoints);
                    c.points += teamPoints;
                }
            });
        });

        renderConstructorsTable(Object.values(constructorMap));

        const constructorDatasets = Object.values(constructorMap)
            .sort((a, b) => b.points - a.points)
            .map(c => ({
                id: c.team,
                label: c.team,
                color: TEAM_COLORS[c.team] || '#ffffff',
                data: buildCumulative(c.racePoints),
            }));

        makeFilteredChart('constructorChart', 'constructor-filter-items', 'constructor-select-all', constructorDatasets, raceLabels);

    } catch (err) {
        console.error('Error loading championship data:', err);
    }
});