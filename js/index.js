// ── Team metadata ──────────────────────────────────────────────────────────
// Maps the team name from the JSON to the CSS class and a display-friendly name.
const TEAM_META = {
    'Mercedes':        { cls: 'team-mercedes',  label: 'Mercedes' },
    'Ferrari':         { cls: 'team-ferrari',   label: 'Ferrari' },
    'McLaren':         { cls: 'team-mclaren',   label: 'McLaren' },
    'Red Bull Racing': { cls: 'team-redbull',   label: 'Red Bull' },
    'Williams':        { cls: 'team-williams',  label: 'Williams' },
    'Racing Bulls':    { cls: 'team-rbracing',  label: 'Racing Bulls' },
    'Alpine':          { cls: 'team-alpine',    label: 'Alpine' },
    'Haas F1 Team':    { cls: 'team-haas',      label: 'Haas' },
    'Aston Martin':    { cls: 'team-aston',     label: 'Aston Martin' },
    'Audi':            { cls: 'team-audi',      label: 'Audi' },
    'Cadillac':        { cls: 'team-cadillac',  label: 'Cadillac' },
};

// Maps full driver name → image filename (without extension).
// Used to resolve avatars even for GPs that don't include the `team` field.
const DRIVER_IMG = {
    'Alexander Albon':   'albon',
    'Arvid Lindblad':    'lindblad',
    'Carlos Sainz':      'sainz',
    'Charles Leclerc':   'leclerc',
    'Esteban Ocon':      'ocon',
    'Fernando Alonso':   'alonso',
    'Franco Colapinto':  'colapinto',
    'Gabriel Bortoleto': 'bortoleto',
    'George Russell':    'russell',
    'Isack Hadjar':      'hadjar',
    'Kimi Antonelli':    'antonelli',
    'Lance Stroll':      'stroll',
    'Lando Norris':      'norris',
    'Lewis Hamilton':    'hamilton',
    'Liam Lawson':       'lawson',
    'Max Verstappen':    'verstappen',
    'Nico Hulkenberg':   'hulkenberg',
    'Oliver Bearman':    'bearman',
    'Oscar Piastri':     'piastri',
    'Pierre Gasly':      'gasly',
    'Sergio Perez':      'perez',
    'Valtteri Bottas':   'bottas',
};

// Maps full driver name → team name (fallback for early GPs without team field).
const DRIVER_TEAM = {
    'Alexander Albon':   'Williams',
    'Arvid Lindblad':    'Racing Bulls',
    'Carlos Sainz':      'Williams',
    'Charles Leclerc':   'Ferrari',
    'Esteban Ocon':      'Haas F1 Team',
    'Fernando Alonso':   'Aston Martin',
    'Franco Colapinto':  'Alpine',
    'Gabriel Bortoleto': 'Audi',
    'George Russell':    'Mercedes',
    'Isack Hadjar':      'Red Bull Racing',
    'Kimi Antonelli':    'Mercedes',
    'Lance Stroll':      'Aston Martin',
    'Lando Norris':      'McLaren',
    'Lewis Hamilton':    'Ferrari',
    'Liam Lawson':       'Racing Bulls',
    'Max Verstappen':    'Red Bull Racing',
    'Nico Hulkenberg':   'Audi',
    'Oliver Bearman':    'Haas F1 Team',
    'Oscar Piastri':     'McLaren',
    'Pierre Gasly':      'Alpine',
    'Sergio Perez':      'Cadillac',
    'Valtteri Bottas':   'Cadillac',
};

// La ciudad (GP_CITY) y la bandera (GP_FLAG) de cada GP ya no viven acá
// hardcodeadas: son datos compartidos por todas las temporadas y se cargan
// desde data/gp-meta.json (ver loadGpMeta/gpFlagEmoji/gpCity/gpLabel en
// grandprix.js). Las tarjetas del calendario (antes 24 divs hardcodeados en
// index.html, uno por GP de 2026) tampoco: se generan en JS a partir del
// season*.json que corresponda, así funciona con cualquier temporada.

