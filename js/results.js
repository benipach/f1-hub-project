// results.js: the Results page (results.html), any season in one place.
//
// It used to be three pages (Results, Championship and Archive), each with
// its own year selector. Now one year drives the whole page, top to bottom:
//   - the hero, the season poster (js/season-hero.js);
//   - Championship: points curve + drivers and teams standings
//     (renderChampionship, js/championship.js);
//   - Race results, built here: the tabs are the sessions that season
//     actually has (1990 has no FP3 or Sprint; 2026 does), and each row is a
//     Grand Prix with the session's winner/pole that expands its full
//     classification, the same table as the Grand Prix page
//     (buildResultTable, js/shared/result-table.js).
//
// The year goes in the URL (?season=2019) and is changed with the dropdown
// in the sticky bar (js/shared/season-picker.js); without a parameter the
// current season opens (data/latest.json). The catalogs (circuits, cities,
// countries, teams, drivers) are loaded once, and each year's season file
// once for the whole page.

// ── SESSION DEFINITIONS ───────────────────────────────────────────
// timeField/timeLabel: which JSON field holds P1's time and what to call the column.
// hasLaps: whether that session's entries carry a `laps` field.
// posLabel: header for the driver column (Winner / Pole / P1).
const SESSION_DEFS = [
    { key: 'fp1',         label: 'Practice 1',       labelShort: 'FP1', title: 'Free Practice 1',  timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: true,  posLabel: 'P1' },
    { key: 'fp2',         label: 'Practice 2',       labelShort: 'FP2', title: 'Free Practice 2',  timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: true,  posLabel: 'P1' },
    { key: 'fp3',         label: 'Practice 3',       labelShort: 'FP3', title: 'Free Practice 3',  timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: true,  posLabel: 'P1' },
    { key: 'sprintQualy', label: 'Sprint Qualifying', labelShort: 'SQ', title: 'Sprint Qualifying', timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: false, posLabel: 'Pole' },
    { key: 'sprintRace',  label: 'Sprint',           labelShort: 'SR', title: 'Sprint Race',       timeField: 'time',    timeLabel: 'Duration',  hasLaps: true,  posLabel: 'Winner' },
    { key: 'qualifying',  label: 'Qualifying',       title: 'Qualifying',       timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: false, posLabel: 'Pole' },
    { key: 'race',        label: 'Race',             title: 'Race',             timeField: 'time',    timeLabel: 'Duration',  hasLaps: true,  posLabel: 'Winner' },
];
const DEFAULT_KEY = 'race';

// ── FLAGS (fallback) ──────────────────────────────────────────────
// The flag comes from circuit → city → country (getGpFlag, shared/resolve.js).
// Old seasons don't always have a circuitId; for those it falls back to this
// map by GP id.
const FLAG_MAP = {
    'australian-gp':     '🇦🇺',
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
    'san-marino-gp':     '🇸🇲',
    'european-gp':       '🇪🇺',
    'french-gp':         '🇫🇷',
    'german-gp':         '🇩🇪',
    'portuguese-gp':     '🇵🇹',
    'argentine-gp':      '🇦🇷',
    'south-african-gp':  '🇿🇦',
    'pacific-gp':        '🇯🇵',
    'luxembourg-gp':     '🇱🇺',
    'malaysian-gp':      '🇲🇾',
    'turkish-gp':        '🇹🇷',
    'korean-gp':         '🇰🇷',
    'indian-gp':         '🇮🇳',
    'russian-gp':        '🇷🇺',
    'styrian-gp':        '🇦🇹',
    '70th-anniversary-gp': '🇬🇧',
    'tuscan-gp':         '🇮🇹',
    'eifel-gp':          '🇩🇪',
    'emilia-romagna-gp': '🇮🇹',
    'sakhir-gp':         '🇧🇭',
};

// ── STATE ─────────────────────────────────────────────────────────
const state = {
    ctx: null,          // shared catalogs + basePath/year for the table
    latestYear: null,   // current season (the only one with a GP page)
    year: null,
    activeKey: DEFAULT_KEY,
    rendering: 0,       // discards stale renders if the year is changed quickly
};

// ── HELPERS ───────────────────────────────────────────────────────
function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function flagFor(gpId, gp) {
    return getGpFlag(gp, state.ctx) || FLAG_MAP[gpId] || '';
}

// Old practice sessions don't have their own date: the race's is used.
function sessionDate(gp, key) {
    return gp.sessions?.[key]?.date ?? gp.sessions?.race?.date ?? null;
}

function setUrlYear(year) {
    const url = new URL(window.location.href);
    url.searchParams.set('season', year);
    history.replaceState(null, '', url);
}

