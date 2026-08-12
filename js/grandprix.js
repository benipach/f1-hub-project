// ── GP → CIRCUIT MAPPING ──────────────────────────────────────────
const CIRCUIT_MAP = {
    'australian-gp':          'albert-park-circuit',
    'chinese-gp':             'shanghai-international-circuit',
    'japanese-gp':            'suzuka-international-racing-course',
    'bahrain-gp':             'bahrain-internatinal-circuit',
    'saudi-arabian-gp':       'jeddah-corniche-circuit',
    'miami-gp':               'miami-international-autodrome',
    'canadian-gp':            'circuit-gilles-villeneuve',
    'monaco-gp':              'circuit-de-monaco',
    'barcelona-gp':           'circuit-de-barcelona-catalunya',
    'austrian-gp':            'red-bull-ring',
    'british-gp':             'silverstone-circuit',
    'belgian-gp':             'circuit-de-spa-francorchamps',
    'hungarian-gp':           'hungaroring',
    'dutch-gp':               'circuit-zandvoort',
    'italian-gp':             'autodromo-nazionale-di-monza',
    'spanish-gp':             'madring',
    'azerbaijan-gp':          'baku-city-circuit',
    'bahrain-gp-in-malaysia': 'sepang-international-circuit',
    'singapore-gp':           'marina-bay-street-circuit',
    'united-states-gp':       'cota',
    'mexican-gp':             'hermanos-rodriguez',
    'brazilian-gp':           'autodromo-jose-carlos-pace',
    'las-vegas-gp':           'las-vegas-strip-circuit',
    'qatar-gp':               'lusail-international-circuit',
    'abu-dhabi-gp':           'yas-marina-circuit',
};

// ── CIRCUIT → COUNTRY FLAG ────────────────────────────────────────
const CIRCUIT_FLAG_MAP = {
    'albert-park-circuit':                'AU',
    'shanghai-international-circuit':     'CN',
    'suzuka-international-racing-course': 'JP',
    'bahrain-internatinal-circuit':       'BH',
    'jeddah-corniche-circuit':            'SA',
    'miami-international-autodrome':      'US',
    'circuit-gilles-villeneuve':          'CA',
    'circuit-de-monaco':                  'MC',
    'circuit-de-barcelona-catalunya':     'ES',
    'red-bull-ring':                      'AT',
    'silverstone-circuit':                'GB',
    'circuit-de-spa-francorchamps':       'BE',
    'hungaroring':                        'HU',
    'circuit-zandvoort':                  'NL',
    'autodromo-nazionale-di-monza':       'IT',
    'madring':                            'ES',
    'baku-city-circuit':                  'AZ',
    'sepang-international-circuit':       'MY',
    'marina-bay-street-circuit':          'SG',
    'cota':                               'US',
    'hermanos-rodriguez':                 'MX',
    'autodromo-jose-carlos-pace':         'BR',
    'las-vegas-strip-circuit':            'US',
    'lusail-international-circuit':       'QA',
    'yas-marina-circuit':                 'AE',
};

// Convierte un código de país ISO 3166-1 alpha-2 (ej. "AR") a su emoji de bandera
function countryCodeToFlagEmoji(code) {
    if (!code || code.length !== 2) return '';
    return [...code.toUpperCase()]
        .map(c => String.fromCodePoint(127397 + c.charCodeAt(0)))
        .join('');
}

// ── FETCH ─────────────────────────────────────────────────────────
async function loadSeason(base = '.') {
    const res = await fetch(`${base}/data/season2026.json`);
    if (!res.ok) throw new Error(`season2026.json — HTTP ${res.status}`);
    return res.json();
}

async function loadCircuits(base = '.') {
    const res = await fetch(`${base}/data/circuits.json`);
    if (!res.ok) throw new Error(`circuits.json — HTTP ${res.status}`);
    return res.json();
}

async function loadRacesHistory(base = '.') {
    const res = await fetch(`${base}/data/racesHistory.json`);
    if (!res.ok) throw new Error(`racesHistory.json — HTTP ${res.status}`);
    const data = await res.json();
    // Aplana el objeto agrupado por temporada { "1950": [...], "2026": [...] }
    // a un array plano, agregando "year" (numérico) a cada fila.
    const flat = [];
    for (const [year, races] of Object.entries(data.racesHistory || {})) {
        for (const race of races) {
            flat.push({ ...race, year: Number(year) });
        }
    }
    return flat;
}

async function loadGPRecords(base = '.') {
    const res = await fetch(`${base}/data/gpRecords.json`);
    if (!res.ok) throw new Error(`gpRecords.json — HTTP ${res.status}`);
    const data = await res.json();
    return data.gpRecords || {};
}

async function loadDrivers(base = '.') {
    const res = await fetch(`${base}/data/drivers.json`);
    if (!res.ok) throw new Error(`drivers.json — HTTP ${res.status}`);
    const data = await res.json();
    const teamMap = {};
    const natMap  = {};
    const numberMap = {};
    for (const d of data.drivers) {
        const key = `${d.firstName} ${d.lastName}`;
        const entry2026 = d.history?.find(h => h.year === 2026);
        if (entry2026) teamMap[key] = entry2026.teamId;
        if (d.nationality) natMap[key] = d.nationality;
        if (d.number != null) numberMap[key] = d.number;
    }
    return { teamMap, natMap, numberMap };
}

// ── HELPERS ───────────────────────────────────────────────────────
function findNextRace(season) {
    const now = new Date();
    return Object.entries(season).find(([, gp]) => {
        const raceEnd = getSessionEnd(gp, 'race');
        return raceEnd && raceEnd > now && !gp.cancelled;
    });
}