// circuits.json y gp-meta.json no cambian entre temporadas — se cargan una
// sola vez al entrar al sitio. Lo único que se vuelve a pedir al cambiar de
// año con las flechas es season${year}.json.
let _circuitsOnce = null;
let _gpMetaOnce   = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const seasonsAvailable = await loadSeasonsIndex('.');
        if (!seasonsAvailable.length) throw new Error('No se encontró ningún archivo season*.json en data/');

        [_circuitsOnce, _gpMetaOnce] = await Promise.all([
            loadCircuits('.'),
            loadGpMeta('.')
        ]);

        window._seasonState = { year: null, available: seasonsAvailable };

        initSeasonSwitcher(seasonsAvailable);

        const initialYear = getRequestedSeasonYear(seasonsAvailable);
        await renderSeason(initialYear, { instantCards: false });
        // initRaceCardReveal ya se llama desde dentro de renderRaceCards
    } catch (err) {
        console.error('Error cargando datos:', err);
    }
});

// Carga y dibuja una temporada completa (calendario + standings + hero).
// instantCards=true evita el fade-in de scroll-reveal en las tarjetas —
// se usa al cambiar de año con las flechas, porque ese efecto es para la
// primera carga de la página, no para cada cambio de temporada.
async function renderSeason(year, { instantCards } = {}) {
    const season = await loadSeason('.', year);

    window._seasonState.year = year;

    const titleEl = document.querySelector('.calendar-title');
    if (titleEl) titleEl.textContent = `${year} Season Calendar`;

    const yearLabelEl = document.getElementById('season-year-label');
    if (yearLabelEl) yearLabelEl.textContent = year;

    renderRaceCards(season, _gpMetaOnce, { instant: instantCards });
    updateDashboard(season, _circuitsOnce, _gpMetaOnce);
    buildStandings(season);
    updateSeasonNavButtons();
}

// ── SEASON SWITCHER (flechas prev/next) ─────────────────────────────
function initSeasonSwitcher(seasonsAvailable) {
    const prevBtn = document.getElementById('season-prev');
    const nextBtn = document.getElementById('season-next');
    if (!prevBtn || !nextBtn) return;

    const goToOffset = async (offset) => {
        const { year, available } = window._seasonState;
        const idx = available.indexOf(year);
        const newYear = available[idx + offset];
        if (newYear == null) return; // ya está en el límite

        // Actualiza la URL (?season=YYYY) sin recargar la página, para que
        // el link se pueda compartir y el botón "atrás" del navegador funcione.
        const url = new URL(window.location.href);
        url.searchParams.set('season', newYear);
        history.pushState({ season: newYear }, '', url);

        await renderSeason(newYear, { instantCards: true });
    };

    prevBtn.addEventListener('click', () => goToOffset(-1));
    nextBtn.addEventListener('click', () => goToOffset(1));

    // Botón "atrás/adelante" del navegador
    window.addEventListener('popstate', () => {
        const seasonsAvailable2 = window._seasonState.available;
        const year = getRequestedSeasonYear(seasonsAvailable2);
        renderSeason(year, { instantCards: true });
    });
}

function updateSeasonNavButtons() {
    const prevBtn = document.getElementById('season-prev');
    const nextBtn = document.getElementById('season-next');
    if (!prevBtn || !nextBtn) return;

    const { year, available } = window._seasonState;
    const idx = available.indexOf(year);
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx === -1 || idx >= available.length - 1;
}

// ── RACE CARDS (generadas desde el JSON, no hardcodeadas en el HTML) ──
function raceCardSkeleton(gpId, gp, gpMeta) {
    const flag       = gpFlagEmoji(gpId, gpMeta, gp);
    const label      = gpLabel(gpId, gpMeta, gp);
    const roundLabel = `Round ${String(gp.round).padStart(2, '0')}`;

    const card = document.createElement('div');
    card.className = 'race-card';
    card.dataset.id = gpId;
    card.innerHTML = `
        <div class="race-card-content">
            <span class="race-round">${roundLabel}</span>
            <h3>${flag} ${label}</h3>
            <p class="race-date"></p>
            <span class="race-status">Loading...</span>
            <a class="race-link" href="./grandsprix/grandprix.html?gp=${gpId}">Loading...</a>
        </div>`;
    return card;
}

