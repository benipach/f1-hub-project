// archive.js — completamente autosuficiente, no depende de championship.js

const ARCHIVE_CURRENT_YEAR = new Date().getFullYear();
const ARCHIVE_TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

// ── HELPERS DE BANDERAS ───────────────────────────────────────────────────
function archiveFlagCode(countryCode = '') {
    const code = countryCode.trim().toUpperCase();
    if (code.length !== 2) return '1f3c1';
    return [...code]
        .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
        .join('-');
}

function archiveRaceLabel(gpId, gp, gpMeta) {
    const meta = gpMeta?.[gpId];
    const countryCode = gp?.countryOverride || meta?.country || '';
    const flagCode = archiveFlagCode(countryCode);
    return {
        name: gp?.name || gpId,
        countryCode,
        flagCode,
        flagUrl: `${ARCHIVE_TWEMOJI_BASE}${flagCode}.svg`,
        gpId,
    };
}

// ── DETECCIÓN DE TEMPORADAS PASADAS ──────────────────────────────────────
async function loadPastSeasons(base = '.') {
    const years = [];
    for (let y = 1950; y < ARCHIVE_CURRENT_YEAR; y++) years.push(y);

    const results = await Promise.all(
        years.map(async y => {
            try {
                const res = await fetch(`${base}/data/season${y}.json`, { method: 'HEAD' });
                return res.ok ? y : null;
            } catch { return null; }
        })
    );
    return results.filter(Boolean).sort((a, b) => b - a);
}

// ── CHART LAYOUT ─────────────────────────────────────────────────────────
const ARCHIVE_CHART_LAYOUT = {
    width: 1000,
    height: 430,
    padding: { top: 38, right: 88, bottom: 68, left: 58 },
    gridStep: 25,
    seasonRailOffsetY: 42,
    flagShellOffsetY: 52,
    maxLabelsOnMobile: 8,
    flagSize: { mobile: 15, desktop: 18 },
    flagShellPadding: { width: 9, height: 7 },
};

// ── BUILDCUMULATIVE ───────────────────────────────────────────────────────
function archiveBuildCumulative(points) {
    let sum = 0;
    return points.map(p => {
        if (p === null) return null;
        sum += p;
        return sum;
    });
}

// ── TABS ──────────────────────────────────────────────────────────────────
function initArchiveTabs() {
    const tabBar = document.querySelector('.archive-tab-bar');
    if (!tabBar) return;

    const indicator = document.createElement('div');
    indicator.className = 'tab-indicator';
    tabBar.appendChild(indicator);

    const move = btn => {
        indicator.style.left  = `${btn.offsetLeft}px`;
        indicator.style.width = `${btn.offsetWidth}px`;
    };

    tabBar.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#archive-content .tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
            move(btn);
        });
    });

    const activeBtn = tabBar.querySelector('.tab-btn.active') || tabBar.querySelector('.tab-btn');
    if (activeBtn) move(activeBtn);
    window.addEventListener('resize', () => {
        const cur = tabBar.querySelector('.tab-btn.active');
        if (cur) move(cur);
    });
}

// ── FILTER DROPDOWNS ─────────────────────────────────────────────────────
function initArchiveFilterDropdowns() {
    document.addEventListener('click', e => {
        ['archive-driver', 'archive-constructor'].forEach(type => {
            const btn = document.getElementById(`${type}-filter-btn`);
            const dd  = document.getElementById(`${type}-filter-dropdown`);
            if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) {
                dd.classList.remove('open');
            }
        });
    });

    ['archive-driver', 'archive-constructor'].forEach(type => {
        document.getElementById(`${type}-filter-btn`)?.addEventListener('click', e => {
            e.stopPropagation();
            document.getElementById(`${type}-filter-dropdown`)?.classList.toggle('open');
        });
    });
}

