// Local mirror of backend state: { DriverList, TimingData, TimingAppData }
let state = {};

// Same recursive merge as the backend's mergeState(). Works whether
// "data" arrives as a partial delta or a full topic object — newer
// keys always overwrite older ones, so the result converges either way.
function mergeState(target, patch) {
    if (patch === null || typeof patch !== 'object') return patch;
    if (target === null || typeof target !== 'object') {
        target = Array.isArray(patch) ? [] : {};
    }
    for (const key of Object.keys(patch)) {
        target[key] = mergeState(target[key], patch[key]);
    }
    return target;
}

// ── TEAM ID → LOGO FILENAME (same map used in race.js) ───────────────────
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

// Tyre compound → PNG filename in img/tyres/
const COMPOUND_META = {
    SOFT:         { code: 'S', file: 'soft' },
    MEDIUM:       { code: 'M', file: 'medium' },
    HARD:         { code: 'H', file: 'hard' },
    INTERMEDIATE: { code: 'I', file: 'inter' },
    WET:          { code: 'W', file: 'wet' },
};

// Compound icon: uses the pre-made PNGs in img/tyres/ (soft/medium/hard/
// inter/wet.png). Falls back to a plain letter badge if the compound isn't
// recognized (shouldn't normally happen, but keeps the row from breaking).
function tyreIconHTML(meta) {
    if (!meta.file) {
        return `<span class="tyre-icon-fallback">${meta.code}</span>`;
    }
    return `<img class="tyre-icon-img" src="./img/tyres/${meta.file}.png" alt="${meta.code}" width="20" height="20">`;
}

function connect() {
    const ws = new WebSocket('ws://localhost:8080');
    const statusEl = document.getElementById('live-status');

    ws.onopen = () => {
        statusEl.textContent = 'Live';
        statusEl.className = 'live-status live-status--on';
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot') {
            state = msg.state || {};
        } else if (msg.type === 'update') {
            state[msg.topic] = mergeState(state[msg.topic] || {}, msg.data);
        }
        render();
    };

    ws.onclose = () => {
        statusEl.textContent = 'Reconnecting…';
        statusEl.className = 'live-status live-status--off';
        setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
}

// --- Rendering helpers ---

// Full surname, uppercase (e.g. "HAMILTON"). Falls back to Tla/number if
// the feed hasn't sent LastName yet for this driver.
function driverSurname(driver, num) {
    if (driver.LastName) return driver.LastName.toUpperCase();
    if (driver.FullName) return driver.FullName.trim().split(' ').pop().toUpperCase();
    return driver.Tla || num;
}

function teamLogoHTML(teamName) {
    const logoFile = TEAM_LOGO_MAP[teamName];
    return logoFile
        ? `<img class="res-team-logo" src="./img/teams/${logoFile}.png" alt="${teamName}">`
        : `<span class="res-team-logo-placeholder"></span>`;
}

// Builds the full stint-by-stint tyre history for a driver, oldest first.
// Flat structure on purpose — icon, laps text, and separator arrows are all
// direct children of one single flex container (.tyre-history), the same
// pattern .res-team uses for the logo+surname pair. No nested inline-flex
// wrappers per chip: that nesting (each chip and each separator as its own
// separate flex formatting context) is what caused the vertical drift no
// matter how the arrow itself was measured or centered.
function tyreHistoryHTML(appLine) {
    if (!appLine || !appLine.Stints) return '<span class="results-date">–</span>';

    const keys = Object.keys(appLine.Stints).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) return '<span class="results-date">–</span>';

    const parts = [];
    keys.forEach((key, i) => {
        if (i > 0) parts.push(tyreSepArrowSvg());
        const stint = appLine.Stints[key];
        const meta = COMPOUND_META[stint.Compound] || { code: '?', file: null };
        const laps = stint.TotalLaps ?? '?';
        parts.push(tyreIconHTML(meta));
        parts.push(`<span class="tyre-laps">${laps}</span>`);
    });

    return `<span class="tyre-history">${parts.join('')}</span>`;
}