// Observer global: se guarda acá para poder desconectarlo antes de crear uno nuevo
// al cambiar de temporada, evitando que se acumulen observers huérfanos.
let _cardRevealObserver = null;

function renderRaceCards(season, gpMeta, { instant = false } = {}) {
    const calendar = document.querySelector('.race-calendar');
    if (!calendar) return;

    // Desconectar el observer anterior antes de limpiar el DOM,
    // así no queda observando nodos que ya no existen.
    if (_cardRevealObserver) {
        _cardRevealObserver.disconnect();
        _cardRevealObserver = null;
    }

    // Se reconstruye desde cero: distintas temporadas pueden tener otra
    // cantidad de carreras, otro orden, u otros GPs directamente.
    calendar.querySelectorAll('.race-card').forEach(el => el.remove());

    const entries = Object.entries(season)
        .filter(([, gp]) => gp && typeof gp === 'object' && !Array.isArray(gp) && gp.round != null)
        .sort(([, a], [, b]) => a.round - b.round);

    for (const [gpId, gp] of entries) {
        const card = raceCardSkeleton(gpId, gp, gpMeta);
        if (instant) card.classList.add('in-view'); // sin animación al cambiar temporada
        calendar.appendChild(card);
    }

    // Scroll reveal: si las cards se insertan con animación (carga inicial),
    // armamos el observer sobre las cards recién creadas. Si son instant
    // (cambio de temporada con flechas), ya tienen in-view, nada que observar.
    if (!instant) {
        initRaceCardReveal();
    }
}

// ── SCROLL REVEAL ─────────────────────────────────────────────────
function initRaceCardReveal() {
    const cards = [...document.querySelectorAll('.race-card')];
    const title = document.querySelector('.calendar-title');
    if (!cards.length) return;

    _cardRevealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const idx   = cards.indexOf(entry.target);
            const delay = idx === -1 ? 0 : (idx % 4) * 40; // left-to-right per row (4-col grid)
            setTimeout(() => entry.target.classList.add('in-view'), delay);
            _cardRevealObserver?.unobserve(entry.target);
        });
    }, { threshold: 0.1 });

    // Wait two frames so the browser paints the initial hidden state first —
    // otherwise cards already visible on load (past sessions) skip the animation.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        cards.forEach(el => _cardRevealObserver?.observe(el));
        if (title) _cardRevealObserver?.observe(title);
    }));
}

function updateDashboard(season, circuits, gpMeta) {
    const now = new Date();
    const nextEntry = findNextRace(season);

    // Todo lo del hero grande (foto, cuenta regresiva, nombre de la próxima
    // carrera) solo tiene sentido si hay una carrera futura en esta
    // temporada. En una temporada vieja (ya terminada) esto no se toca,
    // queda como está — lo que sí tiene que seguir funcionando siempre es
    // el calendario de tarjetas de abajo (ver updateRacecards más abajo).
    if (nextEntry) {
        const [nextId, nextGP] = nextEntry;

        document.documentElement.style.setProperty('--race-gradient', buildGradient(nextGP.color));

        const circuitKey = CIRCUIT_MAP[nextId];
        const circuit = circuits[circuitKey];

        // Set hero background image
        const heroImg = document.getElementById('hero-image');
        if (heroImg) heroImg.src = `./img/circuits/${circuitKey}.png`;

        // Set city for the canvas blurred text (inline script reads window._heroCity)
        window._heroCity = gpCity(nextId, gpMeta, nextGP);

        // GP name (full name, e.g. "AUSTRIAN GRAND PRIX") plus country flag
        const gpNameEl = document.getElementById('hero-gp-name');
        if (gpNameEl) gpNameEl.textContent = `${gpFlagEmoji(nextId, gpMeta, nextGP)} ${nextGP.name.toUpperCase()}`.trim();

        // Circuit name below the GP title
        const circuitLabelEl = document.getElementById('hero-circuit-label');
        if (circuitLabelEl) circuitLabelEl.textContent = circuit?.name || circuit?.Name || '—';

        // Sprint pill
        const sprintPill = document.getElementById('hero-sprint-pill');
        if (sprintPill) sprintPill.style.display = nextGP.sprint ? 'inline-flex' : 'none';

        const circuitBtn = document.getElementById('hero-circuit-btn');
        if (circuitBtn) circuitBtn.href = `./grandsprix/grandprix.html?gp=${nextId}`;

        renderHeroSchedule(nextGP, nextId);
    }

    updateRacecards(season, nextEntry ? nextEntry[0] : null, now, circuits, gpMeta);
}

