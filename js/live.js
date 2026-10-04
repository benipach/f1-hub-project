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

// Circuit slug for the current GP. The backend already sends it in CurrentGP
// (taken from the season file), so that wins; CIRCUIT_MAP stays
// only as a fallback for old snapshots that don't include it.
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
// In Race/Sprint the feed sends both values directly on the line
// (GapToLeader / IntervalToPositionAhead.Value). In Qualifying, Sprint
// Qualifying and Practice those fields come empty: the real diffs travel
// in line.Stats, a dict indexed by segment (Stats["0"] = Q1/SQ1,
// ["1"] = Q2, ["2"] = Q3) with TimeDiffToFastest and TimeDifftoPositionAhead
// (yes, with that lowercase "t", that's how F1 sends it). Verified against a
// live capture; without this the Gap and Interval columns stayed blank
// for the whole of qualifying.
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

    // The current segment may have no diff for this driver: either they were
    // knocked out earlier (their live numbers are from the last segment they
    // ran in), or they haven't set a time yet. Search backwards for the last
    // segment with data instead of showing an empty cell.
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

// Gap cell text. P1 says "Leader". In Q/SQ/Practice, if the feed doesn't
// include the diff (happens at the start of the session or with incomplete captures),
// it's computed by hand: the driver's best lap minus the leader's. In
// Race/Sprint there's no fallback, since there the difference in best laps isn't
// the real gap on track.
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

// "+1.234" → 1.234 s. null for anything that isn't a time (empty, "+1 LAP").
function gapSeconds(value) {
    const match = /^\+?\s*(\d+(?:\.\d+)?)$/.exec(String(value || '').trim());
    return match ? Number(match[1]) : null;
}

// Interval cell text: the difference to the car ahead. If the
// feed doesn't include it (in Practice/Qualifying it's usually empty), it's computed:
//   - Q/SQ/FP: the driver's best lap minus that of the car ahead.
//   - Race/Sprint: the driver's gap to the leader minus that of the car ahead (P1
//     counts as 0). If either is laps down there's no way to subtract.
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

// F1's real feed sends sectors in line.Sectors, indexed from
// ZERO: Sectors["0"] = S1, ["1"] = S2, ["2"] = S3 (verified against a
// live capture of the 2026 Italian GP). Previously this tried the
// 1-based variant first, so S1 showed the S2 time and S3 was
// always empty. Sector{n}Time is kept above because it's the shape
// old mocks/adapters use, and there the index is 1-based.
function getSectorTimeInfo(line, sectorIndex) {
    const zeroBased = String(sectorIndex - 1);
    const candidates = [
        [`Sector${sectorIndex}Time`],
        [`Sector${sectorIndex}`],
        [`LastLapTime`, `Sector${sectorIndex}Time`],
        [`LastLapTime`, `Sector${sectorIndex}`],
        ['Sectors', zeroBased, 'Value'],
        ['LastLapTime', 'Sectors', zeroBased, 'Value'],
        // When the lap is completed, F1 clears Sectors[i].Value and leaves the
        // time in PreviousValue. Without this fallback, S3 showed "-"
        // for almost every driver as soon as they crossed the line.
        ['Sectors', zeroBased, 'PreviousValue'],
    ];

    for (const path of candidates) {
        // A sector without a time arrives as "" (empty string), not missing:
        // that's not a value, it means "hasn't crossed yet".
        const value = normalizeTimeValue(getNestedValue(line, path));
        if (value) return { value };
    }
    return null;
}

function getSectorTimes(line) {
    return [1, 2, 3].map((sectorIndex) => getSectorTimeInfo(line, sectorIndex));
}

// ── TABLE S1-S3: ALWAYS FROM THE SAME LAP ─────────────────────────────────
// getSectorTimes() fills any sector without a time with PreviousValue,
// so it mixed laps: with the driver on their in-lap,
// S1 and S2 were from that lap and S3 from the previous fast lap (and they didn't
// add up to the Last Lap). For the map it doesn't matter (it only estimates pace), but
// the table shows a single lap:
//   - Lap in progress (some Sectors[i].Value with a time): only the
//     sectors already done on this lap, in order from S1; the rest empty.
//     When crossing the line F1 does NOT clear the sectors (verified in the
//     2026 Baku Qualifying): all three keep their time, which is the finished lap,
//     until S1 of the next lap overwrites the first one.
//   - All empty: the three PreviousValue, only if they add up to the Last Lap. If
//     they don't, nothing is shown rather than mixing laps.
// `live`: the sector being driven right now (its mini-sectors update
// live); the ones after it haven't been driven on this lap yet.
// null if the finished lap is shown.
const LAP_SUM_TOLERANCE_MS = 250;

function displayedSectors(line) {
    const sectors = line && line.Sectors;
    if (!sectors || typeof sectors !== 'object') {
        // Old mocks/adapters without Sectors: as before.
        return { times: getSectorTimes(line).map((s) => (s ? s.value : null)), live: null };
    }
    const node = (i) => {
        const n = sectors[i] ?? sectors[String(i)];
        return n && typeof n === 'object' ? n : {};
    };

    const current = [0, 1, 2].map((i) => node(i).Value || null);
    if (current.some(Boolean)) {
        const times = [null, null, null];
        let live = 0;
        while (live < 3 && current[live]) {
            times[live] = current[live];
            live++;
        }
        return { times, live: live < 3 ? live : null };
    }

    const previous = [0, 1, 2].map((i) => node(i).PreviousValue || null);
    const lapMs = lapTimeToMs(line.LastLapTime && line.LastLapTime.Value);
    const sumMs = previous.reduce((sum, v) => sum + (lapTimeToMs(v) ?? NaN), 0);
    if (lapMs != null && Math.abs(sumMs - lapMs) <= LAP_SUM_TOLERANCE_MS) {
        return { times: previous, live: null };
    }
    return { times: [null, null, null], live: null };
}

// ── SECTOR AND LAST LAP COLORS ────────────────────────────────────────────
// Purple = best overall, green = personal best, yellow = neither.
// Previously the feed's OverallFastest/PersonalFastest flags were read, but
// the sector ones were never checked (the time string was read directly,
// without the object that carries the flags) and everything came out yellow. Also,
// in qualifying it isn't confirmed that the feed's flags reset between
// segments, and official F1 timing starts from scratch in each one.
//
// Now it's computed here: for each period (the session, or each Q1/Q2/Q3)
// each driver's best time and the overall best are stored, per sector and
// per lap, with every time seen along the way. Moving to Q2/Q3
// resets everything, and whatever was left on screen from Q1 ("stale") shows in
// yellow and doesn't count until the driver sets a new time in that
// cell. Same with mini-sectors: the feed only sends the color
// (not the time), so the only option there is to dim to yellow the ones
// left over from the previous segment.
//
// If the page opens with the session (or segment) already started, it didn't see the
// earlier times: for the lap it falls back to the feed's best lap
// (see periodBestLapValue) and sectors use F1's flags (see
// feedSectorClass) until the next segment.
const TIMING_SLOTS = ['s1', 's2', 's3', 'lap'];
let timingBests = null;

function slotValues(line) {
    const values = {};
    displayedSectors(line).times.forEach((time, i) => { values[`s${i + 1}`] = time; });
    values.lap = (line.LastLapTime && line.LastLapTime.Value) || null;
    return values;
}

function segmentsSignature(line, sectorIndex) {
    return getSegments(line, sectorIndex).join(',');
}

// What each driver has on screen when the segment changes: those times
// and bars are from the previous segment.
function staleSnapshot(lines) {
    const stale = {};
    for (const [num, line] of Object.entries(lines)) {
        if (!line || typeof line !== 'object') continue;
        const values = slotValues(line);
        const entry = { segments: {} };
        for (const slot of TIMING_SLOTS) if (values[slot]) entry[slot] = values[slot];
        [1, 2, 3].forEach((i) => {
            const signature = segmentsSignature(line, i);
            if (signature) entry.segments[i] = signature;
        });
        stale[num] = entry;
    }
    return stale;
}

function isStaleValue(num, slot, value) {
    const stale = timingBests && timingBests.stale[num];
    return !!(stale && value && stale[slot] === value);
}

function isStaleSegments(num, line, sectorIndex) {
    const stale = timingBests && timingBests.stale[num];
    return !!(stale && stale.segments[sectorIndex] != null
        && stale.segments[sectorIndex] === segmentsSignature(line, sectorIndex));
}

function recordBest(num, slot, ms) {
    const personal = timingBests.personal[num] || (timingBests.personal[num] = {});
    if (!(personal[slot] <= ms)) personal[slot] = ms;
    if (!(timingBests.overall[slot] <= ms)) timingBests.overall[slot] = ms;
}

// Called with every relay message that gets applied (not only on render),
// so a time the feed overwrites right away isn't lost.
function updateTimingBests() {
    const lines = state.TimingData && state.TimingData.Lines;
    if (!lines) return;

    const info = state.SessionInfo || {};
    const sessionKey = String(info.Key ?? info.Path ?? info.Name ?? '');
    const part = currentTimingPart();
    if (!timingBests || timingBests.sessionKey !== sessionKey) {
        timingBests = { sessionKey, part, overall: {}, personal: {}, stale: {}, sawStart: !hasAnyTimes(lines) };
    } else if (timingBests.part !== part) {
        timingBests = { sessionKey, part, overall: {}, personal: {}, stale: staleSnapshot(lines), sawStart: true };
    }

    for (const [num, line] of Object.entries(lines)) {
        if (!line || typeof line !== 'object') continue;
        const values = slotValues(line);
        const stale = timingBests.stale[num];
        for (const slot of TIMING_SLOTS) {
            const value = values[slot];
            if (stale && slot in stale) {
                if (value === stale[slot]) continue;
                delete stale[slot]; // changed: from here on it belongs to this segment
            }
            const ms = lapTimeToMs(value);
            if (ms != null) recordBest(num, slot, ms);
        }
        if (stale) {
            for (const i of Object.keys(stale.segments)) {
                if (stale.segments[i] !== segmentsSignature(line, Number(i))) delete stale.segments[i];
            }
        }
        // The driver's real best lap, not just what's on screen
        // (otherwise, opening the page late, any Last Lap came out
        // purple even if someone else had a faster Best Lap).
        const bestMs = lapTimeToMs(periodBestLapValue(line, part, timingBests.sawStart));
        if (bestMs != null) recordBest(num, 'lap', bestMs);
    }
}

// ── DRIVERS WHO HAVE ALREADY TAKEN THE CHEQUERED FLAG ─────────────────────
// The rule and the calculation live in the relay (server/finishers.js): each driver
// is frozen with the lap they complete on their first line crossing
// after the chequered flag (feed time, not local clock), the same
// for everyone. The relay sees every crossing even if the page opens or
// reloads late, and sends it as the FinishedLines topic.
//
// Here it's only consumed: for those drivers, Last Lap, Best Lap, S1-S3,
// mini-sectors and laps come from the frozen row. Position, gap and status
// stay live. In qualifying everything is released with the next segment's
// green light (FinishedLines is per period).
function relayFinishedLines() {
    const finished = state.FinishedLines;
    if (!finished || typeof finished !== 'object') return null;
    const info = state.SessionInfo || {};
    if (String(finished.sessionKey) !== String(info.Key) || finished.part !== currentTimingPart()) return null;
    return finished.lines || {};
}

function finishedLineFor(num) {
    const fromRelay = relayFinishedLines();
    return (fromRelay && fromRelay[num]) || null;
}

// The line the table shows: the frozen one for drivers who have finished.
function shownTimingLine(num, line) {
    const frozen = finishedLineFor(num);
    return frozen ? { ...line, ...frozen } : line;
}

function hasTakenChequered(num) {
    return !!finishedLineFor(num);
}

