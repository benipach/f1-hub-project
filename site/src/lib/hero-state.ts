// Picks the homepage hero's state from the current time and keeps it current
// (_design/DESIGN.md, section 6):
//   1. live, if a session of the next Grand Prix is running;
//   2. result, if the last race ended less than 24 h ago;
//   3. upcoming otherwise, counting down to the next session. If every
//      session is over but the results aren't in the build yet, it says so
//      instead of counting down to nothing.
//
// Runs once a second and only changes text: no layout reads, no HTML built in
// the loop (the owner's Celeron is the performance floor). Also turns every
// [data-local] time into the visitor's time zone, and sets <html
// data-weekend> so the navbar can show the live state.
//
// Live details. The timetable only knows when a session starts and ends; the
// rest comes from the live feed (the relay's small endpoint, phase 4), which
// writes these attributes on the hero root ([data-hero-root]):
//   data-lap-current, data-lap-total   race and sprint: "19/62", the bar by laps
//   data-quali-part                     "Q2" or "SQ2", the part running or next
//   data-clock-end                      ISO time the session's clock reaches
//                                       zero while it runs: the qualifying
//                                       part's, or practice's 60-min clock
//   data-clock-left                     seconds left while the clock is
//                                       stopped (a red flag); wins over the end
//   (part set, no clock)                between parts: "Q2 next"
// and fills the top 10. The progress bar follows the session's clock, not the
// wall clock, because a red flag stops it (owner's call, 16/10). Without the
// feed it falls back to the timetable: qualifying parts estimated from the
// standard format, practice from its end time, a race by its elapsed time
// (preview pages estimate the laps).

import { fill } from '../i18n/fill';
import type { HeroWords } from '../i18n';

type Session = { key: string; name: string; start: string; end: string };
type State = {
    sessions: Session[];
    lastRaceEnd: string | null;
    preview: boolean;
    previewLaps: number | null;
    /** The next Grand Prix's name, for the live hero's heading. */
    gpName: string;
    /** The page's words (i18n heroWords) and its Intl tag, for dates. */
    words: HeroWords;
    intl: string;
};
type HeroState = 'upcoming' | 'live' | 'result';

const DAY = 864e5;
const RESULT_WINDOW = DAY;

const isRace = (sessionKey: string) => sessionKey === 'race' || sessionKey === 'sprintRace';
const isQuali = (sessionKey: string) => sessionKey === 'qualifying' || sessionKey === 'sprintQualy';

// Qualifying format, in minutes (sporting regulations): the three parts, and
// the breaks between them. The parts size the bar's three segments; the
// breaks only matter to estimate the part without the feed.
const QUALI_FORMAT: Record<string, { prefix: string; parts: number[]; breaks: number[] }> = {
    qualifying: { prefix: 'Q', parts: [18, 15, 12], breaks: [7, 8] },
    sprintQualy: { prefix: 'SQ', parts: [12, 10, 8], breaks: [7, 7] },
};

const MIN = 60_000;

