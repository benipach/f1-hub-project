// pages/index.js — orchestrates the DOM for index.html (hero + season calendar).
// Pure logic lives in shared/*.js; this file only touches the DOM.
//
// KNOWN LIMITATION: season2026.json is being migrated row by row from raw
// display names to IDs, so `driver`/`team` fields are currently a mix of
// both. Team resolution tries a direct ID match first, then falls back to
// a best-effort slug guess for unmigrated rows. Driver code has no such
// fallback — if `driver` isn't a real drivers.json ID, it shows nothing.
//
// Sprint weekends: fp1 → sprintQualy → sprintRace → qualifying → race
// (confirmed against real season2026.json, no fp2/fp3 on those weekends).

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [latest, circuits, cities, countries, teams, drivers] = await Promise.all([
            loadLatest('.'),
            loadCircuits('.'),
            loadCities('.'),
            loadCountries('.'),
            loadTeams('.'),
            loadDrivers('.'),
        ]);

        const season = await loadSeason('.', latest.latestSeason);
        const ctx = { circuits, cities, countries, teams, drivers };

        const titleEl = document.getElementById('calendar-title');
        if (titleEl) titleEl.textContent = `${latest.latestSeason} Season Calendar`;

        renderRaceCards(season, ctx);
        renderHero(season, ctx);

        if (typeof twemoji !== 'undefined') {
            twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
        }
    } catch (err) {
        console.error('Error loading home page data:', err);
    }
});

// ── Location helpers (GP → circuit → city → country) ──────────────────────

function getGpLocation(gp, ctx) {
    const circuit = ctx.circuits?.[gp.circuitId] ?? null;
    const city    = ctx.cities?.[circuit?.location?.city] ?? null;
    const country = ctx.countries?.[city?.country] ?? null;
    return { circuit, city, country };
}

