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
    for (const d of data.drivers) {
        const key = `${d.firstName} ${d.lastName}`;
        const entry2026 = d.history?.find(h => h.year === 2026);
        if (entry2026) teamMap[key] = entry2026.teamId;
        if (d.nationality) natMap[key] = d.nationality;
    }
    return { teamMap, natMap };
}

// ── HELPERS ───────────────────────────────────────────────────────
function findNextRace(season) {
    const now = new Date();
    return Object.entries(season).find(([, gp]) =>
        gp.horarios?.raceEndDate &&
        new Date(gp.horarios.raceEndDate) > now &&
        !gp.cancelled
    );
}

function buildGradient(colors) {
    if (!colors) return '#e8002d';
    return `linear-gradient(135deg, ${colors})`;
}

function parseDate(str) {
    return str ? new Date(str) : null;
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
        const [season, circuits, { teamMap: driverTeams, natMap: driverNats }] = await Promise.all([
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
        renderResult(gp, driverTeams, driverNats);
        renderNotableMoments(gp);
        renderWeather(gp);
        renderHistory(circuit);
        initScrollAnimations();

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
    'Aston Martin':    'astonmartin-logo',
    'Alpine':          'alpine-logo',
    'Williams':        'williams-logo',
    'Racing Bulls':    'racingbulls-logo',
    'Haas':            'haas-logo',
    'Audi':            'audi-logo',
    'Cadillac':        'cadillac-logo',
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

// ── RESULT ───────────────────────────────────────────────────────


function renderResult(gp, driverTeams = {}, driverNats = {}) {
    const container = document.getElementById('result-card');
    if (!container) return;

    if (!gp.results?.race?.length) {
        const section = document.getElementById('section-results');
        if (section) section.style.display = 'none';
        return;
    }

    const qualiMap = buildQualiMap(gp.results?.qualifying);
    const hasQuali = Object.keys(qualiMap).length > 0;

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        ${hasQuali ? '<th class="res-delta-col"></th>' : ''}
                        <th>Driver</th>
                        <th class="res-nat-col">Nationality</th>
                        <th>Time</th>
                        <th style="text-align:center">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    ${gp.results.race.map(res => {
                        const teamId   = driverTeams[res.driver] || '';
                        const logoFile = TEAM_LOGO_MAP[teamId];
                        const logoHtml = logoFile
                            ? `<img class="res-team-logo" src="../img/teams/${logoFile}.png" alt="${teamId}">`
                            : `<span class="res-team-logo-placeholder"></span>`;
                        const isDnf  = res.time === 'DNF' || res.time === 'DNS';
                        const dim    = isDnf ? 'opacity:0.4' : '';
                        const posNum = parseInt(res.pos, 10);
                        const isTop3 = posNum >= 1 && posNum <= 3;
                        const qualiPos = qualiMap[normalizeName(res.driver)];
                        const nat = driverNats[res.driver] || '—';
                        return `
                            <tr>
                                <td class="res-pos${isTop3 ? ' top3' : ''}" style="${dim}">${res.pos}</td>
                                ${hasQuali ? `<td class="res-delta-cell" style="${dim}">${gridDeltaHtml(res.pos, qualiPos)}</td>` : ''}
                                <td class="res-driver" style="${dim}">
                                    ${logoHtml}
                                    <span class="driver-fullname">${res.driver}</span>
                                    <span class="driver-lastname">${res.driver.split(' ').slice(1).join(' ').slice(0, 3).toUpperCase()}</span>
                                </td>
                                <td class="res-nat" style="${dim}">${nat}</td>
                                <td class="res-time" style="${dim}">${res.time}</td>
                                <td class="res-pts" style="${dim}">${res.pts ?? 0}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    if (typeof twemoji !== 'undefined') {
        twemoji.parse(container, { folder: 'svg', ext: '.svg' });
    }
}


// ── NOTABLE MOMENTS ──────────────────────────────────────────────
function renderNotableMoments(gp) {
    const container = document.getElementById('moments-card');
    const section   = document.getElementById('section-moments');
    if (!container) return;

    if (!gp.notableMoments?.length) {
        if (section) section.style.display = 'none';
        return;
    }
    if (section) section.style.display = '';

    const rows = gp.notableMoments.map(m => {
        const hasPenalty  = m.action?.toLowerCase().includes('penalty') || m.action?.includes('+');
        const isVSC       = m.event?.toLowerCase().includes('virtual safety car');
        const isSafetyCar = !isVSC && m.event?.toLowerCase().includes('safety car');
        const isRedFlag   = m.event?.toLowerCase().includes('red flag');

        const eventDisplay = isVSC
            ? `<span class="mt-action" style="background:rgba(255,220,0,0.1);color:#ffdc00;border-color:rgba(255,220,0,0.2);margin-right:8px">VSC</span>${m.event.replace(/virtual safety car/i, '').trim()}`
            : isSafetyCar
            ? `<span class="mt-action" style="background:rgba(255,165,0,0.1);color:#ffa500;border-color:rgba(255,165,0,0.2);margin-right:8px">Safety Car</span>${m.event.replace(/safety car/i, '').trim()}`
            : isRedFlag
            ? `<span class="mt-action" style="background:rgba(225,6,0,0.1);color:var(--primary-red);border-color:rgba(225,6,0,0.2);margin-right:8px">Red Flag</span>${m.event.replace(/red flag/i, '').trim()}`
            : m.event;

        const actionDisplay = hasPenalty
            ? `<span class="mt-action">${m.action}</span>`
            : (m.action ?? '');

        return `
            <tr>
                <td class="mt-time">${m.time}</td>
                <td class="mt-event">${eventDisplay}</td>
                <td class="mt-involved">${m.involved ?? ''}</td>
                <td>${actionDisplay}</td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Event</th>
                        <th>Drivers Involved</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── WEATHER ──────────────────────────────────────────────────────
function renderWeather(gp) {
    const section = document.getElementById('section-weather');
    if (!Array.isArray(gp.weather) || !gp.weather.length) {
        if (section) section.style.display = 'none';
        return;
    }
    if (section) section.style.display = '';
    gp.weather.forEach(w => {
        const day = w.day;
        if (!day) return;
        const iconEl = document.getElementById(`weather-icon-${day}`);
        const condEl = document.getElementById(`weather-condition-${day}`);
        const tempEl = document.getElementById(`weather-temp-${day}`);
        const noteEl = document.getElementById(`weather-notes-${day}`);
        const rainEl = document.getElementById(`weather-rain-${day}`);
        if (iconEl) iconEl.textContent = w.icon      || '—';
        if (condEl) condEl.textContent = w.condition || '—';
        if (tempEl) tempEl.textContent = w.temp      || '—';
        if (noteEl) noteEl.textContent = w.notes     || '—';
        if (rainEl) rainEl.textContent = `💧 ${w.rainChance} rain chance`;
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
                        <th>Team</th>
                        <th>Pole Position</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
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