function formatDay(date) {
    return String(date.getDate()).padStart(2, '0');
}

function formatMonth(date) {
    return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

// Weekend range = earliest session start → latest session end, straight from the JSON.
function getWeekendRange(gp) {
    const keys   = Object.keys(gp.sessions || {});
    const starts = keys.map(key => getSessionStart(gp, key)).filter(Boolean);
    const ends   = keys.map(key => getSessionEnd(gp, key)).filter(Boolean);
    if (!starts.length || !ends.length) return null;
    return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)) };
}

function formatWeekendDateRange(gp) {
    const range = getWeekendRange(gp);
    if (!range) return '';
    const { start, end } = range;
    const startMonth = formatMonth(start);
    const endMonth   = formatMonth(end);
    return startMonth === endMonth
        ? `${formatDay(start)} - ${formatDay(end)} ${endMonth}`
        : `${formatDay(start)} ${startMonth} - ${formatDay(end)} ${endMonth}`;
}

function updateRacecards(season, nextId, now, circuits, gpMeta) {
    document.querySelectorAll('.race-card').forEach(card => {
        const gpId = card.dataset.id;
        const gp   = season[gpId];
        if (!gp) return;

        // Always start from the pristine, originally-shipped markup for this card.
        if (!card.dataset.originalContent) card.dataset.originalContent = card.innerHTML;
        card.innerHTML = card.dataset.originalContent;

        const dateText = formatWeekendDateRange(gp);
        const dateEl   = card.querySelector('.race-date');
        const spanEl   = card.querySelector('.race-status');
        const linkEl   = card.querySelector('.race-link');
        if (dateEl && dateText) dateEl.textContent = dateText;

        card.classList.remove('race-card-ended', 'race-card-next', 'race-card-next-expanded', 'race-card-upcoming', 'race-card-cancelled');
        if (spanEl) spanEl.className = 'race-status';
        if (linkEl) linkEl.href = `./grandsprix/grandprix.html?gp=${gpId}`;

        // Sprint weekends get a gold accent + badge regardless of status,
        // so the calendar isn't just red/blue/grey everywhere
        const isSprint = !!getSession(gp, 'sprintQualy') || !!getSession(gp, 'sprintRace') || !!gp.sprint;
        card.classList.toggle('race-card-sprint', isSprint);

        const roundEl = card.querySelector('.race-round');
        if (roundEl) {
            if (!roundEl.dataset.baseText) roundEl.dataset.baseText = roundEl.textContent.trim();
            roundEl.innerHTML = isSprint
                ? `${roundEl.dataset.baseText} <span class="sprint-chip">SPRINT</span>`
                : roundEl.dataset.baseText;
        }

        if (isGpCancelled(gp)) {
            card.classList.add('race-card-cancelled');
            if (spanEl) { spanEl.classList.add('status-cancelled'); spanEl.innerText = 'CANCELLED'; }
            if (linkEl) linkEl.innerText = 'See why';
        } else if (getSessionEnd(gp, 'race') && getSessionEnd(gp, 'race') < now) {
            card.classList.add('race-card-ended');
            if (spanEl) { spanEl.classList.add('status-ended'); spanEl.innerText = 'ENDED'; }
            if (linkEl) linkEl.innerText = 'View Full Results';
            renderTop3MiniTable(card, gp);

        } else if (gpId === nextId) {
            card.classList.add('race-card-next');
            renderNextCard(card, gp, gpId, circuits, dateText, isSprint, gpMeta);

        } else {
            card.classList.add('race-card-upcoming');
            if (spanEl) { spanEl.classList.add('status-upcoming'); spanEl.innerText = 'UPCOMING'; }
            if (linkEl) linkEl.innerText = 'Show More';
        }

        if (!card.classList.contains('race-card-next-expanded') && typeof twemoji !== 'undefined') {
            twemoji.parse(card, { folder: 'svg', ext: '.svg' });
        }
    });
}

