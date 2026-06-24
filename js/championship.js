// TEAMS, teamColor() vienen de teams.js, que debe cargarse antes que este archivo.

// ── TEAM ID → LOGO FILENAME ──────────────────────────────────────────────
const TEAM_LOGO_MAP = {
    'Mercedes':        'mercedes-logo',
    'Ferrari':         'ferrari-logo',
    'McLaren':         'mclaren-logo',
    'Red Bull':        'redbull-logo',
    'Red Bull Racing': 'redbull-logo',
    'Aston Martin':    'astonmartin-logo',
    'Alpine':          'alpine-logo',
    'Williams':        'williams-logo',
    'Racing Bulls':    'racingbulls-logo',
    'Haas':            'haas-logo',
    'Haas F1 Team':    'haas-logo',
    'Audi':            'audi-logo',
    'Cadillac':        'cadillac-logo',
};



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
function makeFilteredChart(containerId, filterItemsId, selectAllId, datasets, labels) {
    const container = document.getElementById(containerId);
    const filterContainer = document.getElementById(filterItemsId);
    const selectAllBtn = document.getElementById(selectAllId);

    const visible = new Set(datasets.map(d => d.id));

    const width = 1000;
    const height = 420;

    const padding = {
        top: 28,
        right: 88,
        bottom: 52,
        left: 52
    };

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function getAllValues() {
        return datasets
            .flatMap(d => d.data)
            .filter(v => typeof v === 'number' && !Number.isNaN(v));
    }

    function niceMax(value) {
        if (!value || value <= 0) return 10;

        const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
        const normalized = value / magnitude;

        let niceNormalized;

        if (normalized <= 1) niceNormalized = 1;
        else if (normalized <= 2) niceNormalized = 2;
        else if (normalized <= 5) niceNormalized = 5;
        else niceNormalized = 10;

        return niceNormalized * magnitude;
    }

    const allValues = getAllValues();
    const maxY = niceMax(Math.max(...allValues, 10));

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    function xForIndex(index) {
        if (labels.length <= 1) return padding.left;
        return padding.left + (index / (labels.length - 1)) * plotWidth;
    }

    function yForValue(value) {
        return padding.top + plotHeight - (value / maxY) * plotHeight;
    }

    function buildPath(data) {
        let path = '';
        let drawing = false;

        data.forEach((value, index) => {
            if (value === null || value === undefined || Number.isNaN(value)) {
                drawing = false;
                return;
            }

            const x = xForIndex(index);
            const y = yForValue(value);

            if (!drawing) {
                path += `M ${x} ${y} `;
                drawing = true;
            } else {
                path += `L ${x} ${y} `;
            }
        });

        return path.trim();
    }

    function getLastPoint(data) {
        for (let i = data.length - 1; i >= 0; i--) {
            const value = data[i];

            if (typeof value === 'number' && !Number.isNaN(value)) {
                return {
                    index: i,
                    value,
                    x: xForIndex(i),
                    y: yForValue(value)
                };
            }
        }

        return null;
    }

    function makeGrid() {
        const tickCount = 5;
        const ticks = [];

        for (let i = 0; i <= tickCount; i++) {
            const value = Math.round((maxY / tickCount) * i);
            const y = yForValue(value);

            ticks.push(`
                <line
                    class="chart-grid-line"
                    x1="${padding.left}"
                    y1="${y}"
                    x2="${width - padding.right}"
                    y2="${y}"
                />
                <text
                    class="chart-y-label"
                    x="${padding.left - 12}"
                    y="${y + 4}"
                    text-anchor="end"
                >${value}</text>
            `);
        }

        return ticks.join('');
    }

    function makeXAxisLabels() {
        const maxLabelsOnMobile = 8;
        const isMobile = window.matchMedia('(max-width: 500px)').matches;
        const step = isMobile
            ? Math.ceil(labels.length / maxLabelsOnMobile)
            : 1;

        return labels.map((label, index) => {
            if (isMobile && index % step !== 0 && index !== labels.length - 1) {
                return '';
            }

            return `
                <text
                    class="chart-x-label"
                    x="${xForIndex(index)}"
                    y="${height - 18}"
                    text-anchor="middle"
                >${escapeHtml(label)}</text>
            `;
        }).join('');
    }

    function render() {
        const activeDatasets = datasets.filter(d => visible.has(d.id));

        const lines = activeDatasets.map(d => {
            const path = buildPath(d.data);

            if (!path) return '';

            return `
                <path
                    class="chart-line"
                    d="${path}"
                    style="stroke:${d.color}; color:${d.color};"
                    data-series="${escapeHtml(d.id)}"
                />
            `;
        }).join('');

        const points = activeDatasets.map(d => {
            return d.data.map((value, index) => {
                if (value === null || value === undefined || Number.isNaN(value)) {
                    return '';
                }

                return `
                    <circle
                        class="chart-point"
                        cx="${xForIndex(index)}"
                        cy="${yForValue(value)}"
                        r="3.25"
                        style="fill:${d.color}; color:${d.color};"
                        data-series="${escapeHtml(d.id)}"
                        data-label="${escapeHtml(d.label)}"
                        data-race="${escapeHtml(labels[index])}"
                        data-value="${value}"
                    />
                `;
            }).join('');
        }).join('');

        const endLabels = activeDatasets.length <= 12
            ? activeDatasets.map(d => {
                const lastPoint = getLastPoint(d.data);

                if (!lastPoint) return '';

                return `
                    <text
                        class="chart-end-label"
                        x="${lastPoint.x + 8}"
                        y="${lastPoint.y + 4}"
                        style="fill:${d.color};"
                        data-series="${escapeHtml(d.id)}"
                    >${escapeHtml(d.label)}</text>
                `;
            }).join('')
            : '';

        container.innerHTML = `
            <svg
                class="f1-chart-svg"
                viewBox="0 0 ${width} ${height}"
                role="img"
                aria-label="Cumulative championship points chart"
            >
                <rect class="chart-bg" x="0" y="0" width="${width}" height="${height}" />

                <g class="chart-grid">
                    ${makeGrid()}
                    <line
                        class="chart-axis-line"
                        x1="${padding.left}"
                        y1="${padding.top + plotHeight}"
                        x2="${width - padding.right}"
                        y2="${padding.top + plotHeight}"
                    />
                    <line
                        class="chart-axis-line"
                        x1="${padding.left}"
                        y1="${padding.top}"
                        x2="${padding.left}"
                        y2="${padding.top + plotHeight}"
                    />
                </g>

                <g class="chart-lines">
                    ${lines}
                </g>

                <g class="chart-points">
                    ${points}
                </g>

                <g class="chart-end-labels">
                    ${endLabels}
                </g>

                <g class="chart-x-labels">
                    ${makeXAxisLabels()}
                </g>
            </svg>

            <div class="f1-chart-tooltip" hidden></div>
        `;

        attachChartInteractions();
    }

    function updateFilterUI() {
        filterContainer.querySelectorAll('.filter-item').forEach(item => {
            const id = item.dataset.id;
            const checkbox = item.querySelector('.filter-checkbox');
            const dataset = datasets.find(d => d.id === id);

            if (!dataset || !checkbox) return;

            if (visible.has(id)) {
                checkbox.textContent = '✓';
                checkbox.style.background = dataset.color;
                checkbox.style.borderColor = dataset.color;
            } else {
                checkbox.textContent = '';
                checkbox.style.background = 'transparent';
                checkbox.style.borderColor = 'rgba(255,255,255,0.2)';
            }
        });

        const allVisible = datasets.every(d => visible.has(d.id));
        selectAllBtn.textContent = allVisible ? 'Deselect all' : 'Select all';
    }

    function attachChartInteractions() {
        const svg = container.querySelector('.f1-chart-svg');
        const tooltip = container.querySelector('.f1-chart-tooltip');

        if (!svg || !tooltip) return;

        function activateSeries(seriesId) {
            svg.classList.add('is-hovering');

            svg.querySelectorAll(`[data-series="${CSS.escape(seriesId)}"]`).forEach(el => {
                if (el.classList.contains('chart-line')) {
                    el.classList.add('is-active-line');
                }

                if (el.classList.contains('chart-point')) {
                    el.classList.add('is-active-point');
                }

                if (el.classList.contains('chart-end-label')) {
                    el.classList.add('is-active-label');
                }
            });
        }

        function clearActiveSeries() {
            svg.classList.remove('is-hovering');

            svg.querySelectorAll('.is-active-line').forEach(el => {
                el.classList.remove('is-active-line');
            });

            svg.querySelectorAll('.is-active-point').forEach(el => {
                el.classList.remove('is-active-point');
            });

            svg.querySelectorAll('.is-active-label').forEach(el => {
                el.classList.remove('is-active-label');
            });

            tooltip.hidden = true;
        }

        svg.querySelectorAll('.chart-line, .chart-point').forEach(el => {
            el.addEventListener('mouseenter', () => {
                activateSeries(el.dataset.series);
            });

            el.addEventListener('mouseleave', clearActiveSeries);
        });

        svg.querySelectorAll('.chart-point').forEach(point => {
            point.addEventListener('mouseenter', () => {
                tooltip.hidden = false;
                tooltip.innerHTML = `
                    <strong>${escapeHtml(point.dataset.label)}</strong>
                    <span>${escapeHtml(point.dataset.race)}</span>
                    <span>${escapeHtml(point.dataset.value)} pts</span>
                `;
            });

            point.addEventListener('mousemove', e => {
                const rect = container.getBoundingClientRect();

                tooltip.style.left = `${e.clientX - rect.left}px`;
                tooltip.style.top = `${e.clientY - rect.top}px`;
            });

            point.addEventListener('mouseleave', () => {
                tooltip.hidden = true;
            });
        });
    }

    function buildFilters() {
        filterContainer.innerHTML = '';

        datasets.forEach(d => {
            const item = document.createElement('div');
            item.className = 'filter-item';
            item.dataset.id = d.id;

            item.innerHTML = `
                <div
                    class="filter-checkbox checked"
                    style="background:${d.color};border-color:${d.color}"
                >✓</div>
                <span class="filter-label">${escapeHtml(d.label)}</span>
            `;

            item.addEventListener('click', () => {
                if (visible.has(d.id)) {
                    visible.delete(d.id);
                } else {
                    visible.add(d.id);
                }

                updateFilterUI();
                render();
            });

            filterContainer.appendChild(item);
        });

        selectAllBtn.addEventListener('click', () => {
            const allVisible = datasets.every(d => visible.has(d.id));

            if (allVisible) {
                visible.clear();
            } else {
                datasets.forEach(d => visible.add(d.id));
            }

            updateFilterUI();
            render();
        });

        updateFilterUI();
    }

    buildFilters();
    render();

    window.addEventListener('resize', () => {
        render();
    });
}

