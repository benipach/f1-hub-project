// archivo viejo

// ── FLAGS ─────────────────────────────────────────────────────────
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
};

// ── GP ID → SHORT COUNTRY NAME (used on mobile) ──────────────────
const COUNTRY_MAP = {
    'australian-gp':     'Australia',
    'chinese-gp':        'China',
    'japanese-gp':       'Japan',
    'bahrain-gp':        'Bahrain',
    'saudi-arabian-gp':  'Saudi Arabia',
    'miami-gp':          'Miami',
    'canadian-gp':       'Canada',
    'monaco-gp':         'Monaco',
    'barcelona-gp':      'Barcelona',
    'austrian-gp':       'Austria',
    'british-gp':        'Britain',
    'belgian-gp':        'Belgium',
    'hungarian-gp':      'Hungary',
    'dutch-gp':          'Netherlands',
    'italian-gp':        'Italy',
    'spanish-gp':        'Spain',
    'azerbaijan-gp':     'Azerbaijan',
    'singapore-gp':      'Singapore',
    'united-states-gp':  'USA',
    'mexican-gp':        'Mexico',
    'brazilian-gp':      'Brazil',
    'las-vegas-gp':      'Las Vegas',
    'qatar-gp':          'Qatar',
    'abu-dhabi-gp':      'Abu Dhabi',
};

// ── TEAM ID → LOGO FILE ───────────────────────────────────────────
// resolveTeamId() viene de js/shared/teams.js (cargado antes en results.html):
// pasa el campo `team` de los resultados al ID de data/teams.json, que es
// también el nombre del archivo de logo (img/teams/<id>-logo.png).

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

// ── FETCH ─────────────────────────────────────────────────────────
async function loadSeason() {
    const res = await fetch('./data/seasons/season2026.json');
    if (!res.ok) throw new Error(`season2026.json — HTTP ${res.status}`);
    return res.json();
}

// drivers.json pasó a ser un objeto indexado por slug ({ "lando-norris": {…} }),
// sin el array `drivers` ni el `history` por año que tenía antes. Leerlo como
// estaba tiraba un TypeError que caía en el catch del init, y por eso la página
// entera mostraba "Couldn't load results" en vez de las tablas.
async function loadDrivers() {
    const res = await fetch('./data/drivers.json');
    if (!res.ok) throw new Error(`drivers.json — HTTP ${res.status}`);
    return res.json();
}

async function loadTeams() {
    const res = await fetch('./data/teams.json');
    if (!res.ok) throw new Error(`teams.json — HTTP ${res.status}`);
    return res.json();
}

// ── HELPERS ───────────────────────────────────────────────────────
function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// El campo `driver` de los resultados es el slug del piloto ("lando-norris").
// Se resuelve contra drivers.json; si algún resultado viejo todavía guarda el
// nombre completo, se lo formatea igual que antes en vez de romper.
function formatDriverName(rawDriver, drivers) {
    const d = drivers?.[rawDriver];
    if (d) return `${d.firstName} ${d.lastName.toUpperCase()}`;

    const parts = String(rawDriver || '').trim().split(' ');
    if (parts.length < 2) return rawDriver || '—';
    const last = parts.pop();
    return `${parts.join(' ')} ${last.toUpperCase()}`;
}

// ── RENDER ────────────────────────────────────────────────────────
function renderSessionTable(season, drivers, teams, def) {
    const container = document.getElementById(`results-table-${def.key}`);
    if (!container) return;

    const rows = Object.entries(season)
        .map(([gpId, gp]) => ({ gpId, gp, results: gp.sessions?.[def.key]?.results }))
        .filter(({ results }) => Array.isArray(results) && results.length > 0)
        .sort((a, b) => a.gp.round - b.gp.round);

    if (!rows.length) {
        container.innerHTML = `<p class="results-empty">No ${def.title.toLowerCase()} results available yet.</p>`;
        return;
    }

    container.innerHTML = `
        <div class="results-table-wrap">
            <table class="data-table results-table">
                <thead>
                    <tr>
                        <th class="results-round-col">Round</th>
                        <th>Grand Prix</th>
                        <th class="results-date-col">Date</th>
                        <th>${def.posLabel}</th>
                        ${def.sprintCol ? '<th class="res-sprint-col" style="text-align:center">Sprint</th>' : ''}
                        <th class="res-duration-col">${def.timeLabel}</th>
                        ${def.hasLaps ? '<th class="res-laps-col" style="text-align:center">Laps</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(({ gpId, gp, results }) => {
                        const p1       = results[0];
                        const flag     = FLAG_MAP[gpId] || '';
                        const name     = p1?.driver ? formatDriverName(p1.driver, drivers) : '—';
                        const teamId   = resolveTeamId(p1?.team, teams);
                        const logoHtml = teamId
                            ? `<img class="results-team-logo" src="./img/teams/${teamId}-logo.png" alt="${teamId}">`
                            : '';
                        const timeVal = p1?.[def.timeField] || '—';
                        const laps    = p1?.laps ?? '—';
                        const sessionDate = gp.sessions[def.key].date;
                        return `
                            <tr class="results-row" data-href="./races/race.html?gp=${gpId}" tabindex="0">
                                <td class="results-round">${gp.round}</td>
                                <td class="results-gp"><span class="results-flag">${flag}</span><span class="results-gp-full">${gp.name}</span><span class="results-gp-short">${COUNTRY_MAP[gpId] || gp.name}</span></td>
                                <td class="results-date">${formatDate(sessionDate)}</td>
                                <td class="results-winner"><div class="results-winner-inner">${logoHtml}<span class="results-winner-name">${name}</span></div></td>
                                ${def.sprintCol ? `<td class="res-sprint-col" style="text-align:center">${gp.sprint ? '<span class="sprint-badge">SPRINT</span>' : '<span class="results-dash">—</span>'}</td>` : ''}
                                <td class="res-duration-col">${timeVal}</td>
                                ${def.hasLaps ? `<td class="res-laps-col" style="text-align:center">${laps}</td>` : ''}
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    container.querySelectorAll('.results-row').forEach(row => {
        const go = () => { window.location.href = row.dataset.href; };
        row.addEventListener('click', go);
        row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });

    if (typeof twemoji !== 'undefined') twemoji.parse(container, { folder: 'svg', ext: '.svg' });
}