/** "07:24", "1:40:04" from an hour. */
function clock(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// Set by startHero from the page's state: its words and its date formats.
let w: HeroWords;
let fmt: ReturnType<typeof formats>;
let plurals: Intl.PluralRules;

function formats(intl: string) {
    return {
        weekday: new Intl.DateTimeFormat(intl, { weekday: 'short' }),
        time: new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', hour12: false }),
        date: new Intl.DateTimeFormat(intl, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
        dayMonth: new Intl.DateTimeFormat(intl, { day: '2-digit', month: 'short' }),
        // The live hero's weekend: "Fri 9 Oct"
        weekdayDayMonth: new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short' }),
        dayOnly: new Intl.DateTimeFormat(intl, { day: '2-digit' }),
        // The round cards' short range: "23–25 Oct", "30 Oct–1 Nov"
        dayNum: new Intl.DateTimeFormat(intl, { day: 'numeric' }),
        monthShort: new Intl.DateTimeFormat(intl, { month: 'short' }),
    };
}

/** What P1's gap cell says in the live top 10: "Leader" in races, "Fastest" in timed sessions. */
function firstPlaceLabel(sessionKey: string): string {
    return isRace(sessionKey) ? w.leader : w.fastest;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayTime = (d: Date) => `${fmt.weekday.format(d)} ${fmt.dayMonth.format(d)} · ${fmt.time.format(d)}`;

function setText(el: Element | null, text: string) {
    if (el && el.textContent !== text) el.textContent = text;
}

/** Local dates and times for every [data-local] element (formats in the attribute). */
function localizeTimes(root: ParentNode) {
    root.querySelectorAll<HTMLElement>('[data-local]').forEach((el) => {
        const at = new Date(el.dataset['at'] ?? '');
        if (Number.isNaN(at.getTime())) return;
        const format = el.dataset['local'];
        if (format === 'weekday') setText(el, fmt.weekday.format(at));
        else if (format === 'time') setText(el, fmt.time.format(at));
        else if (format === 'daytime') setText(el, dayTime(at));
        else if (format === 'date') setText(el, fmt.date.format(at));
        else if (format === 'daymonth') setText(el, fmt.weekdayDayMonth.format(at));
    });
    root.querySelectorAll<HTMLElement>('[data-range]').forEach((el) => {
        const start = new Date(el.dataset['start'] ?? '');
        const end = new Date(el.dataset['end'] ?? '');
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
        const sameMonth = start.getMonth() === end.getMonth();
        if (el.dataset['range'] === 'short') {
            const month = (d: Date) => fmt.monthShort.format(d).replace('.', '');
            const day = (d: Date) => fmt.dayNum.format(d);
            setText(el, sameMonth ? `${day(start)}–${day(end)} ${month(end)}` : `${day(start)} ${month(start)}–${day(end)} ${month(end)}`);
            return;
        }
        setText(el, `${sameMonth ? fmt.dayOnly.format(start) : fmt.dayMonth.format(start)}–${fmt.dayMonth.format(end)} ${end.getFullYear()}`);
    });
}

/** "2d 04h", "04:12:09" for under a day. */
function compactCountdown(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}${w.unitDay} ${pad(h)}${w.unitHour}` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** Whole calendar months from `from` to `to`, and the date they land on. */
function wholeMonths(from: Date, to: Date): { months: number; after: Date } {
    let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
    const add = (n: number) => {
        const d = new Date(from);
        d.setMonth(d.getMonth() + n);
        return d;
    };
    if (months > 0 && add(months) > to) months -= 1;
    return { months: Math.max(0, months), after: add(Math.max(0, months)) };
}

/** "2mo 05d", "17d 04h", "04h 12m" for under a day: minutes are enough for the calendar. */
function roundCountdown(t: number, target: number): string {
    const { months, after } = wholeMonths(new Date(t), new Date(target));
    if (months > 0) return `${months}${w.unitMonth} ${pad(Math.floor((target - after.getTime()) / DAY))}${w.unitDay}`;
    const m = Math.max(0, Math.floor((target - t) / 60000));
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return d > 0 ? `${d}${w.unitDay} ${pad(h)}${w.unitHour}` : `${pad(h)}${w.unitHour} ${pad(m % 60)}${w.unitMinute}`;
}

/** "18 min", "1 h 05 min". */
function duration(ms: number): string {
    const m = Math.max(0, Math.floor(ms / 60000));
    return m < 60 ? fill(w.minutes, { m }) : fill(w.hoursMinutes, { h: Math.floor(m / 60), m: pad(m % 60) });
}

/** "Buenos Aires": the city of the visitor's time zone. */
function zoneCity(): string {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return zone.split('/').pop()!.replace(/_/g, ' ');
}

/**
 * What the live hero's progress bar measures:
 *   laps   race and sprint, with the lap (from the feed; estimated on previews)
 *   parts  qualifying: Q1, Q2, Q3, by the part's clock (`part` running or next)
 *   clock  practice: the session's clock, counting down
 *   time   a race without laps: its elapsed time on the timetable
 */
type Measure =
    | { kind: 'laps'; current: number; total: number }
    | { kind: 'parts'; prefix: string; parts: number[]; part: number; running: boolean; left: number }
    | { kind: 'clock'; left: number; total: number }
    | { kind: 'time'; elapsed: number; total: number };

export function startHero() {
    const root = document.querySelector<HTMLElement>('[data-hero-root]');
    const json = root?.querySelector('[data-hero-state]')?.textContent;
    if (!root || !json) return;
    const state = JSON.parse(json) as State;
    w = state.words;
    fmt = formats(state.intl);
    plurals = new Intl.PluralRules(state.intl);

    // Preview pages accept ?now=2026-10-10T13:20:00Z to simulate another moment;
    // the clock keeps running from there.
    const forced = state.preview ? Date.parse(new URLSearchParams(location.search).get('now') ?? '') : NaN;
    const offset = Number.isNaN(forced) ? 0 : forced - Date.now();
    const now = () => Date.now() + offset;

    const sessions = state.sessions.map((s) => ({ ...s, startMs: Date.parse(s.start), endMs: Date.parse(s.end) }));
    const lastRaceEnd = state.lastRaceEnd ? Date.parse(state.lastRaceEnd) : null;
    const race = sessions.find((s) => s.key === 'race');

    const sections = new Map<HeroState, HTMLElement>();
    root.querySelectorAll<HTMLElement>('[data-hero]').forEach((el) => sections.set(el.dataset['hero'] as HeroState, el));

    const q = (selector: string) => root.querySelector<HTMLElement>(selector);
    const digits = {
        d: q('[data-cd="d"]'), h: q('[data-cd="h"]'), m: q('[data-cd="m"]'), s: q('[data-cd="s"]'),
    };
    const rows = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>('[data-session]').forEach((el) => rows.set(el.dataset['session'] ?? '', el));

    localizeTimes(document);
    let shown: HeroState | null = null;
    let lastSr = '';

    type Running = { key: string; startMs: number; endMs: number };

    /** A race's current lap: from the feed, estimated on preview pages, or null. */
    function liveLap(session: Running, t: number): { current: number; total: number } | null {
        const current = Number(root!.dataset['lapCurrent']);
        const total = Number(root!.dataset['lapTotal']);
        if (current > 0 && total > 0) return { current, total };
        if (state.previewLaps) {
            const share = (t - session.startMs) / (session.endMs - session.startMs);
            return { current: Math.min(state.previewLaps, Math.max(1, Math.ceil(share * state.previewLaps))), total: state.previewLaps };
        }
        return null;
    }

    /** Ms left on the session's clock, from the feed, or null without it. */
    function feedClock(t: number): number | null {
        const left = Number(root!.dataset['clockLeft']);
        if (root!.dataset['clockLeft'] && !Number.isNaN(left)) return left * 1000;
        const end = Date.parse(root!.dataset['clockEnd'] ?? '');
        return Number.isNaN(end) ? null : Math.max(0, end - t);
    }

    /** What the bar measures now (see Measure). */
    function measure(session: Running, t: number): Measure {
        const total = session.endMs - session.startMs;
        if (isRace(session.key)) {
            const lap = liveLap(session, t);
            return lap ? { kind: 'laps', ...lap } : { kind: 'time', elapsed: t - session.startMs, total };
        }
        const format = QUALI_FORMAT[session.key];
        if (format && isQuali(session.key)) {
            const base = { kind: 'parts' as const, prefix: format.prefix, parts: format.parts };
            const part = root!.dataset['qualiPart'];
            const n = part ? Number(part.replace(/\D/g, '')) : NaN;
            if (n >= 1 && n <= 3) {
                const left = feedClock(t);
                return { ...base, part: n - 1, running: left !== null, left: left ?? 0 };
            }
            // Without the feed: the standard format from the session's start
            let edge = session.startMs;
            for (let i = 0; i < 3; i++) {
                const end = edge + format.parts[i]! * MIN;
                if (t < end) return { ...base, part: i, running: true, left: end - t };
                const breakEnd = end + (format.breaks[i] ?? 0) * MIN;
                if (i < 2 && t < breakEnd) return { ...base, part: i + 1, running: false, left: breakEnd - t };
                edge = breakEnd;
            }
            return { ...base, part: 2, running: true, left: 0 };
        }
        return { kind: 'clock', left: feedClock(t) ?? Math.max(0, session.endMs - t), total };
    }

    // The live hero's elements
    const live = {
        word: q('[data-word]'), line: q('[data-word-line]'), name: q('[data-live-name]'),
        title: q('[data-live-title]'), zone: q('[data-live-zone]'),
        readK: q('[data-read-k]'), readV: q('[data-read-v]'), readS: q('[data-read-s]'),
        startK: q('[data-start-k]'), startV: q('[data-start-v]'), startS: q('[data-start-s]'),
        endV: q('[data-end-v]'), endS: q('[data-end-s]'),
        segs: q('[data-segs]'), towerLabel: q('[data-tower-label]'),
        upName: q('[data-upnext-name]'), upWhen: q('[data-upnext-when]'), upIn: q('[data-upnext-in]'),
    };
    const weekend = [...root.querySelectorAll<HTMLElement>('[data-wk]')].map((el) => ({
        el,
        session: sessions.find((s) => s.key === el.dataset['wk']),
        fill: el.querySelector<HTMLElement>('[data-wk-fill]'),
        txt: el.querySelector<HTMLElement>('[data-wk-txt]'),
    }));
    let liveKey = '';
    let barShape = '';
    let segEls: HTMLElement[][] = [];
    let lastMinute = -1;

    /**
     * Fits the giant line to its box: on one line, or on two ("LIVE" /
     * "QUALIFYING") when two lines make it bigger. Reads the layout, so it
     * runs only when the session changes and on resize, never in the tick.
     */
    function fitWord() {
        const { word, line, name } = live;
        if (!word || !line || !word.clientWidth) return;
        const width = word.clientWidth;
        const desc = /[QJ,]/i.test(name?.textContent ?? '') ? 0.13 : 0;
        line.style.setProperty('--desc', String(desc));
        line.style.setProperty('--fs', '100px');
        line.classList.remove('is-2');
        const one = line.scrollWidth;
        line.classList.add('is-2');
        const two = line.scrollWidth;
        let fs1: number;
        let fs2: number;
        if (matchMedia('(max-width: 760px)').matches) {
            fs1 = Math.min((width * 100) / one, 84);
            fs2 = fs1 >= 46 ? 0 : Math.min((width * 100) / two, 72);
        } else if (matchMedia('(max-width: 1100px)').matches) {
            fs1 = Math.min((width * 100) / one, 200);
            fs2 = fs1 >= 90 ? 0 : Math.min((width * 100) / two, 170);
        } else {
            const height = word.clientHeight;
            fs1 = Math.min((width * 100) / one, height / (0.8 + desc), 400);
            fs2 = Math.min((width * 100) / two, height / (1.58 + desc), 400);
        }
        line.classList.toggle('is-2', fs2 > fs1);
        line.style.setProperty('--fs', `${Math.floor(Math.max(fs1, fs2))}px`);
    }
    if (live.word) new ResizeObserver(fitWord).observe(live.word);
    document.fonts?.ready.then(fitWord);

    /** The bar's segments and scale, built only when what it measures changes. */
    function drawBar(m: Measure, session: Running) {
        const shape = m.kind === 'laps' ? `laps${m.total}` : m.kind === 'parts' ? `parts${m.prefix}` : `${m.kind}${session.key}`;
        if (!live.segs || shape === barShape) return;
        barShape = shape;
        const marks = (list: [number, string][]) => list
            .map(([at, text], i) => `<span class="${i && i < list.length - 1 ? 'mid' : ''}" style="left:${(at * 100).toFixed(3)}%">${text}</span>`)
            .join('');
        const one = (ticks: number, list: [number, string][]) =>
            `<div class="seg"><div class="bar-w"><div class="bar"><div class="bar__fill" data-f></div><div class="bar__ticks" style="--n:${ticks}"></div></div><div class="bar__now" data-f></div></div><div class="scale lbl num" aria-hidden="true">${marks(list)}</div></div>`;
        const minutes = Math.round((session.endMs - session.startMs) / MIN);
        let html = '';
        if (m.kind === 'laps') {
            const list: [number, string][] = [[0, fill(w.lapN, { n: 1 })]];
            for (let lap = 10; lap < m.total - 4; lap += 10) list.push([lap / m.total, String(lap)]);
            list.push([1, String(m.total)]);
            html = one(m.total, list);
        } else if (m.kind === 'parts') {
            html = m.parts.map((length, i) =>
                `<div class="seg is-idle" style="--w:${length}"><div class="bar-w"><div class="bar"><div class="bar__fill" data-f></div></div><div class="bar__now" data-f></div></div><div class="seg__lbl lbl"><b>${m.prefix}${i + 1}</b><span>${fill(w.minutes, { m: length })}</span></div></div>`).join('');
        } else if (m.kind === 'clock') {
            const step = minutes <= 60 ? 15 : 30;
            const list: [number, string][] = [];
            for (let x = 0; x <= minutes; x += step) list.push([x / minutes, `${pad(minutes - x)}:00`]);
            html = one(minutes / step, list);
        } else {
            const step = minutes <= 120 ? 30 : 60;
            const list: [number, string][] = [];
            for (let x = 0; x <= minutes; x += step) list.push([x / minutes, fmt.time.format(new Date(session.startMs + x * MIN))]);
            html = one(minutes / step, list);
        }
        live.segs.innerHTML = html;
        segEls = [...live.segs.querySelectorAll<HTMLElement>('.seg')].map((seg) => [...seg.querySelectorAll<HTMLElement>('[data-f]')]);
        lastMinute = -1;
    }

    function liveTick(current: Running & { name: string }, t: number) {
        // A new session: its words, and the line fitted again
        if (current.key !== liveKey) {
            liveKey = current.key;
            setText(live.name, current.name);
            setText(live.title, fill(w.inProgress, { session: current.name, gp: state.gpName }));
            setText(live.zone, fill(w.yourTime, { zone: zoneCity() }));
            setText(live.startK, isRace(current.key) ? w.lightsOut : w.started);
            setText(live.startV, fmt.time.format(new Date(current.startMs)));
            setText(live.endV, fmt.time.format(new Date(current.endMs)));
            setText(live.towerLabel, `${current.name} · ${isRace(current.key) ? w.gapToLeader : w.bestLap}`);
            setText(q('[data-tower-row] [data-gap]'), firstPlaceLabel(current.key));
            requestAnimationFrame(fitWord);
        }

        const m = measure(current, t);
        drawBar(m, current);
        let fractions: number[] = [];
        let spoken = '';
        if (m.kind === 'laps') {
            setText(live.readK, w.lap);
            setText(live.readV, `${m.current}/${m.total}`);
            setText(live.readS, fill(w.toGo, { n: m.total - m.current }));
            fractions = [m.current / m.total];
            spoken = `${w.lap} ${m.current} / ${m.total}`;
        } else if (m.kind === 'parts') {
            const name = `${m.prefix}${m.part + 1}`;
            setText(live.readV, clock(m.left));
            if (m.running) {
                setText(live.readK, fill(w.partLeft, { part: name }));
                setText(live.readS, fill(w.partOf, { n: m.part + 1, total: 3 }));
                fractions = m.parts.map((length, i) => (i < m.part ? 1 : i > m.part ? 0 : 1 - m.left / (length * MIN)));
            } else {
                setText(live.readK, fill(w.partNext, { part: name }));
                setText(live.readS, fill(w.partDone, { part: `${m.prefix}${m.part}` }));
                fractions = m.parts.map((_, i) => (i < m.part ? 1 : 0));
            }
            segEls.forEach((_, i) => live.segs?.children[i]?.classList.toggle('is-idle', !(m.running && i === m.part)));
            spoken = `${live.readK?.textContent ?? ''} ${clock(m.left)}`;
        } else if (m.kind === 'clock') {
            setText(live.readK, w.sessionClock);
            setText(live.readV, clock(m.left));
            setText(live.readS, fill(w.sessionLength, { m: Math.round(m.total / MIN) }));
            fractions = [1 - m.left / m.total];
            spoken = `${w.sessionClock} ${clock(m.left)}`;
        } else {
            setText(live.readK, w.raceTime);
            setText(live.readV, clock(m.elapsed));
            setText(live.readS, '');
            fractions = [Math.min(1, m.elapsed / m.total)];
            spoken = `${w.raceTime} ${clock(m.elapsed)}`;
        }
        live.readV?.classList.toggle('num', m.kind !== 'laps');
        // The bar: only custom properties, no layout reads
        segEls.forEach((els, i) => els.forEach((el) => el.style.setProperty('--f', Math.min(1, Math.max(0, fractions[i] ?? 0)).toFixed(4))));

        // The weekend's cells
        const nextUp = sessions.find((s) => s.startMs > t);
        for (const cell of weekend) {
            const s = cell.session;
            if (!s) continue;
            const status = s.endMs <= t ? 'done' : s.startMs <= t ? 'live' : s === nextUp ? 'next' : 'later';
            for (const name of ['done', 'live', 'next', 'later']) cell.el.classList.toggle(`is-${name}`, name === status);
            cell.fill?.style.setProperty('--f', status === 'done' ? '1' : status === 'live' ? ((t - s.startMs) / (s.endMs - s.startMs)).toFixed(4) : '0');
        }

        // Once a minute: the texts in minutes and what screen readers hear
        const minute = Math.floor(t / MIN);
        if (minute !== lastMinute) {
            lastMinute = minute;
            setText(live.startS, fill(w.ago, { t: duration(t - current.startMs) }));
            setText(live.endS, fill(w.inTime, { t: duration(current.endMs - t) }));
            const total = m.kind === 'parts' ? m.parts.reduce((a, b) => a + b, 0) : 1;
            const done = m.kind === 'parts' ? fractions.reduce((a, f, i) => a + f * m.parts[i]!, 0) : fractions[0] ?? 0;
            live.segs?.setAttribute('aria-valuenow', String(Math.round((100 * done) / total)));
            live.segs?.setAttribute('aria-valuetext', spoken);
            for (const cell of weekend) {
                const s = cell.session;
                if (!s) continue;
                setText(cell.txt, s.endMs <= t ? w.done : s.startMs <= t ? w.liveNow : s === nextUp ? fill(w.inTime, { t: roundCountdown(t, s.startMs) }) : '');
            }
            if (nextUp) {
                setText(live.upName, nextUp.name);
                setText(live.upWhen, `${fmt.weekday.format(new Date(nextUp.startMs))} ${fmt.time.format(new Date(nextUp.startMs))}`);
                setText(live.upIn, fill(w.inTime, { t: roundCountdown(t, nextUp.startMs) }));
            } else {
                setText(live.upName, w.raceResult);
                setText(live.upWhen, '');
                setText(live.upIn, w.afterFlag);
            }
        }
    }

    function pick(t: number): HeroState {
        if (sessions.some((s) => s.startMs <= t && t < s.endMs)) return 'live';
        if (lastRaceEnd !== null && t - lastRaceEnd < RESULT_WINDOW && sections.has('result')) return 'result';
        if (!sections.has('upcoming')) return sections.has('result') ? 'result' : 'upcoming';
        return 'upcoming';
    }

    function show(next: HeroState) {
        if (next === shown) return;
        shown = next;
        sections.forEach((el, key) => { el.hidden = key !== next; });
        document.documentElement.dataset['weekend'] = next;
    }

    // The calendar's next round says how far away it is, or that it's live
    // (with the beating dot).
    const calNext = document.querySelector<HTMLElement>('[data-cal-next]');
    const calDot = document.querySelector<HTMLElement>('[data-cal-dot]');
    // The next round's result field: "Next · Lights out in" over the
    // countdown, "This weekend · Lights out in" once the weekend has begun,
    // "● Live now" over the session's name while one runs, and "Results on
    // the way" when every session is over.
    const calLive = document.querySelector<HTMLElement>('[data-cal-live]');
    function calendarNext(t: number) {
        if (!calNext) return;
        const current = sessions.find((s) => s.startMs <= t && t < s.endMs);
        const first = sessions[0];
        calDot?.toggleAttribute('hidden', !current);
        calLive?.toggleAttribute('hidden', !current);
        if (current) setText(calLive, current.name);
        let text = `${w.next} · ${w.lightsOutIn}`;
        if (current) text = w.liveNow;
        else if (sessions.length && sessions.every((s) => s.endMs <= t)) text = w.resultsOnTheWay;
        else if (first && first.startMs <= t) text = `${w.thisWeekend} · ${w.lightsOutIn}`;
        setText(calNext, text);
    }

    // Every round still to run counts down to its race start, in the corner
    // of its result line. Hidden once the race has started (or while the
    // next round is live, when its line says so).
    const calCountdowns = [...document.querySelectorAll<HTMLElement>('[data-cal-cd]')]
        .map((el) => ({ el, startMs: Date.parse(el.dataset['calCd'] ?? ''), isNext: el.closest('.rd--next') !== null }))
        .filter((c) => !Number.isNaN(c.startMs));
    function calendarCountdowns(t: number) {
        const live = sessions.some((s) => s.startMs <= t && t < s.endMs);
        for (const { el, startMs, isNext } of calCountdowns) {
            const show = startMs > t && !(isNext && live);
            el.toggleAttribute('hidden', !show);
            if (show) setText(el, roundCountdown(t, startMs));
        }
    }

    function tick() {
        const t = now();
        show(pick(t));
        calendarNext(t);
        calendarCountdowns(t);

        if (shown === 'upcoming') {
            const upcoming = sessions.find((s) => s.startMs > t);
            // The strip's tag follows the weekend: before it, during it
            // (between sessions), and after the race while its result isn't
            // in yet, when "Next race" would read as if it hadn't been run.
            const first = sessions[0];
            setText(
                q('[data-up-tag]'),
                !upcoming ? w.raceFinished : first && first.startMs <= t ? w.raceWeekend : w.nextRace,
            );
            q('[data-countdown-block]')?.toggleAttribute('hidden', !upcoming);
            q('[data-waiting]')?.toggleAttribute('hidden', Boolean(upcoming));
            rows.forEach((row, key) => {
                const s = sessions.find((x) => x.key === key);
                row.classList.toggle('is-done', Boolean(s && s.endMs <= t));
                row.classList.toggle('is-next', s === upcoming);
            });
            if (upcoming) {
                const left = Math.max(0, upcoming.startMs - t);
                const sec = Math.floor(left / 1000);
                setText(digits.d, pad(Math.floor(sec / 86400)));
                setText(digits.h, pad(Math.floor((sec % 86400) / 3600)));
                setText(digits.m, pad(Math.floor((sec % 3600) / 60)));
                setText(digits.s, pad(sec % 60));
                setText(q('[data-next-name]'), upcoming.name);
                setText(q('[data-next-when]'), dayTime(new Date(upcoming.startMs)));
                // Screen readers get the countdown once a minute, not every second.
                const sr = fill(w.srCountdown, { session: upcoming.name, d: Math.floor(sec / 86400), h: Math.floor((sec % 86400) / 3600), m: Math.floor((sec % 3600) / 60) });
                if (sr !== lastSr) { lastSr = sr; setText(q('[data-cd-sr]'), sr); }
            }
            setText(q('[data-race-count]'), race && race.startMs > t ? compactCountdown(race.startMs - t) : w.done);
        } else if (shown === 'live') {
            const current = sessions.find((s) => s.startMs <= t && t < s.endMs);
            if (current) liveTick(current, t);
        } else if (shown === 'result') {
            const days = race ? Math.max(1, Math.ceil((race.startMs - t) / DAY)) : 0;
            setText(q('[data-next-race-in]'), race && race.startMs > t ? fill(plurals.select(days) === 'one' ? w.inDays.one : w.inDays.other, { n: days }) : '');
        }
    }

    tick();
    setInterval(tick, 1000);
}