// The driver's best lap in the current period, according to the feed.
// - In qualifying F1 sends BestLapTimes with one entry per segment ([0] = Q1,
//   [1] = Q2, [2] = Q3): if present, it's exact.
// - Otherwise, BestLapTime (the one in the Best Lap column). In Q2/Q3 it may be from
//   Q1, so there it's only used if the page didn't see the segment start
//   (it was opened or reloaded with the segment underway): without that there's no other
//   reference. If it saw the start, it has already seen every lap of the segment.
function periodBestLapValue(line, part, sawStart) {
    const perPart = line.BestLapTimes;
    if (part >= 1 && perPart && typeof perPart === 'object') {
        const value = normalizeTimeValue(perPart[part - 1] ?? perPart[String(part - 1)]);
        if (value) return value;
    }
    if (part >= 2 && sawStart) return null;
    return (line.BestLapTime && line.BestLapTime.Value) || null;
}

// Is there any time on screen yet? If there was none when the bests record
// was created, the page is seeing the session from the start and everything it
// compares is complete.
function hasAnyTimes(lines) {
    return Object.values(lines).some((line) => line && typeof line === 'object'
        && TIMING_SLOTS.some((slot) => slotValues(line)[slot]));
}

// A sector's color according to the flags F1 sends in Sectors[i]. Used
// when the page didn't see the start (it was opened or reloaded late): for
// sectors there's no other data about earlier bests, and comparing only
// what's on screen painted anyone's sector green.
function feedSectorClass(num, sectorIndex) {
    const lines = (state.TimingData && state.TimingData.Lines) || {};
    const node = getNestedValue(lines[num], ['Sectors', String(sectorIndex - 1)]);
    if (!node || typeof node !== 'object') return 'live-lap--normal';
    if (node.OverallFastest) return 'live-lap--fastest';
    if (node.PersonalFastest) return 'live-lap--pb';
    return 'live-lap--normal';
}

function timingClass(num, slot, value) {
    if (!value) return '';
    const ms = lapTimeToMs(value);
    if (!timingBests || ms == null || isStaleValue(num, slot, value)) return 'live-lap--normal';
    if (slot !== 'lap' && !timingBests.sawStart) return feedSectorClass(num, Number(slot.slice(1)));
    if (ms <= timingBests.overall[slot]) return 'live-lap--fastest';
    const personal = timingBests.personal[num];
    if (personal && ms <= personal[slot]) return 'live-lap--pb';
    return 'live-lap--normal';
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

// Same 0-based indexing as getSectorTimeInfo (confirmed against the live
// feed): Sectors["0"].Segments are the S1 bars.
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

// stale: bars left over from the previous qualifying segment (see
// updateTimingBests); the green and purple from there no longer count, they go yellow.
function microsectorsHTML(segments, stale = false) {
    if (!segments.length) return '';
    return `<span class="live-microsectors">${segments
        .map((status) => {
            let cls = segmentStatusClass(status);
            if (stale && (cls === 'green' || cls === 'purple')) cls = 'yellow';
            return `<span class="live-microsector live-microsector--${cls}"></span>`;
        })
        .join('')}</span>`;
}

// Notice in both tables when there's still NOTHING to show. Without
// this, with the relay down the page stays forever on "Waiting
// for session data…" and there's no way to tell that the problem is that
// server/client.js isn't running.
function setConnectionNotice(text) {
    if (state.TimingData && state.TimingData.Lines) return; // there's data already: don't overwrite anything
    const tbody = document.getElementById('live-rows-2');
    if (tbody) tbody.innerHTML = `<tr><td colspan="${tableColspan}" class="results-empty">${text}</td></tr>`;
}

// ── WHERE THE RELAY IS ────────────────────────────────────────────────────
// This used to be a fixed 'ws://localhost:8080', so the page only showed
// data on the same machine running server/client.js: from a phone, or
// from the version published on GitHub Pages, nothing loaded.
//
// Now the URL is resolved like this, in order:
//   1. ?relay=... in the URL (it gets saved, so it's set up once
//      per device: open live.html?relay=... and that's it)
//   2. whatever was saved from a previous visit (localStorage)
//   3. window.F1_HUB_RELAY_URL, if defined in a <script> before this one
//   4. RELAY_URL below: the constant to fill in with the relay's public URL
//      once it's deployed
//   5. ws://localhost:8080 when the page is opened locally (dev)
//
// Important: a page served over https (GitHub Pages is) CANNOT
// open a ws:// WebSocket; the browser blocks it as mixed content. That's
// why normalizeRelayUrl forces wss:// in that case; the relay has to sit
// behind HTTPS (any host like Render/Railway/Fly provides that already, or
// a tunnel like cloudflared).
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

    // Mixed content: from https only wss is allowed.
    if (location.protocol === 'https:' && url.startsWith('ws://')) {
        url = 'wss://' + url.slice('ws://'.length);
    }
    return url;
}

function readStoredRelay() {
    try {
        return localStorage.getItem(RELAY_STORAGE_KEY);
    } catch (err) {
        return null; // incognito mode / blocked storage
    }
}

function storeRelay(url) {
    try {
        localStorage.setItem(RELAY_STORAGE_KEY, url);
    } catch (err) {
        /* no problem: it keeps working for this session */
    }
}

function resolveRelayUrl() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('relay');

    // ?relay= (empty) clears the saved override and goes back to the default
    // behavior, which is how a device gets "unconfigured".
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
// Live data arrives before the TV picture (the broadcast
// runs a few seconds behind, more on streaming). So the page doesn't
// "spoil" an overtake, every relay message goes into a queue with its
// arrival time and is only applied once the delay the user chose
// has passed. With a delay of 0, everything is applied instantly.
//
// The session clock is delayed too (feedNow()), so the countdown or the
// race timer matches what's on TV.
const DELAY_MAX_SECONDS = 300;
const DELAY_STEP_SECONDS = 5;
const pendingRelayMessages = [];

function delaySeconds() {
    const value = Math.round(Number(viewPrefs && viewPrefs.delaySeconds));
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), DELAY_MAX_SECONDS) : 0;
}

// "Now" according to what's being shown: the real time minus the delay.
function feedNow() {
    return Date.now() - delaySeconds() * 1000;
}

function applyRelayMessage(msg) {
    if (msg.type === 'snapshot') {
        state = msg.state || {};
        if (state.ExtrapolatedClock) lastClockUpdateLocalTime = Date.now();
    } else if (msg.type === 'update') {
        // Position.z: the relay sends the latest batch of positions whole.
        // Merging it index by index with the previous one left old
        // samples at the end of the array when the new batch was shorter,
        // and the car "jumped back" to where it was a moment ago.
        // FinishedLines also arrives whole, and replaces: if it were merged,
        // drivers from the previous segment would stay frozen after the segment changes.
        state[msg.topic] = msg.topic === 'Position.z' || msg.topic === 'FinishedLines'
            ? msg.data
            : mergeState(state[msg.topic] || {}, msg.data);
        if (msg.topic === 'ExtrapolatedClock') lastClockUpdateLocalTime = Date.now();
    }
    updateTimingBests();
}

function receiveRelayMessage(msg) {
    // No delay (and nothing waiting in the queue): apply directly. The first
    // snapshot also goes straight through even with a delay, so the table doesn't
    // sit empty while the delay "fills up".
    const firstSnapshot = msg.type === 'snapshot' && !(state.TimingData && state.TimingData.Lines);
    if ((delaySeconds() === 0 && pendingRelayMessages.length === 0) || firstSnapshot) {
        applyRelayMessage(msg);
        render();
        return;
    }
    pendingRelayMessages.push({ at: Date.now(), msg });
}

// Applies, in order, everything whose delay has passed. If the delay
// shrinks, everything queued comes out at once; if it grows, the page stays
// still until it catches up.
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

