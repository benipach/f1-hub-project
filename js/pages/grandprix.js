// pages/grandprix.js — orchestrates the DOM for grandprix.html (single GP detail page).

const SESSION_DEFS = [
    ['fp1',         'fp1',          'Practice 1'],
    ['fp2',         'fp2',          'Practice 2'],
    ['fp3',         'fp3',          'Practice 3'],
    ['sprintQualy', 'sprint-qualy', 'Sprint Qualifying'],
    ['sprintRace',  'sprint-race',  'Sprint'],
    ['qualifying',  'qualifying',   'Qualifying'],
    ['race',        'race',         'Race'],
];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const gpId = new URLSearchParams(window.location.search).get('gp');
        if (!gpId) { console.error('grandprix.js: missing ?gp= in the URL'); return; }

        const [latest, circuits, cities, countries, teams, drivers] = await Promise.all([
            loadLatest('..'), loadCircuits('..'), loadCities('..'),
            loadCountries('..'), loadTeams('..'), loadDrivers('..'),
        ]);

        const season = await loadSeason('..', latest.latestSeason);
        const gp = season[gpId];
        if (!gp) { console.error(`grandprix.js: GP "${gpId}" not found in season ${latest.latestSeason}`); return; }

        const ctx = { circuits, cities, countries, teams, drivers };

        document.getElementById('page-title').textContent = `F1 Hub | ${gp.name}`;

        renderHero(gpId, gp, ctx);
        renderSchedule(gp);
        renderSessionTabs(gp, ctx);
        renderTrackData(gp, ctx);
        hideUnsourcedSections();
        initScrollReveal();

        if (typeof twemoji !== 'undefined') {
            twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
        }
    } catch (err) {
        console.error('Error loading grand prix page:', err);
    }
});

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

// ── Hero ─────────────────────────────────────────────────────────────────

function renderHero(gpId, gp, ctx) {
    const { circuit } = getGpLocation(gp, ctx);
    const flag = getGpFlag(gp, ctx);
    const year = new Date().getFullYear();
    const layout = getCircuitLayout(circuit, year);

    const heroImg = document.getElementById('race-hero-img');
    if (heroImg) heroImg.src = `../img/circuits/${gp.circuitId}.png`;

    setText('hero-circuit-name', circuit?.name ?? '—');
    setText('hero-name', gp.name);

    const flagBg = document.getElementById('hero-flag-bg');
    if (flagBg) flagBg.textContent = flag;

    const sprintBadge = document.getElementById('hero-sprint-badge');
    if (sprintBadge) sprintBadge.style.display = gp.sprint ? 'flex' : 'none';

    setText('stat-length', layout?.length ? `${layout.length} km` : '—');
    setText('stat-corners', layout?.turns ?? '—');

    const raceWinnerLaps = getSessionResults(gp, 'race').find(r => Number(r.pos) === 1)?.laps;
    setText('stat-laps', raceWinnerLaps ?? '—');

    // OT Zones: circuits.json doesn't track discrete overtaking zones, only an
    // overtaking-difficulty rating (0-100). Showing that as a stand-in.
    setText('stat-overtake', circuit?.characteristics?.overtaking != null
        ? `${circuit.characteristics.overtaking}%` : '—');

    // First GP at this circuit needs scanning every past season file — not done here.
    setText('stat-first', '—');
}

// ── Weekend schedule ─────────────────────────────────────────────────────

