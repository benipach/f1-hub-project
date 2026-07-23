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

// Maps GP id → host city (shown in the blurred canvas text on the hero left)
const GP_CITY = {
    'australian-gp':    'Melbourne',
    'chinese-gp':       'Shanghai',
    'japanese-gp':      'Suzuka',
    'bahrain-gp':       'Sakhir',
    'saudi-arabian-gp': 'Jeddah',
    'miami-gp':         'Miami',
    'canadian-gp':      'Montréal',
    'monaco-gp':        'Monaco',
    'barcelona-gp':     'Barcelona',
    'austrian-gp':      'Spielberg',
    'british-gp':       'Silverstone',
    'belgian-gp':       'Spa',
    'hungarian-gp':     'Budapest',
    'dutch-gp':         'Zandvoort',
    'italian-gp':       'Monza',
    'spanish-gp':       'Madrid',
    'azerbaijan-gp':    'Baku',
    'singapore-gp':     'Singapore',
    'united-states-gp': 'Austin',
    'mexican-gp':       'Mexico City',
    'brazilian-gp':     'São Paulo',
    'las-vegas-gp':     'Las Vegas',
    'qatar-gp':         'Lusail',
    'abu-dhabi-gp':     'Abu Dhabi',
};

// Maps GP id → country flag emoji (shown next to the GP title in the hero)
const GP_FLAG = {
    'australian-gp':    '🇦🇺',
    'chinese-gp':       '🇨🇳',
    'japanese-gp':      '🇯🇵',
    'bahrain-gp':       '🇧🇭',
    'saudi-arabian-gp': '🇸🇦',
    'miami-gp':         '🇺🇸',
    'canadian-gp':      '🇨🇦',
    'monaco-gp':        '🇲🇨',
    'barcelona-gp':     '🇪🇸',
    'austrian-gp':      '🇦🇹',
    'british-gp':       '🇬🇧',
    'belgian-gp':       '🇧🇪',
    'hungarian-gp':     '🇭🇺',
    'dutch-gp':         '🇳🇱',
    'italian-gp':       '🇮🇹',
    'spanish-gp':       '🇪🇸',
    'azerbaijan-gp':    '🇦🇿',
    'singapore-gp':     '🇸🇬',
    'united-states-gp': '🇺🇸',
    'mexican-gp':       '🇲🇽',
    'brazilian-gp':     '🇧🇷',
    'las-vegas-gp':     '🇺🇸',
    'qatar-gp':         '🇶🇦',
    'abu-dhabi-gp':     '🇦🇪',
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [season, circuits] = await Promise.all([
            loadSeason('.'),
            loadCircuits('.')
        ]);
        updateDashboard(season, circuits);
        buildStandings(season);
        initRaceCardReveal();
    } catch (err) {
        console.error('Error cargando datos:', err);
    }
});

// ── SCROLL REVEAL ─────────────────────────────────────────────────
function initRaceCardReveal() {
    const cards = [...document.querySelectorAll('.race-card')];
    const title = document.querySelector('.calendar-title');
    if (!cards.length) return;

    const obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const idx   = cards.indexOf(entry.target);
            const delay = idx === -1 ? 0 : (idx % 4) * 40; // left-to-right per row (4-col grid)
            setTimeout(() => entry.target.classList.add('in-view'), delay);
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.1 });

    // Wait two frames so the browser paints the initial hidden state first —
    // otherwise cards already visible on load (past sessions) skip the animation.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        cards.forEach(el => obs.observe(el));
        if (title) obs.observe(title);
    }));
}