// "DELAY 30s" chip next to the session clock, so it's clear that what's
// shown is behind on purpose.
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
        setConnectionNotice('No relay configured for this device. Open this page with ?relay=wss://your-relay to connect it.');
        return;
    }

    const ws = new WebSocket(relayUrl);

    ws.onopen = () => {
        setConnectionNotice('No session data yet');
    };

    ws.onmessage = (event) => {
        receiveRelayMessage(JSON.parse(event.data));
    };

    ws.onclose = () => {
        setConnectionNotice(isLocalPage()
            ? `Can't reach the relay (${relayUrl}). Start server/client.js. Retrying…`
            : `Can't reach the live timing server (${relayUrl}). It may be starting up or offline. Retrying…`);
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

// When the current qualifying segment started (Q2/Q3, SQ2/SQ3), for whatever
// resets between segments: Race Control and the sector and
// last lap colors. null in Q1, outside qualifying or without data.
//
// It isn't clear whether the QualifyingPart change in SessionData.Series arrives
// with the new segment's green light or with the previous one's chequered
// flag; in the second case, laps finished after the
// flag would count as part of the new segment. That's why the start is the
// first "Started" in StatusSeries since that change (with a 60 s margin in
// case they arrive almost together). If there's no StatusSeries, the time of the change is used.
// { ms, started }: started is false while waiting for the green light.
function qualifyingPartStart() {
    const meta = deriveSessionMeta(state.SessionInfo);
    if (!meta || meta.kind !== 'countdown-segment') return null;
    const part = currentQualifyingPart();
    if (part < 2) return null;
    const data = state.SessionData || {};
    const changes = Object.values(data.Series || {})
        .filter((e) => e && e.QualifyingPart === part)
        .map((e) => rcUtcMs(e.Utc))
        .filter((ms) => ms != null);
    if (changes.length === 0) return null;
    const changeMs = Math.min(...changes);

    const statuses = Object.values(data.StatusSeries || {}).filter((e) => e && e.SessionStatus);
    if (statuses.length === 0) return { ms: changeMs, started: true };
    const starts = statuses
        .filter((e) => e.SessionStatus === 'Started')
        .map((e) => rcUtcMs(e.Utc))
        .filter((ms) => ms != null && ms >= changeMs - 60 * 1000);
    return starts.length
        ? { ms: Math.min(...starts), started: true }
        : { ms: changeMs, started: false };
}

// Until the green light, the previous segment's messages are still shown.
function qualifyingPartStartMs() {
    const start = qualifyingPartStart();
    return start && start.started ? start.ms : null;
}

// Segment that counts for best times (see updateTimingBests): the
// QualifyingPart one, but only from its green light. 0 outside Q/SQ.
function currentTimingPart() {
    const meta = deriveSessionMeta(state.SessionInfo);
    if (!meta || meta.kind !== 'countdown-segment') return 0;
    const part = currentQualifyingPart();
    const start = qualifyingPartStart();
    return start && !start.started ? part - 1 : part;
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
// 3 colors used on the page (SC/VSC count as yellow).
// TODO: confirm these codes against a logged TrackStatus message.
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

// How long it's been since the feed emitted that Remaining. Measured against
// clock.Utc (the feed's own time) and not against when the message
// reached us: when the page opens, the relay sends its latest snapshot,
// which can be minutes old, and treating it as just arrived
// left the countdown behind by exactly that difference.
// If the machine's clock is way off from the feed's, the
// calculation gives an absurd number and it falls back to the old method.
function clockElapsedSeconds(clock) {
    const feedUtc = clock && clock.Utc ? new Date(clock.Utc).getTime() : NaN;
    if (Number.isFinite(feedUtc)) {
        const elapsed = (feedNow() - feedUtc) / 1000;
        if (elapsed >= 0 && elapsed < 6 * 3600) return elapsed;
    }
    return (Date.now() - lastClockUpdateLocalTime) / 1000;
}

// Clock pause icon (red flag or stopped clock). An SVG rather than the
// "⏸" character: each system draws that one its own way (smaller, lower,
// a different weight) and it ended up misaligned with the numbers.
const PAUSE_ICON_SVG = '<svg class="status-clock-pause" viewBox="0 0 10 12" aria-label="Paused" role="img"><rect x="1" y="1" width="2.6" height="10" rx="0.8"></rect><rect x="6.4" y="1" width="2.6" height="10" rx="0.8"></rect></svg>';

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
        <span class="status-clock${paused ? ' status-clock--paused' : ''}">${clockText}${paused ? PAUSE_ICON_SVG : ''}</span>
    `;
    el.innerHTML = html;
}

// Circuit map for the Map View section. It requests the live layout (see
// TRACK MAP) and keeps the circuit PNG as a fallback in case the API doesn't
// respond. The PNG only changes when the GP changes.
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
// The "Team" column shows the name exactly as it is in teams.json (e.g.
// the feed sends "Mercedes" and the database says "Mercedes-AMG"). resolveTeam()
// from shared/teams.js maps feed → database ID, same as in the
// rest of the site. Until teams.json has loaded, the feed's name is shown.
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
    // If no team matches, resolveTeamId returns a slug: the feed's name
    // is better than "haas-f1-team".
    const team = teamsData[resolveTeamId(feedTeamName, teamsData)];
    return (team && team.name) || feedTeamName;
}

// Team color the way championship uses it: teams.json's first, the
// feed's (TEAM_COLOR_MAP) while the database hasn't loaded or if it doesn't have one.
function teamAccentColor(feedTeamName) {
    if (teamsData && typeof resolveTeamId === 'function') {
        const team = teamsData[resolveTeamId(feedTeamName, teamsData)];
        if (team && team.color) return team.color;
    }
    return TEAM_COLOR_MAP[feedTeamName] || 'rgba(255,255,255,0.4)';
}

// "#63" in the team color, copied from championship's .st-driver-num.
// The DriverList key is already the car number; RacingNumber wins if
// the feed includes it.
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
        // The feed sends WindSpeed in m/s (according to FastF1, which reads this same feed),
        // which is what the renderer expects; previously it was divided by 3.6 assuming
        // it came in km/h, and the wind showed 3.6 times lower.
        wind_speed:       Number(w.WindSpeed),
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

// ── TABLE VIEW (columns and format chosen by the user) ────────────────────
// The "Customize table" panel (button next to fullscreen) lets the user
// turn columns on/off and choose how some things are shown. localStorage
// stores ONLY what the user changed: anything never touched
// follows each session type's default (Interval on in races, off in
// qualifying; Laps only in Practice; etc.), so the table looks the same as always
// until someone changes it.
const VIEW_STORAGE_KEY = 'f1hub:live-view';

// The order here is the order of the columns in the table and of the list in
// the panel. locked = can't be removed (without position or driver the table
// says nothing). raceOnly = only exists in Race/Sprint (needs the grid).
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

// Screen panels that can be turned on/off ("Panels" section of the
// Customize panel). Saved together with the columns in viewPrefs.columns.
const VIEW_PANELS = [
    { key: 'trackMap',    label: 'Track map' },
    { key: 'raceControl', label: 'Race control' },
];

const VIEW_SESSION_DEFAULTS = {
    race:     { number: false, team: true, delta: true,  status: true, gap: true, interval: true,  bestLap: false, lastLap: true, sectors: true, microsectors: true, tyres: true, laps: false, trackMap: true, raceControl: true },
    quali:    { number: false, team: true, delta: false, status: true, gap: true, interval: false, bestLap: true,  lastLap: true, sectors: true, microsectors: true, tyres: true, laps: false, trackMap: true, raceControl: true },
    practice: { number: false, team: true, delta: false, status: true, gap: true, interval: false, bestLap: true,  lastLap: true, sectors: true, microsectors: true, tyres: true, laps: true,  trackMap: true, raceControl: true },
};

// Format options (segmented buttons in the panel). The first option
// is the default, except tyres, which depends on the session (see optionDefault).
// dependsOn: the checkbox they depend on; if it's off, the buttons don't
// even show up (no point choosing how something that isn't shown looks).
const VIEW_OPTIONS = {
    driverName: {
        label: 'Driver names',
        choices: [['code', 'Short name'], ['surname', 'Last name'], ['full', 'Full name']],
    },
    team: {
        label: 'Show as',
        dependsOn: 'team',
        choices: [['inline', 'Logo by driver'], ['column', 'Name column']],
    },
    tyres: {
        label: 'Show as',
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
            // "Hidden" (Team) and "Hide" (Race control) used to be buttons;
            // now they're checkboxes. Whatever the user had chosen is respected.
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
    } catch (err) { /* no storage or broken JSON: defaults */ }
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

// What's actually shown in this session: the saved preference if there is
// one, the session default otherwise. cols holds columns and panels.
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

// Visible columns for this view, in order. Each one has its <th> and a
// function that builds its <td> from the row context that
// render() prepares. The timing "cluster" (Best Lap, Last Lap, S1-S3) gets the
// tight padding of .live-col-tight-* depending on which cell ends up first,
// middle or last (see live.css, COLUMN PADDING).
function buildTableColumns(view) {
    const { cols } = view;
    // Team off: no logo and no column, whatever the buttons say.
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
            (r) => `<td class="live-col-status">${r.chequered
                ? '<span class="live-status-wrap"><span class="live-status-badge live-status-badge--chequered" title="Took the chequered flag"><span class="live-chequered-icon" aria-hidden="true"></span>FIN</span></span>'
                : r.statusLabel ? `<span class="live-status-wrap"><span class="live-status-badge" style="color:${r.teamColor}">${r.statusLabel}</span></span>` : ''}</td>`);
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
                const value = r.sectorView.times[idx];
                const time = cols.sectors ? `<span class="live-sector-time">${value ?? '-'}</span>` : '';
                // Sectors not yet driven on this lap: whatever
                // bars they have are from the previous lap, so they go grey.
                // With the frozen row (chequered flag) the bars are the
                // ones from the final lap, not from the cool-down lap.
                const notYetRun = r.sectorView.live != null && idx > r.sectorView.live;
                const segments = getSegments(r.shown, idx + 1);
                const bars = cols.microsectors
                    ? microsectorsHTML(notYetRun ? segments.map(() => 0) : segments, isStaleSegments(r.num, r.shown, idx + 1))
                    : '';
                const colorClass = cols.sectors ? timingClass(r.num, `s${idx + 1}`, value) : '';
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

// Colspan of the "Waiting…"/notice row: follows the number of columns.
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

// Applies the current view without waiting for data: if there's a table already, re-renders;
// if not, it only updates the headers and the empty notice's colspan (without overwriting
// the connection notice text).
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
    updateWindOverlay();
    updateTrackAnnotations();

    const timingLines = (state.TimingData && state.TimingData.Lines) || {};
    const driverList = state.DriverList || {};
    const appLines = (state.TimingAppData && state.TimingAppData.Lines) || {};

    const rows = Object.keys(timingLines)
        .map((num) => ({ num, line: timingLines[num] }))
        .filter((r) => r.line)
        // Sort by Position (the number later shown in
        // the Pos column) and use Line only as a tiebreaker. It used to
        // sort by Line only: when the feed sends Position and Line in
        // separate updates, the table ended up sorted one way and
        // numbered another, with positions that looked repeated or
        // skipped.
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

    // Base for the hand-computed Gap (see gapCellText): the best lap
    // of whoever is P1. Only applies in Q/SQ/FP, where the order is by lap time.
    const allowGapFallback = isQualiSession || isPracticeSession;
    const leaderBestMs = rows.length
        ? lapTimeToMs(rows[0].line.BestLapTime && rows[0].line.BestLapTime.Value)
        : null;

    const tbody2 = document.getElementById('live-rows-2');

    if (rows.length === 0) {
        if (tbody2) tbody2.innerHTML = `<tr><td colspan="${tableColspan}" class="results-empty">No session data yet</td></tr>`;
        return;
    }

    if (tbody2) {
        const rowHtmls = rows.map(({ num, line }, i) => {
            const driver = driverList[num] || {};
            // Whoever has already taken the chequered flag shows their final lap
            // (see relayFinishedLines); everyone else, the live line.
            const shown = shownTimingLine(num, line);
            const lastLap = shown.LastLapTime || {};
            const bestLap = shown.BestLapTime || {};
            const bestMs = lapTimeToMs(bestLap.Value);
            const posNum = i + 1;

            // In FP and Q/SQ the fastest lap is always P1's (table's sorted
            // by best lap), so painting it purple is redundant there.
            const bestLapClass = (bestMs != null && bestMs === sessionBestMs && !isPracticeSession && !isQualiSession) ? 'live-lap--fastest' : '';
            // The full purple row highlight only makes sense in Race/Sprint
            // (bestLapClass is already empty in FP and Q/SQ).
            const fastestRowClass = bestLapClass ? ' live-row--fastest-map' : '';
            const isEliminated = dimAfterPos != null && posNum > dimAfterPos;

            // Everything the columns may need (see
            // buildTableColumns): each one takes its own part from here.
            const r = {
                num,
                line: shown,
                driver,
                posNum,
                appLine: appLines[num],
                isTop3: posNum <= 3 && !isQualiSession && !isPracticeSession,
                teamColor: TEAM_COLOR_MAP[driver.TeamName] || 'rgba(255,255,255,0.9)',
                // Already took the chequered flag: that says more than the PIT/OUT
                // of the cool-down lap.
                chequered: !line.Retired && hasTakenChequered(num),
                statusLabel: line.Retired ? 'RETIRED' : line.InPit ? 'PIT' : line.PitOut ? 'OUT' : '',
                gapText: gapCellText(line, posNum, leaderBestMs, allowGapFallback),
                intervalText: intervalCellText(line, posNum, i > 0 ? rows[i - 1].line : null, allowGapFallback),
                lastLap,
                lapClass: timingClass(num, 'lap', lastLap.Value),
                bestLap,
                bestLapClass,
                shown,
                sectorView: displayedSectors(shown),
                sectorsBlanked: blankSectorsAfterPos != null && posNum > blankSectorsAfterPos,
            };

            return `
                <tr data-num="${num}" class="results-row ${line.Retired ? 'live-row--retired' : ''}${fastestRowClass}${isEliminated ? ' live-row--eliminated' : ''}${followedDriver === num ? ' is-followed' : ''}">
                    ${columns.map((c) => c.td(r)).join('')}
                </tr>
            `;
        });
        tbody2.innerHTML = withQualySeparators(rowHtmls, cutoffLines, tableColspan);
    }

    refreshTrackSectors();
    trackCarProgress();
    updatePositionOverlay();
}

// ── RACE CONTROL ──────────────────────────────────────────────────────────
// Race Control messages (the feed's RaceControlMessages topic): flags,
// SC/VSC, investigations, penalties, track limits, DRS. They go below the
// map, newest on top. The ones that arrive with the page open are
// highlighted for a moment (.is-new) so it's clear there's something new.
//
// The snapshot brings Messages as an array and deltas as an indexed object
// ({"12": {...}}); mergeState already combines them, here they're just sorted by index.
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

// In Q2/Q3 (and SQ2/SQ3) the list starts from scratch: only messages
// since the current segment started count. Since everything else (sector flags
// on the map, chequered flag, track limits counter) comes from
// here, the Q1 chequered flag doesn't keep "ending" the session in Q2 either.
function raceControlMessages() {
    const raw = state.RaceControlMessages && state.RaceControlMessages.Messages;
    if (!raw || typeof raw !== 'object') return [];
    const partStartMs = qualifyingPartStartMs();
    return Object.keys(raw)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => raw[key])
        .filter((m) => m && m.Message)
        .filter((m) => {
            if (partStartMs == null) return true;
            const ms = rcUtcMs(m.Utc);
            return ms == null || ms >= partStartMs;
        });
}

// A driver inside a message: "#16" as in the table (same
// driverNumberHTML(), team color) + surname. If the driver isn't
// in DriverList, the surname comes from the message's own code ("LEC").
function rcDriverHTML(number, fallbackCode) {
    const driver = (state.DriverList || {})[number] || {};
    const name = driver.LastName ? driver.LastName.toUpperCase() : (fallbackCode || driver.Tla || '');
    return `${driverNumberHTML(driver, number)}${name ? ` ${escapeHTML(name)}` : ''}`;
}

// F1 sends times in UTC without a time zone ("2026-09-19T12:03:22"): a Z is
// appended so they aren't read as local time. null if it can't be parsed.
function rcUtcMs(utc) {
    if (!utc) return null;
    const iso = /Z|[+-]\d\d:?\d\d$/.test(utc) ? utc : `${utc}Z`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
}

// Race start time: the first "Started" in SessionData.StatusSeries
// (F1's official time; a red flag with a restart adds another one, hence
// the first). If it's missing, the time the relay saw the session start.
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

// 5025000 ms → "1:23:45". No milliseconds: the chequered flag time
// arrives to the second, so more precision would be made up.
function formatDuration(ms) {
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Message time in UTC ("12:50"), in the same chip as the lap. Exactly
// as F1 sends it, not converted to local time. Empty if it can't be parsed.
function rcUtcTimeChip(utc) {
    const at = rcUtcMs(utc);
    if (at == null) return '';
    const date = new Date(at);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `<span class="rc-chip rc-chip--lap">${hh}:${mm}</span>`;
}

// F1 appends the time to the end of many messages: "IMPEDING (16:33:21)" or
// "... LAP 3 12:03:58". The lap or the time is already shown in its chip, so
// it's removed.
function rcStripTime(text) {
    return String(text).replace(/\s*(?:TIMED AT\s*)?\(?\b\d{1,2}:\d{2}:\d{2}\)?\s*$/i, '');
}

// Reason for an incident/penalty, with any cars it names in the same
// driver format: "IMPEDING CAR 14 (ALO)" → "IMPEDING #14 ALONSO".
function rcReasonHTML(reason) {
    const text = rcStripTime(reason);
    const pattern = /CARS? (\d+) \((\w+)\)/gi;
    let html = '';
    let lastIndex = 0;
    for (const found of text.matchAll(pattern)) {
        html += escapeHTML(text.slice(lastIndex, found.index));
        html += rcDriverHTML(found[1], found[2]);
        lastIndex = found.index + found[0].length;
    }
    return html + escapeHTML(text.slice(lastIndex));
}

// "23 (ALB) AND 55 (SAI)" → "#23 ALBON & #55 SAINZ".
function rcDriversHTML(carsText) {
    const cars = [...String(carsText).matchAll(/(\d+) \((\w+)\)/g)];
    if (cars.length === 0) return escapeHTML(carsText);
    return cars.map(([, number, code]) => rcDriverHTML(number, code)).join(' &amp; ');
}

// ── REWRITTEN MESSAGES ──
// F1's texts are long and technical. Each rule recognizes a type of
// message (match) and returns how to show it: { chip, html }. chip is the
// color label ({ label, cls }; if missing, rcChip()'s is used) and
// html the text (empty = label only). To add a new one, add
// an object to the list. `ctx` carries data that depends on earlier
// messages (e.g. how many track limits each car has). If no
// rule matches, the original message is shown. If show() returns null,
// the message isn't shown (the uninteresting ones).
const RC_REWRITES = [
    {
        // GREEN LIGHT - PIT EXIT OPEN → [GREEN LIGHT] PIT EXIT OPEN
        match: /^GREEN LIGHT - (.+)$/i,
        show: ([, rest]) => ({ chip: { label: 'Green light', cls: 'green' }, html: escapeHTML(rest) }),
    },
    {
        // CAR 16 (LEC) TIME 1:45.221 DELETED - TRACK LIMITS AT TURN 15 LAP 3 12:03:58
        //   Race/Sprint → [TRACK LIMITS] 1° WARNING | #16 LECLERC
        //   Practice/Qualifying → [TRACK LIMITS] LAP DELETED | #16 LECLERC
        // Warnings only count (and add up toward a penalty) in races.
        match: /^CAR (\d+) \((\w+)\) (?:TIME|LAP) .*DELETED - TRACK LIMITS/i,
        show: ([, number, code], ctx) => {
            const chip = { label: 'Track limits', cls: 'info' };
            if (!ctx.isRace) return { chip, html: `LAP DELETED | ${rcDriverHTML(number, code)}` };
            ctx.trackLimits[number] = (ctx.trackLimits[number] || 0) + 1;
            return { chip, html: `${ctx.trackLimits[number]}° WARNING | ${rcDriverHTML(number, code)}` };
        },
    },
    {
        // Lap deleted for any other reason (DOUBLE YELLOW, RED FLAG…):
        // CAR 5 (BOR) TIME 2:26.624 DELETED - DOUBLE YELLOW AT TURN 14 …
        // → not shown. It goes after the track limits rule, which already
        // caught those first.
        match: /^CAR \d+ \(\w+\) (?:TIME|LAP) .*DELETED\b/i,
        show: () => null,
    },
    {
        // FIRST CAR TO TAKE THE FLAG - CAR 5 (BOR) (or "…THE CHEQUERED FLAG") → not
        // shown (the CHEQUERED FLAG next to it already says it's over).
        match: /FIRST CAR TO TAKE (?:THE )?(?:CHEQUERED )?FLAG/i,
        show: () => null,
    },
    {
        // DOUBLE YELLOW IN TRACK SECTOR 11 → [DOUBLE YELLOW] SECTOR 11
        // (same for YELLOW and CLEAR: the label already says which flag it is)
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
        // (and ENDING, THROUGH THE PIT LANE, etc.: the full name goes in the
        // label and the rest of the message, as-is, as text)
        match: /^(VIRTUAL SAFETY CAR|SAFETY CAR) (.+)$/i,
        show: ([, kind, rest]) => ({ chip: { label: kind, cls: 'sc' }, html: escapeHTML(rest) }),
    },
    {
        // RED FLAG → [RED FLAG] (label only)
        match: /^RED FLAG$/i,
        show: () => ({ chip: { label: 'Red flag', cls: 'red' }, html: '' }),
    },
    {
        // CHEQUERED FLAG → [CHEQUERED FLAG] RACE DURATION: 1:23:45
        // Duration = flag time minus start time (see
        // sessionStartMs()). Only in Race/Sprint: in Practice/Qualifying the
        // session lasts as long as it lasts, so there it's just the label.
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
        // Incidents, with every variant F1 sends (with or without "FIA
        // STEWARDS:", with or without "TURN 1", and at any stage):
        // INCIDENT INVOLVING CARS 23 (ALB) AND 55 (SAI) NOTED - CAUSING A COLLISION
        //   → [INCIDENT NOTED] #23 ALBON & #55 SAINZ | CAUSING A COLLISION
        // INCIDENT INVOLVING CAR 12 (ANT) NOTED - IMPEDING CAR 14 (ALO)
        //   → [INCIDENT NOTED] #12 ANTONELLI | IMPEDING #14 ALONSO
        // FIA STEWARDS: INCIDENT INVOLVING CAR 12 (ANT) UNDER INVESTIGATION - IMPEDING
        //   → [UNDER INVESTIGATION] #12 ANTONELLI | IMPEDING
        match: /^(?:FIA STEWARDS: )?(?:TURN \d+ )?INCIDENT INVOLVING CARS? (.+?) (NOTED|UNDER INVESTIGATION|WILL BE INVESTIGATED AFTER THE (?:SESSION|RACE)|REVIEWED(?:,? NO FURTHER (?:INVESTIGATION|ACTION))?)(?: - (.+))?$/i,
        show: ([, cars, stage, reason]) => {
            const s = stage.toUpperCase();
            const label = s === 'NOTED' ? 'Incident noted'
                : s === 'UNDER INVESTIGATION' ? 'Under investigation'
                : s.startsWith('WILL BE INVESTIGATED') ? 'Investigation after session'
                : 'No further action';
            return {
                chip: { label, cls: 'info' },
                html: `${rcDriversHTML(cars)}${reason ? ` | ${rcReasonHTML(reason)}` : ''}`,
            };
        },
    },
    {
        // FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 55 (SAI) - CAUSING A COLLISION
        //   → [5 SECOND PENALTY] #55 SAINZ | CAUSING A COLLISION
        // The penalty type goes in the label ("TIME" is redundant: 5 SECOND TIME →
        // 5 SECOND). Works the same for DRIVE THROUGH, 10 SECOND STOP/GO, etc.
        match: /^FIA STEWARDS: (.+?) PENALTY FOR CAR (\d+) \((\w+)\)(?: - (.+))?$/i,
        show: ([, kind, number, code, reason]) => ({
            chip: { label: `${kind.replace(/\s+TIME$/i, '')} penalty`, cls: 'penalty' },
            html: `${rcDriverHTML(number, code)}${reason ? ` | ${rcReasonHTML(reason)}` : ''}`,
        }),
    },
];

// How each message is shown ({ message, chip, html }), in chronological
// order, without the hidden ones. It goes in order because the
// counters (like the track limits one) depend on what happened before.
function rcDisplayItems(messages) {
    const ctx = {
        trackLimits: {},
        isRace: currentSessionKind() === 'race',
        startMs: sessionStartMs(),
    };
    const items = [];
    for (const m of messages) {
        // The trailing time is removed BEFORE looking up the rule, so the
        // rules see the clean message (and the ones anchored with $ match).
        const text = rcStripTime(m.Message);
        const rule = RC_REWRITES.find((r) => r.match.test(text));
        if (!rule) {
            items.push({ message: m, chip: rcChip(m), html: escapeHTML(text) });
            continue;
        }
        const shown = rule.show(rule.match.exec(text), ctx, m);
        // null = uninteresting message: left out of the list.
        if (shown) items.push({ message: m, chip: shown.chip || rcChip(m), html: shown.html });
    }
    return items;
}

// Color label by message type. null = no label.
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
    // With Race Control visible the map shrinks to the size of the track and
    // leaves the rest of the column to it (see live.css, RACE CONTROL).
    const mapPanel = section.closest('.mapview-panel--map');
    if (mapPanel) {
        mapPanel.classList.toggle('has-race-control', !section.hidden);
        // Track map off: the map is hidden and only the strip with
        // the buttons remains. With both panels off, the table takes the full
        // width (see live.css, PANELS ON/OFF).
        mapPanel.classList.toggle('map-off', !view.cols.trackMap);
    }
    const app = document.getElementById('live-map-view-content');
    if (app) app.classList.toggle('no-side', !view.cols.trackMap && !view.cols.raceControl);
    if (section.hidden) return;

    // The texts are computed over ALL of the session's messages (the
    // counters, like the track limits one, need the earlier ones) and
    // only afterwards trimmed to the latest RC_MAX_MESSAGES.
    const allMessages = raceControlMessages();
    const startMs = sessionStartMs();
    const sessionKind = currentSessionKind();
    // The start time and the session type go into the signature: the CHEQUERED FLAG
    // duration and the track limits format depend on them.
    const last = allMessages[allMessages.length - 1];
    const signature = `${startMs}|${sessionKind}|` + (last
        ? `${allMessages.length}|${last.Utc}|${last.Message}`
        : 'empty');
    if (signature === rcLastSignature) return;
    rcLastSignature = signature;

    // Hidden messages (see RC_REWRITES) are no longer in items.
    const items = rcDisplayItems(allMessages).slice(-RC_MAX_MESSAGES);
    if (items.length === 0) {
        list.innerHTML = '<li class="rc-empty">No race control messages yet</li>';
        return;
    }

    list.innerHTML = items.map(({ message: m, chip, html }) => {
        const id = `${m.Utc}|${m.Message}`;
        const isNew = rcPrimed && !rcSeen.has(id);
        rcSeen.add(id);
        // The lap ("L 14") as one more label. Only if the message has no
        // lap, the message time in UTC ("12:50").
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
    // Whatever was already there when the page opened isn't highlighted: only what arrives
    // afterwards.
    rcPrimed = true;
}

// ── TRACK MAP ─────────────────────────────────────────────────────────────
// Position.z carries each car's position in the track's coordinate
// system (not in pixels of any image). Previously the dots were placed
// on top of the official PNG by stretching a bounding box built from whatever
// arrived: the PNG is rotated and has margins at the designer's whim, so
// the cars never landed on the drawn track.
//
// Now the track is drawn in SVG with the layout from the MultiViewer API
// (the same one f1-dash uses), which comes in THAT SAME coordinate
// system: the cars are drawn with the same numbers and the same
// rotation, so they land exactly on the line. If the API doesn't
// respond, the usual PNG stays, without cars (misplaced ones confuse
// more than they help).
const TRACK_API_URL = 'https://api.multiviewer.app/api/v1/circuits';

let trackMap = null;          // geometry already rotated, ready to draw
let trackMapRequestId = null; // "circuit/year" requested (avoids requesting it twice)

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

// Circuits the API doesn't have (it starts in 2018, so Sepang isn't there):
// the same format, built from a real lap in the archived Position.z, in
// data/track-layouts/{Circuit.Key}.json.
function fetchLocalTrackData(key) {
    return fetch(`./data/track-layouts/${key}.json`)
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        });
}

// Requests the layout of the session's circuit (once per circuit and
// year). If the session's year isn't loaded in the API yet, it tries
// the previous one: the layout almost never changes from one year to the next.
// If the API doesn't have the circuit at all, it uses the local layout.
function loadTrackMap() {
    const target = sessionCircuitTarget();
    if (!target) return;
    const requestId = `${target.key}/${target.year}`;
    if (trackMapRequestId === requestId) return;
    trackMapRequestId = requestId;

    fetchTrackData(target.key, target.year)
        .catch(() => fetchTrackData(target.key, target.year - 1))
        .catch(() => fetchLocalTrackData(target.key))
        .then((data) => {
            if (trackMapRequestId !== requestId) return; // the session changed in the meantime
            trackMap = buildTrackGeometry(data);
            trackSectorShares = null; // circuito nuevo: sectores de nuevo
            drawTrackMap();
            refreshTrackSectors(); // if there are sector times already, paint them right away
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

// Everything drawn (track, corners, cars) goes through toView(): the circuit's
// rotation + inverted Y (in F1 Y grows upwards; in SVG,
// downwards). Sizes (track width, dots, text) come from the
// circuit's size, so they look the same in Monaco as in Spa.
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

    // Each corner's number, shifted off the track in the
    // direction the API indicates (angle is in the original system, so
    // the shift is done before rotating).
    // Corners: where each one is and which side is "outside" (angle,
    // in the original system, turned into an already rotated vector). The number is
    // only placed when drawing (placeCornerLabels), which is where the
    // real on-screen size is known.
    const corners = (data.corners || [])
        .filter((c) => c && c.trackPosition)
        .map((c) => {
            const rad = ((Number(c.angle) || 0) * Math.PI) / 180;
            const at = toView(c.trackPosition.x, c.trackPosition.y);
            const ahead = toView(c.trackPosition.x + Math.cos(rad), c.trackPosition.y + Math.sin(rad));
            const len = Math.hypot(ahead.x - at.x, ahead.y - at.y) || 1;
            return { number: c.number, at, dir: { x: (ahead.x - at.x) / len, y: (ahead.y - at.y) / len } };
        });

    // Time of each point within the reference lap, normalized to
    // 0..1 (trackPositionTime comes in session seconds). If missing,
    // the position in the array is used, which for an evenly sampled lap is
    // almost the same.
    const rawTimes = Array.isArray(data.trackPositionTime) && data.trackPositionTime.length === points.length
        ? data.trackPositionTime.map(Number)
        : null;
    const t0 = rawTimes ? rawTimes[0] : 0;
    const tSpan = rawTimes ? (rawTimes[rawTimes.length - 1] - t0) || 1 : 1;
    const lapFractions = rawTimes
        ? rawTimes.map((t) => (t - t0) / tSpan)
        : points.map((_, i) => i / (points.length - 1));

    // Lap fraction (in time) → point on the track, interpolating between
    // the two layout points around it.
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

    // Stretch of track between two lap fractions (to paint sectors):
    // the layout points that fall inside, plus the two exact ends.
    // Marshal sectors (the ones in "YELLOW IN TRACK SECTOR 11"): the API
    // gives where each one starts; each sector runs from that point to the
    // start of the next, following the layout.
    const nearestIndex = (p) => {
        let best = 0;
        let bestDist = Infinity;
        points.forEach((q, i) => {
            const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
            if (d < bestDist) { bestDist = d; best = i; }
        });
        return best;
    };
    const marshalStarts = (data.marshalSectors || [])
        .filter((s) => s && s.trackPosition && Number.isFinite(Number(s.number)))
        .map((s) => ({ number: Number(s.number), index: nearestIndex(toView(s.trackPosition.x, s.trackPosition.y)) }))
        .sort((a, b) => a.index - b.index);
    const marshalSegments = {};
    marshalStarts.forEach((s, i) => {
        const next = marshalStarts[(i + 1) % marshalStarts.length];
        const segment = [];
        for (let k = s.index; segment.length <= points.length; k = (k + 1) % points.length) {
            segment.push(points[k]);
            if (k === next.index && segment.length > 1) break;
        }
        marshalSegments[s.number] = segment;
    });

    const lapSegmentPoints = (from, to) => [
        pointAtLapFraction(from),
        ...points.filter((_, i) => lapFractions[i] > from && lapFractions[i] < to),
        pointAtLapFraction(to),
    ];

    return {
        toView,
        rotation: angle,
        points,
        corners,
        pointAtLapFraction,
        lapSegmentPoints,
        marshalSegments,
        refLapMs: refLapSeconds > 0 ? refLapSeconds * 1000 : null,
        viewBox: [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2],
        span,
    };
}

function trackPathD(points, closed = true) {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return closed ? `${d} Z` : d;
}

// Track direction at layout point `index` (unit vector).
function trackDirection(points, index) {
    const a = points[index];
    const b = points[(index + 3) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

// A real chequered flag on the start line (the first point of the
// layout: the reference lap starts at the finish line): a grid of
// alternating black and white squares, `cols` along the track and
// `rows` across it, rotated to follow the straight.
function startFlagHTML(points, cell, cols = 3, rows = 6) {
    const a = points[0];
    const dir = trackDirection(points, 0);
    const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const x0 = (-cols / 2) * cell;
    const y0 = (-rows / 2) * cell;
    let squares = '';
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const cls = (c + r) % 2 === 0 ? 'track-flag-white' : 'track-flag-black';
            squares += `<rect class="${cls}" x="${(x0 + c * cell).toFixed(1)}" y="${(y0 + r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}"></rect>`;
        }
    }
    return `<g class="track-flag" transform="translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${angle.toFixed(1)})">${squares}</g>`;
}

// Small arrow showing the direction of travel: beside the chequered
// flag, pointing along the straight. It goes on the side of the track with
// more free space (the start straight often has another stretch nearby).
// `gap` = how far it sits from the center of the track.
function directionArrowPoints(points, size, gap) {
    const p = points[0];
    const dir = trackDirection(points, 0);
    const clearance = (sign) => {
        const cx = p.x - dir.y * gap * sign;
        const cy = p.y + dir.x * gap * sign;
        return Math.min(...points.map((q) => Math.hypot(q.x - cx, q.y - cy)));
    };
    const sign = clearance(1) >= clearance(-1) ? 1 : -1;
    const side = { x: -dir.y * sign, y: dir.x * sign };
    const cx = p.x + side.x * gap;
    const cy = p.y + side.y * gap;
    // A long, narrow arrow (tip + notched tail), easy to read even
    // when tiny; a triangle as wide as it was long read as a "▼".
    const at = (along, across) => ({ x: cx + dir.x * size * along + side.x * size * across, y: cy + dir.y * size * along + side.y * size * across });
    const shape = [at(1.4, 0), at(-0.2, 0.7), at(0.1, 0), at(-0.2, -0.7)];
    return shape.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
}

// ── MAP SECTORS ──
// The map paints S1 / S2 / S3 like the official map. Where each
// sector ends comes from the session's sector times (median across all
// cars with all three times), turned into a lap fraction, just like
// the cars' estimated position. It's fixed the first time there's data
// (recomputing it every lap would make the boundaries "dance"). Without data, the
// track is a single color.
let trackSectorShares = null;

function sessionSectorShares() {
    const lines = (state.TimingData && state.TimingData.Lines) || {};
    const shares = [];
    for (const line of Object.values(lines)) {
        const ms = getSectorTimes(line).map((s) => lapTimeToMs(s && s.value));
        if (ms.every((v) => v != null && v > 0)) {
            const total = ms[0] + ms[1] + ms[2];
            shares.push(ms.map((v) => v / total));
        }
    }
    if (shares.length === 0) return null;
    const median = (values) => {
        const sorted = values.slice().sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    };
    const raw = [0, 1, 2].map((s) => median(shares.map((x) => x[s])));
    const total = raw[0] + raw[1] + raw[2];
    return raw.map((v) => v / total);
}

// Called from render(): the first time there are sector times,
// it redraws the track with colored sectors.
function refreshTrackSectors() {
    if (!trackMap || trackSectorShares) return;
    const shares = sessionSectorShares();
    if (!shares) return;
    trackSectorShares = shares;
    drawTrackMap();
    updatePositionOverlay();
}

// SVG units per screen pixel. Map sizes
// (track width, corner numbers, cars) are thought of in pixels, so they
// look the same on a small map as on a large one. With "meet" the tighter side
// wins; if the container has no height yet (the SVG gives it its height
// in "fit" mode), the width wins.
function trackUnitsPerPx(element, viewBox) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const byWidth = viewBox[2] / rect.width;
    return rect.height > 0 ? Math.max(byWidth, viewBox[3] / rect.height) : byWidth;
}

// Distance from a point to the layout (to the segments between points, not just to
// the points: otherwise a number could end up on the line between two).
function distanceToTrack(p, points) {
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
        if (d < best) best = d;
    }
    return best;
}

// Index of the layout segment closest to a point.
function nearestTrackSegment(p, points) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
}

// Places each corner's number like the official map: as close as
// possible to its corner, on whichever side has room, and always on the side of ITS
// corner (the stretch of track closest to the number has to be that
// corner's; otherwise a number could end up on the other side of a straight, next
// to another corner).
//
// For each corner a list of possible spots is built (24 directions, at
// increasing distances), sorted from best to worst: closest first and, at
// equal distance, the side the API indicates. Then they're placed in order and,
// if a corner can't find a free spot, it backtracks and the previous one
// tries its next option (5 makes room for 6). With a cap on
// attempts: if that's not enough, they're placed one by one as best as possible.
function placeCornerLabels(corners, points, upx) {
    const labelRadius = 9 * upx;       // the number's circle
    const trackHalf = 7.2 * upx;       // half the track width with its border
    const clearTrack = trackHalf + labelRadius + 1.5 * upx;
    const clearLabel = labelRadius * 2 + 2 * upx;
    const rings = [0, 5, 11, 18, 26].map((extra) => clearTrack + (0.5 + extra) * upx);
    const directions = Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12);
    const window = Math.max(6, Math.round(points.length * 0.03));
    const circularGap = (a, b) => {
        const d = Math.abs(a - b) % points.length;
        return Math.min(d, points.length - d);
    };

    const options = corners.map((c) => {
        const preferred = Math.atan2(c.dir.y, c.dir.x);
        const own = nearestTrackSegment(c.at, points);
        const deviation = (angle) => {
            const d = Math.abs(angle - preferred) % (2 * Math.PI);
            return d > Math.PI ? 2 * Math.PI - d : d;
        };
        const list = [];
        rings.forEach((ring, ringIndex) => {
            directions.forEach((angle) => {
                const p = { x: c.at.x + Math.cos(angle) * ring, y: c.at.y + Math.sin(angle) * ring };
                if (distanceToTrack(p, points) < clearTrack) return;
                if (circularGap(nearestTrackSegment(p, points), own) > window) return;
                list.push({ ...p, cost: ringIndex * 10 + deviation(angle) });
            });
        });
        list.sort((a, b) => a.cost - b.cost);
        // Last resort: right against the API's side (in case nothing is free).
        list.push({ x: c.at.x + c.dir.x * rings[0], y: c.at.y + c.dir.y * rings[0], cost: Infinity, fallback: true });
        return list;
    });

    const fits = (p, placed) => p.fallback || placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= clearLabel);

    // Backtracking search, capped so it never hangs.
    const placed = [];
    const choice = new Array(corners.length).fill(-1);
    let steps = 0;
    let i = 0;
    while (i < corners.length && steps < 20000) {
        steps++;
        let next = choice[i] + 1;
        while (next < options[i].length && (options[i][next].fallback || !fits(options[i][next], placed))) next++;
        if (next < options[i].length) {
            choice[i] = next;
            placed[i] = options[i][next];
            i++;
        } else if (i === 0) {
            break;
        } else {
            choice[i] = -1;
            placed.length = i - 1;
            i--;
        }
    }

    // If the search didn't finish, each one keeps the best spot it finds.
    if (i < corners.length) {
        placed.length = 0;
        options.forEach((list) => placed.push(list.find((p) => fits(p, placed)) || list[list.length - 1]));
    }
    return corners.map((c, k) => ({ number: c.number, x: placed[k].x, y: placed[k].y }));
}

// Draws the track (once per circuit, plus once when the sectors
// arrive and again if the size changes) and switches between SVG and PNG.
function drawTrackMap(isRetry = false) {
    const host = document.getElementById('circuit-position-overlay');
    const wrap = document.getElementById('circuit-map-wrap');
    if (!host || !wrap) return;

    wrap.classList.toggle('has-track', !!trackMap);
    // Compass and wind depend on the circuit's rotation.
    updateWindOverlay();
    if (!trackMap) {
        host.innerHTML = '';
        return;
    }

    const { points, corners, viewBox, span } = trackMap;
    const upx = trackUnitsPerPx(host, viewBox) || span / 500;
    trackMap.unitsPerPx = upx;
    const w = 6 * upx;
    // The colored line goes a bit thinner than w, inside the same border.
    const lineW = 3 * upx;

    // Track: border + line. With sectors, the line goes in three colored
    // stretches; without sectors, a single neutral stretch.
    let lineHTML;
    if (trackSectorShares) {
        const [s1, s2] = trackSectorShares;
        const bounds = [[0, s1], [s1, s1 + s2], [s1 + s2, 1]];
        lineHTML = bounds.map(([from, to], i) =>
            `<path class="track-sector track-sector--s${i + 1}" d="${trackPathD(trackMap.lapSegmentPoints(from, to), false)}" style="stroke-width:${lineW.toFixed(1)}"></path>`,
        ).join('');
    } else {
        lineHTML = `<path class="track-line" d="${trackPathD(points)}" style="stroke-width:${lineW.toFixed(1)}"></path>`;
    }

    const labels = placeCornerLabels(corners, points, upx);
    host.innerHTML = `
        <svg class="track-svg" viewBox="${viewBox.map((v) => v.toFixed(1)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Track map">
            <!-- Thin white edge around the border (2px per side). -->
            <path class="track-edge" d="${trackPathD(points)}" style="stroke-width:${(w * 2.4 + 4 * upx).toFixed(1)}"></path>
            <path class="track-outline" d="${trackPathD(points)}" style="stroke-width:${(w * 2.4).toFixed(1)}"></path>
            ${lineHTML}
            <!-- SC / VSC / red flag: the whole track gets tinted (see
                 updateTrackStatus). -->
            <path class="track-status-line" d="${trackPathD(points)}" style="stroke-width:${lineW.toFixed(1)}"></path>
            <!-- Yellow flags per marshal sector (updateTrackFlags), on the line itself. -->
            <g class="track-flags" style="stroke-width:${lineW.toFixed(1)}"></g>
            ${startFlagHTML(points, w * 0.7)}
            <polygon class="track-direction" points="${directionArrowPoints(points, w * 1.6, w * 4)}"></polygon>
            <g class="track-corners">
                ${labels.map((c) => `
                    <g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})">
                        <circle r="${(9 * upx).toFixed(1)}" style="stroke-width:${upx.toFixed(2)}"></circle>
                        <text style="font-size:${(9 * upx).toFixed(1)}px">${c.number}</text>
                    </g>`).join('')}
            </g>
            <!-- Battles on track: stretch between cars less than 1 s apart (updateBattles). -->
            <g class="track-battles" style="stroke-width:${(w * 0.45).toFixed(1)}"></g>
            <g class="track-cars"></g>
        </svg>`;
    trackFlagsSignature = null; // capas nuevas: redibujar banderas
    updateTrackAnnotations();

    // With the SVG in place its real size is known (the max height may
    // shrink it): if the scale was different, it redraws once with the right one.
    const svg = host.querySelector('.track-svg');
    const realUpx = svg && trackUnitsPerPx(svg, viewBox);
    if (!isRetry && realUpx && Math.abs(realUpx - upx) / upx > 0.08) drawTrackMap(true);
}

// If the window size changes, the scale changes: it redraws so that
// numbers and cars keep the same on-screen size.
let trackResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(trackResizeTimer);
    trackResizeTimer = setTimeout(() => {
        if (!trackMap) return;
        drawTrackMap();
        updatePositionOverlay();
    }, 150);
});

// ── WIND ON THE MAP ───────────────────────────────────────────────────────
// F1's coordinate system is oriented to the north: X = east,
// Y = north (compared against the real geographic layout of the 24
// circuits on the calendar: all match within 3°, none
// mirrored). So the map's north is that axis with the same MultiViewer
// rotation applied to the track.
//
// Compass: always visible with the map, top left.
// Wind: thin lines crossing the map in the direction it blows, only if it
// exceeds WIND_MIN_MS. More wind = faster and slightly more visible.
const WIND_MIN_MS = 3;       // ~11 km/h: below this, it doesn't even animate
const WIND_STREAKS = 14;

// On-screen angle (degrees, 0 = right, clockwise) of a
// geographic vector (x = east, y = north), with the map's rotation.
function screenAngleOfGeoVector(gx, gy) {
    const rad = ((trackMap && trackMap.rotation) || 0) * Math.PI / 180;
    const vx = gx * Math.cos(rad) - gy * Math.sin(rad);
    const vy = gy * Math.cos(rad) + gx * Math.sin(rad);
    return Math.atan2(-vy, vx) * 180 / Math.PI; // -vy: in SVG Y grows downwards
}

// Dial ticks, one every 5°, with four lengths like a real compass:
// cardinal points (every 90°) the longest, every 45° medium, every 15° short
// and the rest very short and faint. Built only once.
function buildCompassTicks(compass) {
    const group = compass.querySelector('.track-compass-ticks');
    if (!group || group.childElementCount) return;
    const outer = 15.5;
    let html = '';
    for (let deg = 0; deg < 360; deg += 5) {
        const kind = deg % 90 === 0 ? 'cardinal' : deg % 45 === 0 ? 'major' : deg % 15 === 0 ? 'minor' : 'fine';
        const inner = { cardinal: 11, major: 12.4, minor: 13.6, fine: 14.4 }[kind];
        const rad = (deg * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = -Math.cos(rad); // 0° = arriba
        html += `<line class="track-compass-tick track-compass-tick--${kind}" x1="${(sin * outer).toFixed(2)}" y1="${(cos * outer).toFixed(2)}" x2="${(sin * inner).toFixed(2)}" y2="${(cos * inner).toFixed(2)}"></line>`;
    }
    group.innerHTML = html;
}

function updateCompass() {
    const compass = document.getElementById('track-compass');
    if (!compass) return;
    compass.hidden = !trackMap;
    if (!trackMap) return;

    buildCompassTicks(compass);

    // Only the dial rotates (ticks + red tip), which at rest points
    // up (-90°); the disc and the N in the center stay still and upright.
    const north = screenAngleOfGeoVector(0, 1);
    const dial = compass.querySelector('.track-compass-dial');
    if (dial) dial.setAttribute('transform', `rotate(${(north + 90).toFixed(1)})`);
}

// The lines are created only once, with random length, height and delay, so
// they don't all come out together or in a row.
function ensureWindStreaks(field) {
    if (field.childElementCount) return;
    for (let i = 0; i < WIND_STREAKS; i++) {
        const streak = document.createElement('span');
        streak.className = 'track-wind-streak';
        streak.style.top = `${(4 + Math.random() * 92).toFixed(1)}%`;
        streak.style.setProperty('--len', `${Math.round(40 + Math.random() * 70)}px`);
        streak.style.setProperty('--delay', `${(-Math.random() * 6).toFixed(2)}s`);
        streak.style.setProperty('--jitter', (0.75 + Math.random() * 0.5).toFixed(2));
        field.appendChild(streak);
    }
}

function updateWindOverlay() {
    updateCompass();
    const overlay = document.getElementById('track-wind');
    if (!overlay) return;

    const w = state.WeatherData;
    const speed = w ? Number(w.WindSpeed) : NaN;      // m/s
    const from = w ? Number(w.WindDirection) : NaN;   // degrees, where it blows from
    const active = !!trackMap && Number.isFinite(speed) && Number.isFinite(from) && speed >= WIND_MIN_MS;
    overlay.hidden = !active;
    if (!active) return;

    const field = overlay.querySelector('.track-wind-field');
    ensureWindStreaks(field);

    // It blows TOWARD the opposite side from where it comes (meteorological direction).
    const toward = (from + 180) * Math.PI / 180;
    const angle = screenAngleOfGeoVector(Math.sin(toward), Math.cos(toward));
    // 3 m/s → crosses in ~5 s; 12 m/s or more → in ~1.5 s.
    const duration = Math.max(1.5, Math.min(5, 15 / speed));
    const opacity = Math.max(0.18, Math.min(0.4, speed / 30));
    field.style.setProperty('--wind-angle', `${angle.toFixed(1)}deg`);
    field.style.setProperty('--wind-duration', `${duration.toFixed(2)}s`);
    field.style.setProperty('--wind-opacity', opacity.toFixed(2));
}

// ── MAP ANNOTATIONS: banderas, estado de pista, peleas, seguir, tooltip ───

// Active yellow flags per marshal sector, based on the
// Race Control messages in order: "YELLOW / DOUBLE YELLOW IN TRACK
// SECTOR n" turns the stretch on, "CLEAR IN TRACK SECTOR n" turns it off, and a
// TRACK CLEAR / red flag / chequered flag turns everything off.
// Returns { sector number: 'yellow' | 'double' }.
//
// Only while the session is running, and nothing after the chequered flag:
// Race Control keeps showing yellows while cars or cranes are removed from
// the track after the session has ended, and those never get their CLEAR (the
// feed stops sending). Previously they stayed on forever, with the
// track at TRACK CLEAR (happened in Baku FP2: sectors 2 and 11).
function activeSectorFlags() {
    const flags = {};
    if (!sessionIsRunning()) return flags;
    for (const m of raceControlMessages()) {
        if (String(m.Flag || '').toUpperCase() === 'CHEQUERED' || /^CHEQUERED FLAG/i.test(String(m.Message || ''))) {
            return {};
        }
        const flag = String(m.Flag || '').toUpperCase();
        const text = String(m.Message || '').toUpperCase();
        let sector = m.Scope === 'Sector' && Number.isFinite(Number(m.Sector)) ? Number(m.Sector) : null;
        let kind = flag;
        if (sector == null) {
            const found = /^(DOUBLE YELLOW|YELLOW|CLEAR) IN TRACK SECTOR (\d+)/.exec(text);
            if (found) { kind = found[1]; sector = Number(found[2]); }
        }
        if (sector != null) {
            if (kind === 'DOUBLE YELLOW') flags[sector] = 'double';
            else if (kind === 'YELLOW') flags[sector] = 'yellow';
            else if (kind === 'CLEAR' || kind === 'GREEN') delete flags[sector];
            continue;
        }
        const clearsAll = (m.Scope === 'Track' && (flag === 'CLEAR' || flag === 'GREEN' || flag === 'RED' || flag === 'CHEQUERED'))
            || /^TRACK CLEAR/.test(text) || text === 'RED FLAG' || text === 'CHEQUERED FLAG';
        if (clearsAll) Object.keys(flags).forEach((k) => delete flags[k]);
    }
    return flags;
}

let trackFlagsSignature = null;

function updateTrackFlags() {
    const layer = document.querySelector('#circuit-position-overlay .track-flags');
    if (!layer || !trackMap) return;
    const flags = activeSectorFlags();
    const signature = JSON.stringify(flags);
    if (signature === trackFlagsSignature) return;
    trackFlagsSignature = signature;
    layer.innerHTML = Object.entries(flags)
        .filter(([sector]) => trackMap.marshalSegments[sector])
        .map(([sector, kind]) => `<path class="track-flag-sector track-flag-sector--${kind}" d="${trackPathD(trackMap.marshalSegments[sector], false)}"></path>`)
        .join('');
}

// Track status, in the bottom-left corner of the map: the most
// important thing happening, in this order: red flag, SC, VSC, double
// yellow, yellow and, once the session has ended, chequered flag. With the
// track clear, the corner stays empty.
// With SC / VSC / red, the whole track is also tinted (yellow or red,
// with a soft pulse). TrackStatus: 2 = yellow, 4 = SC, 5 = red,
// 6 = VSC, 7 = VSC ending.
const TRACK_STATUS_TINTS = {
    4: { cls: 'sc', text: 'Safety car' },
    6: { cls: 'vsc', text: 'Virtual safety car' },
    7: { cls: 'vsc', text: 'VSC ending' },
    5: { cls: 'red', text: 'Red flag' },
};

function sessionEnded() {
    const status = state.SessionStatus && state.SessionStatus.Status;
    if (status === 'Finished' || status === 'Finalised' || status === 'Ends') return true;
    return raceControlMessages().some((m) => String(m.Flag || '').toUpperCase() === 'CHEQUERED');
}

// "SECTOR 11" / "SECTORS 10, 11" with the stretches for that flag type.
function sectorsLabel(flags, kind) {
    const sectors = Object.keys(flags).filter((s) => flags[s] === kind).map(Number).sort((a, b) => a - b);
    if (sectors.length === 0) return '';
    return `${sectors.length === 1 ? 'Sector' : 'Sectors'} ${sectors.join(', ')}`;
}

function currentTrackBadge() {
    const status = String((state.TrackStatus && state.TrackStatus.Status) || '');
    const tint = TRACK_STATUS_TINTS[status];
    if (tint) return { cls: tint.cls, text: tint.text, detail: '' };

    const flags = activeSectorFlags();
    const doubles = sectorsLabel(flags, 'double');
    if (doubles) return { cls: 'yellow', text: 'Double yellow', detail: doubles };
    const yellows = sectorsLabel(flags, 'yellow');
    if (yellows || status === '2') return { cls: 'yellow', text: 'Yellow flag', detail: yellows };

    if (sessionEnded()) return { cls: 'chequered', text: 'Chequered flag', detail: '' };
    return null;
}

function updateTrackStatus() {
    const wrap = document.getElementById('circuit-map-wrap');
    const badge = document.getElementById('track-status-banner');
    if (!wrap) return;
    const status = String((state.TrackStatus && state.TrackStatus.Status) || '');
    const tint = trackMap ? TRACK_STATUS_TINTS[status] : null;
    ['sc', 'vsc', 'red'].forEach((cls) => wrap.classList.toggle(`track-status--${cls}`, !!tint && tint.cls === cls));
    if (!badge) return;

    const info = trackMap ? currentTrackBadge() : null;
    badge.hidden = !info;
    if (!info) return;
    badge.className = `track-status-banner track-status-banner--${info.cls}`;
    badge.innerHTML = `<span class="track-status-banner-text">${escapeHTML(info.text)}</span>`
        + (info.detail ? `<span class="track-status-banner-detail">${escapeHTML(info.detail)}</span>` : '');
}

// Everything that depends on messages / status (not on positions): called
// on every render and when the track is drawn.
function updateTrackAnnotations() {
    updateTrackFlags();
    updateTrackStatus();
}

// Battles on track (Race/Sprint only): two consecutive cars less than
// BATTLE_GAP_SECONDS apart are marked by highlighting the stretch of track between them
// (following the layout, not in a straight line: a straight line cut across the inside
// of the circuit). The interval is the feed's real one; the dots are estimated.
const BATTLE_GAP_SECONDS = 1;

function battleIntervalSeconds(line, aheadLine) {
    const fromFeed = gapSeconds(intervalToAheadValue(line));
    if (fromFeed != null) return fromFeed;
    const gap = gapSeconds(gapToLeaderValue(line));
    const aheadGap = Number(aheadLine.Position) === 1 ? 0 : gapSeconds(gapToLeaderValue(aheadLine));
    return gap != null && aheadGap != null ? gap - aheadGap : null;
}

// Index of the layout point closest to a map position.
function nearestTrackIndex(p) {
    const points = trackMap.points;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
        const d = (points[i].x - p.x) ** 2 + (points[i].y - p.y) ** 2;
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
}

// Stretch of the layout from the car behind to the car ahead, following
// the track (forwards, wrapping around if it crosses the line). null if it's
// longer than BATTLE_MAX_LAP_SHARE: with estimated positions two cars
// 0.6 s apart can end up drawn far from each other, and a huge stretch is confusing.
const BATTLE_MAX_LAP_SHARE = 0.08;

function battleSegment(behind, ahead) {
    const points = trackMap.points;
    const from = nearestTrackIndex(behind);
    const to = nearestTrackIndex(ahead);
    const steps = (to - from + points.length) % points.length;
    if (steps === 0 || steps > points.length * BATTLE_MAX_LAP_SHARE) return null;
    const segment = [behind];
    for (let k = 1; k < steps; k++) segment.push(points[(from + k) % points.length]);
    segment.push(ahead);
    return segment;
}

function updateBattles(positions) {
    const layer = document.querySelector('#circuit-position-overlay .track-battles');
    if (!layer) return;
    if (currentSessionKind() !== 'race') {
        layer.innerHTML = '';
        return;
    }
    const lines = (state.TimingData && state.TimingData.Lines) || {};
    const order = Object.keys(lines)
        .filter((num) => lines[num] && Number(lines[num].Position) > 0)
        .sort((a, b) => Number(lines[a].Position) - Number(lines[b].Position));
    let html = '';
    for (let i = 1; i < order.length; i++) {
        const num = order[i];
        const ahead = order[i - 1];
        if (!positions[num] || !positions[ahead]) continue;
        const interval = battleIntervalSeconds(lines[num], lines[ahead]);
        if (interval == null || interval < 0 || interval >= BATTLE_GAP_SECONDS) continue;
        const segment = battleSegment(positions[num], positions[ahead]);
        if (segment) html += `<path class="track-battle" d="${trackPathD(segment, false)}"></path>`;
    }
    layer.innerHTML = html;
}

// Follow a driver: click their row in the table or their car on the map. Their
// dot grows with a ring, the rest dim and the row stays
// highlighted. Another click releases it.
let followedDriver = null;

function setFollowedDriver(num) {
    followedDriver = followedDriver === num ? null : num;
    document.querySelectorAll('#live-rows-2 tr[data-num]').forEach((tr) => {
        tr.classList.toggle('is-followed', tr.dataset.num === followedDriver);
    });
    updatePositionOverlay();
}

// Tooltip when hovering over a car: number and surname, position, gap
// and tyre. It follows the car as it moves.
let tooltipDriver = null;

function tooltipHTML(num) {
    const driver = (state.DriverList || {})[num] || {};
    const line = ((state.TimingData && state.TimingData.Lines) || {})[num] || {};
    const appLine = ((state.TimingAppData && state.TimingAppData.Lines) || {})[num];
    const pos = line.Position ? `P${escapeHTML(line.Position)}` : '';
    const gap = Number(line.Position) === 1 ? 'Leader' : (formatGap(gapToLeaderValue(line)) || '');
    const name = driver.LastName ? driver.LastName.toUpperCase() : driverCode(driver, num);
    return `
        <div class="track-tooltip-name">${driverNumberHTML(driver, num)} ${escapeHTML(name)}</div>
        <div class="track-tooltip-info">
            ${pos ? `<span>${pos}</span>` : ''}
            ${gap ? `<span>${escapeHTML(gap)}</span>` : ''}
            <span class="track-tooltip-tyre">${tyreCompoundBadgeHTML(appLine)}</span>
        </div>`;
}

function updateTooltip() {
    const tooltip = document.getElementById('track-tooltip');
    const wrap = document.getElementById('circuit-map-wrap');
    if (!tooltip || !wrap) return;
    const car = tooltipDriver && document.querySelector(`#circuit-position-overlay .track-car[data-num="${tooltipDriver}"]`);
    if (!car) {
        tooltip.hidden = true;
        return;
    }
    tooltip.innerHTML = tooltipHTML(tooltipDriver);
    tooltip.hidden = false;
    const dot = car.querySelector('.track-car-dot').getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    tooltip.style.left = `${dot.left + dot.width / 2 - box.left}px`;
    tooltip.style.top = `${dot.top - box.top}px`;
}

function initMapInteractions() {
    const overlay = document.getElementById('circuit-position-overlay');
    const rows = document.getElementById('live-rows-2');
    if (overlay) {
        overlay.addEventListener('mouseover', (e) => {
            const car = e.target.closest('.track-car');
            if (car) { tooltipDriver = car.dataset.num; updateTooltip(); }
        });
        overlay.addEventListener('mouseout', (e) => {
            const car = e.target.closest('.track-car');
            if (car && !car.contains(e.relatedTarget)) { tooltipDriver = null; updateTooltip(); }
        });
        overlay.addEventListener('click', (e) => {
            const car = e.target.closest('.track-car');
            if (car) setFollowedDriver(car.dataset.num);
        });
    }
    if (rows) {
        rows.addEventListener('click', (e) => {
            const tr = e.target.closest('tr[data-num]');
            if (tr) setFollowedDriver(tr.dataset.num);
        });
    }
}

// The newest Position.z sample (by Timestamp, not by position in
// the array: a batch can contain several).
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
// F1 only sends Position.z (each car's real position) to connections with
// an F1 TV account, so it never reaches the relay. What does arrive are the
// TimingData mini-sectors: each one goes from 0 to a color the moment
// the car completes it. From that we know, for each car, the last
// checkpoint it passed (~25 per lap), and it's placed there.
//
// Everything is in "lap fraction measured in time": the 3 sectors are
// split according to that car's sector times, and the mini-sectors in
// equal parts within each sector. The MultiViewer layout is a
// real lap with the time of each point, so time fraction →
// point on the track is direct (TRACK MAP, pointAtLapFraction()).
//
// Between one checkpoint and the next the car advances at the pace of its
// last lap, never going past the next mini-sector: if the data
// arrives late, it waits there instead of getting ahead.
//
// If a sector has no mini-sectors (according to OpenF1, in races they may not
// come), that sector counts as a single checkpoint: its time.
const carProgress = {};     // num → { last, frac, next, at }
const carSectorShares = {}; // num → [s1, s2, s3] as lap fractions

// How the lap splits across the 3 sectors, taken from the car's own sector
// times. The last complete split is kept: mid-lap
// the current sector's times come empty, and recomputing with
// partial data would make the checkpoints jump.
function sectorShares(num, line) {
    const ms = getSectorTimes(line).map((s) => lapTimeToMs(s && s.value));
    if (ms.every((v) => v != null && v > 0)) {
        const total = ms[0] + ms[1] + ms[2];
        carSectorShares[num] = ms.map((v) => v / total);
    }
    return carSectorShares[num] || [1 / 3, 1 / 3, 1 / 3];
}

// Checkpoints of the current lap, in order: where each one ends
// (lap fraction) and whether the car has already passed it.
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

// Pace at which the car advances between checkpoints: its last
// lap if it's reasonable, otherwise the best, otherwise the reference lap.
function carLapMs(line) {
    const sane = (ms) => ms != null && ms > 50000 && ms < 240000;
    const last = lapTimeToMs(line.LastLapTime && line.LastLapTime.Value);
    if (sane(last)) return last;
    const best = lapTimeToMs(line.BestLapTime && line.BestLapTime.Value);
    if (sane(best)) return best;
    return (trackMap && trackMap.refLapMs) || 100000;
}

// Called on every render(): records the moment each car passes a
// new checkpoint (or starts a new lap).
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

// Cars on track: also with the session "Finished" (chequered flag or
// clock at 0:00), because there are still cars finishing the lap or
// returning to the pits. Only with "Finalised"/"Ends" are they removed from the map.
function carsOnTrack() {
    const status = state.SessionStatus && state.SessionStatus.Status;
    return status === 'Started' || status === 'Finished';
}

// Each car's estimated position, in SVG coordinates.
function estimatedCarPositions() {
    const positions = {};
    if (!trackMap || !carsOnTrack()) return positions;

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

// Real positions from Position.z (they only arrive with an F1 TV account), in
// SVG coordinates. null if there are none.
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

// Moves the car dots: real positions if they arrive, estimated from
// mini-sectors otherwise (see ESTIMATED CAR POSITIONS). Reuses each car's <g>
// instead of redrawing it, so the CSS transition slides it
// from one position to the next instead of jumping.
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
    // Sizes in screen pixels (see trackUnitsPerPx): a 5px dot and an
    // 11px code, whatever the map's size.
    const upx = trackMap.unitsPerPx || trackMap.span / 500;
    const dotRadius = 5 * upx;
    const labelSize = 11 * upx;

    for (const num of Object.keys(positions)) {
        let car = layer.querySelector(`[data-num="${num}"]`);
        if (!car) {
            car = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            car.dataset.num = num;
            // track-car-hit: an invisible area larger than the dot, so it
            // can be hit with the mouse or a finger (hover / follow).
            car.innerHTML = '<circle class="track-car-hit"></circle><circle class="track-car-dot"></circle><text></text>';
            layer.appendChild(car);
        }

        const followed = followedDriver === num;
        car.setAttribute('class', `track-car${followed ? ' is-followed' : ''}${followedDriver && !followed ? ' is-dimmed' : ''}`);
        // The followed car goes on top of all others (in SVG, DOM order wins).
        if (followed && layer.lastChild !== car) layer.appendChild(car);

        const driver = driverList[num] || {};
        const color = driverMapColor(driver);
        const hit = car.querySelector('.track-car-hit');
        const circle = car.querySelector('.track-car-dot');
        const label = car.querySelector('text');
        const radius = followed ? dotRadius * 1.6 : dotRadius;
        hit.setAttribute('r', (12 * upx).toFixed(1));
        circle.setAttribute('r', radius.toFixed(1));
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke-width', (radius * 0.4).toFixed(1));
        label.setAttribute('x', (radius * 1.5).toFixed(1));
        label.setAttribute('y', (labelSize * 0.35).toFixed(1));
        // White code (not the team color): it was hard to read over the colored
        // sectors. The dot already carries the team color.
        label.style.fontSize = `${labelSize.toFixed(1)}px`;
        label.textContent = driverCode(driver, num);

        const p = positions[num];
        car.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }

    // Cars no longer shown (in the pits, retired, session stopped).
    for (const car of [...layer.children]) {
        if (!positions[car.dataset.num]) car.remove();
    }

    updateBattles(positions);
    updateTooltip();
}

// Between feed messages the estimated cars keep moving: they're
// recomputed every half second (the CSS transition lasts the same, so the
// movement stays continuous).
setInterval(updatePositionOverlay, 500);

// ── CUSTOMIZE TABLE PANEL ─────────────────────────────────────────────────
// It opens with the controls button (next to the fullscreen one) and
// covers the map column while open: the table stays in
// view and every change shows instantly. It's built entirely from VIEW_COLUMNS
// and VIEW_OPTIONS, so adding a new column or option means touching a single
// place.
const LOCK_ICON_SVG = `<svg class="lvp-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>`;

let viewPanelKind = null;

function isViewPanelOpen() {
    const panel = document.getElementById('live-view-panel');
    return !!panel && !panel.hidden;
}

function currentSessionKind() {
    return sessionKindFromMeta(deriveSessionMeta(state.SessionInfo));
}

// How columns are grouped in the panel (the TABLE order is still
// VIEW_COLUMNS'). Each format option goes right below what it
// modifies: "Driver names" inside Driver, the Team style below
// Team, the tyres style below Tyres.
const VIEW_PANEL_GROUPS = [
    { title: 'Driver', keys: ['pos', 'driver', 'number', 'team', 'status'] },
    { title: 'Timing', keys: ['gap', 'interval', 'bestLap', 'lastLap', 'sectors', 'microsectors'] },
    { title: 'Race', keys: ['delta', 'tyres', 'laps'] },
];
const VIEW_OPTION_AFTER = { driver: 'driverName', team: 'team', tyres: 'tyres' };

// One row: name on the left, toggle on the right. The fixed ones
// (Position, Driver) get a lock instead of the toggle; the ones that don't
// apply to this session get a disabled toggle and a note.
function viewToggleRowHTML(col, view, kind) {
    if (col.locked) {
        return `
            <div class="lvp-row is-locked">
                <span class="lvp-row-label">${col.label}</span>
                <span class="lvp-locked" title="Always shown">${LOCK_ICON_SVG}</span>
            </div>`;
    }
    const unavailable = col.raceOnly && kind !== 'race';
    return `
        <label class="lvp-row${unavailable ? ' is-disabled' : ''}">
            <span class="lvp-row-label">
                ${col.label}
                ${unavailable ? '<span class="lvp-row-note">Race &amp; Sprint only</span>' : ''}
            </span>
            <input type="checkbox" class="lvp-switch-input" role="switch" data-col="${col.key}"${view.cols[col.key] ? ' checked' : ''}${unavailable ? ' disabled' : ''}>
            <span class="lvp-switch" aria-hidden="true"></span>
        </label>`;
}

// Segmented buttons for a format option. The ones that depend on a
// switched-off toggle don't even show up (syncDependentOptions() shows them when
// it's switched on).
function viewOptionHTML(name, view) {
    const opt = VIEW_OPTIONS[name];
    return `
        <div class="lvp-option"${opt.dependsOn ? ` data-depends="${opt.dependsOn}"` : ''}${opt.dependsOn && !view.cols[opt.dependsOn] ? ' hidden' : ''}>
            <span class="lvp-option-label" id="lvp-label-${name}">${opt.label}</span>
            <div class="lvp-segmented" role="radiogroup" aria-labelledby="lvp-label-${name}">
                ${opt.choices.map(([value, text]) => `
                    <label class="lvp-seg">
                        <input type="radio" name="lvp-${name}" data-option="${name}" value="${value}"${view[name] === value ? ' checked' : ''}>
                        <span>${text}</span>
                    </label>`).join('')}
            </div>
        </div>`;
}

function viewCardHTML(title, inner) {
    return `
        <section class="lvp-section">
            <h4 class="lvp-section-title">${title}</h4>
            <div class="lvp-card">${inner}</div>
        </section>`;
}

function viewPanelBodyHTML(kind) {
    const view = effectiveView(kind);
    const byKey = Object.fromEntries(VIEW_COLUMNS.map((col) => [col.key, col]));

    const groups = VIEW_PANEL_GROUPS.map((group) => viewCardHTML(group.title, group.keys.map((key) => {
        const option = VIEW_OPTION_AFTER[key];
        return viewToggleRowHTML(byKey[key], view, kind) + (option ? viewOptionHTML(option, view) : '');
    }).join('')));

    const panels = viewCardHTML('Panels', VIEW_PANELS.map((col) => viewToggleRowHTML(col, view, kind)).join(''));

    const tvSync = viewCardHTML('TV sync', `
        <div class="lvp-row lvp-row--stacked">
            <span class="lvp-row-label">
                Broadcast delay
                <span class="lvp-row-note">Holds the live data back so it doesn't spoil what you see on TV</span>
            </span>
            <div class="lvp-stepper" role="group" aria-label="Broadcast delay">
                <button type="button" class="lvp-step" data-action="delay-minus" aria-label="${DELAY_STEP_SECONDS} seconds less">&minus;</button>
                <label class="lvp-delay-value">
                    <input type="number" min="0" max="${DELAY_MAX_SECONDS}" step="1" inputmode="numeric" value="${delaySeconds()}" data-delay aria-label="Delay in seconds">
                    <span aria-hidden="true">s</span>
                </label>
                <button type="button" class="lvp-step" data-action="delay-plus" aria-label="${DELAY_STEP_SECONDS} seconds more">+</button>
            </div>
        </div>`);

    return groups.join('') + panels + tvSync;
}

// Shows or hides the buttons that depend on a checkbox, without redrawing
// the whole panel (so the checkbox just clicked doesn't lose focus).
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

// Called from render(): if the session type changes with the panel open
// (e.g. from Qualifying to Race), the defaults and what's
// available change, so it's redrawn.
function syncViewPanel(kind) {
    if (isViewPanelOpen() && kind !== viewPanelKind) renderViewPanel(kind);
}

function initViewPanel() {
    const btn = document.getElementById('live-view-btn');
    const panel = document.getElementById('live-view-panel');
    if (!btn || !panel) return;

    // Close with an exit animation (.is-closing in live.css): the panel is
    // really hidden only when it ends. Capped at 300 ms in case the
    // browser doesn't fire animationend; no animation if the system asks for
    // reduced motion.
    let closeTimer = null;

    function finishClose() {
        clearTimeout(closeTimer);
        panel.classList.remove('is-closing');
        panel.hidden = true;
    }

    function open() {
        // If it's reopened right while closing, the exit is cut short.
        clearTimeout(closeTimer);
        panel.classList.remove('is-closing');
        renderViewPanel(currentSessionKind());
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        panel.focus();
    }

    function close() {
        if (panel.hidden || panel.classList.contains('is-closing')) return;
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finishClose();
            return;
        }
        panel.classList.add('is-closing');
        panel.addEventListener('animationend', finishClose, { once: true });
        closeTimer = setTimeout(finishClose, 300);
    }

    btn.addEventListener('click', () => {
        if (panel.hidden || panel.classList.contains('is-closing')) open();
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
            input.value = delaySeconds(); // in case they typed something out of range
            return;
        }
        if (input.dataset.col) viewPrefs.columns[input.dataset.col] = input.checked;
        else if (input.dataset.option) viewPrefs[input.dataset.option] = input.value;
        else return;
        saveViewPrefs();
        if (input.dataset.col) syncDependentOptions();
        applyTableView();
    });

    // Registered before the fullscreen one: with the panel open,
    // Esc only closes the panel (it doesn't also exit fullscreen).
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || panel.hidden) return;
        e.stopImmediatePropagation();
        close();
    });
}