// ── SESSION TABS ──────────────────────────────────────────────────
function moveIndicator(indicator, btn) {
    indicator.style.left  = `${btn.offsetLeft}px`;
    indicator.style.width = `${btn.offsetWidth}px`;
}

function initResultsTabs() {
    const tabBar    = document.getElementById('results-tab-bar');
    const allPanels = document.querySelectorAll('.session-tab-panel');
    if (!tabBar || !allPanels.length) return;

    const indicator = document.createElement('div');
    indicator.className = 'session-tab-indicator';
    tabBar.appendChild(indicator);

    const DEFAULT_KEY = 'race';

    SESSION_DEFS.forEach((def) => {
        const panel = document.getElementById(`tab-panel-${def.key}`);
        if (!panel) return;

        const btn = document.createElement('button');
        btn.className = 'session-tab-btn' + (def.key === DEFAULT_KEY ? ' active' : '');
        if (def.labelShort) {
            btn.innerHTML = `<span class="tab-label-full">${def.label}</span><span class="tab-label-short">${def.labelShort}</span>`;
        } else {
            btn.textContent = def.label;
        }
        btn.dataset.session = def.key;
        btn.addEventListener('click', () => activate(def.key));
        tabBar.appendChild(btn);
    });

    // Igual que en grandprix.js: el panel entra deslizándose desde el lado de
    // la pestaña que se dejó (izquierda o derecha).
    const order = SESSION_DEFS.map(d => d.key);
    let previousKey = DEFAULT_KEY;
    function activate(key) {
        const prevIndex = order.indexOf(previousKey);
        const nextIndex = order.indexOf(key);
        const direction = nextIndex === prevIndex ? 0 : (nextIndex > prevIndex ? 1 : -1);

        tabBar.querySelectorAll('.session-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.session === key));
        allPanels.forEach(p => {
            const isActive = p.id === `tab-panel-${key}`;
            if (isActive) p.style.setProperty('--tab-slide-x', direction > 0 ? '24px' : direction < 0 ? '-24px' : '0px');
            p.classList.toggle('active', isActive);
        });
        moveIndicator(indicator, tabBar.querySelector(`.session-tab-btn[data-session="${key}"]`));
        previousKey = key;
    }

    document.getElementById(`tab-panel-${DEFAULT_KEY}`)?.classList.add('active');
    document.getElementById('results-tabs-container')?.classList.add('in-view');

    const defaultBtn = tabBar.querySelector('.session-tab-btn.active') || tabBar.querySelector('.session-tab-btn');
    if (defaultBtn) moveIndicator(indicator, defaultBtn);
    // Las pestañas se miden antes de que cargue la fuente F1: cuando entra,
    // los botones cambian de ancho y el indicador queda corrido. Se re-mide.
    document.fonts?.ready.then(() => moveIndicator(indicator, tabBar.querySelector('.session-tab-btn.active')));
    window.addEventListener('resize', () => {
        const activeBtn = tabBar.querySelector('.session-tab-btn.active');
        if (activeBtn) moveIndicator(indicator, activeBtn);
    });
}

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [season, drivers, teams] = await Promise.all([loadSeason(), loadDrivers(), loadTeams()]);
        SESSION_DEFS.forEach(def => renderSessionTable(season, drivers, teams, def));
        initResultsTabs();
    } catch (err) {
        console.error(err);
        const container = document.getElementById('results-tabs-container');
        if (container) container.innerHTML = `<p class="results-empty">Couldn't load results.</p>`;
    }
});