function buildGradient(colors) {
    if (!colors) return '#e8002d';
    return `linear-gradient(135deg, ${colors})`;
}

function parseDate(str) {
    return str ? new Date(str) : null;
}

function getSession(gp, sessionKey) {
    return gp?.sessions?.[sessionKey] || null;
}

function getSessionStart(gp, sessionKey) {
    return parseDate(getSession(gp, sessionKey)?.date);
}

function getSessionEnd(gp, sessionKey) {
    return parseDate(getSession(gp, sessionKey)?.endDate);
}

function getSessionResults(gp, sessionKey) {
    const results = getSession(gp, sessionKey)?.results;
    return Array.isArray(results) ? results : [];
}

function getSessionWeather(gp, sessionKey) {
    const weather = getSession(gp, sessionKey)?.weather;
    return weather && typeof weather === 'object' && !Array.isArray(weather) ? weather : null;
}

function formatRange(start, end) {
    if (!start || !end) return 'TBD';
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
    return `${start.toLocaleTimeString('en-US', opts)} - ${end.toLocaleTimeString('en-US', opts)}`;
}

function formatDate(date) {
    if (!date) return '—';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── RACE PAGE ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const gpId = new URLSearchParams(window.location.search).get('gp');
    if (!gpId) return;

    try {
        const [season, circuits, racesHistory, gpRecords, { teamMap: driverTeams, natMap: driverNats, numberMap: driverNumbers }] = await Promise.all([
            loadSeason('..'),
            loadCircuits('..'),
            loadRacesHistory('..'),
            loadGPRecords('..'),
            loadDrivers('..')
        ]);

        const gp        = season[gpId];
        const circuitId = CIRCUIT_MAP[gpId];
        const circuit   = circuits[circuitId];

        if (!gp) { console.error('GP no encontrado:', gpId); return; }

        // Historia de este Grand Prix puntual (puede estar vacía, ej. un GP nuevo)
        const gpHistoryRows = racesHistory
            .filter(r => r.gpId === gpId)
            .sort((a, b) => b.year - a.year);

        // Historia del circuito que NO pertenece a este mismo GP —
        // ej. el Malaysian GP viejo, para la página de "Bahrain GP in Malaysia"
        const circuitHistoryRows = racesHistory
            .filter(r => r.circuitId === circuitId && r.gpId !== gpId)
            .sort((a, b) => b.year - a.year);

        injectColors(gp.color);
        renderHero(gp, circuit, circuitId, gpHistoryRows);
        renderGPInfo(gp);
        renderSchedule(gp);
        renderRaceWeekendData(circuit);

        // ── Sesiones de práctica libre ──
        renderSessionResult(getSessionResults(gp, 'fp1'), 'fp1-card', 'Free Practice 1', driverTeams, driverNats, driverNumbers);
        renderSessionResult(getSessionResults(gp, 'fp2'), 'fp2-card', 'Free Practice 2', driverTeams, driverNats, driverNumbers);
        renderSessionResult(getSessionResults(gp, 'fp3'), 'fp3-card', 'Free Practice 3', driverTeams, driverNats, driverNumbers);
        // ── Clasificaciones ──
        renderSessionResult(getSessionResults(gp, 'sprintQualy'), 'sprint-qualy-card', 'Sprint Qualifying', driverTeams, driverNats, driverNumbers);
        renderSessionResult(getSessionResults(gp, 'qualifying'), 'qualifying-card', 'Qualifying', driverTeams, driverNats, driverNumbers);
        // ── Carreras ──
        renderRaceResult(getSessionResults(gp, 'sprintRace'), getSessionResults(gp, 'sprintQualy'), 'sprint-race-card', driverTeams, driverNats, driverNumbers);
        renderRaceResult(getSessionResults(gp, 'race'), getSessionResults(gp, 'qualifying'), 'race-card', driverTeams, driverNats, driverNumbers);

        renderWeather(gp);
        renderGPHistory(gpHistoryRows, gpRecords[gpId]);
        renderCircuitHistory(circuitHistoryRows);
        initScrollAnimations();
        initSessionTabs();

        document.title = `F1 Hub | ${gp.name}`;

    } catch (err) {
        console.error('Error cargando GP:', err);
    }
});

// ── COLORES ───────────────────────────────────────────────────────
function injectColors(colors) {
    if (!colors) return;
    const parts = colors.split(',').map(c => c.trim());
    document.documentElement.style.setProperty('--gp-color-a', parts[0] || '#e8002d');

    let gradient;
    if (parts.length === 1)      gradient = parts[0];
    else if (parts.length === 2) gradient = `linear-gradient(135deg, ${parts[0]} 0%, ${parts[0]} 33%, ${parts[1]} 67%, ${parts[1]} 100%)`;
    else if (parts.length === 3) gradient = `linear-gradient(135deg, ${parts[0]} 0%, ${parts[0]} 20%, ${parts[1]} 40%, ${parts[1]} 60%, ${parts[2]} 80%, ${parts[2]} 100%)`;
    else                         gradient = `linear-gradient(90deg, ${colors})`;

    document.documentElement.style.setProperty('--gp-gradient', gradient);
}