function renderSchedule(gp) {
    const section   = document.getElementById('section-schedule');
    const container = document.getElementById('schedule-card');
    if (!section || !container || !gp?.sessions) return;

    const raceEnded = getSessionEnd(gp, 'race') && getSessionEnd(gp, 'race') <= new Date();
    if (raceEnded) { section.style.display = 'none'; return; }
    section.style.display = '';

    const now = new Date();
    const sessions = SESSION_DEFS
        .filter(([jsonKey]) => hasSession(gp, jsonKey))
        .map(([jsonKey, , label]) => ({
            label, start: getSessionStart(gp, jsonKey), end: getSessionEnd(gp, jsonKey),
        }))
        .filter(s => s.start);

    const dayMap = new Map();
    for (const s of sessions) {
        const dayKey = s.start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
        (dayMap.get(dayKey) ?? dayMap.set(dayKey, []).get(dayKey)).push(s);
    }

    const fmtTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const rowHTML = (s) => {
        const ended = s.end && s.end <= now;
        const live  = s.start <= now && s.end > now;
        const cls   = ['schedule-row', ended ? 'schedule-row-ended' : live ? 'schedule-row-live' : ''].filter(Boolean).join(' ');
        const tag   = live ? 'Live' : ended ? 'Ended' : formatCountdown(s.start - now) ?? 'Upcoming';

        return `
        <div class="${cls}">
            <div class="schedule-row-top">
                <span class="schedule-row-session">${s.label}</span>
                <span class="schedule-row-tag">${tag}</span>
            </div>
            <div class="schedule-row-meta">
                <span class="schedule-row-time">${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
            </div>
        </div>`;
    };

    container.innerHTML = [...dayMap.entries()].map(([dayLabel, rows]) => `
        <div class="schedule-day">
            <p class="schedule-day-label">${dayLabel}</p>
            <div class="schedule-day-rows">${rows.map(rowHTML).join('')}</div>
        </div>`).join('');
}

// ── Session tabs ─────────────────────────────────────────────────────────

function renderSessionTabs(gp, ctx) {
    const tabBar = document.getElementById('session-tab-bar');
    if (!tabBar) return;

    const available = SESSION_DEFS.filter(([jsonKey]) => hasSession(gp, jsonKey));
    if (!available.length) { document.getElementById('session-tabs-container').style.display = 'none'; return; }

    // Hide panels for sessions this GP doesn't have.
    document.querySelectorAll('.session-tab-panel').forEach(panel => {
        const hasIt = available.some(([, htmlKey]) => htmlKey === panel.dataset.session);
        panel.style.display = hasIt ? '' : 'none';
    });

    // Default tab: always Race when the GP has one; otherwise fall back to
    // the last session that's live or ended, else the first upcoming one.
    const now = new Date();
    const withStatus = available.map(([jsonKey, htmlKey]) => {
        const end = getSessionEnd(gp, jsonKey);
        return { jsonKey, htmlKey, ended: end && end <= now };
    });
    const defaultHtmlKey = withStatus.find(s => s.htmlKey === 'race')?.htmlKey
        ?? [...withStatus].reverse().find(s => s.ended)?.htmlKey
        ?? withStatus.find(s => !s.ended)?.htmlKey
        ?? withStatus[0].htmlKey;

    tabBar.innerHTML = available.map(([, htmlKey, label]) => {
        const panel = document.querySelector(`.session-tab-panel[data-session="${htmlKey}"]`);
        const short = panel?.dataset.labelShort ?? label;
        return `<button class="session-tab-btn" data-session="${htmlKey}" type="button">
            <span class="tab-label-full">${label}</span><span class="tab-label-short">${short}</span>
        </button>`;
    }).join('') + `<div class="session-tab-indicator" id="session-tab-indicator"></div>`;

    const indicator = document.getElementById('session-tab-indicator');
    const moveIndicator = (btn) => {
        if (!indicator || !btn) return;
        indicator.style.left  = `${btn.offsetLeft}px`;
        indicator.style.width = `${btn.offsetWidth}px`;
    };

    const order = available.map(([, htmlKey]) => htmlKey);
    let previousHtmlKey = null;

    const activate = (htmlKey) => {
        const prevIndex = previousHtmlKey ? order.indexOf(previousHtmlKey) : -1;
        const nextIndex = order.indexOf(htmlKey);
        const direction  = prevIndex === -1 || nextIndex === prevIndex
            ? 0
            : (nextIndex > prevIndex ? 1 : -1);

        tabBar.querySelectorAll('.session-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.session === htmlKey));
        document.querySelectorAll('.session-tab-panel').forEach(p => {
            const isActive = p.dataset.session === htmlKey;
            if (isActive) p.style.setProperty('--tab-slide-x', direction > 0 ? '24px' : direction < 0 ? '-24px' : '0px');
            p.classList.toggle('active', isActive);
        });
        moveIndicator(tabBar.querySelector(`.session-tab-btn[data-session="${htmlKey}"]`));
        previousHtmlKey = htmlKey;
    };

    tabBar.querySelectorAll('.session-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => activate(btn.dataset.session));
    });

    window.addEventListener('resize', () => moveIndicator(tabBar.querySelector('.session-tab-btn.active')));

    for (const [jsonKey, htmlKey] of available) renderSessionPanel(gp, jsonKey, htmlKey, ctx);
    activate(defaultHtmlKey);
}