// Injects a compact top-3 podium table (pos, gap to leader, driver + team
// logo) into an ended race card, right before the "View Full Results" link.
// TEAM_LOGO_MAP comes from grandprix.js, loaded before this script on index.html.
function renderTop3MiniTable(card, gp) {
    const contentEl = card.querySelector('.race-card-content');
    const linkEl    = card.querySelector('.race-link');
    if (!contentEl) return;

    const top3 = getSessionResults(gp, 'race')
        .filter(res => {
            const pos = parseInt(res.pos, 10);
            return pos >= 1 && pos <= 3;
        })
        .sort((a, b) => parseInt(a.pos, 10) - parseInt(b.pos, 10));

    if (!top3.length) return;

    const qualiResults = getSessionResults(gp, 'qualifying');
    const qualiMap = typeof buildQualiMap !== 'undefined' ? buildQualiMap(qualiResults) : {};

    const rowsHtml = top3.map(res => {
        const teamId   = res.team || '';
        const logoFile = typeof TEAM_LOGO_MAP !== 'undefined' ? TEAM_LOGO_MAP[teamId] : null;
        const logoHtml = logoFile
            ? `<img class="top3-team-logo" src="./img/teams/${logoFile}.png" alt="${teamId}">`
            : `<span class="top3-team-logo top3-team-logo-placeholder"></span>`;
        const lastName = res.driver.split(' ').slice(1).join(' ') || res.driver;
        const driverCode = lastName.slice(0, 3).toUpperCase();
        const posNum   = parseInt(res.pos, 10);
        const qualiPos = qualiMap[typeof normalizeName !== 'undefined' ? normalizeName(res.driver) : res.driver];
        const deltaHtml = typeof gridDeltaHtml !== 'undefined'
            ? gridDeltaHtml(res.pos, qualiPos)
            : '';
        const timeText = posNum === 1 ? '' : (res.time || '—');

        return `
            <div class="race-card-top3-row">
                <span class="top3-pos">${res.pos}</span>
                <span class="top3-delta">${deltaHtml}</span>
                ${logoHtml}
                <span class="top3-driver">${driverCode}</span>
                <span class="top3-time">${timeText}</span>
            </div>`;
    }).join('');

    const table = document.createElement('div');
    table.className = 'race-card-top3';
    table.innerHTML = rowsHtml;

    if (linkEl) linkEl.before(table);
    else contentEl.appendChild(table);
}