// ── GP INFO BANNER ──────────────────────────────────────────────────
// Optional per-GP heads-up notice, driven by season2026.json:
//   "info": { "title": "Race Cancelled", "date": "2026-03-14", "text": "..." }
// "title" and "date" are optional; "date" is when the news broke, not
// today's date. "text" is required for the banner to render.
function renderGPInfo(gp) {
    const section = document.getElementById('section-gp-info');
    if (!section) return;

    const info = gp?.info;
    if (!info?.text) {
        section.style.display = 'none';
        return;
    }

    const titleEl = document.getElementById('gp-info-title');
    if (titleEl) {
        titleEl.textContent = info.title || '';
        titleEl.style.display = info.title ? 'block' : 'none';
    }

    const dateEl = document.getElementById('gp-info-date');
    if (dateEl) {
        const parsed = info.date ? new Date(`${info.date}T00:00:00`) : null;
        const valid = parsed && !isNaN(parsed);
        dateEl.textContent = valid
            ? parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : '';
        dateEl.style.display = valid ? 'inline' : 'none';
    }

    const bodyEl = document.getElementById('gp-info-body');
    if (bodyEl) bodyEl.textContent = info.text;

    section.style.display = 'flex';
}

// ── HERO ─────────────────────────────────────────────────────────
function renderHero(gp, circuit, circuitId, gpHistoryRows = []) {
    const heroImg = document.getElementById('race-hero-img');
    if (heroImg) {
        heroImg.src = `../img/circuits/${circuitId}.png`;
        heroImg.style.display = 'block';
    }

    if (circuit?.name) document.getElementById('hero-circuit-name').textContent = circuit.name;

    const flagBg = document.getElementById('hero-flag-bg');
    if (flagBg) {
        const countryCode = CIRCUIT_FLAG_MAP[circuitId];
        flagBg.textContent = countryCode ? countryCodeToFlagEmoji(countryCode) : '';
    }

    if (gp.name) {
        const heroName = document.getElementById('hero-name');
        const mainName = gp.name.replace(' Grand Prix', '').trim();
        heroName.innerHTML = `${mainName}<span class="race-hero-name-suffix">Grand Prix</span>`;
        // Se eliminaron las líneas que aplicaban el gradiente de color al texto
    }

    if (gp.sprint) {
        const badge = document.getElementById('hero-sprint-badge');
        if (badge) badge.style.display = 'flex';
    }

    const s = circuit?.stats;
    if (s) {
        document.getElementById('stat-length').textContent   = s.length        || '-';
        document.getElementById('stat-laps').textContent     = s.laps          || '-';
        document.getElementById('stat-corners').textContent  = s.turns         || '-';
        document.getElementById('stat-overtake').textContent = s.overtakeZones || '-';
    }

    const firstYear = gpHistoryRows.length
        ? gpHistoryRows[gpHistoryRows.length - 1].year
        : null;
    document.getElementById('stat-first').textContent = firstYear || '-';
}

// ── RACE WEEKEND DATA (pit loss / track characteristics / tyres) ──
const RWD_RATING_LABELS = {
    traction:         'Traction',
    braking:          'Braking',
    tyreStress:       'Tyre Stress',
    asphaltAbrasion:  'Asphalt Abrasion',
    asphaltGrip:      'Asphalt Grip',
    lateral:          'Lateral Load',
    trackEvolution:   'Track Evolution',
};

const RWD_COMPOUND_COLORS = {
    hard:   '#f0f0f0',
    medium: '#f5d13a',
    soft:   '#e8002d',
};

function rwdRatingRowHtml(label, value) {
    const v = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    const segments = Array.from({ length: 5 }, (_, i) =>
        `<span class="rwd-seg ${i < v ? 'is-filled' : ''}"></span>`
    ).join('');
    return `
        <div class="rwd-rating-row">
            <span class="rwd-rating-label">${label}</span>
            <div class="rwd-rating-bar">${segments}</div>
        </div>`;
}

function rwdCompoundHtml(code, name) {
    if (!code) return '';
    const color = RWD_COMPOUND_COLORS[name.toLowerCase()] || '#999';
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return `
        <div class="rwd-compound">
            <div class="rwd-compound-tyre" style="--compound-color:${color}">
                <span class="rwd-compound-code">${code}</span>
            </div>
            <span class="rwd-compound-label">${label}</span>
        </div>`;
}

function rwdPressureRowHtml(label, front, rear, unit) {
    if (front == null && rear == null) return '';
    const fmt = v => (v != null ? `${v}${unit}` : '—');
    return `
        <tr>
            <td class="rwd-press-label">${label}</td>
            <td>${fmt(front)}</td>
            <td>${fmt(rear)}</td>
        </tr>`;
}

function renderRaceWeekendData(circuit) {
    const section   = document.getElementById('section-raceweekend');
    const container = document.getElementById('raceweekend-card');
    if (!section || !container) return;

    const rwd = circuit?.raceWeekendData;
    if (!rwd) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    const ratingsHtml = Object.entries(RWD_RATING_LABELS)
        .filter(([key]) => rwd.ratings?.[key] != null)
        .map(([key, label]) => rwdRatingRowHtml(label, rwd.ratings[key]))
        .join('');

    const compoundsHtml = ['hard', 'medium', 'soft']
        .filter(name => rwd.compounds?.[name])
        .map(name => rwdCompoundHtml(rwd.compounds[name], name))
        .join('');

    const minP   = rwd.tyres?.minStartingPressure       || {};
    const stabP  = rwd.tyres?.stabilizedRunningPressure  || {};
    const camber = rwd.tyres?.eosCamberLimit             || {};

    const pressureRows = [
        rwdPressureRowHtml('Min Starting',        minP.front,   minP.rear,   ' psi'),
        rwdPressureRowHtml('Stabilized Running',  stabP.front,  stabP.rear,  ' psi'),
        rwdPressureRowHtml('EOS Camber Limit',    camber.front, camber.rear, '°'),
    ].join('');

    container.innerHTML = `
        ${rwd.pitStopLoss ? `
        <div class="rwd-headline">
            <span class="rwd-headline-label">Pit Stop Loss</span>
            <span class="rwd-headline-value">${rwd.pitStopLoss}</span>
        </div>` : ''}
        <div class="rwd-grid">
            ${ratingsHtml ? `
            <div class="rwd-col">
                <p class="rwd-col-title">Track Characteristics</p>
                <div class="rwd-ratings">${ratingsHtml}</div>
            </div>` : ''}
            <div class="rwd-col">
                ${compoundsHtml ? `
                <p class="rwd-col-title">Tyre Compounds</p>
                <div class="rwd-compounds">${compoundsHtml}</div>` : ''}
                ${pressureRows ? `
                <p class="rwd-col-title rwd-col-title--spaced">Pressure &amp; Camber</p>
                <div class="rwd-table-wrap">
                    <table class="rwd-press-table">
                        <thead><tr><th></th><th>Front</th><th>Rear</th></tr></thead>
                        <tbody>${pressureRows}</tbody>
                    </table>
                </div>` : ''}
            </div>
        </div>`;
}

