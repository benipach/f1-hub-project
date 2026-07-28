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

// ── GP → CIRCUIT MAPPING (same map used in race.js) ───────────────────────
const CIRCUIT_MAP = {
    'australian-gp':     'albert-park-circuit',
    'chinese-gp':        'shanghai-international-circuit',
    'japanese-gp':       'suzuka-international-racing-course',
    'bahrain-gp':        'bahrain-internatinal-circuit',
    'saudi-arabian-gp':  'jeddah-corniche-circuit',
    'miami-gp':          'miami-international-autodrome',
    'canadian-gp':       'circuit-gilles-villeneuve',
    'monaco-gp':         'circuit-de-monaco',
    'barcelona-gp':      'circuit-de-barcelona-catalunya',
    'austrian-gp':       'red-bull-ring',
    'british-gp':        'silverstone-circuit',
    'belgian-gp':        'circuit-de-spa-francorchamps',
    'hungarian-gp':      'hungaroring',
    'dutch-gp':          'circuit-zandvoort',
    'italian-gp':        'autodromo-nazionale-di-monza',
    'spanish-gp':        'madring',
    'azerbaijan-gp':     'baku-city-circuit',
    'singapore-gp':      'marina-bay-street-circuit',
    'united-states-gp':  'cota',
    'mexican-gp':        'hermanos-rodriguez',
    'brazilian-gp':      'autodromo-jose-carlos-pace',
    'las-vegas-gp':      'las-vegas-strip-circuit',
    'qatar-gp':          'lusail-international-circuit',
    'abu-dhabi-gp':      'yas-marina-circuit',
};

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

// ── TEAM ID → COLOR (from TEAMS in the site's shared color config) ───────
const TEAM_COLOR_MAP = {
    'Mercedes':        'rgb(43, 255, 219)',
    'Ferrari':         'rgb(255, 0, 25)',
    'McLaren':         'rgb(255, 127, 0)',
    'Red Bull':        'rgb(34, 71, 122)',
    'Red Bull Racing': 'rgb(34, 71, 122)',
    'Aston Martin':    'rgb(34, 153, 113)',
    'Alpine':          'rgb(0, 111, 186)',
    'Williams':        'rgb(28, 122, 255)',
    'Racing Bulls':    'rgb(102, 125, 255)',
    'Haas':            'rgb(222, 225, 226)',
    'Haas F1 Team':    'rgb(222, 225, 226)',
    'Audi':            'rgb(255, 46, 46)',
    'Cadillac':        'rgb(170, 170, 173)',
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
    if (!meta.file && !meta.code) {
        // Compound genuinely unknown yet (e.g. the feed hasn't sent it for
        // this stint) — a neutral dot instead of a jarring "?".
        return `<span class="tyre-icon-unknown"></span>`;
    }
    if (!meta.file) {
        return `<span class="tyre-icon-fallback">${meta.code}</span>`;
    }
    return `<img class="tyre-icon-img" src="./img/tyres/${meta.file}.png" alt="${meta.code}" width="20" height="20">`;
}

// The real feed sends lapped-car gaps as e.g. "1 L" (no "+", abbreviated
// "L"). Expand that to "+1 LAP" / "+2 LAPS" for readability; anything else
// (normal "+12.345" gaps) passes through unchanged.
function formatGap(value) {
    if (!value) return value;
    const match = /^\+?\s*(\d+)\s*L$/i.exec(value.trim());
    if (!match) return value;
    const laps = Number(match[1]);
    return `+${laps} Lap${laps === 1 ? '' : 's'}`;
}

function getNestedValue(target, pathSegments) {
    let current = target;
    for (const segment of pathSegments) {
        if (current === null || current === undefined) return null;
        if (typeof current !== 'object' && typeof current !== 'function') return null;
        if (!(segment in current)) return null;
        current = current[segment];
    }
    return current;
}

function normalizeTimeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'Value' in value) return value.Value;
    return null;
}

