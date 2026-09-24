// no se si sigue funcionando

// Local mirror of backend state: { DriverList, TimingData, TimingAppData }
let state = {};

// Local (client-side) timestamp of the last time we RECEIVED an
// ExtrapolatedClock update — not part of `state` itself, since it's not
// data from the feed, it's "when did *we* get this". Used to extrapolate
// the countdown between messages (see updateSessionClock below).
let lastClockUpdateLocalTime = Date.now();

// Same recursive merge as the backend's mergeState(). Works whether
// "data" arrives as a partial delta or a full topic object — newer
// keys always overwrite older ones, so the result converges either way.
function mergeState(target, patch) {
    if (patch === null || typeof patch !== 'object') return patch;
    if (target === null || typeof target !== 'object') {
        target = Array.isArray(patch) ? [] : {};
    }
    for (const key of Object.keys(patch)) {
        target[key] = mergeState(target[key], patch[key]);
    }
    return target;
}

// ── GP → CIRCUIT MAPPING (same map used in race.js) ───────────────────────
const CIRCUIT_MAP = {
    'australian-gp':     'albert-park-circuit',
    'chinese-gp':        'shanghai-international-circuit',
    'japanese-gp':       'suzuka-international-racing-course',
    'bahrain-gp':        'bahrain-internatinal-circuit',
    'saudi-arabian-gp':  'jeddah-corniche-circuit',
    'miami-gp':          'miami-international-autodrome',
    'canadian-gp':       'circuit-gilles-villeneuve',
    'monaco-gp':         'circuit-de-monaco',
    'barcelona-gp':      'circuit-de-barcelona-catalunya',
    'austrian-gp':       'red-bull-ring',
    'british-gp':        'silverstone-circuit',
    'belgian-gp':        'circuit-de-spa-francorchamps',
    'hungarian-gp':      'hungaroring',
    'dutch-gp':          'circuit-zandvoort',
    'italian-gp':        'autodromo-nazionale-di-monza',
    'spanish-gp':        'madring',
    'azerbaijan-gp':     'baku-city-circuit',
    'singapore-gp':      'marina-bay-street-circuit',
    'united-states-gp':  'cota',
    'mexican-gp':        'hermanos-rodriguez',
    'brazilian-gp':      'autodromo-jose-carlos-pace',
    'las-vegas-gp':      'las-vegas-strip-circuit',
    'qatar-gp':          'lusail-international-circuit',
    'abu-dhabi-gp':      'yas-marina-circuit',
};

// ── TEAM ID → LOGO FILENAME (same map used in race.js) ───────────────────
const TEAM_LOGO_MAP = {
    'Mercedes':        'mercedes-logo',
    'Ferrari':         'ferrari-logo',
    'McLaren':         'mclaren-logo',
    'Red Bull':        'red-bull-racing-logo',
    'Red Bull Racing': 'red-bull-racing-logo',
    'Aston Martin':    'aston-martin-logo',
    'Alpine':          'alpine-logo',
    'Williams':        'williams-logo',
    'Racing Bulls':    'racing-bulls-logo',
    'Haas':            'haas-logo',
    'Haas F1 Team':    'haas-logo',
    'Audi':            'audi-logo',
    'Cadillac':        'cadillac-logo',
};

// ── TEAM ID → COLOR (from TEAMS in the site's shared color config) ───────
const TEAM_COLOR_MAP = {
    'Mercedes':        'rgb(43, 255, 219)',
    'Ferrari':         'rgb(255, 0, 25)',
    'McLaren':         'rgb(255, 127, 0)',
    'Red Bull':        'rgb(34, 71, 122)',
    'Red Bull Racing': 'rgb(34, 71, 122)',
    'Aston Martin':    'rgb(34, 153, 113)',
    'Alpine':          'rgb(0, 111, 186)',
    'Williams':        'rgb(28, 122, 255)',
    'Racing Bulls':    'rgb(102, 125, 255)',
    'Haas':            'rgb(222, 225, 226)',
    'Haas F1 Team':    'rgb(222, 225, 226)',
    'Audi':            'rgb(255, 46, 46)',
    'Cadillac':        'rgb(170, 170, 173)',
};

// Circuit slug for the current GP. El backend ya lo manda en CurrentGP
// (lo saca del archivo de temporada), así que eso manda; CIRCUIT_MAP queda
// solo como fallback para snapshots viejos que no lo traigan.
function currentCircuitId() {
    const gp = state.CurrentGP;
    if (!gp) return null;
    return gp.circuitId || CIRCUIT_MAP[gp.slug] || null;
}

// Tyre compound → PNG filename in img/tyres/
const COMPOUND_META = {
    SOFT:         { code: 'S', file: 'soft' },
    MEDIUM:       { code: 'M', file: 'medium' },
    HARD:         { code: 'H', file: 'hard' },
    INTERMEDIATE: { code: 'I', file: 'inter' },
    WET:          { code: 'W', file: 'wet' },
};

// Compound icon: uses the pre-made PNGs in img/tyres/ (soft/medium/hard/
// inter/wet.png). Falls back to a plain letter badge if the compound isn't
// recognized (shouldn't normally happen, but keeps the row from breaking).
function tyreIconHTML(meta) {
    if (!meta.file && !meta.code) {
        // Compound genuinely unknown yet (e.g. the feed hasn't sent it for
        // this stint) — a neutral dot instead of a jarring "?".
        return `<span class="tyre-icon-unknown"></span>`;
    }
    if (!meta.file) {
        return `<span class="tyre-icon-fallback">${meta.code}</span>`;
    }
    return `<img class="tyre-icon-img" src="./img/tyres/${meta.file}.png" alt="${meta.code}" width="22" height="22">`;
}

// The real feed sends lapped-car gaps as e.g. "1 L" (no "+", abbreviated
// "L"). Expand that to "+1 LAP" / "+2 LAPS" for readability; anything else
// (normal "+12.345" gaps) passes through unchanged.
function formatGap(value) {
    if (!value) return value;
    const match = /^\+?\s*(\d+)\s*L$/i.exec(value.trim());
    if (!match) return value;
    const laps = Number(match[1]);
    return `+${laps} Lap${laps === 1 ? '' : 's'}`;
}

// ── GAP / INTERVAL ────────────────────────────────────────────────────────
// En Race/Sprint el feed manda los dos valores sueltos en la línea
// (GapToLeader / IntervalToPositionAhead.Value). En Qualifying, Sprint
// Qualifying y Práctica esos campos vienen vacíos: los diffs reales viajan
// en line.Stats, un dict indexado por segmento (Stats["0"] = Q1/SQ1,
// ["1"] = Q2, ["2"] = Q3) con TimeDiffToFastest y TimeDifftoPositionAhead
// (sí, con esa "t" minúscula — así lo manda F1). Verificado contra una
// captura en vivo; sin esto las columnas Gap e Interval quedaban en blanco
// toda la clasificación.
function sessionStatsEntry(line) {
    const stats = line && line.Stats;
    if (!stats || typeof stats !== 'object') return null;

    const keys = Object.keys(stats).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) return null;

    const hasDiff = (entry) => !!(entry && (entry.TimeDiffToFastest
        || entry.TimeDifftoPositionAhead || entry.TimeDiffToPositionAhead));

    const part = currentQualifyingPart();
    const wanted = Number.isFinite(part) ? String(part - 1) : null;
    const preferred = wanted ? stats[wanted] : null;
    if (hasDiff(preferred)) return preferred;

    // El segmento en curso puede no tener diff para este piloto: o quedó
    // eliminado antes (sus números vivos son los del último segmento que
    // corrió), o todavía no marcó tiempo. Se busca hacia atrás el último
    // segmento con datos en vez de mostrar la celda vacía.
    for (let i = keys.length - 1; i >= 0; i--) {
        const entry = stats[keys[i]];
        if (hasDiff(entry)) return entry;
    }
    return preferred || null;
}

function gapToLeaderValue(line) {
    if (line.GapToLeader) return line.GapToLeader;
    const stats = sessionStatsEntry(line);
    return (stats && stats.TimeDiffToFastest) || line.TimeDiffToFastest || '';
}

// Texto de la celda Gap. P1 dice "Leader". En Q/SQ/Práctica, si el feed no
// trae el diff (pasa al principio de la sesión o con capturas incompletas),
// se calcula a mano: mejor vuelta del piloto menos la del líder. En
// Race/Sprint no hay fallback — ahí la diferencia de mejores vueltas no es
// el gap real en pista.
function gapCellText(line, posNum, leaderBestMs, allowLapFallback) {
    if (posNum === 1) return 'Leader';
    const fromFeed = formatGap(gapToLeaderValue(line));
    if (fromFeed) return fromFeed;
    if (!allowLapFallback || leaderBestMs == null) return '';
    const bestMs = lapTimeToMs(line.BestLapTime && line.BestLapTime.Value);
    if (bestMs == null) return '';
    return `+${((bestMs - leaderBestMs) / 1000).toFixed(3)}`;
}

function intervalToAheadValue(line) {
    const value = line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value;
    if (value) return value;
    const stats = sessionStatsEntry(line);
    return (stats && (stats.TimeDifftoPositionAhead || stats.TimeDiffToPositionAhead))
        || line.TimeDifftoPositionAhead || '';
}

// "+1.234" → 1.234 s. null para lo que no es un tiempo (vacío, "+1 LAP").
function gapSeconds(value) {
    const match = /^\+?\s*(\d+(?:\.\d+)?)$/.exec(String(value || '').trim());
    return match ? Number(match[1]) : null;
}

// Texto de la celda Interval: diferencia con el auto de adelante. Si el
// feed no la trae (en Práctica/Qualy suele venir vacía), se calcula:
//   - Q/SQ/FP: mejor vuelta del piloto menos la del de adelante.
//   - Race/Sprint: gap al líder del piloto menos el del de adelante (P1
//     cuenta como 0). Si alguno está a vueltas no hay resta posible.
function intervalCellText(line, posNum, aheadLine, allowLapFallback) {
    if (posNum === 1) return 'Leader';
    const fromFeed = formatGap(intervalToAheadValue(line));
    if (fromFeed) return fromFeed;
    if (!aheadLine) return '';

    let diffSeconds = null;
    if (allowLapFallback) {
        const bestMs = lapTimeToMs(line.BestLapTime && line.BestLapTime.Value);
        const aheadMs = lapTimeToMs(aheadLine.BestLapTime && aheadLine.BestLapTime.Value);
        if (bestMs != null && aheadMs != null) diffSeconds = (bestMs - aheadMs) / 1000;
    } else {
        const gap = gapSeconds(gapToLeaderValue(line));
        const aheadGap = posNum === 2 ? 0 : gapSeconds(gapToLeaderValue(aheadLine));
        if (gap != null && aheadGap != null) diffSeconds = gap - aheadGap;
    }
    return diffSeconds != null && diffSeconds >= 0 ? `+${diffSeconds.toFixed(3)}` : '';
}


function getNestedValue(target, pathSegments) {
    let current = target;
    for (const segment of pathSegments) {
        if (current === null || current === undefined) return null;
        if (typeof current !== 'object' && typeof current !== 'function') return null;
        if (!(segment in current)) return null;
        current = current[segment];
    }
    return current;
}

function normalizeTimeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'Value' in value) return value.Value;
    return null;
}

// El feed real de F1 manda los sectores en line.Sectors, indexado desde
// CERO: Sectors["0"] = S1, ["1"] = S2, ["2"] = S3 (verificado contra una
// captura en vivo del GP de Italia 2026). Antes esto probaba primero la
// variante 1-based, así que S1 mostraba el tiempo de S2 y S3 quedaba
// siempre vacío. Sector{n}Time se mantiene arriba porque es la forma que
// usan los mocks/adaptadores viejos, y ahí el índice sí es 1-based.
function getSectorTimeInfo(line, sectorIndex) {
    const zeroBased = String(sectorIndex - 1);
    const candidates = [
        [`Sector${sectorIndex}Time`],
        [`Sector${sectorIndex}`],
        [`LastLapTime`, `Sector${sectorIndex}Time`],
        [`LastLapTime`, `Sector${sectorIndex}`],
        ['Sectors', zeroBased, 'Value'],
        ['LastLapTime', 'Sectors', zeroBased, 'Value'],
        // Al completar la vuelta, F1 vacía Sectors[i].Value y deja el
        // tiempo en PreviousValue. Sin este fallback, S3 quedaba en "-"
        // para casi todos los pilotos apenas cruzaban meta.
        ['Sectors', zeroBased, 'PreviousValue'],
    ];

    let value = null;
    let className = '';

    for (const path of candidates) {
        const node = getNestedValue(line, path);
        const normalized = normalizeTimeValue(node);
        // Un sector sin tiempo llega como "" (string vacío), no ausente —
        // eso no es un valor, es "todavía no cruzó".
        if (normalized && value === null) value = normalized;
        if (node && typeof node === 'object') {
            if (node.OverallFastest) {
                className = 'live-lap--fastest';
                break;
            }
            if (node.PersonalFastest && className !== 'live-lap--fastest') {
                className = 'live-lap--pb';
            }
        }
    }

    if (value === null) return null;
    if (!className) className = 'live-lap--normal';
    return { value, className };
}