// ── TEAM ID → LOGO FILENAME ──────────────────────────────────────
const TEAM_LOGO_MAP = {
    'Mercedes-AMG':    'mercedes-logo',
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
    'Renault':         'renault-logo',
    'Lotus':           'lotus-logo',
    'Brawn GP':        'brawngp-logo',
    'Benetton':        'benetton-logo'
};

// ── TEAM ID → PRIMARY COLOR ──────────────────────────────────────────────
const TEAM_COLOR_MAP = {
    'Mercedes':         '#2BFFDB',
    'Mercedes-AMG':     '#2BFFDB',
    'Ferrari':          '#FF0019',
    'McLaren':          '#FF7F00',
    'Red Bull':         '#22477A',
    'Red Bull Racing':  '#22477A',
    'Aston Martin':     '#229971',
    'Alpine':           '#00B2FF',
    'Williams':         '#1C7AFF',
    'Racing Bulls':     '#667DFF',
    'Haas':             '#DEE1E2',
    'Haas F1 Team':     '#DEE1E2',
    'Audi':             '#FF2E2E',
    'Cadillac':         '#AAAAAD',
};

// ── GRID DELTA HELPERS ───────────────────────────────────────────

// Normaliza nombres para comparar entre qualifying y race
// (maneja tildes, "Jr.", espacios extra, etc.)
function normalizeName(name) {
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
        .replace(/\s+jr\.?$/i, '')                        // quita "Jr."
        .trim()
        .toLowerCase();
}

// Devuelve el nombre completo con el apellido en mayúscula (el nombre de pila queda igual)
function formatDriverName(fullName) {
    if (!fullName) return fullName;
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName.toUpperCase();
    const firstName = parts.slice(0, -1).join(' ');
    const lastName  = parts[parts.length - 1];
    return `${firstName} ${lastName.toUpperCase()}`;
}

// Construye un mapa { nombreNormalizado → posición numérica } desde qualifying
function buildQualiMap(qualifying = []) {
    const map = {};
    for (const entry of qualifying) {
        const posNum = parseInt(entry.pos, 10);
        if (!isNaN(posNum)) {
            map[normalizeName(entry.driver)] = posNum;
        }
    }
    return map;
}