function getSectorTimeInfo(line, sectorIndex) {
    const candidates = [
        [`Sector${sectorIndex}Time`],
        [`Sector${sectorIndex}`],
        [`LastLapTime`, `Sector${sectorIndex}Time`],
        [`LastLapTime`, `Sector${sectorIndex}`],
        ['Sectors', String(sectorIndex), 'Value'],
        ['Sectors', sectorIndex, 'Value'],
        ['LastLapTime', 'Sectors', String(sectorIndex), 'Value'],
        ['LastLapTime', 'Sectors', sectorIndex, 'Value'],
    ];

    let value = null;
    let className = '';

    for (const path of candidates) {
        const node = getNestedValue(line, path);
        const normalized = normalizeTimeValue(node);
        if (normalized !== null && value === null) value = normalized;
        if (node && typeof node === 'object') {
            if (node.OverallFastest) {
                className = 'live-lap--fastest';
                break;
            }
            if (node.PersonalFastest && className !== 'live-lap--fastest') {
                className = 'live-lap--pb';
            }
        }
    }

    if (value === null) return null;
    if (!className) className = 'live-lap--normal';
    return { value, className };
}

function getSectorTimes(line) {
    return [1, 2, 3].map((sectorIndex) => getSectorTimeInfo(line, sectorIndex));
}

