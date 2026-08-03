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

// ── CIRCUIT DATA (for total race laps, used by the tyre timeline) ────────
// Same data/circuits.json race.js reads for circuit.stats.laps. Fetched
// once and cached; re-renders once it lands so the first frame or two
// (before the fetch resolves) just fall back gracefully to no timeline.
let circuitsData = null;
fetch('./data/circuits.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => { if (data) { circuitsData = data; render(); } })
    .catch(() => {});

// Total laps for the current GP (from circuits.json), or null if not
// resolvable yet (circuitsData still loading, or unknown slug).
function totalLapsForCurrentGP() {
    const slug = state.CurrentGP && state.CurrentGP.slug;
    const circuitId = slug ? CIRCUIT_MAP[slug] : null;
    const circuit = circuitId && circuitsData ? circuitsData[circuitId] : null;
    const laps = Number(circuit && circuit.stats && circuit.stats.laps);
    return Number.isFinite(laps) && laps > 0 ? laps : null;
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

function getSectorTimeInfo(line, sectorIndex) {
    const candidates = [
        [`Sector${sectorIndex}Time`],
        [`Sector${sectorIndex}`],
        [`LastLapTime`, `Sector${sectorIndex}Time`],
        [`LastLapTime`, `Sector${sectorIndex}`],
        ['Sectors', String(sectorIndex), 'Value'],
        ['Sectors', sectorIndex, 'Value'],
        ['LastLapTime', 'Sectors', String(sectorIndex), 'Value'],
        ['LastLapTime', 'Sectors', sectorIndex, 'Value'],
    ];

    let value = null;
    let className = '';

    for (const path of candidates) {
        const node = getNestedValue(line, path);
        const normalized = normalizeTimeValue(node);
        if (normalized !== null && value === null) value = normalized;
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

function connect() {
    const ws = new WebSocket('ws://localhost:8080');
    const statusEl = document.getElementById('live-status');

    ws.onopen = () => {
        if (statusEl) {
            statusEl.textContent = 'Live';
            statusEl.className = 'live-status live-status--on';
        }
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot') {
            state = msg.state || {};
            if (state.ExtrapolatedClock) lastClockUpdateLocalTime = Date.now();
        } else if (msg.type === 'update') {
            state[msg.topic] = mergeState(state[msg.topic] || {}, msg.data);
            if (msg.topic === 'ExtrapolatedClock') lastClockUpdateLocalTime = Date.now();
        }
        render();
    };

    ws.onclose = () => {
        if (statusEl) {
            statusEl.textContent = 'Reconnecting…';
            statusEl.className = 'live-status live-status--off';
        }
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
// the hero row — same markup/classes as index.html's hero, so it reuses
// that exact look.
function updateGPName() {
    const nameEl = document.getElementById('hero-gp-name');
    // Fullscreen Map View header — same data, separate element (only
    // renders while #live-map-view-content.is-fullscreen is active).
    const fsNameEl = document.getElementById('mapview-fs-name');
    if (!nameEl) return;

    const gp = state.CurrentGP;
    if (!gp || !gp.name) {
        nameEl.textContent = 'Loading Grand Prix…';
        if (fsNameEl) fsNameEl.textContent = 'Loading Grand Prix…';
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

    if (fsNameEl && fsNameEl.textContent !== label) {
        fsNameEl.textContent = label;
        if (window.twemoji) window.twemoji.parse(fsNameEl);
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

function updateSessionClock() {
    const el = document.getElementById('hero-session-status');
    const fsEl = document.getElementById('mapview-fs-session-status');
    if (!el && !fsEl) return;

    const meta = deriveSessionMeta(state.SessionInfo);
    if (!meta) {
        if (el) el.innerHTML = '';
        if (fsEl) fsEl.innerHTML = '';
        return;
    }

    const flag = currentFlagState();
    const fullLabel = fullSessionLabel(meta);
    let clockText = '--:--';
    let paused = false;

    if (meta.kind === 'count-up') {
        const startedUtc = state.SessionTiming && state.SessionTiming.startedUtc;
        clockText = startedUtc
            ? formatClockSeconds((Date.now() - new Date(startedUtc).getTime()) / 1000)
            : '00:00';
    } else {
        const clock = state.ExtrapolatedClock;
        const remainingFromFeed = clock && parseClockToSeconds(clock.Remaining);
        const extrapolating = clock ? clock.Extrapolating !== false : true;
        paused = !extrapolating || isRedFlag();

        if (remainingFromFeed != null) {
            const elapsedSinceUpdate = paused ? 0 : (Date.now() - lastClockUpdateLocalTime) / 1000;
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
    if (el) el.innerHTML = html;
    if (fsEl) fsEl.innerHTML = html;
}

// Circuit map for the Map View section. Just swaps the layout image when
// the GP changes (not on every WebSocket update).
let lastCircuitId = null;
function updateCircuitMap() {
    const img = document.getElementById('circuit-map-img');
    if (!img) return;

    const slug = state.CurrentGP && state.CurrentGP.slug;
    const circuitId = slug ? CIRCUIT_MAP[slug] : null;
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

// Builds the visual tyre timeline for a driver: one proportional bar
// (relative to the full race distance) with a colored segment per stint,
// oldest first — icon anchored at each segment's start, lap count shown
// only on the last (current) segment. Falls back to a plain icon+laps
// sequence (no bar) while totalLaps isn't resolvable yet (circuits.json
// still loading), instead of drawing a bar with a made-up length.
function tyreTimelineHTML(appLine) {
    if (!appLine || !appLine.Stints) return '<span class="results-date">–</span>';

    const keys = Object.keys(appLine.Stints).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) return '<span class="results-date">–</span>';

    const totalLaps = totalLapsForCurrentGP();
    if (!totalLaps) {
        const parts = keys.map((key) => {
            const stint = appLine.Stints[key];
            const meta = COMPOUND_META[stint.Compound] || { code: stint.Compound ? '?' : null, file: null };
            return tyreIconHTML(meta);
        });
        const lastStint = appLine.Stints[keys[keys.length - 1]];
        return `<span class="tyre-history">${parts.join('')}<span class="tyre-laps">${lastStint.TotalLaps ?? '?'}</span></span>`;
    }

    let cumPct = 0;
    const segmentsHTML = keys.map((key, i) => {
        const stint = appLine.Stints[key];
        const meta = COMPOUND_META[stint.Compound] || { code: stint.Compound ? '?' : null, file: null };
        const laps = Number(stint.TotalLaps) || 0;
        const widthPct = Math.max(0, Math.min(100 - cumPct, (laps / totalLaps) * 100));
        const left = cumPct;
        cumPct += widthPct;

        const compoundClass = meta.file ? `tyre-seg--${meta.file}` : 'tyre-seg--unknown';
        const isLast = i === keys.length - 1;
        const lapsLabel = isLast ? `<span class="tyre-segment-laps">${stint.TotalLaps ?? '?'}</span>` : '';

        return `<div class="tyre-segment ${compoundClass}" style="left:${left}%;width:${widthPct}%;">` +
            `<span class="tyre-segment-icon">${tyreIconHTML(meta)}</span>` +
            lapsLabel +
            `</div>`;
    }).join('');

    return `<div class="tyre-timeline">${segmentsHTML}</div>`;
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
                <div class="swc-condition-text">
                    <span class="swc-condition-label">${rainfall ? 'Wet' : 'Dry'}</span>
                    <span class="swc-condition-sub">Conditions</span>
                </div>
            </div>
            <div class="swc-stats">
                <div class="swc-stat">
                    <span class="swc-stat-value">${air}</span>
                    <span class="swc-stat-label">Air Temp</span>
                </div>
                <div class="swc-stat">
                    <span class="swc-stat-value">${track}</span>
                    <span class="swc-stat-label">Track Temp</span>
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
    renderWeatherInto('live-weather', weather);
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

// Qualifying/Sprint Qualifying tyre cell: just the current compound icon
// plus the lap count on that set — the full stint timeline
// (tyreTimelineHTML) doesn't earn its space in a segment with no pit
// strategy to tell, so this swaps in for it whenever
// sessionMeta.kind === 'countdown-segment' (see
// render()'s tyreCellHTML pick).
function tyreCompoundBadgeHTML(appLine) {
    if (!appLine || !appLine.Stints) return '<span class="results-date">–</span>';

    const keys = Object.keys(appLine.Stints).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) return '<span class="results-date">–</span>';

    const stint = appLine.Stints[keys[keys.length - 1]];
    const meta = COMPOUND_META[stint.Compound] || { code: stint.Compound ? '?' : null, file: null };
    // Laps already done on this set, not New/Used — same raw-number
    // convention as .tyre-segment-laps/.tyre-laps in the full timeline.
    const laps = stint.TotalLaps ?? '?';
    // Colored to match the compound (same palette as .tyre-seg--*).
    const colorClass = meta.file ? `tyre-fresh-label--${meta.file}` : '';

    return `<span class="tyre-fresh">${tyreIconHTML(meta)}` +
        `<span class="tyre-fresh-label ${colorClass}">${laps}</span>` +
        `</span>`;
}

// ── TABLE HEADERS (swap columns for Qualifying/Sprint Qualifying & FP) ────
// Race/Sprint: Pos, Delta, Driver, Gap*, Interval, S1, S2, S3, Last Lap,
// Best Lap, Tyres, Status* (*main table only).
// FP: same column set/order as Race/Sprint, minus Delta (no grid position
// exists mid-practice either).
// Q/SQ: no Delta, and Best Lap / Last Lap move in front of the sector
// columns instead of after — see the render() row-building below, which
// mirrors this same order/column set.
const MAIN_THEAD_DEFAULT = `
    <tr>
        <th class="live-col-pos live-col-roomy">Pos</th>
        <th class="live-delta-col"></th>
        <th class="live-col-roomy">Driver</th>
        <th class="live-col-roomy">Gap</th>
        <th class="live-col-roomy">Interval</th>
        <th class="live-sector-col live-col-tight-first">S1</th>
        <th class="live-sector-col live-col-tight-mid">S2</th>
        <th class="live-sector-col live-col-tight-mid">S3</th>
        <th class="live-col-tight-mid">Last Lap</th>
        <th class="live-col-tight-last">Best Lap</th>
        <th class="live-col-roomy">Tyres</th>
        <th>Status</th>
    </tr>
`;
const MAIN_THEAD_NODELTA = `
    <tr>
        <th class="live-col-pos live-col-roomy">Pos</th>
        <th class="live-col-roomy">Driver</th>
        <th class="live-col-roomy">Gap</th>
        <th class="live-col-roomy">Interval</th>
        <th class="live-col-tight-first">Best Lap</th>
        <th class="live-col-tight-mid">Last Lap</th>
        <th class="live-sector-col live-col-tight-mid">S1</th>
        <th class="live-sector-col live-col-tight-mid">S2</th>
        <th class="live-sector-col live-col-tight-last">S3</th>
        <th class="live-col-roomy">Tyres</th>
        <th>Status</th>
        <th class="live-col-roomy">Laps</th>
    </tr>
`;
const MAIN_THEAD_QUALI = `
    <tr>
        <th class="live-col-pos live-col-roomy">Pos</th>
        <th class="live-col-roomy">Driver</th>
        <th class="live-col-roomy">Gap</th>
        <th class="live-col-roomy">Interval</th>
        <th class="live-col-tight-first">Best Lap</th>
        <th class="live-col-tight-mid">Last Lap</th>
        <th class="live-sector-col live-col-tight-mid">S1</th>
        <th class="live-sector-col live-col-tight-mid">S2</th>
        <th class="live-sector-col live-col-tight-last">S3</th>
        <th class="live-col-roomy">Tyres</th>
        <th>Status</th>
    </tr>
`;
// Map View compact table: no Gap/Status either way. Best Lap only shows up
// here in Q/SQ (added alongside the column reshuffle) — outside qualifying
// it stays dropped, same as before.
const COMPACT_THEAD_DEFAULT = `
    <tr>
        <th class="live-col-pos live-col-roomy">Pos</th>
        <th class="live-delta-col"></th>
        <th class="live-col-roomy">Driver</th>
        <th class="live-col-roomy">Interval</th>
        <th class="live-sector-col live-col-tight-first">S1</th>
        <th class="live-sector-col live-col-tight-mid">S2</th>
        <th class="live-sector-col live-col-tight-mid">S3</th>
        <th class="live-col-tight-last">Last Lap</th>
        <th class="live-col-roomy">Tyres</th>
    </tr>
`;
const COMPACT_THEAD_NODELTA = `
    <tr>
        <th class="live-col-pos live-col-roomy">Pos</th>
        <th class="live-col-roomy">Driver</th>
        <th class="live-col-roomy">Gap</th>
        <th class="live-col-tight-first">Best Lap</th>
        <th class="live-col-tight-mid">Last Lap</th>
        <th class="live-sector-col live-col-tight-mid">S1</th>
        <th class="live-sector-col live-col-tight-mid">S2</th>
        <th class="live-sector-col live-col-tight-last">S3</th>
        <th class="live-col-roomy">Tyres</th>
        <th class="live-col-roomy">Laps</th>
    </tr>
`;
const COMPACT_THEAD_QUALI = `
    <tr>
        <th class="live-col-pos live-col-roomy">Pos</th>
        <th class="live-col-roomy">Driver</th>
        <th class="live-col-roomy">Gap</th>
        <th class="live-col-tight-first">Best Lap</th>
        <th class="live-col-tight-mid">Last Lap</th>
        <th class="live-sector-col live-col-tight-mid">S1</th>
        <th class="live-sector-col live-col-tight-mid">S2</th>
        <th class="live-sector-col live-col-tight-last">S3</th>
        <th class="live-col-roomy">Tyres</th>
    </tr>
`;

// Only touches the DOM when the session type actually flips, so this is
// cheap to call on every render(). mode is 'quali' | 'nodelta' | 'default'.
let lastHeaderMode = null;
function updateTableHeaders(mode) {
    if (lastHeaderMode === mode) return;
    lastHeaderMode = mode;

    const thead = document.getElementById('live-thead');
    const thead2 = document.getElementById('live-thead-2');
    const mainByMode = { quali: MAIN_THEAD_QUALI, nodelta: MAIN_THEAD_NODELTA, default: MAIN_THEAD_DEFAULT };
    const compactByMode = { quali: COMPACT_THEAD_QUALI, nodelta: COMPACT_THEAD_NODELTA, default: COMPACT_THEAD_DEFAULT };
    if (thead) thead.innerHTML = mainByMode[mode];
    if (thead2) thead2.innerHTML = compactByMode[mode];

    // FP-only: widens Best Lap's padding to 15px both sides (see live.css).
    document.body.classList.toggle('is-fp-session', mode === 'nodelta');
}

function render() {
    updateGPName();
    updateSessionClock();
    updateLiveWeather();
    updateCircuitMap();

    const timingLines = (state.TimingData && state.TimingData.Lines) || {};
    const driverList = state.DriverList || {};
    const appLines = (state.TimingAppData && state.TimingAppData.Lines) || {};

    const rows = Object.keys(timingLines)
        .map((num) => ({ num, line: timingLines[num] }))
        .filter((r) => r.line)
        .sort((a, b) => (Number(a.line.Line) || 99) - (Number(b.line.Line) || 99));

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

    // Qualifying & Sprint Qualifying: no pit strategy to show (one push lap
    // at a time), so swap the full stint timeline for just the current
    // compound + New/Used — see tyreCompoundBadgeHTML(). Free Practice gets
    // the same badge now (multiple short runs, not a strategy to trace).
    // Race/Sprint keep the full timeline.
    const isQualiSession = sessionMeta && sessionMeta.kind === 'countdown-segment';
    // Free Practice: same deal as Q/SQ — P1-P3 there is just "currently
    // fastest in the session", not a race result, so no podium coloring.
    const isPracticeSession = sessionMeta && sessionMeta.kind === 'countdown-fixed';
    const tyreCellHTML = (isQualiSession || isPracticeSession) ? tyreCompoundBadgeHTML : tyreTimelineHTML;
    const headerMode = isQualiSession ? 'quali' : isPracticeSession ? 'nodelta' : 'default';
    updateTableHeaders(headerMode);
    // No Delta column in Q/SQ (11 cols) or Race/Sprint keep the full 12.
    // FP also lands on 12 — same 11 as Q/SQ plus the new Laps column.
    const mainColspan = isQualiSession ? 11 : 12;
    // Compact table: 9 columns normally (Q/SQ swaps Delta out for Best Lap,
    // FP drops Delta but adds Best Lap back in too — see
    // COMPACT_THEAD_NODELTA). FP gets a 10th for the new Laps column.
    const compactColspan = isPracticeSession ? 10 : 9;

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

    const tbody = document.getElementById('live-rows');
    const tbody2 = document.getElementById('live-rows-2');

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${mainColspan}" class="results-empty">Waiting for session data…</td></tr>`;
        if (tbody2) tbody2.innerHTML = `<tr><td colspan="${compactColspan}" class="results-empty">Waiting for session data…</td></tr>`;
        return;
    }

    const mainRowHtmls = rows.map(({ num, line }, i) => {
        const driver = driverList[num] || {};
        const appLine = appLines[num];
        const lastLap = line.LastLapTime || {};
        const [sector1, sector2, sector3] = getSectorTimes(line);
        const posNum = i + 1;
        // Podium gold/silver/bronze doesn't apply in Q/SQ or FP — P1-P3
        // there is just "currently fastest", not a race result — so the
        // top3 class (which drives the coloring in live.css) only gets
        // added in Race/Sprint.
        const isTop3 = posNum <= 3 && !isQualiSession && !isPracticeSession;

        const lapClass = lastLap.OverallFastest ? 'live-lap--fastest'
            : lastLap.PersonalFastest ? 'live-lap--pb' : 'live-lap--normal';

        const bestLap = line.BestLapTime || {};
        const bestMs = lapTimeToMs(bestLap.Value);
        // Same reasoning as the mapview row tint: in FP the fastest lap is
        // always whoever's sitting in P1 (table's sorted by best lap), so
        // painting that cell purple is redundant — it's just "the top row,
        // again". Race/Sprint/Q/SQ keep it, since there P1 isn't
        // necessarily the fastest lap.
        const bestLapClass = (bestMs != null && bestMs === sessionBestMs && !isPracticeSession) ? 'live-lap--fastest' : '';

        const teamColor = TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)';
        const statusTag = line.Retired ? ''
            : line.InPit ? `<span class="live-status-team" style="color:${teamColor}">In pit</span>`
            : line.PitOut ? `<span class="live-status-team" style="color:${teamColor}">Out lap</span>`
            : 'Racing';

        const isEliminated = dimAfterPos != null && posNum > dimAfterPos;
        const sectorsBlanked = blankSectorsAfterPos != null && posNum > blankSectorsAfterPos;

        // Q/SQ and FP: no Delta column (grid position doesn't exist in
        // either), and Best Lap / Last Lap sit before the sectors instead
        // of after — mirrors MAIN_THEAD_QUALI/MAIN_THEAD_NODELTA above.
        // Only Race/Sprint keep the sectors-then-laps order. The
        // live-col-tight-* classes carry the padding that used to be
        // nth-child-based (see the live.css comment on those classes);
        // which cell gets first/mid/last just follows whichever order is
        // active, same 5-cell cluster either way.
        const deltaCellHTML = (isQualiSession || isPracticeSession) ? '' :
            `<td class="res-delta-cell">${gridDeltaHtml(line.Position ?? posNum, appLine && appLine.GridPos)}</td>`;
        const s1HTML = sectorsBlanked ? '' : (sector1?.value ?? '-');
        const s2HTML = sectorsBlanked ? '' : (sector2?.value ?? '-');
        const s3HTML = sectorsBlanked ? '' : (sector3?.value ?? '-');
        const s1Class = sectorsBlanked ? '' : (sector1?.className || '');
        const s2Class = sectorsBlanked ? '' : (sector2?.className || '');
        const s3Class = sectorsBlanked ? '' : (sector3?.className || '');
        const lapAndSectorCellsHTML = (isQualiSession || isPracticeSession)
            ? `<td class="${bestLapClass} live-col-tight-first">${bestLap.Value ?? '-'}</td>
                <td class="${lapClass} live-col-tight-mid">${lastLap.Value ?? '-'}</td>
                <td class="live-sector-cell live-col-tight-mid ${s1Class}">${s1HTML}</td>
                <td class="live-sector-cell live-col-tight-mid ${s2Class}">${s2HTML}</td>
                <td class="live-sector-cell live-col-tight-last ${s3Class}">${s3HTML}</td>`
            : `<td class="live-sector-cell live-col-tight-first ${s1Class}">${s1HTML}</td>
                <td class="live-sector-cell live-col-tight-mid ${s2Class}">${s2HTML}</td>
                <td class="live-sector-cell live-col-tight-mid ${s3Class}">${s3HTML}</td>
                <td class="${lapClass} live-col-tight-mid">${lastLap.Value ?? '-'}</td>
                <td class="${bestLapClass} live-col-tight-last">${bestLap.Value ?? '-'}</td>`;

        return `
            <tr class="results-row ${line.Retired ? 'live-row--retired' : ''}${isEliminated ? ' live-row--eliminated' : ''}">
                <td class="res-pos live-col-roomy${isTop3 ? ' top3' : ''}">${line.Position ?? posNum}</td>
                ${deltaCellHTML}
                <td class="live-col-roomy">
                    <span class="res-team">
                        ${teamLogoHTML(driver.TeamName)}
                        ${driverFullName(driver, num)}
                    </span>
                </td>
                <td class="results-date live-col-roomy">${posNum === 1 ? 'Leader' : formatGap(line.GapToLeader) ?? ''}</td>
                <td class="results-date live-col-roomy">${posNum === 1 ? 'Leader' : formatGap(line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value) ?? ''}</td>
                ${lapAndSectorCellsHTML}
                <td class="live-col-roomy">${tyreCellHTML(appLines[num])}</td>
                <td>${line.Retired ? 'RETIRED' : statusTag}</td>
                ${isPracticeSession ? `<td class="live-col-roomy">${line.NumberOfLaps ?? '-'}</td>` : ''}
            </tr>
        `;
    });
    tbody.innerHTML = withQualySeparators(mainRowHtmls, cutoffLines, mainColspan);

    // Map View table: Pos, Delta, Driver (3-letter code), Interval, Last
    // Lap, Tyres — Gap/Best Lap/Status stay dropped for this compact view.
    // Q/SQ exception: Delta drops out, Best Lap gets added back in, both
    // laps move ahead of the sectors, and Interval becomes Gap (to the
    // leader, not the car ahead) — see COMPACT_THEAD_QUALI above.
    if (tbody2) {
        const compactRowHtmls = rows.map(({ num, line }, i) => {
            const driver = driverList[num] || {};
            const appLine = appLines[num];
            const lastLap = line.LastLapTime || {};
            const [sector1, sector2, sector3] = getSectorTimes(line);
            const posNum = i + 1;
            const isTop3 = posNum <= 3 && !isQualiSession && !isPracticeSession;

            const lapClass = lastLap.OverallFastest ? 'live-lap--fastest'
                : lastLap.PersonalFastest ? 'live-lap--pb' : 'live-lap--normal';

            const bestLap = line.BestLapTime || {};
            const bestMs = lapTimeToMs(bestLap.Value);
            // Same FP exception as the main table above — redundant when
            // the fastest lap is always P1's.
            const bestLapClass = (bestMs != null && bestMs === sessionBestMs && !isPracticeSession) ? 'live-lap--fastest' : '';
            // The full purple row highlight only makes sense in Race/Sprint.
            // In Q/SQ the purple *cell* on Best/Last Lap (bestLapClass
            // above) already marks the fastest time, so the whole-row tint
            // is redundant there. In FP it's pointless for a different
            // reason: the table's sorted by best lap, so the fastest time
            // is always P1 — tinting "the top row" isn't telling you
            // anything a purple cell there wouldn't already say.
            const fastestRowClass = (bestLapClass && !isQualiSession && !isPracticeSession) ? ' live-row--fastest-map' : '';

            const teamColor = TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)';
            const isEliminated = dimAfterPos != null && posNum > dimAfterPos;

            // Best Lap gets added on top of the base 4-cell cluster
            // (S1/S2/S3/LastLap) in both Q/SQ and FP, and in the same spot
            // for both now: before Last Lap/sectors — matches
            // COMPACT_THEAD_QUALI/COMPACT_THEAD_NODELTA. Race/Sprint keep
            // the plain 4-cell cluster, no Best Lap here. Same
            // live-col-tight-* pattern regardless — just a different cell
            // holding "first"/"last".
            // Q/SQ: this column shows Gap to leader instead of Interval to
            // the car ahead — matches COMPACT_THEAD_QUALI's header swap.
            // It also now surfaces Out lap (PitOut) here, same as the main
            // table's status column already does — only in Q/SQ, since
            // that's the only place this column loses its "Interval" job
            // and has room to carry driver state instead.
            const gapCellContent = line.InPit
                ? `<span class="live-status-team" style="color:${teamColor}">In pit</span>`
                : (isQualiSession && line.PitOut)
                    ? `<span class="live-status-team" style="color:${teamColor}">Out lap</span>`
                    : (posNum === 1 ? 'Leader' : ((isQualiSession || isPracticeSession)
                        ? formatGap(line.GapToLeader) ?? ''
                        : formatGap(line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value) ?? ''));
            const intervalCellHTML = `<td class="results-date live-col-roomy">${gapCellContent}</td>`;
            const sectorsBlanked = blankSectorsAfterPos != null && posNum > blankSectorsAfterPos;
            const s1HTML = sectorsBlanked ? '' : (sector1?.value ?? '-');
            const s2HTML = sectorsBlanked ? '' : (sector2?.value ?? '-');
            const s3HTML = sectorsBlanked ? '' : (sector3?.value ?? '-');
            const s1Class = sectorsBlanked ? '' : (sector1?.className || '');
            const s2Class = sectorsBlanked ? '' : (sector2?.className || '');
            const s3Class = sectorsBlanked ? '' : (sector3?.className || '');
            const lapAndSectorCellsHTML = (isQualiSession || isPracticeSession)
                ? `<td class="${bestLapClass} live-col-tight-first">${bestLap.Value ?? '-'}</td>
                    <td class="${lapClass} live-col-tight-mid">${lastLap.Value ?? '-'}</td>
                    <td class="live-sector-cell live-col-tight-mid ${s1Class}">${s1HTML}</td>
                    <td class="live-sector-cell live-col-tight-mid ${s2Class}">${s2HTML}</td>
                    <td class="live-sector-cell live-col-tight-last ${s3Class}">${s3HTML}</td>`
                : `<td class="live-sector-cell live-col-tight-first ${s1Class}">${s1HTML}</td>
                    <td class="live-sector-cell live-col-tight-mid ${s2Class}">${s2HTML}</td>
                    <td class="live-sector-cell live-col-tight-mid ${s3Class}">${s3HTML}</td>
                    <td class="${lapClass} live-col-tight-last">${lastLap.Value ?? '-'}</td>`;

            return `
                <tr class="results-row ${line.Retired ? 'live-row--retired' : ''}${fastestRowClass}${isEliminated ? ' live-row--eliminated' : ''}">
                    <td class="res-pos live-col-roomy${isTop3 ? ' top3' : ''}">${line.Position ?? posNum}</td>
                    ${(isQualiSession || isPracticeSession) ? '' : `<td class="res-delta-cell">${gridDeltaHtml(line.Position ?? posNum, appLine && appLine.GridPos)}</td>`}
                    <td class="live-col-roomy">
                        <span class="res-team">
                            ${teamLogoHTML(driver.TeamName)}
                            ${driverSurname(driver, num)}
                        </span>
                    </td>
                    ${intervalCellHTML}
                    ${lapAndSectorCellsHTML}
                    <td class="live-col-roomy">${tyreCellHTML(appLines[num])}</td>
                    ${isPracticeSession ? `<td class="live-col-roomy">${line.NumberOfLaps ?? '-'}</td>` : ''}
                </tr>
            `;
        });
        tbody2.innerHTML = withQualySeparators(compactRowHtmls, cutoffLines, compactColspan);
    }

    syncMapHeight();
    updatePositionOverlay();
}

// Rough bounding box for X/Y, expanded as data comes in. Not calibrated
// per circuit yet — good enough tonight to confirm dots move in roughly
// the right place; a real per-circuit calibration is a "polish later" job.
const posBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

// Teams whose dot needs white text instead of the default black
// (their team color reads better with a light label on top).
const WHITE_TEXT_TEAMS = new Set(['Red Bull', 'Red Bull Racing', 'Alpine', 'McLaren', 'Audi', 'Ferrari', 'Williams', 'Racing Bulls', 'Aston Martin', 'Cadillac']);

function updatePositionOverlay() {
    const overlay = document.getElementById('circuit-position-overlay');
    if (!overlay) return;

    const posArray = state['Position.z'] && state['Position.z'].Position;
    const latest = posArray && posArray[posArray.length - 1];
    const entries = latest && latest.Entries;
    if (!entries) return;

    for (const num of Object.keys(entries)) {
        const { X, Y } = entries[num];
        if (typeof X !== 'number' || typeof Y !== 'number') continue;
        if (X < posBounds.minX) posBounds.minX = X;
        if (X > posBounds.maxX) posBounds.maxX = X;
        if (Y < posBounds.minY) posBounds.minY = Y;
        if (Y > posBounds.maxY) posBounds.maxY = Y;
    }

    const driverList = state.DriverList || {};
    const spanX = posBounds.maxX - posBounds.minX || 1;
    const spanY = posBounds.maxY - posBounds.minY || 1;

    overlay.innerHTML = Object.keys(entries).map((num) => {
        const { X, Y, Status } = entries[num];
        if (typeof X !== 'number' || typeof Y !== 'number' || Status === 'OFF') return '';

        const pctX = ((X - posBounds.minX) / spanX) * 100;
        // F1's Y axis grows upward, CSS grows downward — flip it.
        const pctY = 100 - ((Y - posBounds.minY) / spanY) * 100;

        const driver = driverList[num] || {};
        const teamColor = TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)';
        const textColor = WHITE_TEXT_TEAMS.has(driver.TeamName) ? '#fff' : '#000';
        return `<div class="pos-dot" style="left:${pctX}%; top:${pctY}%; background:${teamColor}; color:${textColor};"><span class="pos-dot-label">${driverCode(driver, num)}</span></div>`;
    }).join('');
}

// Matches the circuit map container's height to the Map View table's real
// rendered height — CSS align-items:stretch alone isn't reliable here
// because the map image sizes itself by its own aspect ratio, not by the
// table's content. Skipped below the 700px breakpoint, where the two
// stack vertically (see live.css) and a forced height would just leave
// empty space instead of matching anything.
function syncMapHeight() {
    const tableWrap = document.querySelector('.map-view-content .results-table-wrap');
    const mapWrap = document.getElementById('circuit-map-wrap');
    if (!tableWrap || !mapWrap) return;

    const mapViewContent = document.getElementById('live-map-view-content');
    const isFullscreen = mapViewContent && mapViewContent.classList.contains('is-fullscreen');

    if (window.innerWidth <= 700 || isFullscreen) {
        mapWrap.style.height = '';
        return;
    }
    mapWrap.style.height = `${tableWrap.offsetHeight}px`;
}

window.addEventListener('resize', syncMapHeight);

// ── FULLSCREEN TOGGLE (tabla principal / tabla reducida + mapa) ────────────
// No reparenta nada del DOM — solo agranda el contenedor con position:fixed
// (misma capa que .track-zoom-modal en race.css, z-index 999), así que
// getElementById('live-rows'), getElementById('live-rows-2'), etc. siguen
// funcionando igual estén o no en pantalla completa.
function initFullscreenButtons() {
    const targets = [
        { btnId: 'live-table-fullscreen-btn', wrapId: 'live-table-wrap' },
        { btnId: 'live-map-fullscreen-btn', wrapId: 'live-map-view-content' },
    ];

    function setFullscreen(wrap, btn, on) {
        wrap.classList.toggle('is-fullscreen', on);
        btn.classList.toggle('is-fullscreen', on);
        btn.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
        document.body.style.overflow = document.querySelector('.is-fullscreen') ? 'hidden' : '';
        syncMapHeight();
    }

    targets.forEach(({ btnId, wrapId }) => {
        const btn = document.getElementById(btnId);
        const wrap = document.getElementById(wrapId);
        if (!btn || !wrap) return;

        btn.addEventListener('click', () => {
            setFullscreen(wrap, btn, !wrap.classList.contains('is-fullscreen'));
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        targets.forEach(({ btnId, wrapId }) => {
            const btn = document.getElementById(btnId);
            const wrap = document.getElementById(wrapId);
            if (wrap && wrap.classList.contains('is-fullscreen')) setFullscreen(wrap, btn, false);
        });
    });
}

initFullscreenButtons();
connect();

// Keeps the clock moving smoothly even during gaps between WS messages
// (render() alone only repaints when something arrives over the socket).
setInterval(updateSessionClock, 1000);