// Ícono de chevron (mismo estilo que la flecha de viento, sin el asta)
function deltaArrowSvg(direction) {
    const rotate = direction === 'down' ? 180 : 0;
    return `<svg class="res-delta-arrow" viewBox="0 0 24 24" style="transform:rotate(${rotate}deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Devuelve el HTML del indicador de delta (flecha o barra)
function gridDeltaHtml(racePos, qualiPos) {
    const raceNum = parseInt(racePos, 10);
    if (isNaN(raceNum) || qualiPos == null) {
        // No hubo qualy (NC en qualy) o no hay dato → sin indicador
        return `<span class="res-delta res-delta--none">—</span>`;
    }

    const delta = qualiPos - raceNum; // positivo = ganó puestos
    if (delta > 0) {
        return `<span class="res-delta res-delta--up">${deltaArrowSvg('up')}${delta}</span>`;
    } else if (delta < 0) {
        return `<span class="res-delta res-delta--down">${deltaArrowSvg('down')}${Math.abs(delta)}</span>`;
    } else {
        return `<span class="res-delta res-delta--same">—</span>`;
    }
}

// ── LAP TIME PARSER / GAP CALCULATOR ────────────────────────────
// Convierte "1:18.518" o "18.518" a milisegundos
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

// Devuelve el string de GAP respecto al líder ("+0.293s", "—" si no aplica)
function calcGap(entries) {
    const leaderMs = lapTimeToMs(entries[0]?.lapTime);
    return entries.map(entry => {
        if (parseInt(entry.pos, 10) === 1 || entry.pos === 1) return 'Leader';
        const ms = lapTimeToMs(entry.lapTime);
        if (ms == null || leaderMs == null) return '—';
        const diff = (ms - leaderMs) / 1000;
        return `+${diff.toFixed(3)}s`;
    });
}

// ── RACE RESULT (Race + Sprint Race) ─────────────────────────────
function renderRaceResult(raceEntries = [], prevSessionEntries = [], containerId, driverTeams = {}, driverNats = {}, driverNumbers = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!raceEntries?.length) {
        container.closest('section')?.style && (container.closest('section').style.display = 'none');
        return;
    }

    const qualiMap = buildQualiMap(prevSessionEntries);
    const hasQuali = Object.keys(qualiMap).length > 0;

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        ${hasQuali ? '<th class="res-delta-col"></th>' : ''}
                        <th>Driver</th>
                        <th class="res-team-col">Team</th>
                        <th class="res-time-col">Time</th>
                        <th class="res-time-col res-bestlap-col">Best Lap</th>
                        <th style="text-align:center">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    ${raceEntries.map(res => {
                        const teamId    = res.team || '';
                        const logoFile  = TEAM_LOGO_MAP[teamId];
                        const teamColor = TEAM_COLOR_MAP[teamId] || 'rgba(255,255,255,0.4)';
                        const driverNum = res.number ?? '';
                        const logoHtml  = logoFile
                            ? `<img class="res-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
                            : `<span class="res-team-logo-placeholder"></span>`;
                        const isDnf  = res.time === 'DNF' || res.time === 'DNS';
                        const dim    = isDnf ? 'opacity:0.4' : '';
                        const posNum = parseInt(res.pos, 10);
                        const isTop3 = posNum >= 1 && posNum <= 3;
                        const qualiPos = qualiMap[normalizeName(res.driver)];
                        const bestLap = res.bestLap || '—';
                        // Same purple as live.html's session-fastest-lap highlight.
                        const isFastestLap = res.fastestLap === true;
                        const bestLapStyle = isFastestLap ? 'color:rgb(176,56,216)' : dim;
                        return `
                            <tr>
                                <td class="res-pos${isTop3 ? ' top3' : ''}" style="${dim}">${res.pos}</td>
                                ${hasQuali ? `<td class="res-delta-cell" style="${dim}">${gridDeltaHtml(res.pos, qualiPos)}</td>` : ''}
                                <td class="res-driver" style="${dim}">
                                    <span class="res-driver-number" style="color:${teamColor}">#${driverNum}</span>
                                    ${logoFile
                                        ? `<img class="res-driver-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
                                        : `<span class="res-driver-team-logo res-team-logo-placeholder"></span>`}
                                    <span class="driver-fullname">${formatDriverName(res.driver)}</span>
                                    <span class="driver-lastname">${res.driver.split(' ').slice(1).join(' ').slice(0, 3).toUpperCase()}</span>
                                </td>
                                <td class="res-team-cell" style="${dim}">
                                    <div class="res-team">
                                        ${logoHtml}
                                        <span class="res-team-name">${teamId || '—'}</span>
                                    </div>
                                </td>
                                <td class="res-time" style="${dim}">${res.time}</td>
                                <td class="res-time res-bestlap" style="${bestLapStyle}">${bestLap}</td>
                                <td class="res-pts" style="${dim}">${res.pts ?? 0}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    if (typeof twemoji !== 'undefined') twemoji.parse(container, { folder: 'svg', ext: '.svg' });
}