function getSectorTimes(line) {
    return [1, 2, 3].map((sectorIndex) => getSectorTimeInfo(line, sectorIndex));
}

// ── MINI-SECTORS (segment bars, all session types) ────────────────────────
// F1's feed splits each of the 3 main sectors into further "segments",
// each with its own Status code — same idea as the little colored bars in
// Nitrous/f1-dash. Status codes reverse-engineered by the community
// (FastF1/OpenF1 docs): 0 not available, 2048 yellow, 2049 green, 2051
// purple (overall fastest), 2064 pitlane; other codes fall back to a
// neutral "unknown" bar rather than breaking. Per OpenF1's own docs these
// segments aren't sent during races — only Practice/Qualifying — so in
// Race/Sprint this will render empty (or partially empty) with the real
// feed until/unless that changes; kept enabled everywhere anyway since
// getSegments()/microsectorsHTML() degrade gracefully to '' with no data.
const SEGMENT_STATUS_CLASS = {
    0: 'unavailable',
    2048: 'yellow',
    2049: 'green',
    2050: 'unknown',
    2051: 'purple',
    2052: 'unknown',
    2064: 'pitlane',
    2068: 'unknown',
};

function segmentStatusClass(status) {
    return SEGMENT_STATUS_CLASS[status] ?? 'unknown';
}

// Mismo indexado 0-based que getSectorTimeInfo (confirmado contra el feed
// en vivo): Sectors["0"].Segments son las barras de S1.
function getSegments(line, sectorIndex) {
    const zeroBased = String(sectorIndex - 1);
    const candidates = [
        ['Sectors', zeroBased, 'Segments'],
        ['LastLapTime', 'Sectors', zeroBased, 'Segments'],
    ];
    for (const path of candidates) {
        const node = getNestedValue(line, path);
        if (node && typeof node === 'object') {
            return Object.keys(node)
                .sort((a, b) => Number(a) - Number(b))
                .map((key) => node[key] && node[key].Status);
        }
    }
    return [];
}

function microsectorsHTML(segments) {
    if (!segments.length) return '';
    return `<span class="live-microsectors">${segments
        .map((status) => `<span class="live-microsector live-microsector--${segmentStatusClass(status)}"></span>`)
        .join('')}</span>`;
}

// Aviso en las dos tablas cuando todavía no hay NADA que mostrar. Sin
// esto, con el relay apagado la página se queda para siempre en "Waiting
// for session data…" y no hay forma de saber que el problema es que
// server/client.js no está corriendo.
function setConnectionNotice(text) {
    if (state.TimingData && state.TimingData.Lines) return; // ya hay datos: no pisar nada
    const tbody = document.getElementById('live-rows-2');
    if (tbody) tbody.innerHTML = `<tr><td colspan="${tableColspan}" class="results-empty">${text}</td></tr>`;
}

// ── DÓNDE ESTÁ EL RELAY ───────────────────────────────────────────────────
// Antes esto era 'ws://localhost:8080' fijo, así que la página solo mostraba
// datos en la misma máquina que corre server/client.js: desde el celular, o
// desde la versión publicada en GitHub Pages, no cargaba nada.
//
// Ahora la URL se resuelve así, en orden:
//   1. ?relay=... en la URL (queda guardado, así se configura una sola vez
//      por dispositivo: abrís live.html?relay=... y listo)
//   2. lo que haya guardado de una visita anterior (localStorage)
//   3. window.F1_HUB_RELAY_URL, si se define en un <script> antes de este
//   4. RELAY_URL de acá abajo — la constante a completar con la URL pública
//      del relay una vez desplegado
//   5. ws://localhost:8080 cuando la página se abre en local (dev)
//
// Importante: una página servida por https (GitHub Pages lo es) NO puede
// abrir un WebSocket ws:// — el browser lo bloquea por mixed content. Por
// eso normalizeRelayUrl fuerza wss:// en ese caso; el relay tiene que estar
// detrás de HTTPS (cualquier host tipo Render/Railway/Fly ya lo da hecho, o
// un túnel tipo cloudflared).
const RELAY_URL = 'https://f1-hub-relay.onrender.com';

const RELAY_STORAGE_KEY = 'f1hub:relay';

function isLocalPage() {
    const host = location.hostname;
    return location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '';
}

function normalizeRelayUrl(raw) {
    if (!raw) return null;
    let url = String(raw).trim();
    if (!url) return null;

    if (url.startsWith('http://')) url = 'ws://' + url.slice('http://'.length);
    else if (url.startsWith('https://')) url = 'wss://' + url.slice('https://'.length);
    else if (!url.startsWith('ws://') && !url.startsWith('wss://')) url = 'wss://' + url;

    // Mixed content: desde https solo se puede wss.
    if (location.protocol === 'https:' && url.startsWith('ws://')) {
        url = 'wss://' + url.slice('ws://'.length);
    }
    return url;
}

function readStoredRelay() {
    try {
        return localStorage.getItem(RELAY_STORAGE_KEY);
    } catch (err) {
        return null; // modo incógnito / storage bloqueado
    }
}

function storeRelay(url) {
    try {
        localStorage.setItem(RELAY_STORAGE_KEY, url);
    } catch (err) {
        /* no pasa nada: sigue funcionando por esta sesión */
    }
}

function resolveRelayUrl() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('relay');

    // ?relay= (vacío) borra el override guardado y vuelve al comportamiento
    // por defecto — la forma de "desconfigurar" un dispositivo.
    if (fromQuery === '') {
        try { localStorage.removeItem(RELAY_STORAGE_KEY); } catch (err) { /* ignorar */ }
    } else if (fromQuery) {
        const url = normalizeRelayUrl(fromQuery);
        if (url) storeRelay(url);
        return url;
    }

    const stored = normalizeRelayUrl(readStoredRelay());
    if (stored) return stored;

    const fromGlobal = normalizeRelayUrl(window.F1_HUB_RELAY_URL);
    if (fromGlobal) return fromGlobal;

    const configured = normalizeRelayUrl(RELAY_URL);
    if (configured) return configured;

    return isLocalPage() ? 'ws://localhost:8080' : null;
}

// ── BROADCAST DELAY (Customize → TV sync) ─────────────────────────────────
// Los datos en vivo llegan antes que la imagen de la tele (la transmisión
// va atrasada unos segundos, más en streaming). Para que la página no
// "spoilee" un sobrepaso, cada mensaje del relay entra a una cola con su
// hora de llegada y recién se aplica cuando pasaron los segundos de demora
// que eligió el usuario. Con demora 0, todo se aplica al instante.
//
// El reloj de sesión también se atrasa (feedNow()), así el countdown o el
// cronómetro de carrera coincide con lo que se ve en la tele.
const DELAY_MAX_SECONDS = 300;
const DELAY_STEP_SECONDS = 5;
const pendingRelayMessages = [];

function delaySeconds() {
    const value = Math.round(Number(viewPrefs && viewPrefs.delaySeconds));
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), DELAY_MAX_SECONDS) : 0;
}

// "Ahora" según lo que se está mostrando: la hora real menos la demora.
function feedNow() {
    return Date.now() - delaySeconds() * 1000;
}

function applyRelayMessage(msg) {
    if (msg.type === 'snapshot') {
        state = msg.state || {};
        if (state.ExtrapolatedClock) lastClockUpdateLocalTime = Date.now();
    } else if (msg.type === 'update') {
        // Position.z: el relay manda el último lote de posiciones entero.
        // Mezclarlo índice por índice con el anterior dejaba muestras
        // viejas al final del array cuando el lote nuevo era más corto,
        // y el auto "volvía" a donde estaba hace un rato.
        state[msg.topic] = msg.topic === 'Position.z'
            ? msg.data
            : mergeState(state[msg.topic] || {}, msg.data);
        if (msg.topic === 'ExtrapolatedClock') lastClockUpdateLocalTime = Date.now();
    }
}

function receiveRelayMessage(msg) {
    // Sin demora (y sin nada esperando en la cola): directo. El primer
    // snapshot también va directo aunque haya demora, para que la tabla no
    // quede vacía mientras se "llena" la demora.
    const firstSnapshot = msg.type === 'snapshot' && !(state.TimingData && state.TimingData.Lines);
    if ((delaySeconds() === 0 && pendingRelayMessages.length === 0) || firstSnapshot) {
        applyRelayMessage(msg);
        render();
        return;
    }
    pendingRelayMessages.push({ at: Date.now(), msg });
}

// Aplica, en orden, todo lo que ya cumplió su demora. Si la demora se
// achica, sale de golpe lo acumulado; si se agranda, la página se queda
// quieta hasta alcanzarla.
function flushPendingRelayMessages() {
    const due = Date.now() - delaySeconds() * 1000;
    let applied = false;
    while (pendingRelayMessages.length && pendingRelayMessages[0].at <= due) {
        applyRelayMessage(pendingRelayMessages.shift().msg);
        applied = true;
    }
    if (applied) render();
}

setInterval(flushPendingRelayMessages, 100);

// Chip "DELAY 30s" al lado del reloj de sesión, para que se sepa que lo que
// se ve va atrasado a propósito.
function updateDelayIndicator() {
    const chip = document.getElementById('delay-indicator');
    if (!chip) return;
    const seconds = delaySeconds();
    chip.hidden = seconds === 0;
    chip.textContent = `Delay ${seconds}s`;
}

function setDelaySeconds(seconds) {
    const value = Math.round(Number(seconds));
    viewPrefs.delaySeconds = Number.isFinite(value) ? Math.min(Math.max(value, 0), DELAY_MAX_SECONDS) : 0;
    saveViewPrefs();
    updateDelayIndicator();
    updateSessionClock();
    flushPendingRelayMessages();
}

