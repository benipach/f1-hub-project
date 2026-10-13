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
//   data-lap-current, data-lap-total   race and sprint: "Lap 32 / 62"
//   data-quali-part                     "Q2" or "SQ2", the part running or next
//   data-clock-end                      ISO time the part's clock reaches zero,
//                                       while it runs: "Q2 · 07:24 left"
//   (part set, no clock end)            between parts: "Q2 next"
// and fills the top 10 tower. Without them the detail reads "Ends 20:00".
// Preview pages estimate laps and qualifying parts from the elapsed time.

import { fill } from '../i18n/fill';
import type { HeroWords } from '../i18n';

type Session = { key: string; name: string; start: string; end: string };
type State = {
    sessions: Session[];
    lastRaceEnd: string | null;
    preview: boolean;
    previewLaps: number | null;
    /** The page's words (i18n heroWords) and its Intl tag, for dates. */
    words: HeroWords;
    intl: string;
};
type HeroState = 'upcoming' | 'live' | 'result';

const DAY = 864e5;
const RESULT_WINDOW = DAY;

const isRace = (sessionKey: string) => sessionKey === 'race' || sessionKey === 'sprintRace';
const isQuali = (sessionKey: string) => sessionKey === 'qualifying' || sessionKey === 'sprintQualy';

// Standard qualifying format, in minutes: part, break, part, break, part.
// Only for estimating on preview pages; the real page uses the feed's clock.
const QUALI_FORMAT: Record<string, { prefix: string; minutes: number[] }> = {
    qualifying: { prefix: 'Q', minutes: [18, 7, 15, 8, 12] },
    sprintQualy: { prefix: 'SQ', minutes: [12, 7, 10, 7, 8] },
};

const MIN = 60_000;

/** "07:24" */
function clock(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
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
        dayOnly: new Intl.DateTimeFormat(intl, { day: '2-digit' }),
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
    });
    root.querySelectorAll<HTMLElement>('[data-range]').forEach((el) => {
        const start = new Date(el.dataset['start'] ?? '');
        const end = new Date(el.dataset['end'] ?? '');
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
        const sameMonth = start.getMonth() === end.getMonth();
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

/** "18 min ago", "1 h 05 min ago". */
function ago(ms: number): string {
    const m = Math.max(0, Math.floor(ms / 60000));
    return m < 60 ? fill(w.startedMin, { m }) : fill(w.startedHours, { h: Math.floor(m / 60), m: pad(m % 60) });
}

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

    /** "Q2 · 07:24 left" or "Q2 next": from the feed, estimated on preview pages, or null. */
    function qualiPart(session: Running, t: number): string | null {
        const part = root!.dataset['qualiPart'];
        if (part) {
            const clockEnd = Date.parse(root!.dataset['clockEnd'] ?? '');
            return Number.isNaN(clockEnd) ? fill(w.partNext, { part }) : fill(w.partLeft, { part, clock: clock(clockEnd - t) });
        }
        const format = QUALI_FORMAT[session.key];
        if (!state.preview || !format) return null;
        let edge = session.startMs;
        for (const [i, minutes] of format.minutes.entries()) {
            const end = edge + minutes * MIN;
            if (t < end) {
                const n = Math.floor(i / 2) + 1;
                return i % 2 === 0
                    ? fill(w.partLeft, { part: `${format.prefix}${n}`, clock: clock(end - t) })
                    : fill(w.partStartsIn, { part: `${format.prefix}${n + 1}`, clock: clock(end - t) });
            }
            edge = end;
        }
        return fill(w.partLeft, { part: `${format.prefix}3`, clock: '00:00' });
    }

    /** What follows "Started 18 min ago": the lap, the qualifying part, or the end time. */
    function liveDetail(session: Running, t: number): string {
        const ends = fill(w.ends, { time: fmt.time.format(new Date(session.endMs)) });
        if (isRace(session.key)) {
            const lap = liveLap(session, t);
            return lap ? fill(w.lap, lap) : ends;
        }
        if (isQuali(session.key)) return qualiPart(session, t) ?? ends;
        return ends;
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
    function calendarNext(t: number) {
        if (!calNext) return;
        const current = sessions.find((s) => s.startMs <= t && t < s.endMs);
        const first = sessions[0];
        calDot?.toggleAttribute('hidden', !current);
        let text = w.next;
        if (current) text = `${w.liveNow} · ${current.name}`;
        else if (sessions.length && sessions.every((s) => s.endMs <= t)) text = w.resultsOnTheWay;
        else if (first && first.startMs <= t) text = w.thisWeekend;
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
            const after = sessions.find((s) => s.startMs >= (current?.endMs ?? t));
            if (current) {
                setText(q('[data-tower-row] [data-gap]'), firstPlaceLabel(current.key));
                setText(q('[data-live-name]'), current.name);
                setText(q('[data-live-since]'), ago(t - current.startMs));
                setText(q('[data-live-detail]'), liveDetail(current, t));
            }
            setText(q('[data-upnext-name]'), after ? after.name : w.weekendComplete);
            setText(q('[data-upnext-when]'), after ? dayTime(new Date(after.startMs)) : '');
        } else if (shown === 'result') {
            const days = race ? Math.max(1, Math.ceil((race.startMs - t) / DAY)) : 0;
            setText(q('[data-next-race-in]'), race && race.startMs > t ? fill(plurals.select(days) === 'one' ? w.inDays.one : w.inDays.other, { n: days }) : '');
        }
    }

    tick();
    setInterval(tick, 1000);
}