// Same chevron shape as deltaArrowSvg, just rotated 90deg to point right
// instead of up/down — keeps the two arrow styles visually consistent.
function tyreSepArrowSvg() {
    return `<svg class="tyre-sep-arrow" viewBox="0 0 24 24" style="transform:rotate(90deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Same chevron icon used for the delta indicator in race.js
function deltaArrowSvg(direction) {
    const rotate = direction === 'down' ? 180 : 0;
    return `<svg class="res-delta-arrow" viewBox="0 0 24 24" style="transform:rotate(${rotate}deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Live equivalent of race.js's gridDeltaHtml: compares the starting grid
// position (GridPos, from TimingAppData) against the current live position.
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

// Same lap time parser used in race.js: "1:18.518" or "18.518" → ms
function lapTimeToMs(t) {
    if (!t || typeof t !== 'string') return null;
    const clean = t.trim();
    const parts = clean.split(':');
    if (parts.length === 2) {
        const mins = parseInt(parts[0], 10);
        const secs = parseFloat(parts[1]);
        if (isNaN(mins) || isNaN(secs)) return null;
        return (mins * 60 + secs) * 1000;
    }
    const secs = parseFloat(clean);
    return isNaN(secs) ? null : secs * 1000;
}

function render() {
    const timingLines = (state.TimingData && state.TimingData.Lines) || {};
    const driverList = state.DriverList || {};
    const appLines = (state.TimingAppData && state.TimingAppData.Lines) || {};

    const rows = Object.keys(timingLines)
        .map((num) => ({ num, line: timingLines[num] }))
        .filter((r) => r.line)
        .sort((a, b) => (Number(a.line.Line) || 99) - (Number(b.line.Line) || 99));

    // Find the session's fastest BestLapTime across all drivers, to highlight it purple.
    let sessionBestMs = Infinity;
    for (const { line } of rows) {
        const ms = lapTimeToMs(line.BestLapTime && line.BestLapTime.Value);
        if (ms != null && ms < sessionBestMs) sessionBestMs = ms;
    }

    const tbody = document.getElementById('live-rows');

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="results-empty">Waiting for session data…</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(({ num, line }, i) => {
        const driver = driverList[num] || {};
        const appLine = appLines[num];
        const lastLap = line.LastLapTime || {};
        const posNum = i + 1;
        const isTop3 = posNum <= 3;

        const lapClass = lastLap.OverallFastest ? 'live-lap--fastest'
            : lastLap.PersonalFastest ? 'live-lap--pb' : 'live-lap--normal';

        const bestLap = line.BestLapTime || {};
        const bestMs = lapTimeToMs(bestLap.Value);
        const bestLapClass = (bestMs != null && bestMs === sessionBestMs) ? 'live-lap--fastest' : '';

        const statusTag = line.Retired ? ''
            : line.InPit ? '<span class="live-status-inpit">IN PIT</span>'
            : line.PitOut ? '<span class="live-status-outlap">OUT LAP</span>'
            : 'RACING';

        return `
            <tr class="results-row ${line.Retired ? 'live-row--retired' : ''}">
                <td class="res-pos${isTop3 ? ' top3' : ''}">${line.Position ?? posNum}</td>
                <td class="res-delta-cell">${gridDeltaHtml(line.Position ?? posNum, appLine && appLine.GridPos)}</td>
                <td>
                    <span class="res-team">
                        ${teamLogoHTML(driver.TeamName)}
                        ${driverSurname(driver, num)}
                    </span>
                </td>
                <td class="results-date">${posNum === 1 ? 'LEADER' : (line.GapToLeader ?? '')}</td>
                <td class="results-date">${posNum === 1 ? 'LEADER' : ((line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value) ?? '')}</td>
                <td class="${lapClass}">${lastLap.Value ?? '-'}</td>
                <td class="${bestLapClass}">${bestLap.Value ?? '-'}</td>
                <td>${tyreHistoryHTML(appLines[num])}</td>
                <td>${line.Retired ? 'RETIRED' : statusTag}</td>
            </tr>
        `;
    }).join('');
}

connect();