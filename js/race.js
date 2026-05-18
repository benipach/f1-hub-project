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
        const [season, circuits] = await Promise.all([
            loadSeason('..'),
            loadCircuits('..')
        ]);

        const gp        = season[gpId];
        const circuitId = CIRCUIT_MAP[gpId];
        const circuit   = circuits[circuitId];

        if (!gp) { console.error('GP no encontrado:', gpId); return; }

        injectColors(gp.color);
        renderHero(gp, circuit, circuitId);
        renderCircuitOverview(circuit, circuitId);
        renderFunFacts(circuit);
        renderResult(gp);
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
        heroName.style.background = 'var(--gp-gradient)';
        heroName.style.webkitBackgroundClip = 'text';
        heroName.style.backgroundClip = 'text';
        heroName.style.color = 'transparent';
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
        document.getElementById('lr-meta').textContent =
            `${circuit.lapRecord.driver || '-'} (${circuit.lapRecord.year || '-'})`;
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
    const grid = document.getElementById('facts-grid');
    if (!grid || !circuit?.funFacts?.length) return;
    grid.innerHTML = circuit.funFacts.map((fact, i) => `
        <div class="fact-card">
            <p class="fact-num">Fact ${String(i + 1).padStart(2, '0')}</p>
            <p class="fact-text">${fact}</p>
        </div>
    `).join('');
}

// ── RESULT ───────────────────────────────────────────────────────
function renderResult(gp) {
    const container = document.getElementById('result-card');
    if (!container) return;

    if (!gp.results?.length) {
        container.innerHTML = `
            <div class="result-pending">
                <div class="result-pending-icon">🏁</div>
                <p class="result-pending-text">Race not yet held</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="race-table-wrap">
            <table class="result-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Driver</th>
                        <th>Team</th>
                        <th>Time</th>
                        <th style="text-align:center">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    ${gp.results.map(res => {
                        const isDnf = res.time === 'DNF' || res.time === 'DNS';
                        const dim   = isDnf ? 'color:var(--text-dim)' : '';
                        return `
                            <tr>
                                <td class="res-pos" style="${dim}">${res.pos}</td>
                                <td class="res-driver" style="${dim}">
                                    <span class="driver-fullname">${res.driver}</span>
                                    <span class="driver-lastname">${res.driver.split(' ').slice(1).join(' ').slice(0, 3).toUpperCase()}</span>
                                </td>
                                <td class="res-team" style="${dim}">${res.team}</td>
                                <td class="res-time" style="${dim}">${res.time}</td>
                                <td class="res-pts" style="text-align:center;font-family:'F1-Regular';color:var(--text-light)">
                                    ${res.pts ?? 0}
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

// ── NOTABLE MOMENTS ──────────────────────────────────────────────
function renderNotableMoments(gp) {
    const container = document.getElementById('moments-card');
    if (!container) return;

    if (!gp.notableMoments?.length) { container.innerHTML = ''; return; }

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
            <table class="moments-table">
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
    if (!gp.weather) return;
    ['friday', 'saturday', 'sunday'].forEach(day => {
        const w = gp.weather[day];
        if (!w) return;
        document.getElementById(`weather-icon-${day}`).textContent      = w.icon      || '—';
        document.getElementById(`weather-condition-${day}`).textContent  = w.condition || '—';
        document.getElementById(`weather-temp-${day}`).textContent       = w.temp      || '—';
        document.getElementById(`weather-notes-${day}`).textContent      = w.notes     || '—';
        document.getElementById(`weather-rain-${day}`).textContent       = `💧 ${w.rainChance} rain chance`;
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
            <table class="history-table">
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