function connect() {
    const ws = new WebSocket('ws://localhost:8080');
    const statusEl = document.getElementById('live-status');

    ws.onopen = () => {
        if (statusEl) {
            statusEl.textContent = 'Live';
            statusEl.className = 'live-status live-status--on';
        }
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
        if (statusEl) {
            statusEl.textContent = 'Reconnecting…';
            statusEl.className = 'live-status live-status--off';
        }
        setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
}

// --- Rendering helpers ---

// ── GP → FLAG EMOJI (rendered as an image by twemoji.js, same as the rest
// of the site — the span just needs the raw unicode flag character) ──────
const FLAG_EMOJI_MAP = {
    'australian-gp':    '🇦🇺',
    'chinese-gp':        '🇨🇳',
    'japanese-gp':       '🇯🇵',
    'bahrain-gp':        '🇧🇭',
    'saudi-arabian-gp':  '🇸🇦',
    'miami-gp':          '🇺🇸',
    'canadian-gp':       '🇨🇦',
    'monaco-gp':         '🇲🇨',
    'barcelona-gp':      '🇪🇸',
    'austrian-gp':       '🇦🇹',
    'british-gp':        '🇬🇧',
    'belgian-gp':        '🇧🇪',
    'hungarian-gp':      '🇭🇺',
    'dutch-gp':          '🇳🇱',
    'italian-gp':        '🇮🇹',
    'spanish-gp':        '🇪🇸',
    'azerbaijan-gp':     '🇦🇿',
    'singapore-gp':      '🇸🇬',
    'united-states-gp':  '🇺🇸',
    'mexican-gp':        '🇲🇽',
    'brazilian-gp':      '🇧🇷',
    'las-vegas-gp':      '🇺🇸',
    'qatar-gp':          '🇶🇦',
    'abu-dhabi-gp':      '🇦🇪',
};

// Fills in the GP name (with country flag prefixed, same text node) in
// the hero row — same markup/classes as index.html's hero, so it reuses
// that exact look.
function updateGPName() {
    const nameEl = document.getElementById('hero-gp-name');
    // Fullscreen Map View header — same data, separate element (only
    // renders while #live-map-view-content.is-fullscreen is active).
    const fsNameEl = document.getElementById('mapview-fs-name');
    if (!nameEl) return;

    const gp = state.CurrentGP;
    if (!gp || !gp.name) {
        nameEl.textContent = 'Loading Grand Prix…';
        if (fsNameEl) fsNameEl.textContent = 'Loading Grand Prix…';
        return;
    }

    const flag = FLAG_EMOJI_MAP[gp.slug];
    const label = flag ? `${flag} ${gp.name}` : gp.name;

    if (nameEl.textContent !== label) {
        nameEl.textContent = label;
        // twemoji.js is already loaded site-wide (see the <script> tag
        // in live.html) — this swaps the raw emoji character for its
        // image, same as every other flag on the site.
        if (window.twemoji) window.twemoji.parse(nameEl);
    }

    if (fsNameEl && fsNameEl.textContent !== label) {
        fsNameEl.textContent = label;
        if (window.twemoji) window.twemoji.parse(fsNameEl);
    }
}

// Circuit map for the Map View section. Just swaps the layout image when
// the GP changes (not on every WebSocket update).
let lastCircuitId = null;
function updateCircuitMap() {
    const img = document.getElementById('circuit-map-img');
    if (!img) return;

    const slug = state.CurrentGP && state.CurrentGP.slug;
    const circuitId = slug ? CIRCUIT_MAP[slug] : null;
    if (!circuitId || circuitId === lastCircuitId) return;
    lastCircuitId = circuitId;

    img.src = `./img/circuits/${circuitId}-layout.png`;
}

// Full driver name, preserving the feed's formatting when available.
// Examples: "Carlos SAINZ", "Max Verstappen".
function driverFullName(driver, num) {
    if (driver.FullName) return driver.FullName.trim();
    if (driver.LastName) return driver.LastName.toUpperCase();
    return driver.Tla || num;
}

// Full surname, uppercase (e.g. "HAMILTON"). Falls back to Tla/number if
// the feed hasn't sent LastName yet for this driver.
function driverSurname(driver, num) {
    if (driver.LastName) return driver.LastName.toUpperCase();
    if (driver.FullName) return driver.FullName.trim().split(' ').pop().toUpperCase();
    return driver.Tla || num;
}

// 3-letter driver code for the compact Map View table (e.g. "HAM", "VER").
// Prefers the feed's own Tla if present; otherwise takes the first 3
// letters of whatever driverSurname() resolves to.
function driverCode(driver, num) {
    if (driver.Tla) return driver.Tla.toUpperCase();
    return driverSurname(driver, num).slice(0, 3);
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
        const meta = COMPOUND_META[stint.Compound] || { code: stint.Compound ? '?' : null, file: null };
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

// ── WEATHER (hero card, top of the page) ─────────────────────────────────
// Card markup/CSS is identical to race.js's session-weather-card; only the
// data source differs: race.js reads pre-recorded session weather from
// season2026.json, this reads live WeatherData pushed over the WebSocket.
function formatWeatherNumber(value, suffix = '') {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace('.0', '')}${suffix}` : '—';
}

function compassLabel(deg) {
    const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    return points[idx];
}

function renderSessionWeatherCard(weather) {
    const rainfall = Number(weather.rainfall || 0) > 0;
    const air      = formatWeatherNumber(weather.air_temperature, '°');
    const track    = formatWeatherNumber(weather.track_temperature, '°');
    const humidity = formatWeatherNumber(weather.humidity, '%');
    const wind     = formatWeatherNumber(Number(weather.wind_speed) * 3.6, ' km/h');
    const hasWindDir  = Number.isFinite(Number(weather.wind_direction));
    const windDirDeg  = hasWindDir ? Number(weather.wind_direction) : 0;

    const compassSvg = `
        <svg class="swc-wind-compass-icon" viewBox="0 0 24 24" style="transform:rotate(${windDirDeg}deg)" aria-hidden="true">
            <line x1="12" y1="22.5" x2="12" y2="3.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M3.5 11 L12 2 L20.5 11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

    return `
        <div class="session-weather-card">
            <div class="swc-condition ${rainfall ? 'is-wet' : 'is-dry'}">
                <span class="swc-condition-icon">${rainfall ? '🌧️' : '☀️'}</span>
                <div class="swc-condition-text">
                    <span class="swc-condition-label">${rainfall ? 'Wet' : 'Dry'}</span>
                    <span class="swc-condition-sub">Conditions</span>
                </div>
            </div>
            <div class="swc-stats">
                <div class="swc-stat">
                    <span class="swc-stat-value">${air}</span>
                    <span class="swc-stat-label">Air Temp</span>
                </div>
                <div class="swc-stat">
                    <span class="swc-stat-value">${track}</span>
                    <span class="swc-stat-label">Track Temp</span>
                </div>
                <div class="swc-stat">
                    <span class="swc-stat-value">${humidity}</span>
                    <span class="swc-stat-label">Humidity</span>
                </div>
                <div class="swc-stat">
                    <span class="swc-stat-value">${wind}</span>
                    <span class="swc-stat-label">Wind Speed</span>
                </div>
                ${hasWindDir ? `
                <div class="swc-stat">
                    <span class="swc-stat-value swc-wind-dir-value">
                        ${compassLabel(windDirDeg)}
                        ${compassSvg}
                    </span>
                    <span class="swc-stat-label">Wind Dir</span>
                </div>` : ''}
            </div>
        </div>`;
}

// state.WeatherData is expected in the F1 SignalR feed's native shape
// (AirTemp, TrackTemp, Humidity, WindSpeed, WindDirection, Rainfall — all
// strings). Normalized here to the lowercase/numeric shape renderSessionWeatherCard
// expects, matching what the future backend adapter will forward as-is.
function getLiveWeather() {
    const w = state.WeatherData;
    if (!w) return null;
    return {
        air_temperature:  w.AirTemp,
        track_temperature: w.TrackTemp,
        humidity:         w.Humidity,
        wind_speed:       Number(w.WindSpeed) / 3.6, // feed sends km/h; renderer expects m/s
        wind_direction:   w.WindDirection,
        rainfall:         w.Rainfall,
    };
}

function renderWeatherInto(containerId, weather) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!weather) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = '';
    container.innerHTML = renderSessionWeatherCard(weather);
    if (window.twemoji) window.twemoji.parse(container);
}