// Replaces the compact "next" card with a full-width, detail-rich version:
// circuit photo, flag + GP name, dates, full weekend schedule and the track layout.
function renderNextCard(card, gp, gpId, circuits, dateText, isSprint, gpMeta) {
    const circuitKey = CIRCUIT_MAP[gpId];
    const circuit    = circuits?.[circuitKey];
    const flag       = gpFlagEmoji(gpId, gpMeta, gp);
    const scheduleId = `next-card-schedule-${gpId}`;

    const now = new Date();
    const isLive = Object.keys(gp.sessions || {}).some(key => {
        const start = getSessionStart(gp, key);
        const end   = getSessionEnd(gp, key);
        return start && end && start <= now && end > now;
    });

    const isThisWeekend = !isLive && isRaceThisWeekend(gp);
    const badgeText = isLive ? 'LIVE' : isThisWeekend ? 'THIS WEEKEND' : 'NEXT';

    card.classList.add('race-card-next-expanded');
    card.classList.toggle('race-card-live', isLive);
    card.innerHTML = `
        <div class="race-card-next-top-row">
            <div class="race-card-next-photo">
                <img src="./img/circuits/${circuitKey}.png" alt="" onerror="this.parentElement.style.display='none'">
            </div>
            <div class="race-card-next-info">
                <div class="race-card-next-top">
                    <span class="race-status status-next">${badgeText}</span>
                    ${isSprint ? '<span class="sprint-chip">SPRINT</span>' : ''}
                    <span class="race-round">Round ${gp.round}</span>
                </div>
                <h3 class="race-card-next-title">${flag} ${gp.name}</h3>
                <p class="race-card-next-circuit">${circuit?.name || circuit?.Name || ''}</p>
                <a class="race-link race-card-next-cta${isLive ? ' race-card-next-cta-live' : ''}" href="./grandsprix/grandprix.html?gp=${gpId}">
                    <span>${isLive ? 'Tune in Live' : 'Show More'}</span><span class="race-card-next-cta-arrow">→</span>
                </a>
            </div>
            <div class="race-card-next-layout">
                <img class="race-card-next-layout-svg" src="./img/circuits/${circuitKey}-layout.svg" alt="Track layout" loading="lazy"
                     onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='./img/circuits/${circuitKey}-layout.png';this.classList.remove('race-card-next-layout-svg');}else{this.parentElement.style.display='none';}">
            </div>
        </div>
        <div class="race-card-next-schedule" id="${scheduleId}"></div>`;

    renderHeroSchedule(gp, gpId, scheduleId);
    if (typeof twemoji !== 'undefined') twemoji.parse(card, { folder: 'svg', ext: '.svg' });
}

// Returns true if the race session falls on the current (or immediately upcoming) Sat/Sun.
function isRaceThisWeekend(gp) {
    const raceStart = getSessionStart(gp, 'race');
    if (!raceStart) return false;

    const now = new Date();
    const day = now.getDay(); // 0=Sun ... 6=Sat
    const satOffset = day === 6 ? 0 : day === 0 ? -1 : 6 - day;

    const weekendStart = new Date(now);
    weekendStart.setHours(0, 0, 0, 0);
    weekendStart.setDate(weekendStart.getDate() + satOffset);

    const weekendEnd = new Date(weekendStart);
    weekendEnd.setDate(weekendEnd.getDate() + 1);
    weekendEnd.setHours(23, 59, 59, 999);

    return raceStart >= weekendStart && raceStart <= weekendEnd;
}

function getSession(gp, sessionKey) {
    return gp?.sessions?.[sessionKey] || null;
}

function getSessionStart(gp, sessionKey) {
    return parseDate(getSession(gp, sessionKey)?.date);
}

function getSessionEnd(gp, sessionKey) {
    const session = getSession(gp, sessionKey);
    if (!session) return null;

    // Si el JSON trae endDate explícito, usalo.
    if (session.endDate) return parseDate(session.endDate);

    // Fallback para temporadas historicas que solo tienen "date":
    // si la fecha de inicio ya paso hace mas de 4 horas, la sesion
    // se considera terminada. Las carreras de F1 duran ~2 h, asi que
    // 4 h de margen es suficiente para no marcar una carrera en vivo
    // como ended antes de tiempo.
    const start = parseDate(session.date);
    if (!start) return null;
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    return new Date(start.getTime() + FOUR_HOURS_MS);
}

function getSessionResults(gp, sessionKey) {
    const results = getSession(gp, sessionKey)?.results;
    return Array.isArray(results) ? results : [];
}

function isGpCancelled(gp) {
    const status = gp?.status?.toString().trim().toLowerCase();
    return Boolean(
        gp?.cancelled ||
        gp?.canceled ||
        gp?.is_cancelled ||
        gp?.isCanceled ||
        status === 'cancelled' ||
        status === 'canceled'
    );
}

function hasSession(gp, sessionKey) {
    const session = getSession(gp, sessionKey);
    return !!session && (session.date || session.endDate || Array.isArray(session.results));
}