function connect() {
    const relayUrl = resolveRelayUrl();
    if (!relayUrl) {
        setConnectionNotice('No hay relay configurado para este dispositivo. Abrí esta página con ?relay=wss://tu-relay para conectarla.');
        return;
    }

    const ws = new WebSocket(relayUrl);

    ws.onopen = () => {
        setConnectionNotice('Waiting for session data…');
    };

    ws.onmessage = (event) => {
        receiveRelayMessage(JSON.parse(event.data));
    };

    ws.onclose = () => {
        setConnectionNotice(isLocalPage()
            ? `Sin conexión con el relay (${relayUrl}) — arrancá server/client.js. Reintentando…`
            : `Sin conexión con el relay (${relayUrl}) — puede estar apagado. Reintentando…`);
        setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
}

// --- Rendering helpers ---

// ── GP → FLAG EMOJI (rendered as an image by twemoji.js, same as the rest
// of the site — the span just needs the raw unicode flag character) ──────
const FLAG_EMOJI_MAP = {
    'australian-gp':    '🇦🇺',
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

// Fills in the GP name (with country flag prefixed, same text node) in
// the app's top bar.
function updateGPName() {
    const nameEl = document.getElementById('mapview-fs-name');
    if (!nameEl) return;

    const gp = state.CurrentGP;
    if (!gp || !gp.name) {
        nameEl.textContent = 'Loading Grand Prix…';
        return;
    }

    const flag = FLAG_EMOJI_MAP[gp.slug];
    const label = flag ? `${flag} ${gp.name}` : gp.name;

    if (nameEl.textContent !== label) {
        nameEl.textContent = label;
        // twemoji.js is already loaded site-wide (see the <script> tag
        // in live.html) — this swaps the raw emoji character for its
        // image, same as every other flag on the site.
        if (window.twemoji) window.twemoji.parse(nameEl);
    }
}

// ── SESSION CLOCK (label + time, below the GP name) ───────────────────────
// Three behaviors, per session type (matches what you described):
//   - Practice (FP1/FP2/FP3): countdown from 1h, pauses on red flag.
//   - Qualifying (Q1/Q2/Q3) & Sprint Qualifying (SQ1/SQ2/SQ3): countdown per
//     segment, same pause behavior. Segment durations only used as a
//     fallback before the feed's first ExtrapolatedClock message lands.
//   - Race / Sprint: count-up stopwatch, NEVER pauses. Driven by
//     state.SessionTiming.startedUtc, which the backend stamps the moment
//     the session actually goes green (see client.js) — more reliable than
//     the scheduled start time.
//
// NOTE ON FIELD NAMES: SessionInfo.Name / SessionData.Series / TrackStatus
// are reverse-engineered from F1's feed (same approach f1-dash/Nitrous use),
// not officially documented. The backend logs each of these once verified —
// check your terminal during a real session and adjust the string matches
// below if something doesn't line up.
const SEGMENT_DURATIONS = {
    Q:  [18 * 60, 15 * 60, 12 * 60],
    SQ: [12 * 60, 10 * 60, 8 * 60],
};

function deriveSessionMeta(sessionInfo) {
    const name = (sessionInfo && sessionInfo.Name || '').toLowerCase();
    if (!name) return null;

    if (name.includes('practice 1')) return { kind: 'countdown-fixed', label: 'FP1', duration: 3600 };
    if (name.includes('practice 2')) return { kind: 'countdown-fixed', label: 'FP2', duration: 3600 };
    if (name.includes('practice 3')) return { kind: 'countdown-fixed', label: 'FP3', duration: 3600 };
    if (name.includes('sprint') && (name.includes('qualifying') || name.includes('shootout'))) {
        return { kind: 'countdown-segment', prefix: 'SQ' };
    }
    if (name.includes('sprint')) return { kind: 'count-up', label: 'SPRINT' };
    if (name.includes('qualifying')) return { kind: 'countdown-segment', prefix: 'Q' };
    if (name.includes('race')) return { kind: 'count-up', label: 'RACE' };
    return null;
}

// SessionData.Series is expected as a dict of {Utc, QualifyingPart} entries
// (same "dict of deltas" shape TimingData.Lines uses) — the latest one by
// Utc tells us the current segment. Defaults to part 1 if we don't have
// data yet (e.g. right as Q1 starts, before the first message lands).
function currentQualifyingPart() {
    const series = state.SessionData && state.SessionData.Series;
    if (!series) return 1;
    const entries = Object.values(series).filter((e) => e && typeof e.QualifyingPart === 'number');
    if (entries.length === 0) return 1;
    entries.sort((a, b) => new Date(a.Utc) - new Date(b.Utc));
    return entries[entries.length - 1].QualifyingPart;
}

// ── QUALIFYING ELIMINATION CUTOFFS ────────────────────────────────────────
// 2026 rule (22-car grid): the cut is after P16 (Q1→Q2) and P10 (Q2→Q3) —
// 6 eliminated per cut instead of the pre-2026 5, so P17-P22 drop after Q1
// and P11-P16 drop after Q2, always leaving 10 cars for Q3. Returns which
// cutoff line(s) to draw for the segment currently in progress:
//   Q1 live -> only the Q1 cut (P16/P17) — "ELIMINATION ZONE" (red), it's
//              still an active decision
//   Q2 live -> the Q2 cut (P10/P11), also "ELIMINATION ZONE" (red, still
//              active) + the P16/P17 line, now just "Q1 ELIMINATED" (grey,
//              already decided)
//   Q3 live -> BOTH lines, but by now NEITHER is still being decided —
//              "Q1 ELIMINATED" and "Q2 ELIMINATED" (both grey). Deliberately
//              separate label objects from the Q1/Q2-live ones above, so
//              Q3 never inherits the red "ELIMINATION ZONE" wording.
// Returns [] outside qualifying/sprint-qualifying (meta.kind !== 'countdown-segment').
function qualyCutoffLines(meta) {
    if (!meta || meta.kind !== 'countdown-segment') return [];
    const part = currentQualifyingPart();
    const isSprint = meta.prefix === 'SQ';

    if (part === 1) {
        return [{ afterPos: 16, label: 'ELIMINATION ZONE' }];
    }
    if (part === 2) {
        // Q2 live: the live cut moves to P10 ("ELIMINATION ZONE" — who's
        // fighting to make Q3), and the old P16/P17 line becomes a plain
        // divider marking the Q1 dropouts frozen at the bottom of the
        // table (see dimAfterPos in render(), driven by `dimBeyond`).
        return [
            { afterPos: 10, label: 'ELIMINATION ZONE' },
            { afterPos: 16, label: isSprint ? 'SQ1 ELIMINATED' : 'Q1 ELIMINATED', dimBeyond: true },
        ];
    }
    if (part === 3) {
        // Both lines are already-decided by now, so everything below P10
        // (both the P11-16 and P17-22 groups) gets dimmed the same way Q2
        // dims its Q1 dropouts — dimBeyond only needs to sit on the P10
        // line since that's the outermost boundary of "already out".
        return [
            { afterPos: 16, label: isSprint ? 'SQ1 ELIMINATED' : 'Q1 ELIMINATED' },
            { afterPos: 10, label: isSprint ? 'SQ2 ELIMINATED' : 'Q2 ELIMINATED', dimBeyond: true },
        ];
    }
    return [];
}

// Weaves cutoff separator rows into an already-rendered array of per-driver
// row HTML strings. `rowHtmls[i]` must correspond to finishing position
// i+1 (same order render() already sorts rows into). `colspan` must match
// the number of columns of the target table (12 for the main table, 9 for
// the compact Map View one) so the separator's single <td> spans correctly.
function withQualySeparators(rowHtmls, cutoffLines, colspan) {
    if (cutoffLines.length === 0) return rowHtmls.join('');
    const out = [];
    rowHtmls.forEach((html, i) => {
        out.push(html);
        const posNum = i + 1;
        const cut = cutoffLines.find((c) => c.afterPos === posNum);
        if (cut) {
            out.push(
                `<tr class="live-qualy-separator"><td colspan="${colspan}">` +
                `<span class="live-qualy-separator-inner">` +
                `<span class="live-qualy-separator-line"></span>` +
                `<span class="live-qualy-separator-label${cut.label.includes('ELIMINATION ZONE') ? ' live-qualy-separator-label--danger' : ''}">${cut.label}</span>` +
                `<span class="live-qualy-separator-line"></span>` +
                `</span>` +
                `</td></tr>`
            );
        }
    });
    return out.join('');
}

// Full session name shown OUTSIDE the flag badge, e.g. "QUALIFYING - Q2",
// "SPRINT QUALIFYING - SQ2", "FREE PRACTICE 2", "SPRINT RACE", "RACE".
function fullSessionLabel(meta) {
    if (meta.kind === 'countdown-fixed') {
        const num = meta.label.replace('FP', ''); // "FP2" -> "2"
        return `FREE PRACTICE ${num}`;
    }
    if (meta.kind === 'countdown-segment') {
        const part = currentQualifyingPart();
        return meta.prefix === 'SQ'
            ? `SPRINT QUALIFYING SQ${part}`
            : `QUALIFYING Q${part}`;
    }
    if (meta.kind === 'count-up') {
        return meta.label === 'SPRINT' ? 'SPRINT RACE' : 'RACE';
    }
    return '';
}

function fallbackDuration(meta) {
    if (meta.kind === 'countdown-fixed') return meta.duration;
    if (meta.kind === 'countdown-segment') {
        const durations = SEGMENT_DURATIONS[meta.prefix] || [];
        return durations[currentQualifyingPart() - 1] ?? durations[0] ?? 0;
    }
    return 0;
}

function parseClockToSeconds(hhmmss) {
    if (!hhmmss) return null;
    const parts = hhmmss.split(':').map(Number);
    if (parts.some((n) => Number.isNaN(n))) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
}

function formatClockSeconds(totalSeconds) {
    const sign = totalSeconds < 0 ? '-' : '';
    const abs = Math.max(0, Math.abs(Math.floor(totalSeconds)));
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}

// Reads the current flag state off TrackStatus. Real F1 feed status codes
// (per f1-dash/Nitrous and similar reverse-engineered docs): 1=AllClear,
// 2=Yellow, 4=SafetyCar, 5=Red, 6=VSC, 7=VSCEnding. Collapsed here to the
// 3 colors you asked for (SC/VSC count as yellow).
// TODO: confirm these codes against your own TrackStatus console.log.
function currentFlagState() {
    const ts = state.TrackStatus;
    const status = ts && ts.Status;

    if (status === '5') return { color: 'red', text: 'RED FLAG' };
    if (status === '4') return { color: 'yellow', text: 'SAFETY CAR' };
    if (status === '6' || status === '7') return { color: 'yellow', text: 'VIRTUAL SAFETY CAR' };
    if (status === '2') return { color: 'yellow', text: 'YELLOW FLAG' };
    return { color: 'green', text: 'TRACK CLEAR' };
}

// Whether the countdown should be frozen — red flag is the one that always
// pauses; used together with ExtrapolatedClock's own Extrapolating flag.
function isRedFlag() {
    return currentFlagState().color === 'red';
}

// Cuánto pasó desde que el feed emitió ese Remaining. Se mide contra
// clock.Utc (la hora del propio feed) y no contra el momento en que nos
// llegó el mensaje: al abrir la página, el relay manda su último snapshot,
// que puede tener minutos de antigüedad, y tomarlo como recién llegado
// hacía que el countdown quedara atrasado justo esa diferencia.
// Si el reloj de la máquina está muy corrido respecto al del feed, el
// cálculo da un número absurdo y se cae al método viejo.
function clockElapsedSeconds(clock) {
    const feedUtc = clock && clock.Utc ? new Date(clock.Utc).getTime() : NaN;
    if (Number.isFinite(feedUtc)) {
        const elapsed = (feedNow() - feedUtc) / 1000;
        if (elapsed >= 0 && elapsed < 6 * 3600) return elapsed;
    }
    return (Date.now() - lastClockUpdateLocalTime) / 1000;
}

function updateSessionClock() {
    const el = document.getElementById('mapview-fs-session-status');
    if (!el) return;

    const meta = deriveSessionMeta(state.SessionInfo);
    if (!meta) {
        el.innerHTML = '';
        return;
    }

    const flag = currentFlagState();
    const fullLabel = fullSessionLabel(meta);
    let clockText = '--:--';
    let paused = false;

    if (meta.kind === 'count-up') {
        const startedUtc = state.SessionTiming && state.SessionTiming.startedUtc;
        clockText = startedUtc
            ? formatClockSeconds((feedNow() - new Date(startedUtc).getTime()) / 1000)
            : '00:00';
    } else {
        const clock = state.ExtrapolatedClock;
        const remainingFromFeed = clock && parseClockToSeconds(clock.Remaining);
        const extrapolating = clock ? clock.Extrapolating !== false : true;
        paused = !extrapolating || isRedFlag();

        if (remainingFromFeed != null) {
            const elapsedSinceUpdate = paused ? 0 : clockElapsedSeconds(clock);
            clockText = formatClockSeconds(remainingFromFeed - elapsedSinceUpdate);
        } else {
            // No ExtrapolatedClock message yet this segment — show the
            // nominal full duration instead of a blank/placeholder dash.
            clockText = formatClockSeconds(fallbackDuration(meta));
        }
    }

    const html = `
        <span class="status-flag status-flag--${flag.color}">${flag.text}</span>
        <span class="status-session-name">${fullLabel}</span>
        <span class="status-clock${paused ? ' status-clock--paused' : ''}">${clockText}${paused ? ' ⏸' : ''}</span>
    `;
    el.innerHTML = html;
}

// Circuit map for the Map View section. Pide el trazado en vivo (ver
// TRACK MAP) y deja el PNG del circuito como respaldo por si la API no
// responde. El PNG solo se cambia cuando cambia el GP.
let lastCircuitId = null;
function updateCircuitMap() {
    loadTrackMap();

    const img = document.getElementById('circuit-map-img');
    if (!img) return;

    const circuitId = currentCircuitId();
    if (!circuitId || circuitId === lastCircuitId) return;
    lastCircuitId = circuitId;

    img.src = `./img/circuits/${circuitId}-layout.png`;
}

// Full driver name, preserving the feed's formatting when available.
// Examples: "Carlos SAINZ", "Max Verstappen".
function driverFullName(driver, num) {
    if (driver.FullName) return driver.FullName.trim();
    if (driver.LastName) return driver.LastName.toUpperCase();
    return driver.Tla || num;
}

// Full surname, uppercase (e.g. "HAMILTON"). Falls back to Tla/number if
// the feed hasn't sent LastName yet for this driver.
function driverSurname(driver, num) {
    if (driver.LastName) return driver.LastName.toUpperCase();
    if (driver.FullName) return driver.FullName.trim().split(' ').pop().toUpperCase();
    return driver.Tla || num;
}

// 3-letter driver code for the compact Map View table (e.g. "HAM", "VER").
// Prefers the feed's own Tla if present; otherwise takes the first 3
// letters of whatever driverSurname() resolves to.
function driverCode(driver, num) {
    if (driver.Tla) return driver.Tla.toUpperCase();
    return driverSurname(driver, num).slice(0, 3);
}

function teamLogoHTML(teamName) {
    const logoFile = TEAM_LOGO_MAP[teamName];
    return logoFile
        ? `<img class="res-team-logo" src="./img/teams/${logoFile}.png" alt="${teamName}">`
        : `<span class="res-team-logo-placeholder"></span>`;
}

// ── TEAM NAMES (data/teams.json) ──────────────────────────────────────────
// La columna "Team" muestra el nombre tal cual está en teams.json (p. ej.
// el feed manda "Mercedes" y la base dice "Mercedes-AMG"). resolveTeam()
// de shared/teams.js hace el cruce feed → ID de la base, igual que en el
// resto del sitio. Mientras teams.json no llegó, se muestra el del feed.
let teamsData = null;
fetch('./data/teams.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
        if (!data) return;
        teamsData = data;
        applyTableView();
    })
    .catch(() => {});

function teamDisplayName(feedTeamName) {
    if (!feedTeamName) return '';
    if (!teamsData || typeof resolveTeamId !== 'function') return feedTeamName;
    // Si no hay equipo que encaje, resolveTeamId devuelve un slug: mejor
    // el nombre del feed que "haas-f1-team".
    const team = teamsData[resolveTeamId(feedTeamName, teamsData)];
    return (team && team.name) || feedTeamName;
}

// Color del equipo como lo usa championship: el de teams.json primero, el
// del feed (TEAM_COLOR_MAP) mientras la base no llegó o si no lo tiene.
function teamAccentColor(feedTeamName) {
    if (teamsData && typeof resolveTeamId === 'function') {
        const team = teamsData[resolveTeamId(feedTeamName, teamsData)];
        if (team && team.color) return team.color;
    }
    return TEAM_COLOR_MAP[feedTeamName] || 'rgba(255,255,255,0.4)';
}

// "#63" en el color del equipo — calcado de .st-driver-num de championship.
// La clave de DriverList ya es el número de carrera; RacingNumber manda si
// el feed lo trae.
function driverNumberHTML(driver, num) {
    const number = driver.RacingNumber || num;
    if (!number) return '';
    return `<span class="live-driver-num" style="color:${teamAccentColor(driver.TeamName)}">#${number}</span>`;
}

// Stints ordered oldest → current. Empty array when the feed hasn't sent
// any yet.
function orderedStints(appLine) {
    if (!appLine || !appLine.Stints) return [];
    return Object.keys(appLine.Stints)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => appLine.Stints[key]);
}