function updateLiveWeather() {
    const weather = getLiveWeather();
    renderWeatherInto('live-weather', weather);
    renderWeatherInto('mapview-fs-weather', weather);
}

function render() {
    updateGPName();
    updateLiveWeather();
    updateCircuitMap();

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
    const tbody2 = document.getElementById('live-rows-2');

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="results-empty">Waiting for session data…</td></tr>';
        if (tbody2) tbody2.innerHTML = '<tr><td colspan="9" class="results-empty">Waiting for session data…</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(({ num, line }, i) => {
        const driver = driverList[num] || {};
        const appLine = appLines[num];
        const lastLap = line.LastLapTime || {};
        const [sector1, sector2, sector3] = getSectorTimes(line);
        const posNum = i + 1;
        const isTop3 = posNum <= 3;

        const lapClass = lastLap.OverallFastest ? 'live-lap--fastest'
            : lastLap.PersonalFastest ? 'live-lap--pb' : 'live-lap--normal';

        const bestLap = line.BestLapTime || {};
        const bestMs = lapTimeToMs(bestLap.Value);
        const bestLapClass = (bestMs != null && bestMs === sessionBestMs) ? 'live-lap--fastest' : '';

        const teamColor = TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)';
        const statusTag = line.Retired ? ''
            : line.InPit ? `<span class="live-status-team" style="color:${teamColor}">In pit</span>`
            : line.PitOut ? `<span class="live-status-team" style="color:${teamColor}">Out lap</span>`
            : 'Racing';

        return `
            <tr class="results-row ${line.Retired ? 'live-row--retired' : ''}">
                <td class="res-pos${isTop3 ? ' top3' : ''}">${line.Position ?? posNum}</td>
                <td class="res-delta-cell">${gridDeltaHtml(line.Position ?? posNum, appLine && appLine.GridPos)}</td>
                <td>
                    <span class="res-team">
                        ${teamLogoHTML(driver.TeamName)}
                        ${driverFullName(driver, num)}
                    </span>
                </td>
                <td class="results-date">${posNum === 1 ? 'Leader' : formatGap(line.GapToLeader) ?? ''}</td>
                <td class="results-date">${posNum === 1 ? 'Leader' : formatGap(line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value) ?? ''}</td>
                <td class="live-sector-cell ${sector1?.className || ''}">${sector1?.value ?? '-'}</td>
                <td class="live-sector-cell ${sector2?.className || ''}">${sector2?.value ?? '-'}</td>
                <td class="live-sector-cell ${sector3?.className || ''}">${sector3?.value ?? '-'}</td>
                <td class="${lapClass}">${lastLap.Value ?? '-'}</td>
                <td class="${bestLapClass}">${bestLap.Value ?? '-'}</td>
                <td>${tyreHistoryHTML(appLines[num])}</td>
                <td>${line.Retired ? 'RETIRED' : statusTag}</td>
            </tr>
        `;
    }).join('');

    // Map View table: Pos, Delta, Driver (3-letter code), Interval, Last
    // Lap, Tyres — Gap/Best Lap/Status stay dropped for this compact view.
    if (tbody2) {
        tbody2.innerHTML = rows.map(({ num, line }, i) => {
            const driver = driverList[num] || {};
            const appLine = appLines[num];
            const lastLap = line.LastLapTime || {};
            const [sector1, sector2, sector3] = getSectorTimes(line);
            const posNum = i + 1;
            const isTop3 = posNum <= 3;

            const lapClass = lastLap.OverallFastest ? 'live-lap--fastest'
                : lastLap.PersonalFastest ? 'live-lap--pb' : 'live-lap--normal';

            const bestLap = line.BestLapTime || {};
            const bestMs = lapTimeToMs(bestLap.Value);
            const fastestRowClass = (bestMs != null && bestMs === sessionBestMs) ? ' live-row--fastest-map' : '';

            const teamColor = TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)';

            return `
                <tr class="results-row ${line.Retired ? 'live-row--retired' : ''}${fastestRowClass}">
                    <td class="res-pos${isTop3 ? ' top3' : ''}">${line.Position ?? posNum}</td>
                    <td class="res-delta-cell">${gridDeltaHtml(line.Position ?? posNum, appLine && appLine.GridPos)}</td>
                    <td>
                        <span class="res-team">
                            ${teamLogoHTML(driver.TeamName)}
                            ${driverSurname(driver, num)}
                        </span>
                    </td>
                    <td class="results-date">${line.InPit ? `<span class="live-status-team" style="color:${teamColor}">In pit</span>` : (posNum === 1 ? 'Leader' : formatGap(line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value) ?? '')}</td>
                    <td class="live-sector-cell ${sector1?.className || ''}">${sector1?.value ?? '-'}</td>
                    <td class="live-sector-cell ${sector2?.className || ''}">${sector2?.value ?? '-'}</td>
                    <td class="live-sector-cell ${sector3?.className || ''}">${sector3?.value ?? '-'}</td>
                    <td class="${lapClass}">${lastLap.Value ?? '-'}</td>
                    <td>${tyreHistoryHTML(appLines[num])}</td>
                </tr>
            `;
        }).join('');
    }

    syncMapHeight();
    updatePositionOverlay();
}

