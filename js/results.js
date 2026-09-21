// results.js — resultados de cualquier temporada, sesión por sesión.
//
// Tres ejes: temporada × Grand Prix × sesión.
//   - La temporada va en la URL (?season=2019) y se cambia con el <select>
//     de la cabecera; sin parámetro se abre la vigente (data/latest.json).
//   - Las pestañas son las sesiones que esa temporada realmente tiene
//     (1990 no tiene FP3 ni Sprint; 2026 sí).
//   - Cada fila es un Grand Prix con el ganador/pole de la sesión. Tocarla
//     despliega debajo la clasificación completa, la misma tabla que la página
//     del Grand Prix (buildResultTable, js/shared/result-table.js), así no hace
//     falta entrar GP por GP para ver el detalle.
//
// Los catálogos (circuits, cities, countries, teams, drivers) se cargan una
// vez; al cambiar de año sólo se pide el season file.

// ── SESSION DEFINITIONS ───────────────────────────────────────────
// timeField/timeLabel: which JSON field holds P1's time and what to call the column.
// hasLaps: whether that session's entries carry a `laps` field.
// posLabel: header for the driver column (Winner / Pole / P1).
// sprintCol: whether to show the "Sprint" weekend-format badge column.
const SESSION_DEFS = [
    { key: 'fp1',         label: 'Practice 1',       labelShort: 'FP1', title: 'Free Practice 1',  timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: true,  posLabel: 'P1',     sprintCol: true  },
    { key: 'fp2',         label: 'Practice 2',       labelShort: 'FP2', title: 'Free Practice 2',  timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: true,  posLabel: 'P1',     sprintCol: true  },
    { key: 'fp3',         label: 'Practice 3',       labelShort: 'FP3', title: 'Free Practice 3',  timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: true,  posLabel: 'P1',     sprintCol: true  },
    { key: 'sprintQualy', label: 'Sprint Qualifying', labelShort: 'SQ', title: 'Sprint Qualifying', timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: false, posLabel: 'Pole',   sprintCol: false },
    { key: 'sprintRace',  label: 'Sprint',           labelShort: 'SR', title: 'Sprint Race',       timeField: 'time',    timeLabel: 'Duration',  hasLaps: true,  posLabel: 'Winner', sprintCol: false },
    { key: 'qualifying',  label: 'Qualifying',       title: 'Qualifying',       timeField: 'lapTime', timeLabel: 'Best Lap', hasLaps: false, posLabel: 'Pole',   sprintCol: true  },
    { key: 'race',        label: 'Race',             title: 'Race',             timeField: 'time',    timeLabel: 'Duration',  hasLaps: true,  posLabel: 'Winner', sprintCol: true  },
];
const DEFAULT_KEY = 'race';

// ── FLAGS (fallback) ──────────────────────────────────────────────
// La bandera sale del circuito → ciudad → país (getGpFlag, shared/resolve.js).
// Las temporadas viejas no siempre traen circuitId; para esas se cae a este
// mapa por id de GP.
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
    ctx: null,          // catálogos compartidos + basePath/year para la tabla
    latestYear: null,   // temporada vigente (la única con página de GP)
    year: null,
    activeKey: DEFAULT_KEY,
    rendering: 0,       // descarta renders viejos si se cambia de año rápido
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

// Las prácticas viejas no tienen fecha propia: se usa la de la carrera.
function sessionDate(gp, key) {
    return gp.sessions?.[key]?.date ?? gp.sessions?.race?.date ?? null;
}

function setUrlYear(year) {
    const url = new URL(window.location.href);
    url.searchParams.set('season', year);
    history.replaceState(null, '', url);
}