// One stint: compound icon + laps done on that set, colored to match the
// compound (.tyre-fresh-label--*). Shared by both Tyres views, so "All
// stints" and "Current set" read exactly the same.
function tyreStintBadgeHTML(stint) {
    const meta = COMPOUND_META[stint.Compound] || { code: stint.Compound ? '?' : null, file: null };
    const colorClass = meta.file ? `tyre-fresh-label--${meta.file}` : '';
    return `<span class="tyre-fresh">${tyreIconHTML(meta)}` +
        `<span class="tyre-fresh-label ${colorClass}">${stint.TotalLaps ?? '?'}</span>` +
        `</span>`;
}

// Tyres → "All stints": every stint of the session in order, each with its
// own lap count (e.g. [M]16 [S]8 [S]16).
function tyreStintsHTML(appLine) {
    const stints = orderedStints(appLine);
    if (stints.length === 0) return '<span class="live-muted">–</span>';
    return `<span class="tyre-stints">${stints.map(tyreStintBadgeHTML).join('')}</span>`;
}

// Same chevron icon used for the delta indicator in race.js
function deltaArrowSvg(direction) {
    const rotate = direction === 'down' ? 180 : 0;
    return `<svg class="res-delta-arrow" viewBox="0 0 24 24" style="transform:rotate(${rotate}deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Live equivalent of race.js's gridDeltaHtml: compares the starting grid
// position (GridPos, from TimingAppData) against the current live position.
function gridDeltaHtml(currentPos, gridPos) {
    const posNum = parseInt(currentPos, 10);
    if (isNaN(posNum) || gridPos == null) {
        return `<span class="res-delta res-delta--none">—</span>`;
    }

    const delta = gridPos - posNum; // positive = gained places
    if (delta > 0) {
        return `<span class="res-delta res-delta--up">${deltaArrowSvg('up')}${delta}</span>`;
    } else if (delta < 0) {
        return `<span class="res-delta res-delta--down">${deltaArrowSvg('down')}${Math.abs(delta)}</span>`;
    } else {
        return `<span class="res-delta res-delta--same">—</span>`;
    }
}

// Same lap time parser used in race.js: "1:18.518" or "18.518" → ms
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

// ── WEATHER (hero card, top of the page) ─────────────────────────────────
// Card markup/CSS is identical to race.js's session-weather-card; only the
// data source differs: race.js reads pre-recorded session weather from
// season2026.json, this reads live WeatherData pushed over the WebSocket.
function formatWeatherNumber(value, suffix = '') {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace('.0', '')}${suffix}` : '—';
}

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
    const wind     = formatWeatherNumber(Number(weather.wind_speed) * 3.6, ' km/h');
    const hasWindDir  = Number.isFinite(Number(weather.wind_direction));
    const windDirDeg  = hasWindDir ? Number(weather.wind_direction) : 0;

    const compassSvg = `
        <svg class="swc-wind-compass-icon" viewBox="0 0 24 24" style="transform:rotate(${windDirDeg}deg)" aria-hidden="true">
            <line x1="12" y1="22.5" x2="12" y2="3.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M3.5 11 L12 2 L20.5 11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

    return `
        <div class="session-weather-card">
            <div class="swc-condition ${rainfall ? 'is-wet' : 'is-dry'}">
                <span class="swc-condition-icon">${rainfall ? '🌧️' : '☀️'}</span>
            </div>
            <div class="swc-stats">
                <div class="swc-stat">
                    <span class="swc-stat-value">${air}</span>
                    <span class="swc-stat-label">Air</span>
                </div>
                <div class="swc-stat">
                    <span class="swc-stat-value">${track}</span>
                    <span class="swc-stat-label">Track</span>
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
            </div>
        </div>`;
}

// state.WeatherData is expected in the F1 SignalR feed's native shape
// (AirTemp, TrackTemp, Humidity, WindSpeed, WindDirection, Rainfall — all
// strings). Normalized here to the lowercase/numeric shape renderSessionWeatherCard
// expects, matching what the future backend adapter will forward as-is.
function getLiveWeather() {
    const w = state.WeatherData;
    if (!w) return null;
    return {
        air_temperature:  w.AirTemp,
        track_temperature: w.TrackTemp,
        humidity:         w.Humidity,
        wind_speed:       Number(w.WindSpeed) / 3.6, // feed sends km/h; renderer expects m/s
        wind_direction:   w.WindDirection,
        rainfall:         w.Rainfall,
    };
}

function renderWeatherInto(containerId, weather) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!weather) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = '';
    container.innerHTML = renderSessionWeatherCard(weather);
    if (window.twemoji) window.twemoji.parse(container);
}

function updateLiveWeather() {
    const weather = getLiveWeather();
    renderWeatherInto('mapview-fs-weather', weather);
}

// ── MAP VIEW FULLSCREEN PANEL HEIGHT (Q1 vs Q2/Q3) ────────────────────────
// Fullscreen .mapview-panels-row height differs by qualifying segment (see
// live.css): 782px in Q1 (still 22 cars in the table), 814px in Q2/Q3 (field
// already down to 16/10, table's shorter so the row can stretch taller).
// Outside qualifying, neither class applies and live.css falls back to its
// default max-height.
function updateQualiPanelHeightClass(sessionMeta) {
    const mapViewContent = document.getElementById('live-map-view-content');
    if (!mapViewContent) return;

    mapViewContent.classList.remove('quali-q1', 'quali-q2-q3');
    if (!sessionMeta || sessionMeta.kind !== 'countdown-segment') return;

    const part = currentQualifyingPart();
    if (part === 1) mapViewContent.classList.add('quali-q1');
    else if (part === 2 || part === 3) mapViewContent.classList.add('quali-q2-q3');
}

// Tyres → "Current set": just the stint the car is on right now (default
// in Qualifying and Practice, where there's no pit strategy to trace).
function tyreCompoundBadgeHTML(appLine) {
    const stints = orderedStints(appLine);
    if (stints.length === 0) return '<span class="live-muted">–</span>';
    return tyreStintBadgeHTML(stints[stints.length - 1]);
}

// ── TABLE VIEW (columnas y formato que elige el usuario) ──────────────────
// El panel "Customize table" (botón al lado de pantalla completa) deja
// prender/apagar columnas y elegir cómo se muestran algunas cosas. En
// localStorage se guarda SOLO lo que el usuario tocó: lo que nunca tocó
// sigue el default de cada tipo de sesión (Interval en carrera sí, en Qualy
// no; Laps solo en Práctica; etc.), así la tabla se ve igual que siempre
// hasta que alguien la cambie.
const VIEW_STORAGE_KEY = 'f1hub:live-view';

// El orden de acá es el orden de las columnas en la tabla y de la lista en
// el panel. locked = no se puede sacar (sin posición o piloto la tabla no
// dice nada). raceOnly = solo existe en Carrera/Sprint (necesita la grilla).
const VIEW_COLUMNS = [
    { key: 'pos',          label: 'Position', locked: true },
    { key: 'delta',        label: 'Positions gained', raceOnly: true },
    { key: 'driver',       label: 'Driver', locked: true },
    { key: 'number',       label: 'Driver number' },
    { key: 'team',         label: 'Team' },
    { key: 'status',       label: 'Status (Pit / Out)' },
    { key: 'gap',          label: 'Gap to leader' },
    { key: 'interval',     label: 'Interval' },
    { key: 'bestLap',      label: 'Best lap' },
    { key: 'lastLap',      label: 'Last lap' },
    { key: 'sectors',      label: 'Sectors' },
    { key: 'microsectors', label: 'Microsectors' },
    { key: 'tyres',        label: 'Tyres' },
    { key: 'laps',         label: 'Laps' },
];

// Paneles de la pantalla que se pueden prender/apagar (sección "Panels" del
// panel Customize). Se guardan junto con las columnas en viewPrefs.columns.
const VIEW_PANELS = [
    { key: 'trackMap',    label: 'Track map' },
    { key: 'raceControl', label: 'Race control' },
];

const VIEW_SESSION_DEFAULTS = {
    race:     { number: false, team: true, delta: true,  status: true, gap: true, interval: true,  bestLap: false, lastLap: true, sectors: true, microsectors: true, tyres: true, laps: false, trackMap: true, raceControl: true },
    quali:    { number: false, team: true, delta: false, status: true, gap: true, interval: false, bestLap: true,  lastLap: true, sectors: true, microsectors: true, tyres: true, laps: false, trackMap: true, raceControl: true },
    practice: { number: false, team: true, delta: false, status: true, gap: true, interval: false, bestLap: true,  lastLap: true, sectors: true, microsectors: true, tyres: true, laps: true,  trackMap: true, raceControl: true },
};

// Opciones de formato (botones segmentados en el panel). La primera opción
// es el default, salvo tyres, que depende de la sesión (ver optionDefault).
// dependsOn: la casilla de la que dependen; si está apagada, los botones ni
// aparecen (no tiene sentido elegir cómo se ve algo que no se muestra).
const VIEW_OPTIONS = {
    driverName: {
        label: 'Driver names',
        choices: [['code', 'Short name'], ['surname', 'Last name'], ['full', 'Full name']],
    },
    team: {
        label: 'Team',
        dependsOn: 'team',
        choices: [['inline', 'Logo by driver'], ['column', 'Name column']],
    },
    tyres: {
        label: 'Tyres',
        dependsOn: 'tyres',
        choices: [['history', 'All stints'], ['current', 'Current set']],
    },
};

function loadViewPrefs() {
    try {
        const parsed = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || '{}');
        if (parsed && typeof parsed === 'object') {
            const columns = parsed.columns && typeof parsed.columns === 'object' ? parsed.columns : {};
            const prefs = { ...parsed, columns };
            // Antes "Hidden" (Team) y "Hide" (Race control) eran botones;
            // ahora son casillas. Se respeta lo que el usuario había elegido.
            if (prefs.team === 'hidden') {
                columns.team = false;
                delete prefs.team;
            }
            if (prefs.raceControl === 'hide' || prefs.raceControl === 'show') {
                columns.raceControl = prefs.raceControl === 'show';
                delete prefs.raceControl;
            }
            return prefs;
        }
    } catch (err) { /* sin storage o JSON roto: defaults */ }
    return { columns: {} };
}

let viewPrefs = loadViewPrefs();

function saveViewPrefs() {
    try { localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(viewPrefs)); } catch (err) { /* ignorar */ }
}

function sessionKindFromMeta(meta) {
    if (meta && meta.kind === 'countdown-segment') return 'quali';
    if (meta && meta.kind === 'countdown-fixed') return 'practice';
    return 'race';
}

function optionDefault(name, kind) {
    if (name === 'tyres') return kind === 'race' ? 'history' : 'current';
    return VIEW_OPTIONS[name].choices[0][0];
}

// Lo que efectivamente se ve en esta sesión: preferencia guardada si la
// hay, default de la sesión si no. cols trae columnas y paneles.
function effectiveView(kind) {
    const defaults = VIEW_SESSION_DEFAULTS[kind];
    const cols = {};
    for (const col of [...VIEW_COLUMNS, ...VIEW_PANELS]) {
        if (col.locked) cols[col.key] = true;
        else if (col.raceOnly && kind !== 'race') cols[col.key] = false;
        else if (typeof viewPrefs.columns[col.key] === 'boolean') cols[col.key] = viewPrefs.columns[col.key];
        else cols[col.key] = defaults[col.key];
    }
    const view = { kind, cols };
    for (const name of Object.keys(VIEW_OPTIONS)) {
        const saved = viewPrefs[name];
        const valid = VIEW_OPTIONS[name].choices.some(([value]) => value === saved);
        view[name] = valid ? saved : optionDefault(name, kind);
    }
    return view;
}

function driverDisplayName(driver, num, style) {
    if (style === 'surname') return driverSurname(driver, num);
    if (style === 'full') {
        if (driver.FirstName && driver.LastName) return `${driver.FirstName} ${driver.LastName.toUpperCase()}`;
        return driverFullName(driver, num);
    }
    return driverCode(driver, num);
}

// Columnas visibles para esta vista, en orden. Cada una trae su <th> y una
// función que arma su <td> a partir del contexto de fila que prepara
// render(). El "cluster" de tiempos (Best Lap, Last Lap, S1-S3) lleva el
// padding apretado de .live-col-tight-* según qué celda quede primera,
// del medio o última (ver live.css, COLUMN PADDING).
function buildTableColumns(view) {
    const { cols } = view;
    // Team apagado: ni logo ni columna, elija lo que elija en los botones.
    const teamMode = cols.team ? view.team : 'hidden';
    const showSectors = cols.sectors || cols.microsectors;
    const cluster = [
        cols.bestLap && 'bestLap',
        cols.lastLap && 'lastLap',
        ...(showSectors ? ['s1', 's2', 's3'] : []),
    ].filter(Boolean);
    const pad = (key) => {
        if (cluster.length === 1) return 'live-col-roomy';
        if (key === cluster[0]) return 'live-col-tight-first';
        if (key === cluster[cluster.length - 1]) return 'live-col-tight-last';
        return 'live-col-tight-mid';
    };

    const columns = [];
    const add = (th, td) => columns.push({ th, td });

    add('<th class="live-col-pos live-col-roomy">Pos</th>',
        (r) => `<td class="res-pos live-col-roomy${r.isTop3 ? ' top3' : ''}">${r.line.Position ?? r.posNum}</td>`);

    if (cols.delta) {
        add('<th class="live-delta-col"></th>',
            (r) => `<td class="res-delta-cell">${gridDeltaHtml(r.line.Position ?? r.posNum, r.appLine && r.appLine.GridPos)}</td>`);
    }

    add('<th class="live-col-roomy live-col-driver">Driver</th>',
        (r) => `<td class="live-col-roomy live-col-driver">
                    <span class="res-team">
                        ${teamMode === 'inline' ? teamLogoHTML(r.driver.TeamName) : ''}
                        ${cols.number ? driverNumberHTML(r.driver, r.num) : ''}
                        ${driverDisplayName(r.driver, r.num, view.driverName)}
                    </span>
                </td>`);

    if (teamMode === 'column') {
        add('<th class="live-col-roomy live-col-team">Team</th>',
            (r) => `<td class="live-col-roomy live-col-team"><span class="res-team">${teamLogoHTML(r.driver.TeamName)}${teamDisplayName(r.driver.TeamName)}</span></td>`);
    }

    if (cols.status) {
        add('<th class="live-col-status"></th>',
            (r) => `<td class="live-col-status">${r.statusLabel ? `<span class="live-status-wrap"><span class="live-status-badge" style="color:${r.teamColor}">${r.statusLabel}</span></span>` : ''}</td>`);
    }

    if (cols.gap) {
        add('<th class="live-col-roomy">Gap</th>',
            (r) => `<td class="live-muted live-col-roomy">${r.gapText}</td>`);
    }

    if (cols.interval) {
        add('<th class="live-col-roomy">Interval</th>',
            (r) => `<td class="live-muted live-col-roomy">${r.intervalText}</td>`);
    }

    if (cols.bestLap) {
        add(`<th class="live-col-best ${pad('bestLap')}">Best Lap</th>`,
            (r) => `<td class="live-col-best ${r.bestLapClass} ${pad('bestLap')}">${r.bestLap.Value ?? '-'}</td>`);
    }

    if (cols.lastLap) {
        add(`<th class="${pad('lastLap')}">Last Lap</th>`,
            (r) => `<td class="${r.lapClass} ${pad('lastLap')}">${r.lastLap.Value ?? '-'}</td>`);
    }

    if (showSectors) {
        [0, 1, 2].forEach((idx) => {
            const cls = pad(`s${idx + 1}`);
            add(`<th class="live-sector-col ${cls}">S${idx + 1}</th>`, (r) => {
                if (r.sectorsBlanked) return `<td class="live-sector-cell ${cls}"></td>`;
                const sector = r.sectors[idx];
                const time = cols.sectors ? `<span class="live-sector-time">${sector?.value ?? '-'}</span>` : '';
                const bars = cols.microsectors ? microsectorsHTML(getSegments(r.line, idx + 1)) : '';
                const colorClass = cols.sectors ? (sector?.className || '') : '';
                const microOnly = cols.sectors ? '' : ' live-sector-cell--micro-only';
                return `<td class="live-sector-cell ${cls} ${colorClass}${microOnly}"><span class="live-sector-wrap">${bars}${time}</span></td>`;
            });
        });
    }

    if (cols.tyres) {
        const tyreCellHTML = view.tyres === 'history' ? tyreStintsHTML : tyreCompoundBadgeHTML;
        add('<th class="live-col-roomy">Tyres</th>',
            (r) => `<td class="live-col-roomy">${tyreCellHTML(r.appLine)}</td>`);
    }

    if (cols.laps) {
        add('<th class="live-col-roomy">Laps</th>',
            (r) => `<td class="live-col-roomy">${r.line.NumberOfLaps ?? '-'}</td>`);
    }

    return columns;
}

// Colspan de la fila de "Waiting…"/avisos: sigue a la cantidad de columnas.
let tableColspan = 11;

// Only touches the DOM when the header actually changes (session type or
// the user's view settings), so this is cheap to call on every render().
let lastHeaderHTML = null;
function updateTableHeaders(columns) {
    const html = `<tr>${columns.map((c) => c.th).join('')}</tr>`;
    tableColspan = columns.length;
    if (html === lastHeaderHTML) return;
    lastHeaderHTML = html;

    const thead = document.getElementById('live-thead-2');
    if (thead) thead.innerHTML = html;
}

// Aplica la vista actual sin esperar datos: si ya hay tabla, re-renderiza;
// si no, solo actualiza encabezados y el colspan del aviso vacío (sin pisar
// el texto del aviso de conexión).
function applyTableView() {
    if (state.TimingData && state.TimingData.Lines) {
        render();
        return;
    }
    const kind = sessionKindFromMeta(deriveSessionMeta(state.SessionInfo));
    updateTableHeaders(buildTableColumns(effectiveView(kind)));
    const emptyCell = document.querySelector('#live-rows-2 td.results-empty');
    if (emptyCell) emptyCell.colSpan = tableColspan;
    renderRaceControl();
}

function render() {
    updateGPName();
    updateSessionClock();
    updateLiveWeather();
    updateCircuitMap();
    renderRaceControl();

    const timingLines = (state.TimingData && state.TimingData.Lines) || {};
    const driverList = state.DriverList || {};
    const appLines = (state.TimingAppData && state.TimingAppData.Lines) || {};

    const rows = Object.keys(timingLines)
        .map((num) => ({ num, line: timingLines[num] }))
        .filter((r) => r.line)
        // Ordenar por Position (que es el número que después se muestra en
        // la columna Pos) y usar Line solo para desempatar. Antes se
        // ordenaba solo por Line: cuando el feed manda Position y Line en
        // updates distintos, la tabla quedaba ordenada de una forma y
        // numerada de otra, con posiciones que parecían repetidas o
        // salteadas.
        .sort((a, b) => {
            const posA = Number(a.line.Position) || Number(a.line.Line) || 99;
            const posB = Number(b.line.Position) || Number(b.line.Line) || 99;
            if (posA !== posB) return posA - posB;
            return (Number(a.line.Line) || 99) - (Number(b.line.Line) || 99);
        });

    // Find the session's fastest BestLapTime across all drivers, to highlight it purple.
    let sessionBestMs = Infinity;
    for (const { line } of rows) {
        const ms = lapTimeToMs(line.BestLapTime && line.BestLapTime.Value);
        if (ms != null && ms < sessionBestMs) sessionBestMs = ms;
    }

    // Only non-empty during Q1/Q2/Q3 (or SQ1/SQ2/SQ3) — see qualyCutoffLines().
    const sessionMeta = deriveSessionMeta(state.SessionInfo);
    const cutoffLines = qualyCutoffLines(sessionMeta);
    updateQualiPanelHeightClass(sessionMeta);

    // Qualifying & Sprint Qualifying / Free Practice: P1-P3 there is just
    // "currently fastest in the session", not a race result, so no podium
    // coloring, no grid delta and no fastest-row tint. Which columns show
    // (and how) comes from the user's view settings — see effectiveView().
    const sessionKind = sessionKindFromMeta(sessionMeta);
    const isQualiSession = sessionKind === 'quali';
    const isPracticeSession = sessionKind === 'practice';
    const view = effectiveView(sessionKind);
    const columns = buildTableColumns(view);
    updateTableHeaders(columns);
    syncViewPanel(sessionKind);
    // FP-only: widens Best Lap's padding to 15px both sides (see live.css).
    document.body.classList.toggle('is-fp-session', isPracticeSession);

    // Rows below the outermost "already eliminated" divider get dimmed —
    // frozen results from a segment that's over, not part of the live
    // fight happening above. In Q2 that's below P16 (Q1 dropouts); in Q3
    // it's below P10 (everyone eliminated in Q1 or Q2). `dimBeyond` flags
    // which cutoff (if any) marks that boundary; null in Q1, so nothing
    // is dimmed there (nobody's eliminated yet).
    const dimAfterPos = (cutoffLines.find((c) => c.dimBeyond) || {}).afterPos ?? null;

    // Sector times get blanked out for whoever's already out: in Q2 that's
    // the Q1 dropouts (below P16), in Q3 it's the Q2 dropouts (below P10) —
    // their sector splits are stale from a segment that's already over, so
    // showing them next to the live fight above is misleading.
    const qualifyingPart = isQualiSession ? currentQualifyingPart() : null;
    const blankSectorsAfterPos = qualifyingPart === 2 ? 16 : qualifyingPart === 3 ? 10 : null;

    // Base para el Gap calculado a mano (ver gapCellText): la mejor vuelta
    // de quien está P1. Solo aplica en Q/SQ/FP, donde se ordena por vuelta.
    const allowGapFallback = isQualiSession || isPracticeSession;
    const leaderBestMs = rows.length
        ? lapTimeToMs(rows[0].line.BestLapTime && rows[0].line.BestLapTime.Value)
        : null;

    const tbody2 = document.getElementById('live-rows-2');

    if (rows.length === 0) {
        if (tbody2) tbody2.innerHTML = `<tr><td colspan="${tableColspan}" class="results-empty">Waiting for session data…</td></tr>`;
        return;
    }

    if (tbody2) {
        const rowHtmls = rows.map(({ num, line }, i) => {
            const driver = driverList[num] || {};
            const lastLap = line.LastLapTime || {};
            const bestLap = line.BestLapTime || {};
            const bestMs = lapTimeToMs(bestLap.Value);
            const posNum = i + 1;

            // In FP the fastest lap is always P1's (table's sorted by best
            // lap), so painting it purple is redundant there.
            const bestLapClass = (bestMs != null && bestMs === sessionBestMs && !isPracticeSession) ? 'live-lap--fastest' : '';
            // The full purple row highlight only makes sense in Race/Sprint.
            // In Q/SQ the purple *cell* on Best Lap already marks the
            // fastest time; in FP the fastest time is always P1.
            const fastestRowClass = (bestLapClass && !isQualiSession && !isPracticeSession) ? ' live-row--fastest-map' : '';
            const isEliminated = dimAfterPos != null && posNum > dimAfterPos;

            // Todo lo que las columnas pueden necesitar (ver
            // buildTableColumns): cada una toma de acá lo suyo.
            const r = {
                num,
                line,
                driver,
                posNum,
                appLine: appLines[num],
                isTop3: posNum <= 3 && !isQualiSession && !isPracticeSession,
                teamColor: TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)',
                statusLabel: line.Retired ? 'RETIRED' : line.InPit ? 'PIT' : line.PitOut ? 'OUT' : '',
                gapText: gapCellText(line, posNum, leaderBestMs, allowGapFallback),
                intervalText: intervalCellText(line, posNum, i > 0 ? rows[i - 1].line : null, allowGapFallback),
                lastLap,
                lapClass: lastLap.OverallFastest ? 'live-lap--fastest'
                    : lastLap.PersonalFastest ? 'live-lap--pb' : 'live-lap--normal',
                bestLap,
                bestLapClass,
                sectors: getSectorTimes(line),
                sectorsBlanked: blankSectorsAfterPos != null && posNum > blankSectorsAfterPos,
            };

            return `
                <tr class="results-row ${line.Retired ? 'live-row--retired' : ''}${fastestRowClass}${isEliminated ? ' live-row--eliminated' : ''}">
                    ${columns.map((c) => c.td(r)).join('')}
                </tr>
            `;
        });
        tbody2.innerHTML = withQualySeparators(rowHtmls, cutoffLines, tableColspan);
    }

    trackCarProgress();
    updatePositionOverlay();
}

// ── RACE CONTROL ──────────────────────────────────────────────────────────
// Mensajes de Race Control (tema RaceControlMessages del feed): banderas,
// SC/VSC, investigaciones, sanciones, track limits, DRS. Van debajo del
// mapa, el más nuevo arriba. Los que llegan con la página abierta se
// resaltan un momento (.is-new) para que se note que hay algo nuevo.
//
// El snapshot trae Messages como array y los deltas como objeto indexado
// ({"12": {...}}); mergeState ya los junta, acá solo se ordena por índice.
const RC_MAX_MESSAGES = 60;
const rcSeen = new Set();
let rcPrimed = false;
let rcLastSignature = null;

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function raceControlMessages() {
    const raw = state.RaceControlMessages && state.RaceControlMessages.Messages;
    if (!raw || typeof raw !== 'object') return [];
    return Object.keys(raw)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => raw[key])
        .filter((m) => m && m.Message);
}

// Piloto dentro de un mensaje: "#16" igual que en la tabla (mismo
// driverNumberHTML(), color del equipo) + apellido. Si el piloto no está
// en DriverList, el apellido sale de la sigla del propio mensaje ("LEC").
function rcDriverHTML(number, fallbackCode) {
    const driver = (state.DriverList || {})[number] || {};
    const name = driver.LastName ? driver.LastName.toUpperCase() : (fallbackCode || driver.Tla || '');
    return `${driverNumberHTML(driver, number)}${name ? ` ${escapeHTML(name)}` : ''}`;
}

// F1 manda las horas en UTC sin zona ("2026-09-19T12:03:22"): se les
// agrega la Z para que no se lean como hora local. null si no se entiende.
function rcUtcMs(utc) {
    if (!utc) return null;
    const iso = /Z|[+-]\d\d:?\d\d$/.test(utc) ? utc : `${utc}Z`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
}

// Momento de la largada: el primer "Started" de SessionData.StatusSeries
// (hora oficial de F1; una bandera roja con relargada agrega otro, por eso
// el primero). Si no está, la hora en que el relay vio arrancar la sesión.
function sessionStartMs() {
    const series = state.SessionData && state.SessionData.StatusSeries;
    if (series && typeof series === 'object') {
        const keys = Object.keys(series).sort((a, b) => Number(a) - Number(b));
        for (const key of keys) {
            const entry = series[key];
            if (entry && entry.SessionStatus === 'Started') {
                const ms = rcUtcMs(entry.Utc);
                if (ms != null) return ms;
            }
        }
    }
    const started = state.SessionTiming && state.SessionTiming.startedUtc;
    return started ? rcUtcMs(started) : null;
}

// 5025000 ms → "1:23:45". Sin milésimas: la hora de la bandera a cuadros
// llega al segundo, así que más precisión sería inventada.
function formatDuration(ms) {
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Hora del mensaje en UTC ("12:50"), en el mismo chip que la vuelta. Tal
// cual la manda F1, sin pasarla a la hora local. Vacío si no se entiende.
function rcUtcTimeChip(utc) {
    const at = rcUtcMs(utc);
    if (at == null) return '';
    const date = new Date(at);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `<span class="rc-chip rc-chip--lap">${hh}:${mm}</span>`;
}

// "23 (ALB) AND 55 (SAI)" → "#23 ALBON & #55 SAINZ".
function rcDriversHTML(carsText) {
    const cars = [...String(carsText).matchAll(/(\d+) \((\w+)\)/g)];
    if (cars.length === 0) return escapeHTML(carsText);
    return cars.map(([, number, code]) => rcDriverHTML(number, code)).join(' &amp; ');
}

// ── MENSAJES REESCRITOS ──
// Los textos de F1 son largos y técnicos. Cada regla reconoce un tipo de
// mensaje (match) y devuelve cómo mostrarlo: { chip, html }. chip es la
// etiqueta de color ({ label, cls }; si no viene, se usa la de rcChip()) y
// html el texto (vacío = solo la etiqueta). Para sumar una nueva, agregar
// un objeto a la lista. `ctx` trae datos que dependen de los mensajes
// anteriores (p. ej. cuántos track limits lleva cada auto). Si ninguna
// regla coincide, se muestra el mensaje original.
const RC_REWRITES = [
    {
        // GREEN LIGHT - PIT EXIT OPEN → [GREEN LIGHT] PIT EXIT OPEN
        match: /^GREEN LIGHT - (.+)$/i,
        show: ([, rest]) => ({ chip: { label: 'Green light', cls: 'green' }, html: escapeHTML(rest) }),
    },
    {
        // CAR 16 (LEC) TIME 1:45.221 DELETED - TRACK LIMITS AT TURN 15 LAP 3 12:03:58
        //   → [TRACK LIMITS] 1° WARNING | #16 LECLERC
        match: /^CAR (\d+) \((\w+)\) (?:TIME|LAP) .*DELETED - TRACK LIMITS/i,
        show: ([, number, code], ctx) => {
            ctx.trackLimits[number] = (ctx.trackLimits[number] || 0) + 1;
            return {
                chip: { label: 'Track limits', cls: 'info' },
                html: `${ctx.trackLimits[number]}° WARNING | ${rcDriverHTML(number, code)}`,
            };
        },
    },
    {
        // DOUBLE YELLOW IN TRACK SECTOR 11 → [DOUBLE YELLOW] SECTOR 11
        // (igual para YELLOW y CLEAR: la etiqueta ya dice qué bandera es)
        match: /^(DOUBLE YELLOW|YELLOW|CLEAR) IN TRACK SECTOR (\d+)/i,
        show: ([, flag, sector]) => {
            const kind = flag.toUpperCase();
            const chip = kind === 'CLEAR' ? { label: 'Clear', cls: 'green' }
                : kind === 'YELLOW' ? { label: 'Yellow', cls: 'yellow' }
                : { label: 'Double yellow', cls: 'yellow' };
            return { chip, html: `SECTOR ${sector}` };
        },
    },
    {
        // VIRTUAL SAFETY CAR DEPLOYED → [VIRTUAL SAFETY CAR] DEPLOYED
        // SAFETY CAR IN THIS LAP      → [SAFETY CAR] IN THIS LAP
        // (y ENDING, THROUGH THE PIT LANE, etc.: el nombre completo va en la
        // etiqueta y el resto del mensaje, tal cual, como texto)
        match: /^(VIRTUAL SAFETY CAR|SAFETY CAR) (.+)$/i,
        show: ([, kind, rest]) => ({ chip: { label: kind, cls: 'sc' }, html: escapeHTML(rest) }),
    },
    {
        // RED FLAG → [RED FLAG] (solo la etiqueta)
        match: /^RED FLAG$/i,
        show: () => ({ chip: { label: 'Red flag', cls: 'red' }, html: '' }),
    },
    {
        // CHEQUERED FLAG → [CHEQUERED FLAG] RACE DURATION: 1:23:45
        // Duración = hora de la bandera menos la de largada (ver
        // sessionStartMs()). Solo en Carrera/Sprint: en Práctica/Qualy la
        // sesión dura lo que dura, así que ahí va solo la etiqueta.
        match: /^CHEQUERED FLAG$/i,
        show: (found, ctx, message) => {
            const chip = { label: 'Chequered flag', cls: 'chequered' };
            const end = rcUtcMs(message.Utc);
            if (!ctx.isRace || ctx.startMs == null || end == null || end <= ctx.startMs) {
                return { chip, html: '' };
            }
            return { chip, html: `RACE DURATION: ${formatDuration(end - ctx.startMs)}` };
        },
    },
    {
        // INCIDENT INVOLVING CARS 23 (ALB) AND 55 (SAI) NOTED - CAUSING A COLLISION
        //   → [INCIDENT NOTED] #23 ALBON & #55 SAINZ | CAUSING A COLLISION
        match: /^INCIDENT INVOLVING CARS? (.+?) NOTED - (.+)$/i,
        show: ([, cars, reason]) => ({
            chip: { label: 'Incident noted', cls: 'info' },
            html: `${rcDriversHTML(cars)} | ${escapeHTML(reason)}`,
        }),
    },
    {
        // FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 55 (SAI) - CAUSING A COLLISION
        //   → [5 SECOND PENALTY] #55 SAINZ | CAUSING A COLLISION
        // El tipo de sanción va en la etiqueta ("TIME" sobra: 5 SECOND TIME →
        // 5 SECOND). Sirve igual para DRIVE THROUGH, 10 SECOND STOP/GO, etc.
        match: /^FIA STEWARDS: (.+?) PENALTY FOR CAR (\d+) \((\w+)\)(?: - (.+))?$/i,
        show: ([, kind, number, code, reason]) => ({
            chip: { label: `${kind.replace(/\s+TIME$/i, '')} penalty`, cls: 'penalty' },
            html: `${rcDriverHTML(number, code)}${reason ? ` | ${escapeHTML(reason)}` : ''}`,
        }),
    },
];

// Cómo se muestra cada mensaje ({ chip, html }), en orden cronológico (los
// contadores como el de track limits dependen de lo que pasó antes).
function rcDisplayItems(messages) {
    const ctx = {
        trackLimits: {},
        isRace: currentSessionKind() === 'race',
        startMs: sessionStartMs(),
    };
    return messages.map((m) => {
        for (const rule of RC_REWRITES) {
            const found = rule.match.exec(m.Message);
            if (found) {
                const shown = rule.show(found, ctx, m);
                return { chip: shown.chip || rcChip(m), html: shown.html };
            }
        }
        return { chip: rcChip(m), html: escapeHTML(m.Message) };
    });
}

// Etiqueta de color según el tipo de mensaje. null = sin etiqueta.
function rcChip(message) {
    const flag = String(message.Flag || '').toUpperCase();
    const category = String(message.Category || '');
    const text = String(message.Message || '').toUpperCase();

    if (category === 'SafetyCar' || text.includes('SAFETY CAR')) {
        return { label: text.includes('VIRTUAL') ? 'VSC' : 'SC', cls: 'sc' };
    }
    if (flag === 'RED') return { label: 'Red flag', cls: 'red' };
    if (flag === 'DOUBLE YELLOW') return { label: 'Double yellow', cls: 'yellow' };
    if (flag === 'YELLOW') return { label: 'Yellow', cls: 'yellow' };
    if (flag === 'GREEN') return { label: 'Green', cls: 'green' };
    if (flag === 'CLEAR') return { label: 'Clear', cls: 'green' };
    if (flag === 'BLUE') return { label: 'Blue flag', cls: 'blue' };
    if (flag === 'CHEQUERED') return { label: 'Chequered', cls: 'chequered' };
    if (flag === 'BLACK AND WHITE') return { label: 'Black/white', cls: 'bw' };
    if (category === 'Drs') return { label: 'DRS', cls: 'drs' };
    if (text.includes('PENALTY')) return { label: 'Penalty', cls: 'penalty' };
    if (text.includes('TRACK LIMITS') || text.includes('DELETED')) return { label: 'Track limits', cls: 'info' };
    if (text.includes('INVESTIGATION') || text.includes('NOTED') || text.includes('REVIEWED')) {
        return { label: 'Stewards', cls: 'info' };
    }
    return null;
}

function renderRaceControl() {
    const section = document.getElementById('race-control');
    const list = document.getElementById('rc-list');
    if (!section || !list) return;

    const view = effectiveView(currentSessionKind());
    section.hidden = !view.cols.raceControl;
    // Con Race Control visible el mapa se achica a lo que mide la pista y
    // le deja el resto de la columna (ver live.css, RACE CONTROL).
    const mapPanel = section.closest('.mapview-panel--map');
    if (mapPanel) {
        mapPanel.classList.toggle('has-race-control', !section.hidden);
        // Track map apagado: el mapa se esconde y queda solo la franja con
        // los botones. Con los dos paneles apagados, la tabla ocupa todo el
        // ancho (ver live.css, PANELS ON/OFF).
        mapPanel.classList.toggle('map-off', !view.cols.trackMap);
    }
    const app = document.getElementById('live-map-view-content');
    if (app) app.classList.toggle('no-side', !view.cols.trackMap && !view.cols.raceControl);
    if (section.hidden) return;

    // Los textos se calculan sobre TODOS los mensajes de la sesión (los
    // contadores, como el de track limits, necesitan los anteriores) y
    // recién después se recortan a los últimos RC_MAX_MESSAGES.
    const allMessages = raceControlMessages();
    const allItems = rcDisplayItems(allMessages);
    const startMs = sessionStartMs();
    const messages = allMessages.slice(-RC_MAX_MESSAGES);
    const items = allItems.slice(-RC_MAX_MESSAGES);
    // La hora de largada entra en la firma: si llega después que los
    // mensajes, hay que redibujar (la duración de CHEQUERED FLAG depende de ella).
    const signature = `${startMs}|` + (messages.length
        ? `${messages.length}|${messages[messages.length - 1].Utc}|${messages[messages.length - 1].Message}`
        : 'empty');
    if (signature === rcLastSignature) return;
    rcLastSignature = signature;

    if (messages.length === 0) {
        list.innerHTML = '<li class="rc-empty">No race control messages yet</li>';
        return;
    }

    list.innerHTML = messages.map((m, i) => {
        const id = `${m.Utc}|${m.Message}`;
        const isNew = rcPrimed && !rcSeen.has(id);
        rcSeen.add(id);
        const { chip, html } = items[i];
        // La vuelta ("L 14") como una etiqueta más. Solo si el mensaje no
        // trae vuelta, la hora del mensaje en UTC ("12:50").
        const meta = m.Lap
            ? `<span class="rc-chip rc-chip--lap">L ${escapeHTML(m.Lap)}</span>`
            : rcUtcTimeChip(m.Utc);
        return `
            <li class="rc-item${isNew ? ' is-new' : ''}">
                <div class="rc-meta">${meta}</div>
                <div class="rc-body">
                    ${chip ? `<span class="rc-chip rc-chip--${chip.cls}">${chip.label}</span>` : ''}
                    ${html ? `<span class="rc-text">${html}</span>` : ''}
                </div>
            </li>`;
    }).reverse().join('');
    // Lo que ya estaba al abrir la página no se resalta: solo lo que llega
    // después.
    rcPrimed = true;
}

// ── TRACK MAP ─────────────────────────────────────────────────────────────
// Position.z trae la posición de cada auto en el sistema de coordenadas de
// la pista (no en píxeles de ninguna imagen). Antes los puntos se ponían
// encima del PNG oficial estirando un bounding box armado con lo que iba
// llegando: el PNG está girado y con márgenes a gusto del diseñador, así
// que los autos nunca caían sobre la pista dibujada.
//
// Ahora la pista se dibuja en SVG con el trazado de la API de MultiViewer
// (la misma que usa f1-dash), que viene en ESE MISMO sistema de
// coordenadas: los autos se dibujan con los mismos números y la misma
// rotación, así que caen exactamente sobre la línea. Si la API no
// responde, queda el PNG de siempre, sin autos (mal ubicados confunden
// más de lo que ayudan).
const TRACK_API_URL = 'https://api.multiviewer.app/api/v1/circuits';

let trackMap = null;          // geometría ya rotada, lista para dibujar
let trackMapRequestId = null; // "circuito/año" pedido (evita pedirlo dos veces)

function sessionCircuitTarget() {
    const info = state.SessionInfo;
    const key = info && info.Meeting && info.Meeting.Circuit && info.Meeting.Circuit.Key;
    if (!key) return null;
    const start = info.StartDate ? new Date(info.StartDate) : new Date();
    const year = Number.isFinite(start.getFullYear()) ? start.getFullYear() : new Date().getFullYear();
    return { key, year };
}

function fetchTrackData(key, year) {
    return fetch(`${TRACK_API_URL}/${key}/${year}`)
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((data) => {
            if (!data || !Array.isArray(data.x) || data.x.length < 2) throw new Error('empty track');
            return data;
        });
}

// Pide el trazado del circuito de la sesión (una sola vez por circuito y
// año). Si el año de la sesión todavía no está cargado en la API, prueba
// con el anterior: el trazado casi nunca cambia de un año al otro.
function loadTrackMap() {
    const target = sessionCircuitTarget();
    if (!target) return;
    const requestId = `${target.key}/${target.year}`;
    if (trackMapRequestId === requestId) return;
    trackMapRequestId = requestId;

    fetchTrackData(target.key, target.year)
        .catch(() => fetchTrackData(target.key, target.year - 1))
        .then((data) => {
            if (trackMapRequestId !== requestId) return; // cambió de sesión mientras tanto
            trackMap = buildTrackGeometry(data);
            drawTrackMap();
            updatePositionOverlay();
        })
        .catch(() => {
            trackMap = null;
            drawTrackMap();
        });
}

function rotatePoint(x, y, angleDeg, cx, cy) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    return { x: dx * cos - dy * sin + cx, y: dy * cos + dx * sin + cy };
}

// Todo lo que se dibuja (pista, curvas, autos) pasa por toView(): rotación
// del circuito + Y invertida (en F1 la Y crece hacia arriba; en SVG, hacia
// abajo). Los tamaños (grosor de la pista, puntos, textos) salen del
// tamaño del circuito, así se ven iguales en Mónaco que en Spa.
function buildTrackGeometry(data) {
    const xs = data.x;
    const ys = data.y;
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const angle = Number(data.rotation) || 0;

    const toView = (x, y) => {
        const p = rotatePoint(x, y, angle, cx, cy);
        return { x: p.x, y: -p.y };
    };

    const points = xs.map((x, i) => toView(x, ys[i]));
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const span = Math.max(maxX - minX, maxY - minY);
    const pad = span * 0.06;

    // Número de cada curva, corrido hacia afuera de la pista en la
    // dirección que indica la API (angle está en el sistema original, así
    // que el corrimiento se hace antes de rotar).
    const labelOffset = span * 0.035;
    const corners = (data.corners || [])
        .filter((c) => c && c.trackPosition)
        .map((c) => {
            const rad = ((Number(c.angle) || 0) * Math.PI) / 180;
            const pos = toView(
                c.trackPosition.x + Math.cos(rad) * labelOffset,
                c.trackPosition.y + Math.sin(rad) * labelOffset,
            );
            return { number: c.number, x: pos.x, y: pos.y };
        });

    // Tiempo de cada punto dentro de la vuelta de referencia, normalizado a
    // 0..1 (trackPositionTime viene en segundos de sesión). Si no viene, se
    // usa la posición en el array, que para una vuelta muestreada parejo es
    // casi lo mismo.
    const rawTimes = Array.isArray(data.trackPositionTime) && data.trackPositionTime.length === points.length
        ? data.trackPositionTime.map(Number)
        : null;
    const t0 = rawTimes ? rawTimes[0] : 0;
    const tSpan = rawTimes ? (rawTimes[rawTimes.length - 1] - t0) || 1 : 1;
    const lapFractions = rawTimes
        ? rawTimes.map((t) => (t - t0) / tSpan)
        : points.map((_, i) => i / (points.length - 1));

    // Fracción de vuelta (en tiempo) → punto de la pista, interpolando entre
    // los dos puntos del trazado que la rodean.
    const pointAtLapFraction = (fraction) => {
        const f = Math.min(Math.max(fraction, 0), 1);
        let lo = 0;
        let hi = lapFractions.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (lapFractions[mid] <= f) lo = mid;
            else hi = mid;
        }
        const width = lapFractions[hi] - lapFractions[lo] || 1;
        const k = Math.min(Math.max((f - lapFractions[lo]) / width, 0), 1);
        return {
            x: points[lo].x + (points[hi].x - points[lo].x) * k,
            y: points[lo].y + (points[hi].y - points[lo].y) * k,
        };
    };

    const refLapSeconds = Number(data.candidateLap && data.candidateLap.lapTime);

    return {
        toView,
        points,
        corners,
        pointAtLapFraction,
        refLapMs: refLapSeconds > 0 ? refLapSeconds * 1000 : null,
        viewBox: [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2],
        span,
    };
}

function trackPathD(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
}

// Línea de largada: un trazo corto perpendicular a la pista en el primer
// punto del trazado (la vuelta de referencia arranca en la meta).
function startLineD(points, length) {
    const [a, b] = points;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * length;
    const ny = (dx / len) * length;
    return `M${(a.x - nx).toFixed(1)} ${(a.y - ny).toFixed(1)} L${(a.x + nx).toFixed(1)} ${(a.y + ny).toFixed(1)}`;
}

// Dibuja la pista (una vez por circuito) y alterna entre SVG y PNG.
function drawTrackMap() {
    const host = document.getElementById('circuit-position-overlay');
    const wrap = document.getElementById('circuit-map-wrap');
    if (!host || !wrap) return;

    wrap.classList.toggle('has-track', !!trackMap);
    if (!trackMap) {
        host.innerHTML = '';
        return;
    }

    const { points, corners, viewBox, span } = trackMap;
    const trackWidth = span * 0.014;
    const cornerFont = span * 0.022;
    host.innerHTML = `
        <svg class="track-svg" viewBox="${viewBox.map((v) => v.toFixed(1)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Track map">
            <path class="track-outline" d="${trackPathD(points)}" style="stroke-width:${(trackWidth * 2.2).toFixed(1)}"></path>
            <path class="track-line" d="${trackPathD(points)}" style="stroke-width:${trackWidth.toFixed(1)}"></path>
            <path class="track-start" d="${startLineD(points, trackWidth * 1.6)}" style="stroke-width:${(trackWidth * 0.7).toFixed(1)}"></path>
            <g class="track-corners" style="font-size:${cornerFont.toFixed(1)}px">
                ${corners.map((c) => `<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}">${c.number}</text>`).join('')}
            </g>
            <g class="track-cars"></g>
        </svg>`;
}

// La muestra más nueva de Position.z (por Timestamp, no por posición en
// el array: el lote puede traer varias).
function latestPositionEntries() {
    const samples = state['Position.z'] && state['Position.z'].Position;
    if (!Array.isArray(samples) || samples.length === 0) return null;
    let latest = samples[0];
    for (const sample of samples) {
        if (sample && latest && String(sample.Timestamp) > String(latest.Timestamp)) latest = sample;
    }
    return latest && latest.Entries;
}

function driverMapColor(driver) {
    if (driver.TeamColour) return `#${String(driver.TeamColour).replace('#', '')}`;
    return TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)';
}