// Rough bounding box for X/Y, expanded as data comes in. Not calibrated
// per circuit yet — good enough tonight to confirm dots move in roughly
// the right place; a real per-circuit calibration is a "polish later" job.
const posBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

// Teams whose dot needs white text instead of the default black
// (their team color reads better with a light label on top).
const WHITE_TEXT_TEAMS = new Set(['Red Bull', 'Red Bull Racing', 'Alpine', 'McLaren', 'Audi', 'Ferrari', 'Williams', 'Racing Bulls', 'Aston Martin', 'Cadillac']);

function updatePositionOverlay() {
    const overlay = document.getElementById('circuit-position-overlay');
    if (!overlay) return;

    const posArray = state['Position.z'] && state['Position.z'].Position;
    const latest = posArray && posArray[posArray.length - 1];
    const entries = latest && latest.Entries;
    if (!entries) return;

    for (const num of Object.keys(entries)) {
        const { X, Y } = entries[num];
        if (typeof X !== 'number' || typeof Y !== 'number') continue;
        if (X < posBounds.minX) posBounds.minX = X;
        if (X > posBounds.maxX) posBounds.maxX = X;
        if (Y < posBounds.minY) posBounds.minY = Y;
        if (Y > posBounds.maxY) posBounds.maxY = Y;
    }

    const driverList = state.DriverList || {};
    const spanX = posBounds.maxX - posBounds.minX || 1;
    const spanY = posBounds.maxY - posBounds.minY || 1;

    overlay.innerHTML = Object.keys(entries).map((num) => {
        const { X, Y, Status } = entries[num];
        if (typeof X !== 'number' || typeof Y !== 'number' || Status === 'OFF') return '';

        const pctX = ((X - posBounds.minX) / spanX) * 100;
        // F1's Y axis grows upward, CSS grows downward — flip it.
        const pctY = 100 - ((Y - posBounds.minY) / spanY) * 100;

        const driver = driverList[num] || {};
        const teamColor = TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)';
        const textColor = WHITE_TEXT_TEAMS.has(driver.TeamName) ? '#fff' : '#000';
        return `<div class="pos-dot" style="left:${pctX}%; top:${pctY}%; background:${teamColor}; color:${textColor};"><span class="pos-dot-label">${driverCode(driver, num)}</span></div>`;
    }).join('');
}