// ── RENDER TABLES ────────────────────────────────────────────────────────
function renderDriversTable(drivers, driverNats = {}, driverNumbers = {}) {
    const sorted = [...drivers].sort((a, b) => b.points - a.points);
    const leader = sorted[0].points;
    const wrap = document.getElementById('drivers-table-wrap');

    const rows = sorted.map((d, i) => {
        const pos        = i + 1;
        const gap        = pos === 1 ? '—' : `−${leader - d.points}`;
        const code       = d.driver.split(' ').pop().slice(0, 3).toUpperCase();
        const logoFile   = TEAM_LOGO_MAP[d.team];
        const logoHtml   = logoFile
            ? `<img class="st-team-logo" src="img/teams/${logoFile}.png" alt="${d.team}">`
            : `<span class="st-team-logo-placeholder"></span>`;
        const num        = driverNumbers[d.driver] || '';
        const driverTeamColor = teamColor(d.team) || 'rgba(255,255,255,0.4)';
        const numHtml    = num
            ? `<span class="st-driver-num" style="color:${driverTeamColor}">#${num}</span>`
            : '';

        return `
            <tr>
                <td class="st-pos">${pos}</td>
                <td>
                    <div class="st-driver">
                        ${numHtml}
                        <span class="driver-fullname">${d.driver}</span>
                        <span class="driver-code">${code}</span>
                    </div>
                </td>
                <td>
                    <div class="st-team-cell">
                        ${logoHtml}
                        <span class="team-name">${d.team}</span>
                    </div>
                </td>
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
                    <th>Team</th>
                    <th style="text-align:center">Pts</th>
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
    try {
        const [res, driversRes] = await Promise.all([
            fetch('./data/season2026.json'),
            fetch('./data/drivers.json'),
        ]);
        const season = await res.json();
        const driversData = await driversRes.json();

        // Lookup: "Nombre Apellido" → teamId del año 2026
        const driverTeamLookup   = {};
        const driverNatLookup    = {};
        const driverNumberLookup = {};
        driversData.drivers.forEach(d => {
            const fullName  = `${d.firstName} ${d.lastName}`;
            const entry2026 = d.history.find(h => h.year === 2026);
            if (entry2026) driverTeamLookup[fullName] = entry2026.teamId;
            if (d.nationality) driverNatLookup[fullName] = d.nationality;
            if (d.number)      driverNumberLookup[fullName] = d.number;
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

        // ── Helpers: extraen resultados desde la nueva estructura por sesión ──
        // Nuevo JSON:
        // gp.sessions.race.results
        // gp.sessions.sprintRace.results
        const getSessionResults = (gp, sessionKey) => {
            const results = gp?.sessions?.[sessionKey]?.results;
            return Array.isArray(results) ? results : [];
        };

        const getRaceResults = gp => getSessionResults(gp, 'race');
        const getSprintResults = gp => getSessionResults(gp, 'sprintRace');

        const raceHasAnyResult = gp => {
            return getRaceResults(gp).length > 0 || getSprintResults(gp).length > 0;
        };

        const resultTeam = r => r.team || driverTeamLookup[r.driver] || 'Unknown';

        // ── Lógica de Pilotos ──
        const driverMap = {};

        // Inicializamos pilotos desde carrera y sprint. Esto permite que el campeonato
        // muestre puntos de Sprint aunque la carrera principal todavía no esté cargada.
        allRaces.forEach(gp => {
            [...getRaceResults(gp), ...getSprintResults(gp)].forEach(r => {
                if (!r?.driver) return;
                if (!driverMap[r.driver]) {
                    const team = resultTeam(r);
                    driverMap[r.driver] = { driver: r.driver, team, points: 0, racePoints: [] };
                }
            });
        });

        allRaces.forEach(gp => {
            const raceResults   = getRaceResults(gp);
            const sprintResults = getSprintResults(gp);
            const hasAnyResult  = raceHasAnyResult(gp);

            Object.values(driverMap).forEach(d => {
                if (!hasAnyResult) {
                    d.racePoints.push(null);
                    return;
                }

                const raceRes   = raceResults.find(r => r.driver === d.driver);
                const sprintRes = sprintResults.find(r => r.driver === d.driver);
                const racePts   = raceRes ? (raceRes.pts ?? 0) : 0;
                const sprintPts = sprintRes ? (sprintRes.pts ?? 0) : 0;
                const pts       = racePts + sprintPts;

                d.racePoints.push(pts);
                d.points += pts;

                // Si OpenF1/JSON trae team en resultados, lo usamos para mantenerlo actualizado.
                if (raceRes?.team || sprintRes?.team) {
                    d.team = raceRes?.team || sprintRes?.team || d.team;
                }
            });
        });

        renderDriversTable(Object.values(driverMap), driverNatLookup, driverNumberLookup);

        const driverDatasets = Object.values(driverMap)
            .sort((a, b) => b.points - a.points)
            .map(d => ({
                id: d.driver,
                label: d.driver.split(' ').slice(1).join(' ').toUpperCase() || d.driver.toUpperCase(),
                color: teamColor(d.team) || '#ffffff',
                data: buildCumulative(d.racePoints),
            }));

        makeFilteredChart('driverChart', 'driver-filter-items', 'driver-select-all', driverDatasets, raceLabels);

        // ── Lógica de Constructores ──
        // Inicializar equipos desde drivers.json y también desde resultados,
        // porque algunos resultados ya traen nombres OpenF1 como "Red Bull Racing".
        const constructorMap = {};
        const ensureConstructor = team => {
            if (!team) return;
            if (!constructorMap[team]) {
                constructorMap[team] = { team, points: 0, racePoints: [] };
            }
        };

        Object.values(driverTeamLookup).forEach(ensureConstructor);
        allRaces.forEach(gp => {
            [...getRaceResults(gp), ...getSprintResults(gp)].forEach(r => ensureConstructor(resultTeam(r)));
        });

        allRaces.forEach(gp => {
            const raceResults   = getRaceResults(gp);
            const sprintResults = getSprintResults(gp);
            const hasAnyResult  = raceHasAnyResult(gp);

            Object.values(constructorMap).forEach(c => {
                if (!hasAnyResult) {
                    c.racePoints.push(null);
                    return;
                }

                const teamRacePts = raceResults
                    .filter(r => resultTeam(r) === c.team)
                    .reduce((sum, r) => sum + (r.pts ?? 0), 0);

                const teamSprintPts = sprintResults
                    .filter(r => resultTeam(r) === c.team)
                    .reduce((sum, r) => sum + (r.pts ?? 0), 0);

                const pts = teamRacePts + teamSprintPts;
                c.racePoints.push(pts);
                c.points += pts;
            });
        });

        renderConstructorsTable(Object.values(constructorMap));

        const constructorDatasets = Object.values(constructorMap)
            .sort((a, b) => b.points - a.points)
            .map(c => ({
                id: c.team,
                label: c.team,
                color: teamColor(c.team) || '#ffffff',
                data: buildCumulative(c.racePoints),
            }));

        makeFilteredChart('constructorChart', 'constructor-filter-items', 'constructor-select-all', constructorDatasets, raceLabels);

    } catch (err) {
        console.error('Error loading championship data:', err);
    }
});