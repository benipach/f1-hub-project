// ── GP → CIRCUIT MAPPING ──────────────────────────────────────────
const CIRCUIT_MAP = {
    'australian-gp':    'albert-park-circuit',
    'chinese-gp':       'shanghai-international-circuit',
    'japanese-gp':      'suzuka-international-racing-course',
    'bahrain-gp':       'bahrain-internatinal-circuit',
    'saudi-arabian-gp': 'jeddah-corniche-circuit',
    'miami-gp':         'miami-international-autodrome',
    'canadian-gp':      'circuit-gilles-villeneuve',
    'monaco-gp':        'circuit-de-monaco',
    'barcelona-gp':     'circuit-de-barcelona-catalunya',
    'austrian-gp':      'red-bull-ring',
    'british-gp':       'silverstone-circuit',
    'belgian-gp':       'circuit-de-spa-francorchamps',
    'hungarian-gp':     'hungaroring',
    'dutch-gp':         'circuit-zandvoort',
    'italian-gp':       'autodromo-nazionale-di-monza',
    'spanish-gp':       'madring',
    'azerbaijan-gp':    'baku-city-circuit',
    'singapore-gp':     'marina-bay-street-circuit',
    'united-states-gp': 'cota',
    'mexican-gp':       'hermanos-rodriguez',
    'brazilian-gp':     'autodromo-jose-carlos-pace',
    'las-vegas-gp':     'las-vegas-strip-circuit',
    'qatar-gp':         'lusail-international-circuit',
    'abu-dhabi-gp':     'yas-marina-circuit',
};

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
        const [season, circuits, { teamMap: driverTeams, natMap: driverNats, numberMap: driverNumbers }] = await Promise.all([
            loadSeason('..'),
            loadCircuits('..'),
            loadDrivers('..')
        ]);

        const gp        = season[gpId];
        const circuitId = CIRCUIT_MAP[gpId];
        const circuit   = circuits[circuitId];

        if (!gp) { console.error('GP no encontrado:', gpId); return; }

        injectColors(gp.color);
        renderHero(gp, circuit, circuitId);
        renderCircuitOverview(circuit, circuitId);
        renderFunFacts(circuit);

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
        renderHistory(circuit);
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