// Matches the circuit map container's height to the Map View table's real
// rendered height — CSS align-items:stretch alone isn't reliable here
// because the map image sizes itself by its own aspect ratio, not by the
// table's content. Skipped below the 700px breakpoint, where the two
// stack vertically (see live.css) and a forced height would just leave
// empty space instead of matching anything.
function syncMapHeight() {
    const tableWrap = document.querySelector('.map-view-content .results-table-wrap');
    const mapWrap = document.getElementById('circuit-map-wrap');
    if (!tableWrap || !mapWrap) return;

    if (window.innerWidth <= 700) {
        mapWrap.style.height = '';
        return;
    }
    mapWrap.style.height = `${tableWrap.offsetHeight}px`;
}

window.addEventListener('resize', syncMapHeight);

// ── FULLSCREEN TOGGLE (tabla principal / tabla reducida + mapa) ────────────
// No reparenta nada del DOM — solo agranda el contenedor con position:fixed
// (misma capa que .track-zoom-modal en race.css, z-index 999), así que
// getElementById('live-rows'), getElementById('live-rows-2'), etc. siguen
// funcionando igual estén o no en pantalla completa.
function initFullscreenButtons() {
    const targets = [
        { btnId: 'live-table-fullscreen-btn', wrapId: 'live-table-wrap' },
        { btnId: 'live-map-fullscreen-btn', wrapId: 'live-map-view-content' },
    ];

    function setFullscreen(wrap, btn, on) {
        wrap.classList.toggle('is-fullscreen', on);
        btn.classList.toggle('is-fullscreen', on);
        btn.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
        document.body.style.overflow = document.querySelector('.is-fullscreen') ? 'hidden' : '';
        syncMapHeight();
    }

    targets.forEach(({ btnId, wrapId }) => {
        const btn = document.getElementById(btnId);
        const wrap = document.getElementById(wrapId);
        if (!btn || !wrap) return;

        btn.addEventListener('click', () => {
            setFullscreen(wrap, btn, !wrap.classList.contains('is-fullscreen'));
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        targets.forEach(({ btnId, wrapId }) => {
            const btn = document.getElementById(btnId);
            const wrap = document.getElementById(wrapId);
            if (wrap && wrap.classList.contains('is-fullscreen')) setFullscreen(wrap, btn, false);
        });
    });
}

initFullscreenButtons();
connect();