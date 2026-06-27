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

// ── CHART LAYOUT CONFIG ──────────────────────────────────────────────────
// Centraliza las dimensiones del SVG para que un cambio de tamaño no
// requiera tocar números sueltos en 5 funciones distintas.
const CHART_LAYOUT = {
    width: 1000,
    height: 430,
    padding: { top: 38, right: 88, bottom: 68, left: 58 },
    gridStep: 25,           // separación entre líneas de grilla / ticks del eje Y
    seasonRailOffsetY: 42,  // distancia del rail de temporada respecto al borde inferior
    flagShellOffsetY: 52,   // distancia de las banderas respecto al borde inferior
    maxLabelsOnMobile: 8,
    flagSize: { mobile: 15, desktop: 18 },
    flagShellPadding: { width: 9, height: 7 },
};

// ── FILTERED CHART BUILDER ───────────────────────────────────────────────
function makeFilteredChart(containerId, filterItemsId, selectAllId, datasets, labels) {
    const container = document.getElementById(containerId);
    const filterContainer = document.getElementById(filterItemsId);
    const selectAllBtn = document.getElementById(selectAllId);

    const visible = new Set(datasets.map(d => d.id));
    let maxY = 50;

    const raceItems = labels.map(label => {
        if (typeof label === 'string') {
            return {
                name: label,
                countryCode: '',
                flagCode: '1f3c1',
                flagUrl: `${TWEMOJI_FLAG_BASE_URL}1f3c1.svg`,
                gpId: '',
            };
        }

        const flagCode = label?.flagCode || '1f3c1';

        return {
            name: label?.name || 'Grand Prix',
            countryCode: label?.countryCode || '',
            flagCode,
            flagUrl: label?.flagUrl || `${TWEMOJI_FLAG_BASE_URL}${flagCode}.svg`,
            gpId: label?.gpId || '',
        };
    });

    const { width, height, padding } = CHART_LAYOUT;

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function getValuesFrom(sourceDatasets = datasets) {
        return sourceDatasets
            .flatMap(d => d.data)
            .filter(v => typeof v === 'number' && !Number.isNaN(v));
    }

    function scaleMaxFrom(sourceDatasets) {
        const step = CHART_LAYOUT.gridStep;
        const values = getValuesFrom(sourceDatasets);
        const highest = Math.max(...values, 0);

        if (highest <= 0) return step;

        // Always go to the next 50-point step above the current maximum.
        // Examples: 156 -> 200, 200 -> 250, 278 -> 300.
        return (Math.floor(highest / step) + 1) * step;
    }

    function xForIndex(index) {
        if (raceItems.length <= 1) return padding.left;
        return padding.left + (index / (raceItems.length - 1)) * plotWidth;
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

    function deconflictLabelPositions(points, minGap = 12) {
        // points: [{ y, ...resto }], ordenado por y ascendente.
        // Empuja hacia abajo cualquier label que quede a menos de minGap del anterior.
        // Si el grupo resulta demasiado largo, intenta recuperar el espacio hacia arriba
        // sin mover ninguna etiqueta por encima de su y original.
        const sorted = [...points]
            .map(point => ({ ...point, originalY: point.y }))
            .sort((a, b) => a.y - b.y);
        const lowerBound = padding.top + plotHeight;

        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            if (curr.y - prev.y < minGap) {
                curr.y = prev.y + minGap;
            }
        }

        let overflow = sorted.length ? sorted[sorted.length - 1].y - lowerBound : 0;
        if (overflow > 0) {
            for (let i = sorted.length - 1; i >= 0 && overflow > 0; i--) {
                const curr = sorted[i];
                const allowedUp = curr.y - curr.originalY;
                const shift = Math.min(overflow, allowedUp);
                curr.y -= shift;
                overflow -= shift;
            }

            if (overflow > 0) {
                // Si todavía hay overflow, comprime los gaps existentes hasta el mínimo.
                for (let i = sorted.length - 1; i > 0 && overflow > 0; i--) {
                    const prev = sorted[i - 1];
                    const curr = sorted[i];
                    const currentGap = curr.y - prev.y;
                    const available = currentGap - minGap;
                    if (available > 0) {
                        const reduce = Math.min(available, overflow);
                        curr.y -= reduce;
                        overflow -= reduce;
                    }
                }
            }
        }

        return sorted;
    }

    function getLastPoint(data) {
        for (let i = data.length - 1; i >= 0; i--) {
            const value = data[i];
            if (typeof value === 'number' && !Number.isNaN(value)) {
                return { index: i, value, x: xForIndex(i), y: yForValue(value) };
            }
        }
        return null;
    }

    function getSeriesSummary(seriesId) {
        const dataset = datasets.find(d => d.id === seriesId);
        if (!dataset) return null;

        const lastPoint = getLastPoint(dataset.data);
        const points = lastPoint?.value ?? 0;
        const ranked = datasets
            .map(d => ({ id: d.id, value: getLastPoint(d.data)?.value ?? 0 }))
            .sort((a, b) => b.value - a.value);
        const position = ranked.findIndex(d => d.id === seriesId) + 1;
        const leader = ranked[0]?.value ?? points;
        const gap = position === 1 ? 'LEADER' : `-${leader - points}`;

        return { dataset, points, position, gap };
    }

    function raceCompleted(index) {
        return datasets.some(d => typeof d.data[index] === 'number' && !Number.isNaN(d.data[index]));
    }

    function makeGrid() {
        const step = CHART_LAYOUT.gridStep;
        const ticks = [];

        // Values are generated bottom-to-top: 0, 50, 100, ... maxY.
        for (let value = 0; value <= maxY; value += step) {
            const y = yForValue(value);
            ticks.push(`
                <line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />
                <text class="chart-y-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${value}</text>
            `);
        }

        return ticks.join('');
    }

    function makeRaceMarkers() {
        return raceItems.map((race, index) => {
            const completed = raceCompleted(index);
            const x = xForIndex(index);
            return `<line class="chart-race-marker ${completed ? 'is-completed' : 'is-future'}" x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + plotHeight}" />`;
        }).join('');
    }

    function makeSeasonRail() {
        const railY = height - CHART_LAYOUT.seasonRailOffsetY;
        const completedIndexes = raceItems
            .map((_, index) => raceCompleted(index) ? index : -1)
            .filter(index => index >= 0);
        const lastCompletedIndex = completedIndexes.length ? Math.max(...completedIndexes) : 0;
        const completedX = xForIndex(lastCompletedIndex);

        return `
            <line class="chart-season-rail" x1="${padding.left}" y1="${railY}" x2="${width - padding.right}" y2="${railY}" />
            <line class="chart-season-rail-red" x1="${padding.left}" y1="${railY}" x2="${completedX}" y2="${railY}" />
        `;
    }

    function makeXAxisLabels() {
        const { maxLabelsOnMobile, flagSize, flagShellPadding, flagShellOffsetY } = CHART_LAYOUT;
        const isMobile = window.matchMedia('(max-width: 500px)').matches;
        const step = isMobile ? Math.ceil(raceItems.length / maxLabelsOnMobile) : 1;
        const currentFlagSize = isMobile ? flagSize.mobile : flagSize.desktop;
        const shellW = currentFlagSize + flagShellPadding.width;
        const shellH = currentFlagSize + flagShellPadding.height;
        const shellY = height - flagShellOffsetY;

        return raceItems.map((race, index) => {
            if (isMobile && index % step !== 0 && index !== raceItems.length - 1) return '';
            const x = xForIndex(index);
            const isFuture = !raceCompleted(index);
            const href = `./races/race.html?gp=${escapeHtml(race.gpId)}`;

            return `
                <a class="chart-flag-link" href="${href}" aria-label="${escapeHtml(race.name)}" title="Ver ${escapeHtml(race.name)}">
                    <rect class="chart-flag-shell${isFuture ? ' is-future' : ''}" x="${x - shellW / 2}" y="${shellY}" width="${shellW}" height="${shellH}" />
                    <image class="chart-flag${isFuture ? ' is-future' : ''}" href="${escapeHtml(race.flagUrl)}" x="${x - currentFlagSize / 2}" y="${shellY + 3.5}" width="${currentFlagSize}" height="${currentFlagSize}" preserveAspectRatio="xMidYMid meet" aria-label="${escapeHtml(race.name)}" />
                </a>
            `;
        }).join('');
    }

    function render() {
        const activeDatasets = datasets.filter(d => visible.has(d.id));

        // This is the key: the Y scale is recalculated every render from only visible datasets.
        maxY = scaleMaxFrom(activeDatasets);

        const lineGlows = activeDatasets.map(d => {
            const path = buildPath(d.data);
            if (!path) return '';
            return `<path class="chart-line-glow" d="${path}" style="stroke:${d.color}; color:${d.color};" data-series="${escapeHtml(d.id)}" />`;
        }).join('');

        const lines = activeDatasets.map(d => {
            const path = buildPath(d.data);
            if (!path) return '';
            return `
                <path class="chart-line-hitarea" d="${path}" data-series="${escapeHtml(d.id)}" />
                <path class="chart-line" d="${path}" style="stroke:${d.color}; color:${d.color};" data-series="${escapeHtml(d.id)}" />
            `;
        }).join('');

        const points = activeDatasets.map(d => {
            return d.data.map((value, index) => {
                if (value === null || value === undefined || Number.isNaN(value)) return '';

                const race = raceItems[index] || { name: 'Grand Prix' };
                const formattedValue = Number.isInteger(value) ? value : value.toFixed(1);
                const x = xForIndex(index);
                const y = yForValue(value);

                return `
                    <g class="chart-point-wrap" data-series="${escapeHtml(d.id)}">
                        <circle class="chart-point-hitarea" cx="${x}" cy="${y}" r="9" data-series="${escapeHtml(d.id)}" data-label="${escapeHtml(d.label)}" data-race="${escapeHtml(race.name)}" data-value="${formattedValue}" />
                        <circle class="chart-point" cx="${x}" cy="${y}" r="3.25" style="fill:${d.color}; stroke:${d.color}; color:${d.color};" data-series="${escapeHtml(d.id)}" data-label="${escapeHtml(d.label)}" data-race="${escapeHtml(race.name)}" data-value="${formattedValue}" />
                    </g>
                `;
            }).join('');
        }).join('');

        const endLabels = (() => {
            if (activeDatasets.length > 12) return '';

            const labelPoints = activeDatasets
                .map(d => {
                    const lastPoint = getLastPoint(d.data);
                    return lastPoint ? { dataset: d, x: lastPoint.x, y: lastPoint.y } : null;
                })
                .filter(Boolean);

            const adjusted = deconflictLabelPositions(labelPoints);

            return adjusted.map(({ dataset: d, x, y }) =>
                `<text class="chart-end-label" x="${x + 9}" y="${y + 4}" style="fill:${d.color};" data-series="${escapeHtml(d.id)}">${escapeHtml(d.label)}</text>`
            ).join('');
        })();

        container.innerHTML = `
            <svg class="f1-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative championship points chart">
                <rect class="chart-bg" x="0" y="0" width="${width}" height="${height}" />

                <g class="chart-grid">
                    ${makeRaceMarkers()}
                    ${makeGrid()}
                    <line class="chart-axis-line" x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" />
                    <line class="chart-axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" />
                </g>

                <g class="chart-line-glows">${lineGlows}</g>
                <g class="chart-lines">${lines}</g>
                <g class="chart-points">${points}</g>
                <g class="chart-end-labels">${endLabels}</g>
                <g class="chart-season-axis">${makeSeasonRail()}${makeXAxisLabels()}</g>
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

        function removeActiveClasses() {
            svg.querySelectorAll('.is-active-line').forEach(el => el.classList.remove('is-active-line'));
            svg.querySelectorAll('.is-active-line-glow').forEach(el => el.classList.remove('is-active-line-glow'));
            svg.querySelectorAll('.is-active-point').forEach(el => el.classList.remove('is-active-point'));
            svg.querySelectorAll('.is-active-point-value').forEach(el => el.classList.remove('is-active-point-value'));
            svg.querySelectorAll('.is-active-label').forEach(el => el.classList.remove('is-active-label'));
        }

        function activateSeries(seriesId) {
            svg.classList.add('is-hovering');
            removeActiveClasses();

            svg.querySelectorAll(`[data-series="${CSS.escape(seriesId)}"]`).forEach(el => {
                if (el.classList.contains('chart-line')) el.classList.add('is-active-line');
                if (el.classList.contains('chart-line-glow')) el.classList.add('is-active-line-glow');
                if (el.classList.contains('chart-point')) el.classList.add('is-active-point');
                if (el.classList.contains('chart-end-label')) el.classList.add('is-active-label');
            });
        }

        function clearActiveSeries() {
            svg.classList.remove('is-hovering');
            removeActiveClasses();
            tooltip.hidden = true;
        }

        svg.querySelectorAll('.chart-line-hitarea, .chart-point-wrap').forEach(el => {
            el.addEventListener('mouseenter', () => {
                activateSeries(el.dataset.series);
            });

            el.addEventListener('mouseleave', () => clearActiveSeries());
        });

        svg.querySelectorAll('.chart-line-hitarea').forEach(line => {
            line.addEventListener('mouseenter', () => {
                const summary = getSeriesSummary(line.dataset.series);
                if (!summary) return;

                const { dataset, points } = summary;
                tooltip.style.setProperty('--active-series-color', dataset.color);
                tooltip.hidden = false;
                tooltip.innerHTML = `
                    <strong>${escapeHtml(dataset.label)}</strong>
                    <span>${points} pts</span>
                `;
            });

            line.addEventListener('mousemove', e => {
                const rect = container.getBoundingClientRect();
                tooltip.style.left = `${e.clientX - rect.left}px`;
                tooltip.style.top = `${e.clientY - rect.top}px`;
            });

            line.addEventListener('mouseleave', () => {
                tooltip.hidden = true;
            });
        });

        svg.querySelectorAll('.chart-point-hitarea').forEach(point => {
            point.addEventListener('mouseenter', () => {
                const seriesColor = datasets.find(d => d.id === point.dataset.series)?.color;
                if (seriesColor) tooltip.style.setProperty('--active-series-color', seriesColor);
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
                <div class="filter-checkbox checked" style="background:${d.color};border-color:${d.color}">✓</div>
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

    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => render(), 150);
    });
    resizeObserver.observe(container);
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


// ── RACE LABEL HELPERS ───────────────────────────────────────────────────
const TWEMOJI_FLAG_BASE_URL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

function twemojiFlagCode(countryCode = '') {
    const code = countryCode.trim().toUpperCase();

    if (code.length !== 2) return '1f3c1';

    return [...code]
        .map(char => (0x1F1E6 + char.charCodeAt(0) - 65).toString(16))
        .join('-');
}

function countryCodeFromGpName(gpName = '', gpId = '') {
    const gpKey = (gpId || '').trim().toLowerCase();
    const countryMap = {
        'australian-gp': 'AU',
        'chinese-gp': 'CN',
        'japanese-gp': 'JP',
        'bahrain-gp': 'BH',
        'saudi-arabian-gp': 'SA',
        'miami-gp': 'US',
        'canadian-gp': 'CA',
        'monaco-gp': 'MC',
        'barcelona-gp': 'ES',
        'austrian-gp': 'AT',
        'british-gp': 'GB',
        'belgian-gp': 'BE',
        'hungarian-gp': 'HU',
        'dutch-gp': 'NL',
        'italian-gp': 'IT',
        'spanish-gp': 'ES',
        'azerbaijan-gp': 'AZ',
        'singapore-gp': 'SG',
        'united-states-gp': 'US',
        'mexican-gp': 'MX',
        'brazilian-gp': 'BR',
        'las-vegas-gp': 'US',
        'qatar-gp': 'QA',
        'abu-dhabi-gp': 'AE',
    };

    if (gpKey && countryMap[gpKey]) {
        return countryMap[gpKey];
    }

    const match = countryRules.find(([pattern]) => pattern.test(name));
    return match ? match[1] : '';
}

function raceLabelFromGp(gp) {
    const name = gp?.name || 'Grand Prix';
    const countryCode = countryCodeFromGpName(name, gp?.gpId || '');
    const flagCode = twemojiFlagCode(countryCode);

    return {
        name,
        countryCode,
        flagCode,
        flagUrl: `${TWEMOJI_FLAG_BASE_URL}${flagCode}.svg`,
        gpId: gp?.gpId || '',
    };
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
        const allRaces = Object.entries(season)
            .filter(([gpId, gp]) => {
                const name = gp.name.toLowerCase();
                return !name.includes('bahrain') && !name.includes('saudi');
            })
            .sort(([, a], [, b]) => a.round - b.round)
            .map(([gpId, gp]) => ({ ...gp, gpId }));
        // Labels para el gráfico: bandera abajo, nombre completo en hover/tooltip.
        const raceLabels = allRaces.map(raceLabelFromGp);

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