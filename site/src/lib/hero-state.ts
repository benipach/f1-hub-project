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

type Session = { key: string; name: string; start: string; end: string };
type State = { sessions: Session[]; lastRaceEnd: string | null; preview: boolean; previewLaps: number | null };
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

/** What P1's gap cell says in the live top 10: "Leader" in races, "Fastest" in timed sessions. */
function firstPlaceLabel(sessionKey: string): string {
    return isRace(sessionKey) ? 'Leader' : 'Fastest';
}

const fmt = {
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }),
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
    date: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
    dayMonth: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }),
    dayOnly: new Intl.DateTimeFormat('en-GB', { day: '2-digit' }),
};

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

/** "2 d 04 h", "04:12:09" for under a day. */
function compactCountdown(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d} d ${pad(h)} h` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** "18 min ago", "1 h 05 min ago". */
function ago(ms: number): string {
    const m = Math.max(0, Math.floor(ms / 60000));
    return m < 60 ? `Started ${m} min ago` : `Started ${Math.floor(m / 60)} h ${pad(m % 60)} min ago`;
}

export function startHero() {
    const root = document.querySelector<HTMLElement>('[data-hero-root]');
    const json = root?.querySelector('[data-hero-state]')?.textContent;
    if (!root || !json) return;
    const state = JSON.parse(json) as State;

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
            return Number.isNaN(clockEnd) ? `${part} next` : `${part} · ${clock(clockEnd - t)} left`;
        }
        const format = QUALI_FORMAT[session.key];
        if (!state.preview || !format) return null;
        let edge = session.startMs;
        for (const [i, minutes] of format.minutes.entries()) {
            const end = edge + minutes * MIN;
            if (t < end) {
                const n = Math.floor(i / 2) + 1;
                return i % 2 === 0
                    ? `${format.prefix}${n} · ${clock(end - t)} left`
                    : `${format.prefix}${n + 1} starts in ${clock(end - t)}`;
            }
            edge = end;
        }
        return `${format.prefix}3 · 00:00 left`;
    }

    /** What follows "Started 18 min ago": the lap, the qualifying part, or the end time. */
    function liveDetail(session: Running, t: number): string {
        const ends = `Ends ${fmt.time.format(new Date(session.endMs))}`;
        if (isRace(session.key)) {
            const lap = liveLap(session, t);
            return lap ? `Lap ${lap.current} / ${lap.total}` : ends;
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

    function tick() {
        const t = now();
        show(pick(t));

        if (shown === 'upcoming') {
            const upcoming = sessions.find((s) => s.startMs > t);
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
                const sr = `${upcoming.name} starts in ${Math.floor(sec / 86400)} days, ${Math.floor((sec % 86400) / 3600)} hours and ${Math.floor((sec % 3600) / 60)} minutes`;
                if (sr !== lastSr) { lastSr = sr; setText(q('[data-cd-sr]'), sr); }
            }
            setText(q('[data-race-count]'), race && race.startMs > t ? compactCountdown(race.startMs - t) : 'Done');
        } else if (shown === 'live') {
            const current = sessions.find((s) => s.startMs <= t && t < s.endMs);
            const after = sessions.find((s) => s.startMs >= (current?.endMs ?? t));
            if (current) {
                setText(q('[data-tower-row] [data-gap]'), firstPlaceLabel(current.key));
                setText(q('[data-live-name]'), current.name);
                setText(q('[data-live-since]'), ago(t - current.startMs));
                setText(q('[data-live-detail]'), liveDetail(current, t));
            }
            setText(q('[data-upnext-name]'), after ? after.name : 'Weekend complete');
            setText(q('[data-upnext-when]'), after ? dayTime(new Date(after.startMs)) : '');
        } else if (shown === 'result') {
            const days = race ? Math.max(1, Math.ceil((race.startMs - t) / DAY)) : 0;
            setText(q('[data-next-race-in]'), race && race.startMs > t ? `In ${days} day${days === 1 ? '' : 's'}` : '');
        }
    }

    tick();
    setInterval(tick, 1000);
}