// ── RENDER: una tabla por sesión ──────────────────────────────────
function renderSessionTable(container, season, def) {
    const rows = getSeasonEntries(season)
        .map(([gpId, gp]) => ({ gpId, gp, results: getSessionResults(gp, def.key) }))
        .filter(({ results }) => results.length > 0);

    if (!rows.length) {
        container.innerHTML = `<p class="results-empty">No ${def.title.toLowerCase()} results available yet.</p>`;
        return;
    }

    // La columna Sprint sólo si la temporada tuvo fines de semana con sprint
    // (desde 2021); antes es una columna entera de guiones.
    const sprintCol = def.sprintCol && rows.some(({ gp }) => gp.sprint);
    const colCount = 5 + (sprintCol ? 1 : 0) + (def.hasLaps ? 1 : 0);

    container.innerHTML = `
        <div class="results-table-wrap">
            <table class="data-table results-table">
                <thead>
                    <tr>
                        <th class="results-round-col">Round</th>
                        <th>Grand Prix</th>
                        <th class="results-date-col">Date</th>
                        <th>${def.posLabel}</th>
                        ${sprintCol ? '<th class="res-sprint-col" style="text-align:center">Sprint</th>' : ''}
                        <th class="res-duration-col">${def.timeLabel}</th>
                        ${def.hasLaps ? '<th class="res-laps-col" style="text-align:center">Laps</th>' : ''}
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
                                ${sprintCol ? `<td class="res-sprint-col" style="text-align:center">${gp.sprint ? '<span class="sprint-badge">SPRINT</span>' : '<span class="results-dash">—</span>'}</td>` : ''}
                                <td class="res-duration-col">${timeVal}</td>
                                ${def.hasLaps ? `<td class="res-laps-col" style="text-align:center">${laps}</td>` : ''}
                                <td class="results-expand"><span class="results-expand-icon" aria-hidden="true"></span></td>
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

    // Desplegar/plegar la clasificación completa. La fila de detalle siempre
    // está en el DOM, plegada a altura 0; abrirla es una transición de altura
    // (results.css, .results-detail-grid), no un display:none que salta. La
    // tabla se arma la primera vez que se abre (son 20+ filas por GP; no vale
    // la pena para las que no se miran).
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

// Clasificación completa de una sesión + link a la página del GP (sólo para
// la temporada vigente: grandprix.html trabaja con data/latest.json).
function buildDetail(gpId, gp, def) {
    const results = getSessionResults(gp, def.key);
    const table = buildResultTable(results, def.key, state.ctx, getGridPositions(gp, def.key));
    const gpLink = state.year === state.latestYear
        ? `<a class="results-detail-link" href="./grandsprix/grandprix.html?gp=${gpId}">Full Grand Prix page <span aria-hidden="true">→</span></a>`
        : '';
    return `
        <div class="results-detail-head">
            <span class="results-detail-title">${gp.name} · ${def.title}</span>
            ${gpLink}
        </div>
        ${table}`;
}

// ── SESSION TABS ──────────────────────────────────────────────────
// Calcadas de renderSessionTabs en js/pages/grandprix.js: mismo indicador,
// misma animación de entrada lateral según de qué lado venía la pestaña.
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

    tabBar.querySelectorAll('.session-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => activate(btn.dataset.session));
    });

    // Al cambiar de año se conserva la pestaña que estaba abierta si la nueva
    // temporada la tiene; si no, Race.
    activate(order.includes(state.activeKey) ? state.activeKey : (order.includes(DEFAULT_KEY) ? DEFAULT_KEY : order[order.length - 1]));

    // Las pestañas se miden antes de que cargue la fuente F1: cuando entra,
    // los botones cambian de ancho y el indicador queda corrido. Se re-mide.
    document.fonts?.ready.then(() => moveIndicator(indicator, tabBar.querySelector('.session-tab-btn.active')));
    wrap.classList.add('in-view');
}

window.addEventListener('resize', () => {
    const tabBar = document.getElementById('results-tab-bar');
    moveIndicator(document.getElementById('results-tab-indicator'), tabBar?.querySelector('.session-tab-btn.active'));
});

// ── SEASON SWITCH ─────────────────────────────────────────────────
async function showSeason(year) {
    const ticket = ++state.rendering;
    state.year = year;
    state.ctx.year = year;
    document.title = `F1 Hub | ${year} Results`;
    document.getElementById('results-title').textContent = `${year} Race Results`;

    const wrap = document.getElementById('results-tabs-container');
    wrap.classList.add('is-loading');

    let season;
    try {
        season = await loadSeason('.', year);
    } catch (err) {
        console.error('No se pudo cargar la temporada', year, err);
        if (ticket !== state.rendering) return;
        wrap.classList.remove('is-loading');
        wrap.hidden = true;
        const empty = document.getElementById('results-empty');
        empty.hidden = false;
        empty.textContent = `Couldn't load the ${year} season.`;
        return;
    }
    if (ticket !== state.rendering) return;

    renderSeason(season);
    wrap.classList.remove('is-loading');
}

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const select = document.getElementById('results-season-select');
    try {
        const [seasons, latest, circuits, cities, countries, teams, drivers] = await Promise.all([
            loadSeasonsSummary('.'), loadLatest('.'),
            loadCircuits('.'), loadCities('.'), loadCountries('.'), loadTeams('.'), loadDrivers('.'),
        ]);
        state.ctx = { circuits, cities, countries, teams, drivers, basePath: '.' };
        state.latestYear = Number(latest?.latestSeason) || null;

        const years = seasons.map(s => s.year).sort((a, b) => b - a);
        select.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

        const requested = Number(new URLSearchParams(location.search).get('season'));
        const initial = years.includes(requested) ? requested : (state.latestYear ?? years[0]);
        select.value = String(initial);
        select.addEventListener('change', () => {
            const year = Number(select.value);
            setUrlYear(year);
            showSeason(year);
        });

        setUrlYear(initial);
        await showSeason(initial);
    } catch (err) {
        console.error('Error loading results page:', err);
        const empty = document.getElementById('results-empty');
        empty.hidden = false;
        empty.textContent = "Couldn't load results.";
    }
});