// ── HERO ─────────────────────────────────────────────────────────
function renderHero(gp, circuit, circuitId) {
    const heroImg = document.getElementById('race-hero-img');
    if (heroImg) {
        heroImg.src = `../img/circuits/${circuitId}.png`;
        heroImg.style.display = 'block';
    }

    if (circuit?.name) document.getElementById('hero-circuit-name').textContent = circuit.name;

    if (gp.name) {
        const heroName = document.getElementById('hero-name');
        heroName.textContent = gp.name.replace(' Grand Prix', '').trim();
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

    document.getElementById('stat-first').textContent = circuit?.history?.[0]?.year || '-';
}

// ── CIRCUIT OVERVIEW ─────────────────────────────────────────────
function renderCircuitOverview(circuit, circuitId) {
    if (!circuit) return;
    const s = circuit.stats;

    if (s) {
        document.getElementById('cs-length').textContent   = s.length || '-';
        document.getElementById('cs-distance').textContent = s.length
            ? (parseFloat(s.length) * s.laps).toFixed(3): '-';
        document.getElementById('cs-laps').textContent     = s.laps          || '-';
        document.getElementById('cs-corners').textContent  = s.turns         || '-';
        document.getElementById('cs-overtake').textContent = s.overtakeZones || '-';
    }

    document.getElementById('cs-editions').textContent = circuit.history?.length || '-';

    if (circuit.lapRecord) {
        document.getElementById('lr-time').textContent = circuit.lapRecord.time || '-';
    }

    if (circuit.topSpeed) {
        document.getElementById('lr-topspeed').textContent = circuit.topSpeed.speed || '-';
    }

    const trackLayoutImg = document.getElementById('track-layout-img');
    if (trackLayoutImg) trackLayoutImg.src = `../img/circuits/${circuitId}-layout.png`;

    if (circuit.characteristics) {
        setBar('downforce', circuit.characteristics.downforce);
        setBar('overtaking', circuit.characteristics.overtaking);
        setBar('tiredeg',    circuit.characteristics.tyreDeg);
        const trackEl = document.getElementById('char-tracktype');
        if (trackEl) trackEl.textContent = circuit.characteristics.trackType || '-';
    }

    const nameEl = document.getElementById('track-layout-name');
    if (nameEl && circuit.name) nameEl.textContent = circuit.name;
}

function setBar(id, value) {
    const pct = Math.min(Math.max(value || 0, 0), 100);
    let label;
    if (pct <= 30)      label = 'Low';
    else if (pct <= 50) label = 'Medium Low';
    else if (pct <= 65) label = 'Medium';
    else if (pct <= 80) label = 'Medium High';
    else                label = 'High';

    const charEl = document.getElementById(`char-${id}`);
    const barEl  = document.getElementById(`bar-${id}`);
    if (charEl) charEl.textContent = label;
    setTimeout(() => { if (barEl) barEl.style.width = pct + '%'; }, 300);
}

// ── FUN FACTS ────────────────────────────────────────────────────
function renderFunFacts(circuit) {
    const track   = document.getElementById('facts-track');
    const dotsEl  = document.getElementById('facts-dots');
    const prevBtn = document.getElementById('facts-prev');
    const nextBtn = document.getElementById('facts-next');
    if (!track || !circuit?.funFacts?.length) return;

    const facts = circuit.funFacts;
    const perPage = 1;
    let current = 0;
    const pages = Math.ceil(facts.length / perPage);

    track.innerHTML = facts.map((fact, i) => `
        <div class="fact-card">
            <p class="fact-num">Fact ${String(i + 1).padStart(2, '0')}</p>
            <p class="fact-text">${fact}</p>
        </div>
    `).join('');

    // dots
    dotsEl.innerHTML = Array.from({ length: pages }, (_, i) =>
        `<button class="facts-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></button>`
    ).join('');

    function goTo(page) {
        current = Math.max(0, Math.min(page, pages - 1));
        const cardW = track.querySelector('.fact-card')?.offsetWidth || 0;
        const gap = 14;
        track.style.transform = `translateX(-${current * perPage * (cardW + gap)}px)`;
        dotsEl.querySelectorAll('.facts-dot').forEach((d, i) =>
            d.classList.toggle('active', i === current)
        );
        prevBtn.disabled = current === 0;
        nextBtn.disabled = current >= pages - 1;
    }

    prevBtn.addEventListener('click', () => goTo(current - 1));
    nextBtn.addEventListener('click', () => goTo(current + 1));
    dotsEl.addEventListener('click', e => {
        const i = e.target.dataset.i;
        if (i !== undefined) goTo(+i);
    });

    goTo(0);
}

// ── TEAM ID → LOGO FILENAME ──────────────────────────────────────
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

// ── TEAM ID → PRIMARY COLOR ──────────────────────────────────────────────
const TEAM_COLOR_MAP = {
    'Mercedes':         '#2BFFDB',
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

// Devuelve el HTML del indicador de delta (flecha o barra)
function gridDeltaHtml(racePos, qualiPos) {
    const raceNum = parseInt(racePos, 10);
    if (isNaN(raceNum) || qualiPos == null) {
        // No hubo qualy (NC en qualy) o no hay dato → sin indicador
        return `<span class="res-delta res-delta--none">—</span>`;
    }

    const delta = qualiPos - raceNum; // positivo = ganó puestos
    if (delta > 0) {
        return `<span class="res-delta res-delta--up">▲ ${delta}</span>`;
    } else if (delta < 0) {
        return `<span class="res-delta res-delta--down">▼ ${Math.abs(delta)}</span>`;
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
                        <th style="text-align:center">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    ${raceEntries.map(res => {
                        const teamId    = res.team || driverTeams[res.driver] || '';
                        const logoFile  = TEAM_LOGO_MAP[teamId];
                        const teamColor = TEAM_COLOR_MAP[teamId] || 'rgba(255,255,255,0.4)';
                        const driverNum = driverNumbers[res.driver] ?? '';
                        const logoHtml  = logoFile
                            ? `<img class="res-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
                            : `<span class="res-team-logo-placeholder"></span>`;
                        const isDnf  = res.time === 'DNF' || res.time === 'DNS';
                        const dim    = isDnf ? 'opacity:0.4' : '';
                        const posNum = parseInt(res.pos, 10);
                        const isTop3 = posNum >= 1 && posNum <= 3;
                        const qualiPos = qualiMap[normalizeName(res.driver)];
                        return `
                            <tr>
                                <td class="res-pos${isTop3 ? ' top3' : ''}" style="${dim}">${res.pos}</td>
                                ${hasQuali ? `<td class="res-delta-cell" style="${dim}">${gridDeltaHtml(res.pos, qualiPos)}</td>` : ''}
                                <td class="res-driver" style="${dim}">
                                    <span class="res-driver-number" style="color:${teamColor}">#${driverNum}</span>
                                    <span class="driver-fullname">${res.driver}</span>
                                    <span class="driver-lastname">${res.driver.split(' ').slice(1).join(' ').slice(0, 3).toUpperCase()}</span>
                                </td>
                                <td class="res-team-cell" style="${dim}">
                                    <div class="res-team">
                                        ${logoHtml}
                                        <span class="res-team-name">${teamId || '—'}</span>
                                    </div>
                                </td>
                                <td class="res-time" style="${dim}">${res.time}</td>
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
                    </tr>
                </thead>
                <tbody>
                    ${entries.map((res, i) => {
                        const teamId    = res.team || driverTeams[res.driver] || '';
                        const logoFile  = TEAM_LOGO_MAP[teamId];
                        const teamColor = TEAM_COLOR_MAP[teamId] || 'rgba(255,255,255,0.4)';
                        const driverNum = driverNumbers[res.driver] ?? '';
                        const logoHtml  = logoFile
                            ? `<img class="res-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
                            : `<span class="res-team-logo-placeholder"></span>`;
                        const noTime = !res.lapTime || res.lapTime === 'DNF' || res.lapTime === 'DNS' || res.lapTime === 'NC';
                        const dim    = noTime ? 'opacity:0.4' : '';
                        const posNum = parseInt(res.pos, 10);
                        const isTop3 = posNum >= 1 && posNum <= 3;
                        const gapStr = gaps[i];
                        return `
                            <tr>
                                <td class="res-pos${isTop3 ? ' top3' : ''}" style="${dim}">${res.pos}</td>
                                <td class="res-driver" style="${dim}">
                                    <span class="res-driver-number" style="color:${teamColor}">#${driverNum}</span>
                                    <span class="driver-fullname">${res.driver}</span>
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

function sessionDisplayName(sessionKey) {
    const labels = {
        fp1: 'FP1',
        fp2: 'FP2',
        fp3: 'FP3',
        sprintQualy: 'Sprint Qualy',
        sprintRace: 'Sprint',
        qualifying: 'Qualifying',
        race: 'Race',
    };
    return labels[sessionKey] || sessionKey;
}

function weatherDayFromSession(session) {
    const date = parseDate(session?.date);
    return date
        ? date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
        : null;
}

function renderWeather(gp) {
    const section = document.getElementById('section-weather');
    const sessionEntries = Object.entries(gp?.sessions || {})
        .map(([sessionKey, session]) => ({ sessionKey, session, weather: getSessionWeather(gp, sessionKey) }))
        .filter(item => item.weather);

    if (!sessionEntries.length) {
        if (section) section.style.display = 'none';
        return;
    }

    if (section) section.style.display = '';

    const byDay = new Map();
    for (const item of sessionEntries) {
        const day = weatherDayFromSession(item.session);
        if (!day) continue;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(item);
    }

    byDay.forEach((items, day) => {
        const samples = items.map(item => item.weather);
        const avg = key => {
            const nums = samples.map(w => Number(w?.[key])).filter(Number.isFinite);
            return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        };
        const rainfall = samples.some(w => Number(w?.rainfall || 0) > 0) ? 1 : 0;
        const air = avg('air_temperature');
        const track = avg('track_temperature');
        const humidity = avg('humidity');
        const wind = avg('wind_speed');
        const sessionsLabel = items.map(item => sessionDisplayName(item.sessionKey)).join(' / ');

        const iconEl = document.getElementById(`weather-icon-${day}`);
        const condEl = document.getElementById(`weather-condition-${day}`);
        const tempEl = document.getElementById(`weather-temp-${day}`);
        const noteEl = document.getElementById(`weather-notes-${day}`);
        const rainEl = document.getElementById(`weather-rain-${day}`);

        if (iconEl) iconEl.textContent = rainfall ? '🌧️' : '🌤️';
        if (condEl) condEl.textContent = rainfall ? 'Rain recorded' : 'Dry session data';
        if (tempEl) tempEl.textContent = `${formatWeatherNumber(air, '°C')} air · ${formatWeatherNumber(track, '°C')} track`;
        if (noteEl) noteEl.textContent = `${sessionsLabel} · wind ${formatWeatherNumber(wind, ' m/s')} · humidity ${formatWeatherNumber(humidity, '%')}`;
        if (rainEl) rainEl.textContent = rainfall ? '💧 Rainfall detected' : '💧 No rainfall detected';
    });
}

// ── HISTORY ──────────────────────────────────────────────────────
function renderHistory(circuit) {
    const container = document.getElementById('history-card');
    if (!container || !circuit?.history?.length) return;

    const rows = [...circuit.history].reverse().map(h => `
        <tr class="${h.year === 2026 ? 'current-year' : ''}">
            <td class="ht-year">${h.year}</td>
            <td class="ht-winner">${h.winner || '—'}</td>
            <td><span class="ht-team-badge">${h.winnerTeam || '—'}</span></td>
            <td>${h.pole || '—'}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Winner</th>
                        <th class="res-team-col">Team</th>
                        <th>Pole Position</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── SESSION TABS ─────────────────────────────────────────────────
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
        });
        tabBar.appendChild(btn);
    });

    // Show first available tab
    availablePanels[0].classList.add('active');
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