// ── SESSION RESULT (FP1/FP2/FP3 + Qualifying + Sprint Qualifying) ─
function renderSessionResult(entries = [], containerId, sessionLabel, driverTeams = {}, driverNats = {}, driverNumbers = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!entries?.length) {
        container.closest('section')?.style && (container.closest('section').style.display = 'none');
        return;
    }

    const gaps = calcGap(entries);
    const isFreePractice = sessionLabel.startsWith('Free Practice');
    const isQualy = sessionLabel === 'Qualifying' || sessionLabel === 'Sprint Qualifying';
    const qPrefix = sessionLabel === 'Sprint Qualifying' ? 'SQ' : 'Q';
    const colspan = 5;

    const qualyStageDivider = (posNum) => {
        if (!isQualy) return '';
        if (posNum === 1) {
            return `<tr class="qualy-divider"><td colspan="${colspan}">${qPrefix}3</td></tr>`;
        }
        if (posNum === 11) {
            return `<tr class="qualy-divider"><td colspan="${colspan}">Eliminated in ${qPrefix}2</td></tr>`;
        }
        if (posNum === 17 && entries.length > 16) {
            return `<tr class="qualy-divider"><td colspan="${colspan}">Eliminated in ${qPrefix}1</td></tr>`;
        }
        return '';
    };

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Driver</th>
                        <th class="res-team-col">Team</th>
                        <th class="res-time-col">Time</th>
                        <th class="res-gap-col">Gap</th>
                        ${isFreePractice ? '<th class="res-laps-col" style="text-align:center">Laps</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${entries.map((res, i) => {
                        const teamId    = res.team || '';
                        const logoFile  = TEAM_LOGO_MAP[teamId];
                        const teamColor = TEAM_COLOR_MAP[teamId] || 'rgba(255,255,255,0.4)';
                        const driverNum = res.number ?? '';
                        const logoHtml  = logoFile
                            ? `<img class="res-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
                            : `<span class="res-team-logo-placeholder"></span>`;
                        const noTime = !res.lapTime || ['DNF', 'DNS', 'NC', 'No time'].includes(res.lapTime);
                        const dim    = noTime ? 'opacity:0.4' : '';
                        const posNum = parseInt(res.pos, 10);
                        const isTop3 = posNum >= 1 && posNum <= 3;
                        const gapStr = gaps[i];
                        return `
                            ${entries.length > 10 ? qualyStageDivider(posNum) : ''}
                            <tr>
                                <td class="res-pos${isTop3 ? ' top3' : ''}" style="${dim}">${res.pos}</td>
                                <td class="res-driver" style="${dim}">
                                    <span class="res-driver-number" style="color:${teamColor}">#${driverNum}</span>
                                    ${logoFile
                                        ? `<img class="res-driver-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
                                        : `<span class="res-driver-team-logo res-team-logo-placeholder"></span>`}
                                    <span class="driver-fullname">${formatDriverName(res.driver)}</span>
                                    <span class="driver-lastname">${res.driver.split(' ').slice(1).join(' ').slice(0, 3).toUpperCase()}</span>
                                </td>
                                <td class="res-team-cell" style="${dim}">
                                    <div class="res-team">
                                        ${logoHtml}
                                        <span class="res-team-name">${teamId || '—'}</span>
                                    </div>
                                </td>
                                <td class="res-time" style="${dim}">${res.lapTime || '—'}</td>
                                <td class="res-gap" style="${dim}">${gapStr}</td>
                                ${isFreePractice ? `<td class="res-laps" style="${dim}">${res.laps ?? '—'}</td>` : ''}
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    if (typeof twemoji !== 'undefined') twemoji.parse(container, { folder: 'svg', ext: '.svg' });
}

// ── WEATHER ──────────────────────────────────────────────────────
function formatWeatherNumber(value, suffix = '') {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace('.0', '')}${suffix}` : '—';
}

// Data key (as stored in season2026.json) → DOM id suffix (as built in grandprix.html)
const WEATHER_SESSION_MAP = {
    fp1:         'fp1',
    fp2:         'fp2',
    fp3:         'fp3',
    sprintQualy: 'sprint-qualy',
    sprintRace:  'sprint-race',
    qualifying:  'qualifying',
    race:        'race',
};

// 8 puntos cardinales a partir de los grados (0°=N, 90°=E, 180°=S, 270°=W)
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
    // Se guarda en m/s (unidad nativa de OpenF1); se muestra en km/h.
    const wind     = formatWeatherNumber(Number(weather.wind_speed) * 3.6, ' km/h');
    const pressure = formatWeatherNumber(weather.pressure, ' hPa');
    const hasPressure = Number.isFinite(Number(weather.pressure));
    const hasWindDir  = Number.isFinite(Number(weather.wind_direction));
    const windDirDeg  = hasWindDir ? Number(weather.wind_direction) : 0;

    // Ícono de flecha/brújula: apunta hacia arriba (Norte) por defecto y rota
    // según wind_direction. Se dibuja como triángulo + línea, prolijo y nítido a cualquier tamaño.
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
                ${hasPressure ? `
                <div class="swc-stat">
                    <span class="swc-stat-value">${pressure}</span>
                    <span class="swc-stat-label">Pressure</span>
                </div>` : ''}
            </div>
        </div>`;
}

function renderWeather(gp) {
    Object.entries(WEATHER_SESSION_MAP).forEach(([dataKey, domSuffix]) => {
        const container = document.getElementById(`weather-${domSuffix}`);
        if (!container) return;

        const weather = getSessionWeather(gp, dataKey);
        if (!weather) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = '';
        container.innerHTML = renderSessionWeatherCard(weather);
    });

    if (typeof twemoji !== 'undefined') {
        document.querySelectorAll('.session-weather').forEach(el => {
            twemoji.parse(el, { folder: 'svg', ext: '.svg' });
        });
    }
}

// ── GP RECORDS ───────────────────────────────────────────────────
// Records de cada Grand Prix (poles, podios, vuelta rápida, etc.) —
// vienen ya armados desde gpRecords.json, porque son datos que no se
// pueden derivar de racesHistory.json (esa solo guarda el ganador).
function renderGPRecords(records) {
    if (!records || !records.length) return '';

    const items = records.map((r, idx) => {
        // r.detail can be a single string or an array of lines — arrays render
        // as a stacked, collapsible list instead of one long run-together sentence.
        const detailLines = Array.isArray(r.detail) ? r.detail : (r.detail ? [r.detail] : []);
        const detailId = `gp-record-detail-${idx}`;
        const toggleHtml = detailLines.length
            ? `<button type="button" class="gp-record-toggle" aria-expanded="false" aria-controls="${detailId}" aria-label="Toggle details">
                   <span class="gp-record-toggle-icon">${deltaArrowSvg('down')}</span>
               </button>`
            : '';
        const detailHtml = detailLines.length
            ? (() => {
                  // "|" separates N columns (year | team | position); falls back to
                  // ":" for the simpler 2-column year: value lines.
                  const rows = detailLines.map(line => line.includes('|')
                      ? line.split('|').map(cell => cell.trim())
                      : (line.indexOf(':') > -1
                          ? [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]
                          : [line]));
                  const colCount = Math.max(...rows.map(r => r.length));
                  const rowsHtml = rows.map(cells => `<div class="gp-record-detail-row">${
                      cells.map((cell, i) => `<span class="gp-record-detail-cell${i === 0 ? ' gp-record-detail-year' : ''}">${cell}</span>`).join('')
                  }</div>`).join('');
                  return `<div class="gp-record-detail-list" id="${detailId}"><div class="gp-record-detail-inner cols-${colCount}">${rowsHtml}</div></div>`;
              })()
            : '';

        return `
        <div class="gp-record-item">
            ${toggleHtml}
            <p class="gp-record-label">${r.label}</p>
            <p class="gp-record-value">${r.value}</p>
            <p class="gp-record-sub">${r.sub}</p>
            ${detailHtml}
        </div>`;
    }).join('');

    return `
        <div class="gp-records-panel">
            <p class="gp-records-title">Grand Prix Records</p>
            ${items}
        </div>`;
}

// Un solo listener delegado para todos los botones .gp-record-toggle,
// porque el panel se re-inyecta dinámicamente (innerHTML) y no conviene
// enganchar listeners individuales cada vez que se renderiza.
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.gp-record-toggle');
    if (!btn) return;

    const detail = document.getElementById(btn.getAttribute('aria-controls'));
    if (!detail) return;

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    detail.classList.toggle('is-open', !expanded);
    btn.classList.toggle('is-expanded', !expanded);
});

// ── HISTORY ──────────────────────────────────────────────────────
// Fila de tabla compartida por las dos tablas de historia de abajo.
// showCircuit=true agrega la columna de circuito (para Grand Prix History,
// donde el mismo GP puede haber corrido en circuitos distintos con el tiempo).
function historyRowHtml(row, { showCircuit = false, showGpName = false } = {}) {
    const circuitName = showCircuit
        ? `<td class="ht-circuit">${circuitDisplayName(row.circuitId)}</td>`
        : '';
    const gpNameCell = showGpName
        ? `<td class="ht-gpname">${row.gpName || '—'}</td>`
        : '';
    const teamId   = row.team || '';
    const logoFile = TEAM_LOGO_MAP[teamId];
    const logoHtml = logoFile
        ? `<img class="res-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
        : `<span class="res-team-logo-placeholder"></span>`;

    return `
        <tr class="${row.year === 2026 ? 'current-year' : ''}">
            <td class="ht-year">${row.year}</td>
            ${gpNameCell}
            ${circuitName}
            <td class="ht-winner">${row.winner && row.winner !== 'N/A' ? formatDriverName(row.winner) : '—'}</td>
            <td class="res-team-cell">
                <div class="res-team">
                    ${logoHtml}
                    <span class="res-team-name">${teamId || '—'}</span>
                </div>
            </td>
        </tr>`;
}