function renderSessionPanel(gp, jsonKey, htmlKey, ctx) {
    renderSessionWeather(gp, jsonKey, htmlKey);
    const results = getSessionResults(gp, jsonKey);
    const container = document.getElementById(`${htmlKey}-card`);
    if (!container) return;

    const gridPositions = getGridPositions(gp, jsonKey);
    container.innerHTML = results.length
        ? buildResultTable(results, jsonKey, ctx, gridPositions)
        : `<span class="result-pending-text">No results yet</span>`;
}

// Race/Sprint don't carry their own starting-grid data; the grid position
// is derived from that GP's Qualifying (for race) or Sprint Qualifying
// (for sprint) results — same driver key, position from that session.
function getGridPositions(gp, jsonKey) {
    const gridSessionKey = jsonKey === 'race' ? 'qualifying'
        : jsonKey === 'sprintRace' ? 'sprintQualy'
        : null;
    if (!gridSessionKey) return null;

    const gridResults = getSessionResults(gp, gridSessionKey);
    if (!gridResults.length) return null;

    const map = {};
    for (const r of gridResults) {
        if (r.driver != null) map[r.driver] = Number(r.pos);
    }
    return map;
}

function renderSessionWeather(gp, jsonKey, htmlKey) {
    const container = document.getElementById(`weather-${htmlKey}`);
    const w = getSession(gp, jsonKey)?.weather;
    if (!container) return;
    if (!w) { container.innerHTML = ''; return; }

    const isWet = w.rainfall > 0;
    container.innerHTML = `
        <div class="session-weather-card">
            <div class="swc-condition ${isWet ? 'is-wet' : 'is-dry'}">
                <span class="swc-condition-icon">${isWet ? '🌧️' : '☀️'}</span>
                <span class="swc-condition-text">
                    <span class="swc-condition-label">${isWet ? 'Wet' : 'Dry'}</span>
                    <span class="swc-condition-sub">Track Condition</span>
                </span>
            </div>
            <div class="swc-stats">
                <span class="swc-stat"><span class="swc-stat-value">${w.air_temperature}°C</span><span class="swc-stat-label">Air Temp</span></span>
                <span class="swc-stat"><span class="swc-stat-value">${w.track_temperature}°C</span><span class="swc-stat-label">Track Temp</span></span>
                <span class="swc-stat"><span class="swc-stat-value">${w.humidity}%</span><span class="swc-stat-label">Humidity</span></span>
                <span class="swc-stat"><span class="swc-stat-value">${w.wind_speed} m/s</span><span class="swc-stat-label">Wind</span></span>
            </div>
        </div>`;
}

// ── Result table ─────────────────────────────────────────────────────────