function isoToFlagEmoji(isoCode) {
    if (!isoCode || isoCode.length !== 2) return '';
    return String.fromCodePoint(
        ...[...isoCode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    );
}

function getGpFlag(gp, ctx)     { return isoToFlagEmoji(getGpLocation(gp, ctx).country?.isoCode); }
function getGpCityName(gp, ctx) { return getGpLocation(gp, ctx).city?.name ?? ''; }

// Card titles use "GP" instead of the full "Grand Prix" (hero keeps the full name).
function gpShortName(gp) { return gp.name.replace(/Grand Prix/i, 'GP'); }

// ── Team helper (temporary name→slug bridge, see file header) ─────────────

function toTeamSlugGuess(name) {
    return name
        ?.toLowerCase()
        .replace(/ f1 team$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') ?? '';
}

function resolveTeamId(rawTeamName, teamsData) {
    if (teamsData?.[rawTeamName]) return rawTeamName; // already an ID
    return toTeamSlugGuess(rawTeamName); // legacy raw name, best effort
}

function resolveTeam(rawTeamName, teamsData) {
    return getTeamMeta(resolveTeamId(rawTeamName, teamsData), teamsData);
}

// Team logos follow a filename convention — [id]-logo.png — instead of a
// `logo` field in teams.json.
function teamLogoPath(teamId) {
    return teamId ? `./img/teams/${teamId}-logo.png` : null;
}

// Driver code (e.g. "RUS") only comes from a real drivers.json match — no
// guessing from whatever string is in `driver`, so an un-migrated/unknown
// row shows nothing instead of a wrong code.
function resolveDriverCode(rawDriver, driversData) {
    return driversData?.[rawDriver]?.lastName ?? '';
}

// ── Position delta (grid → finish) ─────────────────────────────────────────
//
// The race grid always comes from `qualifying`, even on sprint weekends —
// `sprintQualy` only sets the Sprint's own grid, not the main race's.

function getGridPosition(gp, driverKey) {
    const row = getSessionResults(gp, 'qualifying').find(r => r.driver === driverKey);
    return row ? Number(row.pos) : null;
}

// Chevron icon — same as grandprix.js's deltaArrowSvg (identical markup, so
// both pages render the exact same arrow instead of two different styles).
function deltaArrowSvg(direction) {
    const rotate = direction === 'down' ? 180 : 0;
    return `<svg class="res-delta-arrow" viewBox="0 0 24 24" style="transform:rotate(${rotate}deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Flat bar for "unchanged" — same stroke weight/style as the chevron, just
// straight, so it sits as its own flex child (gap applies) instead of being
// fused into the number as one text string.
function deltaBarSvg() {
    return `<svg class="res-delta-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12 L20.5 12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`;
}

function renderDeltaHTML(gridPos, finishPos) {
    if (!gridPos || !finishPos || Number.isNaN(gridPos) || Number.isNaN(finishPos)) {
        return `<span class="res-delta res-delta--none">—</span>`;
    }

    const diff = gridPos - finishPos; // positive = gained positions on race day
    if (diff > 0) {
        return `<span class="res-delta res-delta--up">${deltaArrowSvg('up')}${diff}</span>`;
    } else if (diff < 0) {
        return `<span class="res-delta res-delta--down">${deltaArrowSvg('down')}${Math.abs(diff)}</span>`;
    } else {
        return `<span class="res-delta res-delta--same">${deltaBarSvg()}0</span>`;
    }
}

// ── Hero ────────────────────────────────────────────────────────────────

function findNextRace(season) {
    const now = new Date();
    return getSeasonEntries(season).find(([, gp]) => {
        if (isGpCancelled(gp)) return false;
        const end = getSessionEnd(gp, 'race');
        return !end || end > now;
    }) ?? null;
}

function renderHero(season, ctx) {
    const nextEntry = findNextRace(season);
    if (!nextEntry) return; // season finished — leave hero markup as shipped

    const [gpId, gp] = nextEntry;
    const { circuit } = getGpLocation(gp, ctx);

    const heroImg = document.getElementById('hero-image');
    if (heroImg) heroImg.src = `./img/circuits/${gp.circuitId}.png`;

    window._heroCity = getGpCityName(gp, ctx);

    const gpNameEl = document.getElementById('hero-gp-name');
    if (gpNameEl) gpNameEl.textContent = `${getGpFlag(gp, ctx)} ${gp.name.toUpperCase()}`.trim();

    const flagEl = document.getElementById('hero-gp-flag');
    if (flagEl) flagEl.textContent = '';

    const circuitLabelEl = document.getElementById('hero-circuit-label');
    if (circuitLabelEl) circuitLabelEl.textContent = circuit?.name ?? '—';

    const circuitBtn = document.getElementById('hero-circuit-btn');
    if (circuitBtn) circuitBtn.href = `./grandsprix/grandprix.html?gp=${gpId}`;

    renderWeekendSchedule(gp, gpId, 'hero-schedule-days');
}

// ── Weekend schedule (shared by hero + expanded "next" card) ──────────────

function renderWeekendSchedule(gp, gpId, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !gp?.sessions) return;

    const now = new Date();
    const sessionDefs = gp.sprint
        ? [['fp1', 'Free Practice 1'], ['sprintQualy', 'Sprint Qualifying'], ['sprintRace', 'Sprint'],
           ['qualifying', 'Qualifying'], ['race', 'Race']]
        : [['fp1', 'Free Practice 1'], ['fp2', 'Free Practice 2'], ['fp3', 'Free Practice 3'],
           ['qualifying', 'Qualifying'], ['race', 'Race']];

    const sessions = sessionDefs
        .filter(([key]) => hasSession(gp, key))
        .map(([key, name]) => ({ key, name, start: getSessionStart(gp, key), end: getSessionEnd(gp, key) }))
        .filter(s => s.start);

    const dayMap = new Map();
    for (const s of sessions) {
        const dayKey = s.start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
        (dayMap.get(dayKey) ?? dayMap.set(dayKey, []).get(dayKey)).push(s);
    }

    const fmtTime = (d) => d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

    const sessionHTML = (s) => {
        const finished = s.end && s.end <= now;
        const live  = s.start && s.start <= now && s.end > now;
        const tag   = live ? 'Live' : finished ? 'Finished' : 'Upcoming';
        const cls   = ['schedule-session', finished ? 'schedule-session-finished' : live ? 'schedule-session-live' : '']
            .filter(Boolean).join(' ');

        const cta = finished
            ? `<a href="./grandsprix/grandprix.html?gp=${gpId}" class="schedule-session-cta">
                <span>View Session Details</span><span class="schedule-session-cta-arrow">→</span></a>`
            : live
            ? `<a href="./live.html" class="schedule-session-cta schedule-session-cta-live">
                <span>Tune in Live</span><span class="schedule-session-cta-arrow">→</span></a>`
            : '';

        return `
        <div class="${cls}">
            <span class="schedule-session-name">${s.name}</span>
            ${finished ? '' : `<span class="schedule-session-time">${fmtTime(s.start)} – ${fmtTime(s.end)}</span>`}
            <span class="schedule-session-tag">${tag}</span>
            ${cta}
        </div>`;
    };

    const dayHTML = (dayLabel, sessions) => {
        const [weekday, ...rest] = dayLabel.split(' ');
        return `
        <div class="schedule-day">
            <p class="schedule-day-title">
                <span class="day-weekday">${weekday}</span>
                <span class="day-date">${rest.join(' ')}</span>
            </p>
            ${sessions.map(sessionHTML).join('')}
        </div>`;
    };

    container.innerHTML = [...dayMap.entries()].map(([k, ss]) => dayHTML(k, ss)).join('');
    bindSessionHoverCta(container);
}

// CTA-on-hover behavior for finished/live sessions (swaps content for a "view/tune in" link).
function bindSessionHoverCta(container) {
    container.querySelectorAll('.schedule-session-finished, .schedule-session-live').forEach(row => {
        if (!row.querySelector('.schedule-session-cta')) return;
        let t = null;
        row.addEventListener('mouseenter', () => {
            clearTimeout(t);
            row.classList.add('schedule-session-content-hidden');
            t = setTimeout(() => row.classList.add('schedule-session-cta-visible'), 150);
        });
        row.addEventListener('mouseleave', () => {
            clearTimeout(t);
            row.classList.remove('schedule-session-cta-visible');
            t = setTimeout(() => row.classList.remove('schedule-session-content-hidden'), 150);
        });
    });
}

// ── Season calendar (race cards) ───────────────────────────────────────────

function renderRaceCards(season, ctx) {
    const calendar = document.querySelector('.race-calendar');
    if (!calendar) return;

    calendar.querySelectorAll('.race-card').forEach(el => el.remove());

    const entries = getSeasonEntries(season);
    const nextId  = findNextRace(season)?.[0] ?? null;
    const now     = new Date();

    for (const [gpId, gp] of entries) {
        const isNext = gpId === nextId;
        const card = buildRaceCard(gpId, gp, ctx, { isNext, now });
        calendar.appendChild(card);

        // Schedule render needs the card already attached to `document`,
        // since renderWeekendSchedule looks up its container via
        // document.getElementById — a detached node won't resolve.
        if (isNext) renderWeekendSchedule(gp, gpId, `next-card-schedule-${gpId}`);
    }

    initRaceCardReveal();
}

function buildRaceCard(gpId, gp, ctx, { isNext, now }) {
    const card = document.createElement('div');
    card.className = 'race-card';
    card.dataset.id = gpId;

    const isSprint = !!gp.sprint;
    if (isSprint) card.classList.add('race-card-sprint');

    if (isGpCancelled(gp)) {
        card.classList.add('race-card-cancelled');
        card.innerHTML = compactCardHTML(gpId, gp, ctx, isSprint, {
            statusClass: 'status-cancelled', statusText: 'CANCELLED', linkText: 'See why',
        });
    } else if (getSessionEnd(gp, 'race') && getSessionEnd(gp, 'race') < now) {
        card.classList.add('race-card-finished');
        card.innerHTML = compactCardHTML(gpId, gp, ctx, isSprint, {
            statusClass: 'status-finished', statusText: '🏁 FINISHED', linkText: 'View Full Results',
        });
        appendTop3Table(card, gp, ctx);
    } else if (isNext) {
        card.classList.add('race-card-next', 'race-card-next-expanded');
        card.innerHTML = expandedCardHTML(gpId, gp, ctx, isSprint);
    } else {
        card.classList.add('race-card-upcoming');
        card.innerHTML = compactCardHTML(gpId, gp, ctx, isSprint, {
            statusClass: 'status-upcoming', statusText: 'UPCOMING', linkText: 'Show More',
        });
    }

    return card;
}

function compactCardHTML(gpId, gp, ctx, isSprint, { statusClass, statusText, linkText }) {
    const flag       = getGpFlag(gp, ctx);
    const roundLabel = `Round ${String(gp.round).padStart(2, '0')}`;
    const dateText   = formatWeekendDateRange(gp); // from shared/format.js

    return `
        <div class="race-card-content">
            <span class="race-round">${roundLabel}${isSprint ? ' <span class="sprint-chip">SPRINT</span>' : ''}</span>
            <h3>${flag} ${gpShortName(gp)}</h3>
            <p class="race-date">${dateText}</p>
            <span class="race-status ${statusClass}">${statusText}</span>
            <a class="race-link" href="./grandsprix/grandprix.html?gp=${gpId}">${linkText}</a>
        </div>`;
}

function expandedCardHTML(gpId, gp, ctx, isSprint) {
    const { circuit } = getGpLocation(gp, ctx);
    const flag = getGpFlag(gp, ctx);
    const now  = new Date();

    const isLive = Object.keys(gp.sessions ?? {}).some(key => {
        const start = getSessionStart(gp, key);
        const end   = getSessionEnd(gp, key);
        return start && end && start <= now && end > now;
    });
    const badgeText = isLive ? 'LIVE' : 'NEXT';

    return `
        <div class="race-card-next-top-row">
            <div class="race-card-next-photo">
                <img src="./img/circuits/${gp.circuitId}.png" alt="" onerror="this.parentElement.style.display='none'">
            </div>
            <div class="race-card-next-info">
                <div class="race-card-next-top">
                    <span class="race-status status-next">${badgeText}</span>
                    ${isSprint ? '<span class="sprint-chip">SPRINT</span>' : ''}
                    <span class="race-round">Round ${gp.round}</span>
                </div>
                <h3 class="race-card-next-title">${flag} ${gpShortName(gp)}</h3>
                <p class="race-card-next-circuit">${circuit?.name ?? ''}</p>
                <a class="race-link race-card-next-cta${isLive ? ' race-card-next-cta-live' : ''}"
                   href="./grandsprix/grandprix.html?gp=${gpId}">
                    <span>${isLive ? 'Tune in Live' : 'Show More'}</span><span class="race-card-next-cta-arrow">→</span>
                </a>
            </div>
            <div class="race-card-next-layout">
                <img class="race-card-next-layout-svg" src="./img/circuits/${gp.circuitId}-layout.svg" alt="Track layout" loading="lazy"
                     onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='./img/circuits/${gp.circuitId}-layout.png';this.classList.remove('race-card-next-layout-svg');}else{this.parentElement.style.display='none';}">
            </div>
        </div>
        <div class="race-card-next-schedule" id="next-card-schedule-${gpId}"></div>`;
}

function appendTop3Table(card, gp, ctx) {
    const contentEl = card.querySelector('.race-card-content');
    const linkEl    = card.querySelector('.race-link');
    if (!contentEl) return;

    const top3 = getSessionResults(gp, 'race')
        .filter(r => Number(r.pos) >= 1 && Number(r.pos) <= 3)
        .sort((a, b) => Number(a.pos) - Number(b.pos));
    if (!top3.length) return;

    const rowsHTML = top3.map(res => {
        const teamId   = resolveTeamId(res.team, ctx.teams);
        const team     = getTeamMeta(teamId, ctx.teams);
        const logoSrc  = teamLogoPath(teamId);
        const logoHTML = logoSrc
            ? `<img class="top3-team-logo" src="${logoSrc}" alt="${team.label}"
                 onerror="this.outerHTML='<span class=&quot;top3-team-logo top3-team-logo-placeholder&quot;></span>'">`
            : `<span class="top3-team-logo top3-team-logo-placeholder"></span>`;
        const driverCode = resolveDriverCode(res.driver, ctx.drivers);
        const gridPos    = getGridPosition(gp, res.driver);
        const deltaHTML  = renderDeltaHTML(gridPos, Number(res.pos));

        return `
            <div class="race-card-top3-row">
                <span class="top3-pos">${res.pos}</span>
                <span class="top3-delta">${deltaHTML}</span>
                ${logoHTML}
                <span class="top3-driver">${driverCode}</span>
                <span class="top3-time">${res.pos == 1 ? '' : (res.time ?? '—')}</span>
            </div>`;
    }).join('');

    const table = document.createElement('div');
    table.className = 'race-card-top3';
    table.innerHTML = rowsHTML;

    if (linkEl) linkEl.before(table);
    else contentEl.appendChild(table);
}

// ── Scroll reveal (fade cards in as they enter the viewport) ──────────────

let _cardRevealObserver = null;

function initRaceCardReveal() {
    _cardRevealObserver?.disconnect();

    const cards = [...document.querySelectorAll('.race-card')];
    const title = document.getElementById('calendar-title');
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

    requestAnimationFrame(() => requestAnimationFrame(() => {
        cards.forEach(el => _cardRevealObserver?.observe(el));
        if (title) _cardRevealObserver?.observe(title);
    }));
}