// ── ESTIMATED CAR POSITIONS ───────────────────────────────────────────────
// F1 solo manda Position.z (la posición real de cada auto) a conexiones con
// cuenta de F1 TV, así que al relay nunca le llega. Lo que sí llega son los
// minisectores de TimingData: cada uno pasa de 0 a un color en el momento
// en que el auto lo completa. Con eso se sabe, para cada auto, cuál fue el
// último punto de control que pasó (~25 por vuelta), y se lo ubica ahí.
//
// Todo va en "fracción de vuelta medida en tiempo": los 3 sectores se
// reparten según los tiempos de sector de ese auto, y los minisectores en
// partes iguales dentro de cada sector. El trazado de MultiViewer es una
// vuelta real con el tiempo de cada punto, así que fracción de tiempo →
// punto de la pista es directo (TRACK MAP, pointAtLapFraction()).
//
// Entre un punto de control y el siguiente el auto avanza al ritmo de su
// última vuelta, sin pasarse nunca del minisector siguiente: si el dato
// llega tarde, lo espera ahí en vez de adelantarse.
//
// Si un sector no trae minisectores (según OpenF1, en carrera pueden no
// venir), ese sector cuenta como un único punto de control: su tiempo.
const carProgress = {};     // num → { last, frac, next, at }
const carSectorShares = {}; // num → [s1, s2, s3] como fracción de la vuelta