function renderHeroSchedule(gp, gpId, containerId = 'hero-schedule-days') {
    const container = document.getElementById(containerId);
    if (!container || !gp?.sessions) return;

    const now = new Date();
    const isSprint = !!getSession(gp, 'sprintQualy') || !!getSession(gp, 'sprintRace') || !!gp.sprint;

    const sessionDefs = isSprint
        ? [
            ['fp1',          'Free practice 1'],
            ['sprintQualy',  'Sprint Qualifying'],
            ['sprintRace',   'Sprint Race'],
            ['qualifying',   'Qualifying'],
            ['race',         'Race'],
        ]
        : [
            ['fp1',          'Free practice 1'],
            ['fp2',          'Free practice 2'],
            ['fp3',          'Free practice 3'],
            ['qualifying',   'Qualifying'],
            ['race',         'Race'],
        ];

    const sessions = sessionDefs
        .filter(([key]) => hasSession(gp, key))
        .map(([key, name]) => ({
            key,
            name,
            start: getSessionStart(gp, key),
            end: getSessionEnd(gp, key),
        }));

    const dayMap = new Map();
    for (const s of sessions) {
        if (!s.start) continue;
        const dayKey = s.start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
        if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
        dayMap.get(dayKey).push(s);
    }

    const fmt = (d) => d
        ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : '—';

    const sessionHTML = (s) => {
        const ended   = s.end   && s.end   <= now;
        const live    = s.start && s.start <= now && s.end > now;
        const future  = !ended && !live;
        const tag     = live ? 'Live' : ended ? 'Ended' : 'Upcoming';
        const classes = ['schedule-session',
            ended ? 'schedule-session-ended' : live ? 'schedule-session-live' : ''
        ].filter(Boolean).join(' ');
        const dataAttr = future && s.start ? ` data-start="${s.start.getTime()}"` : '';

        const cta = ended
            ? `<a href="./grandsprix/grandprix.html?gp=${gpId}" class="schedule-session-cta">
                <span>View Session Details</span>
                <span class="schedule-session-cta-arrow">→</span>
               </a>`
            : live
            ? `<a href="./live.html" class="schedule-session-cta schedule-session-cta-live">
                <span>Tune in Live</span>
                <span class="schedule-session-cta-arrow">→</span>
               </a>`
            : '';

        return `
        <div class="${classes}"${dataAttr}>
            <span class="schedule-session-name">${s.name}</span>
            ${ended ? '' : `<span class="schedule-session-time">${fmt(s.start)} – ${fmt(s.end)}</span>`}
            <span class="schedule-session-tag">${tag}</span>
            ${cta}
        </div>`;
    };

    const dayHTML = (dayLabel, sessions) => {
        const [weekday, ...rest] = dayLabel.split(' ');
        const allEnded = sessions.every(s => s.end && s.end <= now);
        return `
        <div class="schedule-day${allEnded ? ' schedule-day-ended' : ''}">
            <p class="schedule-day-title">
                <span class="day-weekday">${weekday}</span>
                <span class="day-date">${rest.join(' ')}</span>
            </p>
            ${sessions.map(sessionHTML).join('')}
        </div>`;
    };

    container.innerHTML = [...dayMap.entries()].map(([k, ss]) => dayHTML(k, ss)).join('');

    container.querySelectorAll('.schedule-session-ended, .schedule-session-live').forEach(row => {
        const cta = row.querySelector('.schedule-session-cta');
        if (!cta) return;

        let ctaTimeout = null;

        row.addEventListener('mouseenter', () => {
            clearTimeout(ctaTimeout);
            row.classList.add('schedule-session-content-hidden');

            ctaTimeout = setTimeout(() => {
                row.classList.add('schedule-session-cta-visible');
            }, 150);
        });

        row.addEventListener('mouseleave', () => {
            clearTimeout(ctaTimeout);
            row.classList.remove('schedule-session-cta-visible');

            ctaTimeout = setTimeout(() => {
                row.classList.remove('schedule-session-content-hidden');
            }, 150);
        });
    });

    container.querySelectorAll('.schedule-session[data-start]').forEach(row => {
        const timeEl   = row.querySelector('.schedule-session-time');
        const original = timeEl.textContent;
        const startMs  = Number(row.dataset.start);
        let interval   = null;

        const fmtRemaining = () => {
            const diff = startMs - Date.now();
            if (diff <= 0) return original;
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            const parts = [
                d > 0 && `${d}d`,
                h > 0 && `${h}h`,
                m > 0 && `${m}m`,
                `${s}s`,
            ].filter(Boolean);
            return parts.slice(0, 2).join(' ');
        };

        const setTime = (text) => {
            timeEl.style.transition = 'opacity 0.15s ease';
            timeEl.style.opacity = '0';
            setTimeout(() => {
                timeEl.textContent = text;
                timeEl.style.opacity = '1';
            }, 150);
        };

        row.addEventListener('mouseenter', () => {
            setTime(fmtRemaining());
            interval = setInterval(() => { timeEl.textContent = fmtRemaining(); }, 1000);
        });

        row.addEventListener('mouseleave', () => {
            clearInterval(interval);
            setTime(original);
        });
    });
}