// ── RENDER TABLA DRIVERS ──────────────────────────────────────────────────
function archiveRenderDriversTable(drivers, driverNumbers = {}) {
    const wrap = document.getElementById('archive-drivers-table-wrap');
    if (!wrap) return;
    const sorted = [...drivers].sort((a, b) => b.points - a.points);
    const leader = sorted[0]?.points ?? 0;

    const rows = sorted.map((d, i) => {
        const pos     = i + 1;
        const gap     = pos === 1 ? '—' : `−${leader - d.points}`;
        const logoFile = TEAM_LOGO_MAP?.[d.team];
        const logoHtml = logoFile
            ? `<img class="st-team-logo" src="img/teams/${logoFile}.png" alt="${d.team}">`
            : `<span class="st-team-logo-placeholder"></span>`;
        const num              = driverNumbers[d.driver] || '';
        const driverTeamColor  = (typeof teamColor === 'function' ? teamColor(d.team) : null) || 'rgba(255,255,255,0.4)';
        const numHtml          = num
            ? `<span class="st-driver-num" style="color:${driverTeamColor}">#${num}</span>`
            : '';

        return `<tr>
            <td class="st-pos">${pos}</td>
            <td><div class="st-driver">
                ${numHtml}
                <span class="driver-lastname">${d.driver.split(' ').slice(1).join(' ').toUpperCase() || d.driver.toUpperCase()}</span>
            </div></td>
            <td><div class="st-team-cell">${logoHtml}<span class="team-name">${d.team}</span></div></td>
            <td class="st-pts">${d.points}</td>
            <td class="st-gap">${gap}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="standings-table">
        <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th style="text-align:center">Pts</th><th>Gap</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ── RENDER TABLA CONSTRUCTORS ─────────────────────────────────────────────
function archiveRenderConstructorsTable(constructors) {
    const wrap = document.getElementById('archive-constructors-table-wrap');
    if (!wrap) return;
    const sorted = [...constructors].sort((a, b) => b.points - a.points);
    const leader = sorted[0]?.points ?? 0;

    const rows = sorted.map((c, i) => {
        const pos      = i + 1;
        const gap      = pos === 1 ? '—' : `−${leader - c.points}`;
        const logoFile = TEAM_LOGO_MAP?.[c.team];
        const logoHtml = logoFile
            ? `<img class="st-team-logo" src="img/teams/${logoFile}.png" alt="${c.team}">`
            : `<span class="st-team-logo-placeholder"></span>`;

        return `<tr>
            <td class="st-pos">${pos}</td>
            <td><div class="st-driver">${logoHtml}<span class="constructor-fullname">${c.team}</span></div></td>
            <td class="st-pts">${c.points}</td>
            <td class="st-gap">${gap}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="standings-table">
        <thead><tr><th>Pos</th><th>Constructor</th><th style="text-align:center">Pts</th><th>Gap</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ── CHART (copia de makeFilteredChart de championship.js) ─────────────────
function archiveMakeChart(containerId, filterItemsId, selectAllId, datasets, labels) {
    const container      = document.getElementById(containerId);
    const filterContainer = document.getElementById(filterItemsId);
    const selectAllBtn   = document.getElementById(selectAllId);
    if (!container) return;

    const visible = new Set(datasets.map(d => d.id));
    let maxY = 50;

    const raceItems = labels.map(label => {
        if (typeof label === 'string') {
            return { name: label, countryCode: '', flagCode: '1f3c1', flagUrl: `${ARCHIVE_TWEMOJI_BASE}1f3c1.svg`, gpId: '' };
        }
        const flagCode = label?.flagCode || '1f3c1';
        return {
            name: label?.name || 'Grand Prix',
            countryCode: label?.countryCode || '',
            flagCode,
            flagUrl: label?.flagUrl || `${ARCHIVE_TWEMOJI_BASE}${flagCode}.svg`,
            gpId: label?.gpId || '',
        };
    });

    const { width, height, padding } = ARCHIVE_CHART_LAYOUT;
    const plotWidth  = width  - padding.left - padding.right;
    const plotHeight = height - padding.top  - padding.bottom;

    function xForIndex(i) {
        if (raceItems.length <= 1) return padding.left;
        return padding.left + (i / (raceItems.length - 1)) * plotWidth;
    }
    function yForValue(v) { return padding.top + plotHeight - (v / maxY) * plotHeight; }

    function scaleMax(src) {
        const step = ARCHIVE_CHART_LAYOUT.gridStep;
        const vals = src.flatMap(d => d.data).filter(v => typeof v === 'number' && !Number.isNaN(v));
        const hi = Math.max(...vals, 0);
        if (hi <= 0) return step;
        return (Math.floor(hi / step) + 1) * step;
    }

    function buildPath(data) {
        let path = '', drawing = false;
        data.forEach((v, i) => {
            if (v === null || v === undefined || Number.isNaN(v)) { drawing = false; return; }
            const x = xForIndex(i), y = yForValue(v);
            path += drawing ? `L ${x} ${y} ` : `M ${x} ${y} `;
            drawing = true;
        });
        return path.trim();
    }

    function getLastPoint(data) {
        for (let i = data.length - 1; i >= 0; i--) {
            if (typeof data[i] === 'number' && !Number.isNaN(data[i]))
                return { index: i, value: data[i], x: xForIndex(i), y: yForValue(data[i]) };
        }
        return null;
    }

    function makeGrid() {
        const step = ARCHIVE_CHART_LAYOUT.gridStep;
        const ticks = [];
        for (let v = 0; v <= maxY; v += step) {
            const y = yForValue(v);
            ticks.push(`
                <line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"/>
                <text class="chart-y-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${v}</text>`);
        }
        return ticks.join('');
    }

    function raceCompleted(i) {
        return datasets.some(d => typeof d.data[i] === 'number' && !Number.isNaN(d.data[i]));
    }

    function makeRaceMarkers() {
        return raceItems.map((r, i) => {
            const x = xForIndex(i);
            return `<line class="chart-race-marker ${raceCompleted(i) ? 'is-completed' : 'is-future'}" x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + plotHeight}"/>`;
        }).join('');
    }

    function makeFlags() {
        const L = ARCHIVE_CHART_LAYOUT;
        const isMobile = window.innerWidth < 640;
        const maxLabels = isMobile ? L.maxLabelsOnMobile : raceItems.length;
        const step = raceItems.length > maxLabels ? Math.ceil(raceItems.length / maxLabels) : 1;
        const flagSize = isMobile ? L.flagSize.mobile : L.flagSize.desktop;
        const { width: pw, height: ph } = L.flagShellPadding;
        const shellW = flagSize + pw, shellH = flagSize + ph;
        const railY = height - padding.bottom + L.seasonRailOffsetY;
        const flagY = height - padding.bottom + L.flagShellOffsetY;

        const rail = `<line class="chart-season-rail" x1="${padding.left}" y1="${railY}" x2="${width - padding.right}" y2="${railY}"/>`;

        const flags = raceItems.map((r, i) => {
            if (i % step !== 0 && i !== raceItems.length - 1) return '';
            const x = xForIndex(i);
            const shellX = x - shellW / 2;
            const shellY = flagY - shellH / 2;
            const imgX   = x - flagSize / 2;
            const imgY   = flagY - flagSize / 2;
            return `
                <rect class="chart-flag-shell" x="${shellX}" y="${shellY}" width="${shellW}" height="${shellH}" rx="3"/>
                <image href="${r.flagUrl}" x="${imgX}" y="${imgY}" width="${flagSize}" height="${flagSize}" class="chart-flag-img">
                    <title>${r.name}</title>
                </image>`;
        }).join('');

        return rail + flags;
    }

    function deconflict(points, minGap = 12) {
        const sorted = [...points].map(p => ({ ...p, originalY: p.y })).sort((a, b) => a.y - b.y);
        const lowerBound = padding.top + plotHeight;
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].y - sorted[i-1].y < minGap) sorted[i].y = sorted[i-1].y + minGap;
        }
        let overflow = sorted.length ? sorted[sorted.length-1].y - lowerBound : 0;
        if (overflow > 0) {
            for (let i = sorted.length-1; i >= 0 && overflow > 0; i--) {
                const shift = Math.min(overflow, sorted[i].y - sorted[i].originalY);
                sorted[i].y -= shift; overflow -= shift;
            }
        }
        return sorted;
    }

    function makeEndLabels(src) {
        const visibleDs = src.filter(d => visible.has(d.id));
        const points = visibleDs.map(d => {
            const lp = getLastPoint(d.data);
            if (!lp) return null;
            return { id: d.id, label: d.label, color: d.color, x: lp.x, y: lp.y, value: lp.value };
        }).filter(Boolean);

        const deconflicted = deconflict(points);
        return deconflicted.map(p => `
            <line class="chart-label-connector" x1="${p.x + 4}" y1="${p.y}" x2="${padding.left + plotWidth + 6}" y2="${p.y}" stroke="${p.color}" stroke-opacity="0.35"/>
            <text class="chart-end-label" x="${padding.left + plotWidth + 10}" y="${p.y + 4}" fill="${p.color}">${p.label}</text>`
        ).join('');
    }

    function render(src) {
        maxY = scaleMax(src.filter(d => visible.has(d.id)));
        const visibleDs = src.filter(d => visible.has(d.id));

        const lines = visibleDs.map(d => {
            const path = buildPath(d.data);
            if (!path) return '';
            const lp = getLastPoint(d.data);
            const dot = lp ? `<circle class="chart-dot" cx="${lp.x}" cy="${lp.y}" r="4" fill="${d.color}"/>` : '';
            return `<path class="chart-line" d="${path}" stroke="${d.color}" fill="none" stroke-width="2"/>${dot}`;
        }).join('');

        container.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
                ${makeGrid()}
                ${makeRaceMarkers()}
                ${lines}
                ${makeEndLabels(src)}
                ${makeFlags()}
            </svg>`;
    }

    // Filter items
    if (filterContainer) {
        filterContainer.innerHTML = '';
        datasets.forEach(d => {
            const item = document.createElement('label');
            item.className = 'filter-item';
            item.innerHTML = `
                <input type="checkbox" checked data-id="${d.id}">
                <span class="filter-dot" style="background:${d.color}"></span>
                <span class="filter-label">${d.label}</span>`;
            item.querySelector('input').addEventListener('change', e => {
                e.target.checked ? visible.add(d.id) : visible.delete(d.id);
                render(datasets);
            });
            filterContainer.appendChild(item);
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const allSelected = visible.size === datasets.length;
            allSelected ? visible.clear() : datasets.forEach(d => visible.add(d.id));
            selectAllBtn.textContent = allSelected ? 'Select all' : 'Deselect all';
            filterContainer?.querySelectorAll('input[type=checkbox]').forEach(cb => {
                cb.checked = !allSelected;
            });
            render(datasets);
        });
    }

    render(datasets);
    window.addEventListener('resize', () => render(datasets));
}

// ── PROCESAMIENTO DE DATOS ────────────────────────────────────────────────
function archiveProcessSeason(season) {
    const allRaces = Object.entries(season)
        .filter(([, gp]) => gp && typeof gp === 'object' && gp.round != null && !gp.cancelled)
        .sort(([, a], [, b]) => a.round - b.round)
        .map(([gpId, gp]) => ({ ...gp, gpId }));

    const getResults = (gp, key) => {
        const r = gp?.sessions?.[key]?.results;
        return Array.isArray(r) ? r : [];
    };
    const getRace   = gp => getResults(gp, 'race');
    const getSprint = gp => getResults(gp, 'sprintRace');
    const hasResult = gp => getRace(gp).length > 0 || getSprint(gp).length > 0;
    const resultTeam = r => (typeof teamCanonicalName === 'function' ? teamCanonicalName(r.team || '') : r.team) || 'Unknown';

    // Drivers
    const driverMap = {};
    allRaces.forEach(gp => {
        [...getRace(gp), ...getSprint(gp)].forEach(r => {
            if (!r?.driver) return;
            if (!driverMap[r.driver]) {
                driverMap[r.driver] = { driver: r.driver, team: resultTeam(r), points: 0, racePoints: [] };
            }
        });
    });
    allRaces.forEach(gp => {
        const rr = getRace(gp), sr = getSprint(gp), has = hasResult(gp);
        Object.values(driverMap).forEach(d => {
            if (!has) { d.racePoints.push(null); return; }
            const r1  = rr.find(r => r.driver === d.driver);
            const r2  = sr.find(r => r.driver === d.driver);
            const pts = (r1?.pts ?? 0) + (r2?.pts ?? 0);
            d.racePoints.push(pts);
            d.points += pts;
            if (r1?.team || r2?.team) d.team = resultTeam(r1 || r2);
        });
    });

    // Constructors
    const constructorMap = {};
    const ensureTeam = team => { if (team && !constructorMap[team]) constructorMap[team] = { team, points: 0, racePoints: [] }; };
    allRaces.forEach(gp => [...getRace(gp), ...getSprint(gp)].forEach(r => ensureTeam(resultTeam(r))));
    allRaces.forEach(gp => {
        const rr = getRace(gp), sr = getSprint(gp), has = hasResult(gp);
        Object.values(constructorMap).forEach(c => {
            if (!has) { c.racePoints.push(null); return; }
            const pts = [...rr, ...sr].filter(r => resultTeam(r) === c.team).reduce((s, r) => s + (r.pts ?? 0), 0);
            c.racePoints.push(pts);
            c.points += pts;
        });
    });

    return { allRaces, driverMap, constructorMap };
}

// ── NÚMERO DE PILOTO MÁS USADO EN LA TEMPORADA ────────────────────────────
// Recorre TODAS las sesiones (race, sprintRace, qualifying, fp, etc.) de
// cada GP y cuenta qué número usó cada piloto. Si un piloto cambió de
// número durante el año, se queda con el que más veces usó; en caso de
// empate, gana el que usó más tarde en el calendario (por round).
function archiveComputeDriverNumbers(allRaces) {
    const usage = {}; // driver -> { [num]: { count, lastRound } }

    allRaces.forEach(gp => {
        const sessions = gp?.sessions || {};
        Object.values(sessions).forEach(session => {
            const results = Array.isArray(session?.results) ? session.results : [];
            results.forEach(r => {
                if (!r?.driver || r.number == null) return;
                if (!usage[r.driver]) usage[r.driver] = {};
                const entry = usage[r.driver][r.number] || { count: 0, lastRound: -1 };
                entry.count++;
                entry.lastRound = Math.max(entry.lastRound, gp.round ?? -1);
                usage[r.driver][r.number] = entry;
            });
        });
    });

    const driverNumbers = {};
    Object.entries(usage).forEach(([driver, nums]) => {
        let best = null;
        Object.entries(nums).forEach(([num, stats]) => {
            const isBetter = !best
                || stats.count > best.count
                || (stats.count === best.count && stats.lastRound > best.lastRound);
            if (isBetter) best = { num, ...stats };
        });
        if (best) driverNumbers[driver] = best.num;
    });

    return driverNumbers;
}

// ── RENDER CALENDARIO ─────────────────────────────────────────────────────
function archiveRenderCalendar(season, gpMeta) {
    const calendar = document.getElementById('archive-calendar');
    if (!calendar) return;
    calendar.querySelectorAll('.race-card').forEach(el => el.remove());

    const entries = Object.entries(season)
        .filter(([, gp]) => gp && typeof gp === 'object' && gp.round != null)
        .sort(([, a], [, b]) => a.round - b.round);

    for (const [gpId, gp] of entries) {
        if (typeof raceCardSkeleton !== 'function') continue;
        const card = raceCardSkeleton(gpId, gp, gpMeta);
        card.classList.add('in-view');
        calendar.appendChild(card);
    }
}

// ── RENDER TEMPORADA COMPLETA ─────────────────────────────────────────────
async function archiveRenderSeason(year) {
    const [seasonRes, gpMetaRes] = await Promise.all([
        fetch(`./data/season${year}.json`),
        fetch('./data/gp-meta.json'),
    ]);
    const season = await seasonRes.json();
    const gpMeta = await gpMetaRes.json();

    document.getElementById('archive-title').textContent    = `${year} SEASON`;
    document.getElementById('archive-subtitle').textContent = `${year} Formula 1 World Championship`;
    document.getElementById('archive-calendar-title').textContent = `${year} Season Calendar`;
    document.getElementById('archive-content').removeAttribute('hidden');

    const { allRaces, driverMap, constructorMap } = archiveProcessSeason(season);
    const raceLabels = allRaces.map(gp => archiveRaceLabel(gp.gpId, gp, gpMeta));
    const driverNumberLookup = archiveComputeDriverNumbers(allRaces);

    // Drivers
    archiveRenderDriversTable(Object.values(driverMap), driverNumberLookup);
    const driverDatasets = Object.values(driverMap)
        .sort((a, b) => b.points - a.points)
        .map(d => ({
            id: d.driver,
            label: d.driver.split(' ').slice(1).join(' ').toUpperCase() || d.driver.toUpperCase(),
            color: (typeof teamColor === 'function' ? teamColor(d.team) : null) || '#ffffff',
            data: buildCumulative(d.racePoints),
        }));
    makeFilteredChart('archive-driverChart', 'archive-driver-filter-items', 'archive-driver-select-all', driverDatasets, raceLabels);

    // Constructors
    archiveRenderConstructorsTable(Object.values(constructorMap));
    const constructorDatasets = Object.values(constructorMap)
        .sort((a, b) => b.points - a.points)
        .map(c => ({
            id: c.team,
            label: c.team,
            color: (typeof teamColor === 'function' ? teamColor(c.team) : null) || '#ffffff',
            data: buildCumulative(c.racePoints),
        }));
    makeFilteredChart('archive-constructorChart', 'archive-constructor-filter-items', 'archive-constructor-select-all', constructorDatasets, raceLabels, 50);

    // Calendario
    archiveRenderCalendar(season, gpMeta);
}

// ── MAIN ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await document.fonts.ready;

    initArchiveTabs();
    initArchiveFilterDropdowns();

    const select = document.getElementById('archive-season-select');
    if (!select) return;

    try {
        const seasons = await loadPastSeasons('.');

        if (!seasons.length) {
            select.innerHTML = '<option value="" disabled selected>No past seasons available</option>';
            return;
        }

        seasons.forEach(year => {
            const opt = document.createElement('option');
            opt.value = year;
            opt.textContent = year;
            select.appendChild(opt);
        });

        // Preseleccionar si viene ?season=YYYY en la URL
        const params = new URLSearchParams(window.location.search);
        const requestedYear = Number(params.get('season'));
        if (requestedYear && seasons.includes(requestedYear)) {
            select.value = requestedYear;
            await archiveRenderSeason(requestedYear);
        }

        select.addEventListener('change', async () => {
            const year = Number(select.value);
            if (!year) return;
            history.pushState(null, '', `?season=${year}`);
            document.getElementById('archive-driverChart').innerHTML      = '';
            document.getElementById('archive-constructorChart').innerHTML = '';
            await archiveRenderSeason(year);
        });

    } catch (err) {
        console.error('Error cargando Archive:', err);
    }
});