// Reparto de la vuelta entre los 3 sectores, sacado de los tiempos de
// sector del propio auto. Se guarda el último reparto completo: a mitad de
// vuelta los tiempos del sector en curso vienen vacíos, y recalcular con
// datos a medias haría saltar los puntos de control.
function sectorShares(num, line) {
    const ms = getSectorTimes(line).map((s) => lapTimeToMs(s && s.value));
    if (ms.every((v) => v != null && v > 0)) {
        const total = ms[0] + ms[1] + ms[2];
        carSectorShares[num] = ms.map((v) => v / total);
    }
    return carSectorShares[num] || [1 / 3, 1 / 3, 1 / 3];
}

// Puntos de control de la vuelta en curso, en orden: dónde termina cada uno
// (fracción de vuelta) y si el auto ya lo pasó.
function lapCheckpoints(num, line) {
    const shares = sectorShares(num, line);
    const checkpoints = [];
    let start = 0;
    for (let s = 0; s < 3; s++) {
        const segments = getSegments(line, s + 1);
        if (segments.length > 0) {
            segments.forEach((status, k) => {
                checkpoints.push({ passed: !!status, end: start + (shares[s] * (k + 1)) / segments.length });
            });
        } else {
            const sector = getNestedValue(line, ['Sectors', String(s), 'Value']);
            checkpoints.push({ passed: !!sector, end: start + shares[s] });
        }
        start += shares[s];
    }
    return checkpoints;
}