// ── AUTO-HIDE MAP CONTROLS ────────────────────────────────────────────────
// Like YouTube: if nobody moves the mouse (or touches the screen, or presses
// a key) for a few seconds, the Customize / Full screen buttons
// fade out, and they come back with any movement. They don't hide while
// the panel is open, with the mouse over them or with keyboard focus inside.
const CONTROLS_IDLE_MS = 3000;

function initControlsAutoHide() {
    const controls = document.querySelector('.live-map-controls');
    const panel = document.getElementById('live-view-panel');
    if (!controls) return;
    const mapWrap = controls.closest('.circuit-map-wrap');

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
        // With the buttons hidden, the compass shows up in that same corner.
        if (mapWrap) mapWrap.classList.add('controls-idle');
    }

    function wake() {
        controls.classList.remove('is-idle');
        if (mapWrap) mapWrap.classList.remove('controls-idle');
        schedule();
    }

    ['mousemove', 'pointerdown', 'touchstart', 'keydown', 'wheel'].forEach((type) => {
        document.addEventListener(type, wake, { passive: true });
    });
    schedule();
}

// ── FULLSCREEN TOGGLE ─────────────────────────────────────────────────────
// The page already IS the table + map view (it fills the whole window below the
// navbar). "Full screen" also covers the navbar (.is-fullscreen class,
// position:fixed) and, where the browser allows it, requests real
// fullscreen (Fullscreen API) to hide the browser bars, which is ideal for
// leaving it on a TV. On iPhone that API doesn't exist for regular elements,
// so there only the CSS version applies, which still covers everything on the page.
function initFullscreenButton() {
    const app = document.getElementById('live-map-view-content');
    const btn = document.getElementById('live-fullscreen-btn');
    if (!app || !btn) return;
    function applyState(on) {
        app.classList.toggle('is-fullscreen', on);
        btn.classList.toggle('is-fullscreen', on);
        // Icon-only button: the text lives in the tooltip and in aria-label.
        const label = on ? 'Exit full screen' : 'Full screen';
        btn.setAttribute('aria-label', label);
        btn.title = label;
        document.body.style.overflow = on ? 'hidden' : '';
    }

    function enter() {
        applyState(true);
        if (app.requestFullscreen && !document.fullscreenElement) {
            // If the browser rejects it, the CSS version stays and that's it.
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

    // In real fullscreen, Esc is handled by the browser and doesn't arrive as a
    // keydown: this is where we learn it exited and sync the button.
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && app.classList.contains('is-fullscreen')) applyState(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && app.classList.contains('is-fullscreen')) exit();
    });
}

initViewPanel();
initControlsAutoHide();
initMapInteractions();
initFullscreenButton();
applyTableView();
updateDelayIndicator();
connect();

// Keeps the clock moving smoothly even during gaps between WS messages
// (render() alone only repaints when something arrives over the socket).
setInterval(updateSessionClock, 1000);