// Nombre "lindo" del circuito a partir del circuitId (usado solo acá,
// no hace falta el objeto circuits completo para esto)
function circuitDisplayName(circuitId) {
    return circuitId
        ? circuitId.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
        : '—';
}

// "Grand Prix History": historial de este GP puntual, filtrado por gpId.
// Se muestra siempre, aunque esté vacía (ej. un GP nuevo sin ediciones previas).
function renderGPHistory(rows, records) {
    const container = document.getElementById('history-card');
    if (!container) return;

    const recordsHtml = renderGPRecords(records);

    if (!rows.length) {
        container.innerHTML = `<p class="result-pending-text">No previous editions of this Grand Prix yet.</p>${recordsHtml}`;
        return;
    }

    const bodyRows = rows.map(r => historyRowHtml(r, { showCircuit: true, showGpName: false })).join('');

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Circuit</th>
                        <th>Winner</th>
                        <th class="res-team-col">Team</th>
                    </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
        ${recordsHtml}`;
}

// "Previous races at this circuit": otras carreras (de OTRO gpId) corridas
// en el mismo circuito. Se oculta la sección entera si no hay nada distinto
// que mostrar (ej. un GP que siempre corrió con el mismo nombre en su circuito).
function renderCircuitHistory(rows) {
    const section   = document.getElementById('section-circuit-history');
    const container = document.getElementById('circuit-history-card');
    if (!section || !container) return;

    if (!rows.length) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    section.style.display = '';
    const bodyRows = rows.map(r => historyRowHtml(r, { showCircuit: false, showGpName: true })).join('');

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Grand Prix</th>
                        <th>Winner</th>
                        <th class="res-team-col">Team</th>
                    </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>`;
}

// ── SCHEDULE ─────────────────────────────────────────────────────
const SCHEDULE_SESSION_LABELS = {
    fp1:         'Free Practice 1',
    sprintQualy: 'Sprint Qualifying',
    sprintRace:  'Sprint Race',
    fp2:         'Free Practice 2',
    fp3:         'Free Practice 3',
    qualifying:  'Qualifying',
    race:        'Race',
};

function formatDuration(start, end) {
    if (!start || !end) return null;
    const totalMin = Math.round((end - start) / 60000);
    if (totalMin <= 0) return null;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h)      return `${h}h`;
    return `${m}m`;
}

// Igual al countdown del hero de index.js: dd/hh/mm/ss, se muestran los 2 primeros valores no nulos
function formatCountdown(diffMs) {
    if (diffMs <= 0) return null;
    const d = Math.floor(diffMs / 86400000);
    const h = Math.floor((diffMs % 86400000) / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);
    const parts = [
        d > 0 && `${d}d`,
        h > 0 && `${h}h`,
        m > 0 && `${m}m`,
        `${s}s`,
    ].filter(Boolean);
    return parts.slice(0, 2).join(' ');
}