// Ritmo con el que avanza el auto entre puntos de control: su última
// vuelta si es razonable, si no la mejor, si no la vuelta de referencia.
function carLapMs(line) {
    const sane = (ms) => ms != null && ms > 50000 && ms < 240000;
    const last = lapTimeToMs(line.LastLapTime && line.LastLapTime.Value);
    if (sane(last)) return last;
    const best = lapTimeToMs(line.BestLapTime && line.BestLapTime.Value);
    if (sane(best)) return best;
    return (trackMap && trackMap.refLapMs) || 100000;
}

// Se llama en cada render(): registra el momento en que cada auto pasa un
// punto de control nuevo (o arranca una vuelta nueva).
function trackCarProgress() {
    const lines = (state.TimingData && state.TimingData.Lines) || {};
    const now = Date.now();
    for (const num of Object.keys(lines)) {
        const checkpoints = lapCheckpoints(num, lines[num]);
        let last = -1;
        checkpoints.forEach((c, i) => { if (c.passed) last = i; });

        const prev = carProgress[num];
        if (prev && prev.last === last) continue;
        carProgress[num] = {
            last,
            frac: last < 0 ? 0 : checkpoints[last].end,
            next: checkpoints[last + 1] ? checkpoints[last + 1].end : 1,
            at: now,
        };
    }
}

function sessionIsRunning() {
    const status = state.SessionStatus && state.SessionStatus.Status;
    return status === 'Started';
}

// Posición estimada de cada auto, en coordenadas del SVG.
function estimatedCarPositions() {
    const positions = {};
    if (!trackMap || !sessionIsRunning()) return positions;

    const lines = (state.TimingData && state.TimingData.Lines) || {};
    const now = Date.now();
    for (const num of Object.keys(lines)) {
        const line = lines[num];
        const progress = carProgress[num];
        if (!progress || line.InPit || line.Retired) continue;

        const advanced = progress.frac + (now - progress.at) / carLapMs(line);
        const frac = Math.min(advanced, progress.next - 0.002);
        positions[num] = trackMap.pointAtLapFraction(Math.max(0, frac));
    }
    return positions;
}