function updateDashboard(season, circuits) {
    const now = new Date();
    const nextEntry = findNextRace(season);
    if (!nextEntry) return;
    const [nextId, nextGP] = nextEntry;

    document.documentElement.style.setProperty('--race-gradient', buildGradient(nextGP.color));

    const circuitKey = CIRCUIT_MAP[nextId];
    const circuit = circuits[circuitKey];

    // Set hero background image
    const heroImg = document.getElementById('hero-image');
    if (heroImg) heroImg.src = `./img/circuits/${circuitKey}.png`;

    // Set city for the canvas blurred text (inline script reads window._heroCity)
    window._heroCity = GP_CITY[nextId] || '';

    // GP name (full name, e.g. "AUSTRIAN GRAND PRIX")
    const gpNameEl = document.getElementById('hero-gp-name');
    if (gpNameEl) gpNameEl.textContent = nextGP.name.toUpperCase();

    // Country flag next to the GP title
    const flagEl = document.getElementById('hero-gp-flag');
    if (flagEl) flagEl.textContent = GP_FLAG[nextId] || '';

    // Circuit name below the GP title
    const circuitLabelEl = document.getElementById('hero-circuit-label');
    if (circuitLabelEl) circuitLabelEl.textContent = circuit?.name || circuit?.Name || '—';

    // Sprint pill
    const sprintPill = document.getElementById('hero-sprint-pill');
    if (sprintPill) sprintPill.style.display = nextGP.sprint ? 'inline-flex' : 'none';

    const circuitBtn = document.getElementById('hero-circuit-btn');
    if (circuitBtn) circuitBtn.href = `./races/race.html?gp=${nextId}`;

    renderHeroSchedule(nextGP, nextId);
    updateRacecards(season, nextId, now);
}

function updateRacecards(season, nextId, now) {
    document.querySelectorAll('.race-card').forEach(card => {
        const gpId   = card.dataset.id;
        const gp     = season[gpId];
        const spanEl = card.querySelector('.race-status');
        const linkEl = card.querySelector('.race-link');
        if (!gp) return;

        card.classList.remove('race-card-ended', 'race-card-next', 'race-card-upcoming', 'race-card-cancelled');
        if (spanEl) spanEl.className = 'race-status';
        if (linkEl) linkEl.href = `./races/race.html?gp=${gpId}`;

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

        if (gp.cancelled) {
            card.classList.add('race-card-cancelled');
            if (spanEl) { spanEl.classList.add('status-cancelled'); spanEl.innerText = 'CANCELLED'; }
            if (linkEl) linkEl.innerText = 'Cancelled';
        } else if (getSessionEnd(gp, 'race') && getSessionEnd(gp, 'race') < now) {
            card.classList.add('race-card-ended');
            if (spanEl) { spanEl.classList.add('status-ended'); spanEl.innerText = 'ENDED'; }
            if (linkEl) linkEl.innerText = 'View Results';

        } else if (gpId === nextId) {
            // (Líneas de gradiente en el <h3> removidas)
            card.classList.add('race-card-next');
            if (spanEl) { spanEl.classList.add('status-next'); spanEl.innerText = 'NEXT'; }
            if (linkEl) linkEl.innerText = 'Show More';

        } else {
            card.classList.add('race-card-upcoming');
            if (spanEl) { spanEl.classList.add('status-upcoming'); spanEl.innerText = 'UPCOMING'; }
            if (linkEl) linkEl.innerText = 'Show More';
        }
    });
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

function hasSession(gp, sessionKey) {
    const session = getSession(gp, sessionKey);
    return !!session && (session.date || session.endDate || Array.isArray(session.results));
}

function renderHeroSchedule(gp, gpId) {
    const container = document.getElementById('hero-schedule');
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
            ? `<a href="./races/race.html?gp=${gpId}" class="schedule-session-cta">
                <span>View Session Details</span>
                <span class="schedule-session-cta-arrow">→</span>
               </a>`
            : live
            ? `<a href="./races/race.html?gp=${gpId}" class="schedule-session-cta schedule-session-cta-live">
                <span>Tune in Live</span>
                <span class="schedule-session-cta-arrow">→</span>
               </a>`
            : '';

        return `
        <div class="${classes}"${dataAttr}>
            <span class="schedule-session-name">${s.name}</span>
            <span class="schedule-session-time">${fmt(s.start)} – ${fmt(s.end)}</span>
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