// ── RENDER: one table per session ─────────────────────────────────
function renderSessionTable(container, season, def) {
    const rows = getSeasonEntries(season)
        .map(([gpId, gp]) => ({ gpId, gp, results: getSessionResults(gp, def.key) }))
        .filter(({ results }) => results.length > 0);

    if (!rows.length) {
        container.innerHTML = `<p class="results-empty">No ${def.title.toLowerCase()} results available yet.</p>`;
        return;
    }

    // Condition column: dry or wet, from the session's weather `rainfall`
    // (the same reading as the GP page's weather card). Only seasons loaded
    // with weather have it (2026), so the column only shows when some row does.
    const weatherOf = gp => gp?.sessions?.[def.key]?.weather;
    const conditionCol = rows.some(({ gp }) => weatherOf(gp));
    const conditionHtml = gp => {
        const w = weatherOf(gp);
        if (!w) return '<span class="results-condition-none">—</span>';
        const wet = Number(w.rainfall) > 0;
        return `<span class="results-condition" title="${wet ? 'Wet' : 'Dry'}">${wet ? '🌧️' : '☀️'}</span>`;
    };

    const colCount = 5 + (def.hasLaps ? 1 : 0) + (conditionCol ? 1 : 0);

    container.innerHTML = `
        <div class="results-table-wrap">
            <table class="data-table results-table">
                <thead>
                    <tr>
                        <th class="results-round-col">Round</th>
                        <th>Grand Prix</th>
                        <th class="results-date-col">Date</th>
                        <th>${def.posLabel}</th>
                        <th class="res-duration-col">${def.timeLabel}</th>
                        ${def.hasLaps ? '<th class="res-laps-col" style="text-align:center">Laps</th>' : ''}
                        ${conditionCol ? '<th class="results-condition-col" title="Track condition">Track</th>' : ''}
                        <th class="results-expand-col"></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(({ gpId, gp, results }) => {
                        const p1       = [...results].sort((a, b) => Number(a.pos) - Number(b.pos))[0];
                        const name     = p1?.driver ? resolveDriverNameUpper(p1.driver, state.ctx.drivers) : '—';
                        const teamId   = resolveTeamId(p1?.team, state.ctx.teams);
                        const logoSrc  = teamLogoPath(teamId, '.');
                        const logoHtml = logoSrc
                            ? `<img class="results-team-logo" src="${logoSrc}" alt="" onerror="this.remove()">`
                            : '';
                        const timeVal = p1?.[def.timeField] ?? p1?.time ?? '—';
                        const laps    = p1?.laps ?? '—';
                        return `
                            <tr class="results-row" data-gp="${gpId}" tabindex="0" role="button" aria-expanded="false">
                                <td class="results-round">${gp.round}</td>
                                <td class="results-gp"><span class="results-flag">${flagFor(gpId, gp)}</span><span class="results-gp-full">${gp.name}</span><span class="results-gp-short">${gpShortLabel(gp.name)}</span></td>
                                <td class="results-date">${formatDate(sessionDate(gp, def.key))}</td>
                                <td class="results-winner"><div class="results-winner-inner">${logoHtml}<span class="results-winner-name">${name}</span></div></td>
                                <td class="res-duration-col">${timeVal}</td>
                                ${def.hasLaps ? `<td class="res-laps-col" style="text-align:center">${laps}</td>` : ''}
                                ${conditionCol ? `<td class="results-condition-col">${conditionHtml(gp)}</td>` : ''}
                                <td class="results-expand"><svg class="results-expand-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg></td>
                            </tr>
                            <tr class="results-detail" data-gp="${gpId}">
                                <td colspan="${colCount + 1}">
                                    <div class="results-detail-grid"><div class="results-detail-inner"><div class="results-detail-body"></div></div></div>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    // Expand/collapse the full classification. The detail row is always
    // in the DOM, collapsed to height 0; opening it is a height transition
    // (results.css, .results-detail-grid), not a display:none that jumps. The
    // table is built the first time it opens (20+ rows per GP; not worth it
    // for the ones nobody looks at).
    container.querySelectorAll('.results-row').forEach(row => {
        const detail = row.nextElementSibling;
        const toggle = () => {
            const open = !detail.classList.contains('is-open');
            if (open && !detail.dataset.ready) {
                const gp = season[row.dataset.gp];
                detail.querySelector('.results-detail-body').innerHTML =
                    buildDetail(row.dataset.gp, gp, def);
                detail.dataset.ready = '1';
                if (typeof twemoji !== 'undefined') twemoji.parse(detail, { folder: 'svg', ext: '.svg' });
            }
            detail.classList.toggle('is-open', open);
            row.classList.toggle('is-open', open);
            row.setAttribute('aria-expanded', String(open));
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
    });

    if (typeof twemoji !== 'undefined') twemoji.parse(container, { folder: 'svg', ext: '.svg' });
}

// Full classification of a session + link to the GP page (only for
// the current season: grandprix.html works with data/latest.json).
function buildDetail(gpId, gp, def) {
    const results = getSessionResults(gp, def.key);
    const table = buildResultTable(results, def.key, state.ctx, getGridPositions(gp, def.key));
    // No title above the table: the open row right above already says
    // which Grand Prix it is. Just the link, on the left, when there is one.
    const gpLink = state.year === state.latestYear
        ? `<div class="results-detail-head"><a class="results-detail-link" href="./grandsprix/grandprix.html?gp=${gpId}">Full Grand Prix page <span aria-hidden="true">→</span></a></div>`
        : '';
    return `${gpLink}${table}`;
}

// ── SESSION TABS ──────────────────────────────────────────────────
// Copied from renderSessionTabs in js/pages/grandprix.js: same indicator,
// same sideways entrance animation depending on which side the tab came from.
function moveIndicator(indicator, btn) {
    if (!indicator || !btn) return;
    indicator.style.left  = `${btn.offsetLeft}px`;
    indicator.style.width = `${btn.offsetWidth}px`;
}

function renderSeason(season) {
    const tabBar   = document.getElementById('results-tab-bar');
    const panels   = document.getElementById('results-panels');
    const empty    = document.getElementById('results-empty');
    const wrap     = document.getElementById('results-tabs-container');

    const available = SESSION_DEFS.filter(def =>
        getSeasonEntries(season).some(([, gp]) => getSessionResults(gp, def.key).length));

    if (!available.length) {
        wrap.hidden = true;
        empty.hidden = false;
        empty.textContent = `No results loaded for the ${state.year} season yet.`;
        return;
    }
    wrap.hidden = false;
    empty.hidden = true;

    tabBar.innerHTML = available.map(def => `
        <button class="session-tab-btn" data-session="${def.key}" type="button">
            <span class="tab-label-full">${def.label}</span><span class="tab-label-short">${def.labelShort ?? def.label}</span>
        </button>`).join('') + '<div class="session-tab-indicator" id="results-tab-indicator"></div>';

    panels.innerHTML = available.map(def =>
        `<div class="session-tab-panel" id="tab-panel-${def.key}" data-session="${def.key}"></div>`).join('');

    for (const def of available) {
        renderSessionTable(document.getElementById(`tab-panel-${def.key}`), season, def);
    }

    const indicator = document.getElementById('results-tab-indicator');
    const order = available.map(d => d.key);
    let previousKey = null;

    const activate = (key) => {
        const prevIndex = previousKey ? order.indexOf(previousKey) : -1;
        const nextIndex = order.indexOf(key);
        const direction = prevIndex === -1 || nextIndex === prevIndex ? 0 : (nextIndex > prevIndex ? 1 : -1);

        tabBar.querySelectorAll('.session-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.session === key));
        panels.querySelectorAll('.session-tab-panel').forEach(p => {
            const isActive = p.dataset.session === key;
            if (isActive) p.style.setProperty('--tab-slide-x', direction > 0 ? '24px' : direction < 0 ? '-24px' : '0px');
            p.classList.toggle('active', isActive);
        });
        moveIndicator(indicator, tabBar.querySelector(`.session-tab-btn[data-session="${key}"]`));
        previousKey = key;
        state.activeKey = key;
    };
    // The hero opens a race from outside the tabs (openRaceRow).
    state.activate = key => { if (order.includes(key)) activate(key); };

    tabBar.querySelectorAll('.session-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => activate(btn.dataset.session));
    });

    // When the year changes, the open tab is kept if the new
    // season has it; otherwise, Race.
    activate(order.includes(state.activeKey) ? state.activeKey : (order.includes(DEFAULT_KEY) ? DEFAULT_KEY : order[order.length - 1]));

    // The tabs are measured before the F1 font loads: when it arrives,
    // the buttons change width and the indicator ends up offset. So it re-measures.
    document.fonts?.ready.then(() => moveIndicator(indicator, tabBar.querySelector('.session-tab-btn.active')));
    wrap.classList.add('in-view');
}

window.addEventListener('resize', () => {
    const tabBar = document.getElementById('results-tab-bar');
    moveIndicator(document.getElementById('results-tab-indicator'), tabBar?.querySelector('.session-tab-btn.active'));
});

// ── FROM THE HERO TO THE TABLE ────────────────────────────────────
// A round picked on the hero's season bar: the Race tab comes forward, its
// row opens (if it wasn't already) and the page scrolls down to it.
function openRaceRow(gpId) {
    state.activate?.('race');
    const row = document.querySelector(`#tab-panel-race .results-row[data-gp="${gpId}"]`);
    if (!row) return;
    if (!row.classList.contains('is-open')) row.click();
    row.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── SEASON SWITCH ─────────────────────────────────────────────────
// One season file for the whole page: the hero, the race results and the
// championship all draw from it.
async function showSeason(year) {
    const ticket = ++state.rendering;
    state.year = year;
    state.ctx.year = year;
    document.title = `F1 Hub | ${year} Results`;

    const wrap = document.getElementById('results-tabs-container');
    const champ = document.getElementById('championship');
    const empty = document.getElementById('results-empty');
    wrap.classList.add('is-loading');
    champ?.classList.add('is-loading');

    let season;
    try {
        season = await loadSeason('.', year);
    } catch (err) {
        console.error('Could not load the season', year, err);
        if (ticket !== state.rendering) return;
        wrap.classList.remove('is-loading');
        champ?.classList.remove('is-loading');
        champ?.classList.add('is-empty');
        wrap.hidden = true;
        empty.hidden = false;
        empty.textContent = `Couldn't load the ${year} season.`;
        return;
    }
    if (ticket !== state.rendering) return;

    renderSeasonHero(season, year, { ctx: state.ctx, flagOf: flagFor, onPick: openRaceRow });
    renderSeason(season);
    wrap.classList.remove('is-loading');

    if (champ) {
        await renderChampionship(champ, year, season);
        if (ticket === state.rendering) champ.classList.remove('is-loading');
    }
}

// ── SECTION BAR ───────────────────────────────────────────────────
// The sticky bar's links light up with the section on screen, and the red
// indicator slides under the active one, like the session tabs'. The
// active section is the last one whose top has gone past a line just under
// the sticky bar; above the first one (in the hero) none is.
const SECTION_LINE = 160;   // px from the top: navbar (60) + bar (64) + margin

// Returns the update, for when the page jumps on its own (a #section link).
function watchSections() {
    const links = [...document.querySelectorAll('.results-bar-links a')];
    const indicator = document.querySelector('.results-bar-indicator');
    const sections = links.map(link => document.getElementById(link.hash.slice(1)));
    if (!sections.every(Boolean)) return () => {};

    const update = () => {
        let current = -1;
        sections.forEach((sec, i) => { if (sec.getBoundingClientRect().top <= SECTION_LINE) current = i; });
        links.forEach((link, i) => link.classList.toggle('is-active', i === current));
        indicator?.classList.toggle('is-visible', current >= 0);
        if (indicator && current >= 0) moveIndicator(indicator, links[current]);
    };

    // Two measurements per scroll event, which the browser already fires
    // once per frame: no need to throttle.
    window.addEventListener('scroll', update, { passive: true });
    // The links change width when the F1 font arrives, and on resize.
    window.addEventListener('resize', update);
    document.fonts?.ready.then(update);
    update();
    return update;
}

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const updateSections = watchSections();
    try {
        const [seasons, latest, circuits, cities, countries, teams, drivers] = await Promise.all([
            loadSeasonsSummary('.'), loadLatest('.'),
            loadCircuits('.'), loadCities('.'), loadCountries('.'), loadTeams('.'), loadDrivers('.'),
        ]);
        state.ctx = { circuits, cities, countries, teams, drivers, basePath: '.' };
        state.latestYear = Number(latest?.latestSeason) || null;

        const years = seasons.map(s => s.year).sort((a, b) => b - a);
        const requested = Number(new URLSearchParams(location.search).get('season'));
        const initial = years.includes(requested) ? requested : (state.latestYear ?? years[0]);

        // The year dropdown in the sticky bar (js/shared/season-picker.js).
        setupSeasonPicker(document.getElementById('season-picker'), years, initial, year => {
            setUrlYear(year);
            showSeason(year);
        });

        setUrlYear(initial);
        await showSeason(initial);

        // Coming in with #section (from an old link): the content
        // has just been drawn and moved things down, so it goes there again.
        // Instant (the site scrolls smoothly): landing there, not travelling
        // down from the top on load.
        const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
        target?.scrollIntoView({ block: 'start', behavior: 'instant' });
        updateSections();
    } catch (err) {
        console.error('Error loading the results page:', err);
        const empty = document.getElementById('results-empty');
        empty.hidden = false;
        empty.textContent = "Couldn't load the season.";
    }
});