// Posiciones reales de Position.z (solo llegan con cuenta de F1 TV), en
// coordenadas del SVG. null si no hay.
function exactCarPositions() {
    const entries = latestPositionEntries();
    if (!entries || !trackMap) return null;
    const lines = (state.TimingData && state.TimingData.Lines) || {};
    const positions = {};
    for (const num of Object.keys(entries)) {
        const { X, Y, Status } = entries[num] || {};
        const line = lines[num];
        if (typeof X !== 'number' || typeof Y !== 'number' || Status === 'OFF') continue;
        if (line && line.Retired) continue;
        positions[num] = trackMap.toView(X, Y);
    }
    return positions;
}

// Mueve los puntos de los autos: posiciones reales si llegan, estimadas por
// minisectores si no (ver ESTIMATED CAR POSITIONS). Reutiliza los <g> de
// cada auto en vez de redibujarlos, así la transición de CSS los desliza
// de una posición a la siguiente en lugar de saltar.
function updatePositionOverlay() {
    const note = document.getElementById('track-note');
    const layer = document.querySelector('#circuit-position-overlay .track-cars');
    if (!trackMap || !layer) {
        if (note) note.hidden = true;
        return;
    }

    const exact = exactCarPositions();
    const positions = exact || estimatedCarPositions();
    if (note) note.hidden = !!exact || Object.keys(positions).length === 0;

    const driverList = state.DriverList || {};
    const dotRadius = trackMap.span * 0.013;
    const labelSize = trackMap.span * 0.024;

    for (const num of Object.keys(positions)) {
        let car = layer.querySelector(`[data-num="${num}"]`);
        if (!car) {
            car = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            car.setAttribute('class', 'track-car');
            car.dataset.num = num;
            car.innerHTML = '<circle></circle><text></text>';
            layer.appendChild(car);
        }

        const driver = driverList[num] || {};
        const color = driverMapColor(driver);
        const circle = car.firstChild;
        const label = car.lastChild;
        circle.setAttribute('r', dotRadius.toFixed(1));
        circle.setAttribute('fill', color);
        label.setAttribute('x', (dotRadius * 1.5).toFixed(1));
        label.setAttribute('y', (labelSize * 0.35).toFixed(1));
        label.setAttribute('fill', color);
        label.style.fontSize = `${labelSize.toFixed(1)}px`;
        label.textContent = driverCode(driver, num);

        const p = positions[num];
        car.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }

    // Autos que ya no se muestran (en boxes, retirados, sesión parada).
    for (const car of [...layer.children]) {
        if (!positions[car.dataset.num]) car.remove();
    }
}

// Entre mensajes del feed los autos estimados siguen avanzando: se
// recalculan cada medio segundo (la transición de CSS dura lo mismo, así el
// movimiento queda continuo).
setInterval(updatePositionOverlay, 500);

// ── CUSTOMIZE TABLE PANEL ─────────────────────────────────────────────────
// Se abre con el botón de controles (al lado del de pantalla completa) y
// cubre la columna del mapa mientras está abierto: la tabla queda a la
// vista y cada cambio se ve al instante. Se arma entero desde VIEW_COLUMNS
// y VIEW_OPTIONS, así sumar una columna u opción nueva es tocar un solo
// lugar.
const LOCK_ICON_SVG = `<svg class="lvp-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>`;

let viewPanelKind = null;

function isViewPanelOpen() {
    const panel = document.getElementById('live-view-panel');
    return !!panel && !panel.hidden;
}

function currentSessionKind() {
    return sessionKindFromMeta(deriveSessionMeta(state.SessionInfo));
}

function viewCheckboxHTML(col, view, kind) {
    const unavailable = col.raceOnly && kind !== 'race';
    const disabled = col.locked || unavailable;
    const hint = col.locked ? `${LOCK_ICON_SVG}Always shown`
        : unavailable ? 'Race &amp; Sprint only' : '';
    return `
        <li>
            <label class="lvp-check${disabled ? ' is-disabled' : ''}">
                <input type="checkbox" data-col="${col.key}"${view.cols[col.key] ? ' checked' : ''}${disabled ? ' disabled' : ''}>
                <span class="lvp-box" aria-hidden="true"></span>
                <span class="lvp-check-label">${col.label}</span>
                ${hint ? `<span class="lvp-hint">${hint}</span>` : ''}
            </label>
        </li>`;
}

function viewPanelBodyHTML(kind) {
    const view = effectiveView(kind);

    const columnItems = VIEW_COLUMNS.map((col) => viewCheckboxHTML(col, view, kind)).join('');
    const panelItems = VIEW_PANELS.map((col) => viewCheckboxHTML(col, view, kind)).join('');

    // Los botones que dependen de una casilla apagada ni se muestran
    // (syncDependentOptions() los vuelve a mostrar al prenderla).
    const optionGroups = Object.entries(VIEW_OPTIONS).map(([name, opt]) => `
        <div class="lvp-field"${opt.dependsOn ? ` data-depends="${opt.dependsOn}"` : ''}${opt.dependsOn && !view.cols[opt.dependsOn] ? ' hidden' : ''}>
            <span class="lvp-field-label" id="lvp-label-${name}">${opt.label}</span>
            <div class="lvp-segmented" role="radiogroup" aria-labelledby="lvp-label-${name}">
                ${opt.choices.map(([value, text]) => `
                    <label class="lvp-seg">
                        <input type="radio" name="lvp-${name}" data-option="${name}" value="${value}"${view[name] === value ? ' checked' : ''}>
                        <span>${text}</span>
                    </label>`).join('')}
            </div>
        </div>`).join('');

    return `
        <section class="lvp-section">
            <h4 class="lvp-section-title">Columns</h4>
            <ul class="lvp-list">${columnItems}</ul>
        </section>
        <section class="lvp-section">
            <h4 class="lvp-section-title">Panels</h4>
            <ul class="lvp-list">${panelItems}</ul>
        </section>
        <section class="lvp-section">
            <h4 class="lvp-section-title">Display</h4>
            ${optionGroups}
        </section>
        <section class="lvp-section">
            <h4 class="lvp-section-title">TV sync</h4>
            <div class="lvp-field">
                <span class="lvp-field-label" id="lvp-label-delay">Delay</span>
                <div class="lvp-stepper" role="group" aria-labelledby="lvp-label-delay">
                    <button type="button" class="lvp-step" data-action="delay-minus" aria-label="${DELAY_STEP_SECONDS} seconds less">&minus;</button>
                    <label class="lvp-delay-value">
                        <input type="number" min="0" max="${DELAY_MAX_SECONDS}" step="1" inputmode="numeric" value="${delaySeconds()}" data-delay aria-label="Delay in seconds">
                        <span aria-hidden="true">s</span>
                    </label>
                    <button type="button" class="lvp-step" data-action="delay-plus" aria-label="${DELAY_STEP_SECONDS} seconds more">+</button>
                </div>
                <p class="lvp-help">Holds the live data back so it doesn't spoil what you see on TV.</p>
            </div>
        </section>`;
}

// Muestra u oculta los botones que dependen de una casilla, sin redibujar
// todo el panel (así la casilla que se acaba de tocar no pierde el foco).
function syncDependentOptions() {
    const view = effectiveView(currentSessionKind());
    document.querySelectorAll('#live-view-panel [data-depends]').forEach((field) => {
        field.hidden = !view.cols[field.dataset.depends];
    });
}

function renderViewPanel(kind) {
    const body = document.getElementById('live-view-panel-body');
    if (!body) return;
    viewPanelKind = kind;
    body.innerHTML = viewPanelBodyHTML(kind);
}

// Llamado desde render(): si la sesión cambia de tipo con el panel abierto
// (p. ej. de Qualy a Carrera), cambian los defaults y lo que está
// disponible, así que se redibuja.
function syncViewPanel(kind) {
    if (isViewPanelOpen() && kind !== viewPanelKind) renderViewPanel(kind);
}

function initViewPanel() {
    const btn = document.getElementById('live-view-btn');
    const panel = document.getElementById('live-view-panel');
    if (!btn || !panel) return;

    function open() {
        renderViewPanel(currentSessionKind());
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        panel.focus();
    }

    function close() {
        if (panel.hidden) return;
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
    }

    btn.addEventListener('click', () => {
        if (panel.hidden) open();
        else close();
    });

    panel.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (!action) return;
        if (action.dataset.action === 'close') close();
        if (action.dataset.action === 'reset') {
            viewPrefs = { columns: {} };
            saveViewPrefs();
            renderViewPanel(currentSessionKind());
            applyTableView();
            setDelaySeconds(0);
        }
        if (action.dataset.action === 'delay-minus' || action.dataset.action === 'delay-plus') {
            const step = action.dataset.action === 'delay-plus' ? DELAY_STEP_SECONDS : -DELAY_STEP_SECONDS;
            setDelaySeconds(delaySeconds() + step);
            const field = panel.querySelector('input[data-delay]');
            if (field) field.value = delaySeconds();
        }
    });

    panel.addEventListener('change', (e) => {
        const input = e.target;
        if (input.hasAttribute('data-delay')) {
            setDelaySeconds(input.value);
            input.value = delaySeconds(); // por si escribió algo fuera de rango
            return;
        }
        if (input.dataset.col) viewPrefs.columns[input.dataset.col] = input.checked;
        else if (input.dataset.option) viewPrefs[input.dataset.option] = input.value;
        else return;
        saveViewPrefs();
        if (input.dataset.col) syncDependentOptions();
        applyTableView();
    });

    // Registrado antes que el de pantalla completa: con el panel abierto,
    // Esc solo cierra el panel (no saca además la pantalla completa).
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || panel.hidden) return;
        e.stopImmediatePropagation();
        close();
    });
}

// ── AUTO-HIDE MAP CONTROLS ────────────────────────────────────────────────
// Como en YouTube: si nadie mueve el mouse (ni toca la pantalla, ni aprieta
// una tecla) por unos segundos, los botones Customize / Full screen se
// desvanecen, y vuelven con cualquier movimiento. No se esconden mientras
// el panel está abierto, con el mouse encima o con foco de teclado adentro.
const CONTROLS_IDLE_MS = 3000;

function initControlsAutoHide() {
    const controls = document.querySelector('.live-map-controls');
    const panel = document.getElementById('live-view-panel');
    if (!controls) return;

    let timer = null;

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(hide, CONTROLS_IDLE_MS);
    }

    function hide() {
        const busy = (panel && !panel.hidden)
            || controls.matches(':hover')
            || controls.querySelector(':focus-visible');
        if (busy) {
            schedule();
            return;
        }
        controls.classList.add('is-idle');
    }

    function wake() {
        controls.classList.remove('is-idle');
        schedule();
    }

    ['mousemove', 'pointerdown', 'touchstart', 'keydown', 'wheel'].forEach((type) => {
        document.addEventListener(type, wake, { passive: true });
    });
    schedule();
}

// ── FULLSCREEN TOGGLE ─────────────────────────────────────────────────────
// La página ya ES la vista tabla + mapa (ocupa toda la ventana debajo del
// navbar). "Full screen" tapa también el navbar (clase .is-fullscreen,
// position:fixed) y, donde el navegador lo permite, pide pantalla completa
// real (Fullscreen API) para esconder las barras del navegador — ideal para
// dejarlo en una tele. En iPhone esa API no existe para elementos comunes,
// así que ahí queda solo la versión CSS, que igual tapa todo lo de la página.
function initFullscreenButton() {
    const app = document.getElementById('live-map-view-content');
    const btn = document.getElementById('live-fullscreen-btn');
    if (!app || !btn) return;
    function applyState(on) {
        app.classList.toggle('is-fullscreen', on);
        btn.classList.toggle('is-fullscreen', on);
        // Botón solo con ícono: el texto vive en el tooltip y en aria-label.
        const label = on ? 'Exit full screen' : 'Full screen';
        btn.setAttribute('aria-label', label);
        btn.title = label;
        document.body.style.overflow = on ? 'hidden' : '';
    }

    function enter() {
        applyState(true);
        if (app.requestFullscreen && !document.fullscreenElement) {
            // Si el navegador lo rechaza, queda la versión CSS y listo.
            app.requestFullscreen().catch(() => {});
        }
    }

    function exit() {
        applyState(false);
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    btn.addEventListener('click', () => {
        if (app.classList.contains('is-fullscreen')) exit();
        else enter();
    });

    // En pantalla completa real, Esc lo maneja el navegador y no llega como
    // keydown: acá nos enteramos de que salió y sincronizamos el botón.
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && app.classList.contains('is-fullscreen')) applyState(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && app.classList.contains('is-fullscreen')) exit();
    });
}

initViewPanel();
initControlsAutoHide();
initFullscreenButton();
applyTableView();
updateDelayIndicator();
connect();

// Keeps the clock moving smoothly even during gaps between WS messages
// (render() alone only repaints when something arrives over the socket).
setInterval(updateSessionClock, 1000);