function buildResultTable(results, jsonKey, ctx, gridPositions) {
    const isRaceLike = jsonKey === 'race' || jsonKey === 'sprintRace';
    const isSprintRace = jsonKey === 'sprintRace';
    const isPractice  = jsonKey === 'fp1' || jsonKey === 'fp2' || jsonKey === 'fp3';
    const isQualy     = jsonKey === 'qualifying' || jsonKey === 'sprintQualy';

    const headCellsArr = [
        '<th class="res-pos-col">Pos</th>',
        isRaceLike ? '<th class="res-delta-col"></th>' : '',
        '<th>Driver</th>',
        '<th class="res-team-col">Team</th>',
        isPractice ? '<th>Lap Time</th>' : '',
        isPractice ? '<th class="res-laps-col">Laps</th>' : '',
        !isRaceLike && !isPractice ? '<th>Lap Time</th>' : '',
        isSprintRace ? '<th class="res-laps-col">Laps</th>' : '',
        isRaceLike ? '<th>Time / Gap</th>' : '',
        isRaceLike ? '<th class="res-bestlap-col">Best Lap</th>' : '',
        isRaceLike ? '<th class="res-pts-col">Pts</th>' : '',
    ].filter(Boolean);

    const rowsData = [...results]
        .sort((a, b) => Number(a.pos) - Number(b.pos))
        .map(r => ({
            pos: Number(r.pos),
            html: buildResultRow(r, jsonKey, isRaceLike, isPractice, ctx, gridPositions),
        }));

    const rows = isQualy
        ? withQualyEliminationSeparators(rowsData, jsonKey, headCellsArr.length)
        : rowsData.map(rd => rd.html).join('');

    return `<div class="race-table-wrap"><table class="data-table">
        <thead><tr>${headCellsArr.join('')}</tr></thead>
        <tbody>${rows}</tbody>
    </table></div>`;
}

// 2026 22-car grid: P17-P22 drop after Q1/SQ1, P11-P16 drop after Q2/SQ2,
// leaving the top 10 for Q3. Injects a divider row right after the last
// surviving position of each cut (same spot live.js freezes them once the
// session has ended).
function withQualyEliminationSeparators(rowsData, jsonKey, colspan) {
    const isSprint = jsonKey === 'sprintQualy';
    const cutoffs = [
        { afterPos: 16, label: isSprint ? 'SQ1 ELIMINATED' : 'Q1 ELIMINATED' },
        { afterPos: 10, label: isSprint ? 'SQ2 ELIMINATED' : 'Q2 ELIMINATED' },
    ];

    const out = [];
    rowsData.forEach(({ pos, html }) => {
        out.push(html);
        const cut = cutoffs.find(c => c.afterPos === pos);
        if (cut) {
            out.push(
                `<tr class="qualy-separator"><td colspan="${colspan}">` +
                `<span class="qualy-separator-inner">` +
                `<span class="qualy-separator-line"></span>` +
                `<span class="qualy-separator-label">${cut.label}</span>` +
                `<span class="qualy-separator-line"></span>` +
                `</span>` +
                `</td></tr>`
            );
        }
    });
    return out.join('');
}

function isNoResultTime(value) {
    if (!value) return false;
    const v = String(value).trim().toLowerCase();
    return v === 'dnf' || v === 'no time' || v === 'dns';
}