// ── Driver Standings ────────────────────────────────────────────────────────

function buildStandings(season) {
    const driverMap = {}; // { fullName: { pts, team, lastRound } }

    for (const [, gp] of Object.entries(season)) {
        if (!gp || typeof gp !== 'object') continue;

        for (const sessionKey of ['race', 'sprintRace']) {
            const entries = getSessionResults(gp, sessionKey);
            if (!Array.isArray(entries)) continue;

            for (const entry of entries) {
                const driver = entry.driver;
                const pts    = Number(entry.pts) || 0;
                const team   = entry.team || DRIVER_TEAM[driver] || '';
                if (!driver) continue;

                if (!driverMap[driver]) {
                    driverMap[driver] = { pts: 0, team, lastRound: 0 };
                }

                driverMap[driver].pts += pts;
                if (team) driverMap[driver].team = team;
                if (gp.round > driverMap[driver].lastRound) {
                    driverMap[driver].lastRound = gp.round;
                }
            }
        }
    }

    const standings = Object.entries(driverMap)
        .filter(([, d]) => d.pts > 0)
        .sort(([, a], [, b]) => b.pts - a.pts || b.lastRound - a.lastRound);

    if (!standings.length) return;

    const completedRaceGPs = Object.values(season)
        .filter(gp => gp && typeof gp === 'object' && !Array.isArray(gp))
        .filter(gp => getSessionResults(gp, 'race').length > 0);

    const lastRound = completedRaceGPs.length
        ? Math.max(...completedRaceGPs.map(gp => gp.round))
        : 0;

    const lastGP = Object.values(season).find(gp =>
        gp && typeof gp === 'object' && !Array.isArray(gp) && gp.round === lastRound
    );

    const subtitleEl = document.querySelector('.standings-subtitle');
    if (subtitleEl && lastGP) {
        subtitleEl.textContent = `After ${lastGP.name.replace(' Grand Prix', ' GP')} · Round ${String(lastRound).padStart(2, '0')}`;
    }

    const list = document.querySelector('.standings-list');
    if (!list) return;

    list.innerHTML = standings.slice(0, 10).map(([driver, data], i) => {
        const pos        = i + 1;
        const teamName   = data.team;
        const teamMeta   = TEAM_META[teamName] || { cls: '', label: teamName };
        const imgSlug    = DRIVER_IMG[driver] || driver.split(' ').pop().toLowerCase();
        const lastName   = driver.split(' ').slice(1).join(' ') || driver;

        return `
        <div class="standing-row ${teamMeta.cls}">
            <span class="standing-pos">${pos}</span>
            <img class="standing-avatar"
                 src="./img/drivers/${imgSlug}.png"
                 alt="${driver}"
                 onerror="this.style.visibility='hidden'">
            <span class="standing-name">${lastName}</span>
            <span class="standing-pts">${data.pts}</span>
            <span class="standing-delta delta-neutral">—</span>
        </div>`;
    }).join('');
}