function renderSchedule(gp) {
    const section   = document.getElementById('section-schedule');
    const container = document.getElementById('schedule-card');
    if (!section || !container) return;

    // Solo mostramos el schedule si la carrera todavía no se disputó
    const raceEnd     = getSessionEnd(gp, 'race');
    const alreadyRaced = raceEnd && raceEnd < new Date();
    if (gp.cancelled || alreadyRaced) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const now = new Date();
    const sessions = Object.entries(SCHEDULE_SESSION_LABELS)
        .map(([key, label]) => {
            const start = getSessionStart(gp, key);
            const end   = getSessionEnd(gp, key);
            return start ? { label, start, end } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);

    if (!sessions.length) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    // Agrupamos las sesiones por día — cada día es una columna
    const days = [];
    sessions.forEach(s => {
        const dayKey = s.start.toDateString();
        let day = days.find(d => d.key === dayKey);
        if (!day) {
            day = { key: dayKey, label: formatDate(s.start), rows: [] };
            days.push(day);
        }
        day.rows.push(s);
    });

    container.innerHTML = days.map(day => `
        <div class="schedule-day">
            <p class="schedule-day-label">${day.label}</p>
            <div class="schedule-day-rows">
                ${day.rows.map(s => {
                    const duration = formatDuration(s.start, s.end);
                    const ended    = s.end && s.end <= now;
                    const live     = s.start <= now && (!s.end || s.end > now);
                    const upcoming = !ended && !live;
                    const tag      = live ? 'Live' : ended ? 'Ended' : 'Upcoming';
                    const stateCls = live ? ' schedule-row-live' : ended ? ' schedule-row-ended' : '';
                    const dataAttr = upcoming ? ` data-start="${s.start.getTime()}"` : '';
                    return `
                    <div class="schedule-row${stateCls}"${dataAttr}>
                        <div class="schedule-row-top">
                            <span class="schedule-row-session">${s.label}</span>
                            <span class="schedule-row-tag">${tag}</span>
                        </div>
                        <div class="schedule-row-meta">
                            <span class="schedule-row-time">${formatRange(s.start, s.end)}</span>
                            ${upcoming
                                ? `<span class="schedule-row-countdown">—</span>`
                                : `<span class="schedule-row-duration">${duration || '—'}</span>`}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `).join('');

    section.style.display = '';
    initScheduleCountdowns(container);
}

// Cuenta regresiva en vivo para cada sesión que todavía no arrancó,
// mostrada aparte del horario (space-between) y actualizada cada segundo
function initScheduleCountdowns(container) {
    const rows = [...container.querySelectorAll('.schedule-row[data-start]')];
    if (!rows.length) return;

    const tick = () => {
        rows.forEach(row => {
            const el = row.querySelector('.schedule-row-countdown');
            if (!el) return;
            const startMs   = Number(row.dataset.start);
            const remaining = formatCountdown(startMs - Date.now());
            el.textContent  = remaining || 'Starting…';
        });
    };

    tick();
    const interval = setInterval(tick, 1000);

    // Evita timers acumulados si se vuelve a renderizar el schedule
    if (container._scheduleInterval) clearInterval(container._scheduleInterval);
    container._scheduleInterval = interval;
}

// ── SESSION TABS ─────────────────────────────────────────────────
function resetQualyScroll(panel) {
    if (!panel) return;
    panel.querySelectorAll('.race-table-wrap').forEach(wrap => {
        if (wrap.querySelector('.qualy-divider')) wrap.scrollTop = 30;
    });
}

function moveIndicator(indicator, btn) {
    indicator.style.left  = `${btn.offsetLeft}px`;
    indicator.style.width = `${btn.offsetWidth}px`;
}

function initSessionTabs() {
    const tabBar    = document.getElementById('session-tab-bar');
    const allPanels = document.querySelectorAll('.session-tab-panel');
    if (!tabBar || !allPanels.length) return;

    // A panel is "available" if its inner section was NOT hidden by a render function.
    // render functions call `container.closest('section').style.display = 'none'` on empty data.
    const availablePanels = [...allPanels].filter(panel => {
        const section = panel.querySelector('section');
        return !section || section.style.display !== 'none';
    });

    if (!availablePanels.length) {
        const container = document.getElementById('session-tabs-container');
        if (container) container.style.display = 'none';
        return;
    }

    const indicator = document.createElement('div');
    indicator.className = 'session-tab-indicator';
    tabBar.appendChild(indicator);

    // Build tab buttons
    availablePanels.forEach((panel, idx) => {
        const label      = panel.dataset.label || panel.dataset.session;
        const labelShort = panel.dataset.labelShort;
        const btn        = document.createElement('button');
        btn.className    = 'session-tab-btn' + (idx === 0 ? ' active' : '');
        if (labelShort) {
            btn.innerHTML = `<span class="tab-label-full">${label}</span><span class="tab-label-short">${labelShort}</span>`;
        } else {
            btn.textContent = label;
        }
        btn.dataset.target = panel.id;
        btn.addEventListener('click', () => {
            tabBar.querySelectorAll('.session-tab-btn').forEach(b => b.classList.remove('active'));
            allPanels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            panel.classList.add('active');
            resetQualyScroll(panel);
            moveIndicator(indicator, btn);
        });
        tabBar.appendChild(btn);
    });

    // Show first available tab
    availablePanels[0].classList.add('active');
    resetQualyScroll(availablePanels[0]);

    const firstBtn = tabBar.querySelector('.session-tab-btn');
    if (firstBtn) moveIndicator(indicator, firstBtn);
    window.addEventListener('resize', () => {
        const activeBtn = tabBar.querySelector('.session-tab-btn.active');
        if (activeBtn) moveIndicator(indicator, activeBtn);
    });

    const tabsContainer = document.getElementById('session-tabs-container');
    if (tabsContainer) {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        requestAnimationFrame(() => requestAnimationFrame(() => obs.observe(tabsContainer)));
    }
}

// ── SCROLL ANIMATIONS ────────────────────────────────────────────
function initScrollAnimations() {
    const items = document.querySelectorAll('.moment-item');
    if (!items.length) return;
    const obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const idx = [...items].indexOf(entry.target);
                setTimeout(() => entry.target.classList.add('visible'), idx * 120);
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    items.forEach(el => obs.observe(el));
}
// ── TRACK LAYOUT ZOOM MODAL ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const zoomBtn   = document.getElementById('track-zoom-btn');
    const trackImg  = document.getElementById('track-layout-img');
    const modal     = document.getElementById('track-zoom-modal');
    const modalImg  = document.getElementById('track-zoom-modal-img');
    const modalClose = document.getElementById('track-zoom-modal-close');

    if (!zoomBtn || !trackImg || !modal || !modalImg || !modalClose) return;

    function openModal() {
        modalImg.src = trackImg.src;
        modalImg.alt = trackImg.alt;
        modal.classList.add('is-active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('is-active');
        document.body.style.overflow = '';
    }

    zoomBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-active')) closeModal();
    });
});