// Same chevron icon used for the delta indicator in live.js
function deltaArrowSvg(direction) {
    const rotate = direction === 'down' ? 180 : 0;
    return `<svg class="res-delta-arrow" viewBox="0 0 24 24" style="transform:rotate(${rotate}deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Compares the starting grid position (derived from Qualifying/Sprint
// Qualifying results) against the finishing position.
function gridDeltaHtml(currentPos, gridPos) {
    const posNum = parseInt(currentPos, 10);
    if (isNaN(posNum) || gridPos == null) {
        return `<span class="res-delta res-delta--none">—</span>`;
    }

    const delta = gridPos - posNum; // positive = gained places
    if (delta > 0) {
        return `<span class="res-delta res-delta--up">${deltaArrowSvg('up')}${delta}</span>`;
    } else if (delta < 0) {
        return `<span class="res-delta res-delta--down">${deltaArrowSvg('down')}${Math.abs(delta)}</span>`;
    } else {
        return `<span class="res-delta res-delta--same">—</span>`;
    }
}

function buildResultRow(r, jsonKey, isRaceLike, isPractice, ctx, gridPositions) {
    const isSprintRace = jsonKey === 'sprintRace';
    const teamId    = resolveTeamId(r.team, ctx.teams);
    const team      = getTeamMeta(teamId, ctx.teams);
    const logoSrc   = teamLogoPath(teamId, '..');
    const teamLogo  = logoSrc
        ? `<img class="res-team-logo" src="${logoSrc}" alt="" onerror="this.remove()">`
        : `<span class="res-team-logo-placeholder"></span>`;
    const driverName = resolveDriverName(r.driver, ctx.drivers);
    const driverNameDisplay = resolveDriverNameUpper(r.driver, ctx.drivers);
    const isTop3      = Number(r.pos) <= 3;
    const mobileLogo  = logoSrc ? `<img class="res-driver-team-logo" src="${logoSrc}" alt="" onerror="this.remove()">` : '';
    const teamColor   = team.color ?? '#888888';
    const primaryTime = isRaceLike ? r.time : r.lapTime;

    const rowClass = isNoResultTime(primaryTime) ? ' class="row-no-time"' : '';
    const deltaCellHTML = isRaceLike
        ? `<td class="res-delta-cell">${gridDeltaHtml(r.pos, gridPositions?.[r.driver])}</td>`
        : '';

    const cells = [
        `<td class="res-pos${isTop3 && isRaceLike ? ' top3' : ''}">${r.pos}</td>`,
        deltaCellHTML,
        `<td><div class="res-driver">
            <span class="res-driver-number" style="color:${teamColor}">${r.number ? '#' + r.number : ''}</span>
            ${mobileLogo}
            <span class="driver-fullname">${driverNameDisplay}</span>
            <span class="driver-lastname">${resolveDriverCode(r.driver, ctx.drivers) || driverName}</span>
        </div></td>`,
        `<td class="res-team-cell"><div class="res-team">${teamLogo}${team.label ?? ''}</div></td>`,
        isPractice ? `<td class="res-time">${r.lapTime ?? '—'}</td>` : '',
        isPractice ? `<td class="res-laps">${r.laps ?? '—'}</td>` : '',
        !isRaceLike && !isPractice ? `<td class="res-time">${r.lapTime ?? '—'}</td>` : '',
        isSprintRace ? `<td class="res-laps">${r.laps ?? '—'}</td>` : '',
        isRaceLike ? `<td class="res-time">${r.time ?? '—'}</td>` : '',
        isRaceLike ? `<td class="res-time${r.fastestLap ? ' is-fastest' : ''}">${r.bestLap ?? '—'}</td>` : '',
        isRaceLike ? `<td class="res-pts">${r.pts ?? 0}</td>` : '',
    ].filter(Boolean).join('');

    return `<tr${rowClass}>${cells}</tr>`;
}

// ── Track & tyre data (from circuits.json characteristics only) ───────────

function renderTrackData(gp, ctx) {
    const container = document.getElementById('raceweekend-card');
    const { circuit } = getGpLocation(gp, ctx);
    if (!container || !circuit?.characteristics) { container?.closest('section')?.style.setProperty('display', 'none'); return; }

    const c = circuit.characteristics;
    const ratingRow = (label, value) => {
        const segs = Array.from({ length: 5 }, (_, i) => (i + 1) * 20 <= (value ?? 0)
            ? '<span class="rwd-seg is-filled"></span>' : '<span class="rwd-seg"></span>').join('');
        return `<div class="rwd-rating-row"><span class="rwd-rating-label">${label}</span><div class="rwd-rating-bar">${segs}</div></div>`;
    };

    container.innerHTML = `
        <div class="rwd-headline">
            <span class="rwd-headline-label">Track Type</span>
            <span class="rwd-headline-value">${c.trackType ?? '—'}</span>
        </div>
        <div class="rwd-grid">
            <div>
                <p class="rwd-col-title">Track Characteristics</p>
                <div class="rwd-ratings">
                    ${ratingRow('Downforce', c.downforce)}
                    ${ratingRow('Overtaking', c.overtaking)}
                    ${ratingRow('Tyre Degradation', c.tyreDeg)}
                </div>
            </div>
        </div>`;
}


function initScrollReveal() {
    const el = document.getElementById('session-tabs-container');
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.1 });

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('in-view');
    } else {
        observer.observe(el);
    }
}

function hideUnsourcedSections() {
    document.getElementById('section-gp-info')?.style.setProperty('display', 'none');
    document.getElementById('section-circuit-history')?.style.setProperty('display', 'none');
    document.getElementById('history-card')?.closest('section')?.style.setProperty('display', 'none');
}