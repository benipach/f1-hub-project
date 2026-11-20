// The homepage hero's browser side (components/home/Hero.astro): picks the
// state from the current time and keeps it current, once a second.
//
//   live      a session of the next Grand Prix is running
//   pending   every session is over, the race result isn't in the build yet
//   result    the last race ended less than 24 h ago and its result is in
//   upcoming  otherwise: counting down to the next session
//
// The page is static (built when the data changes), so the times come with
// it and the clock decides. What only the live feed knows (positions, gaps,
// tyres, weather, the qualifying part and its real clock, the lap) comes from
// the relay's homepage channel (server/home.js, ?proto=home), opened only
// while the hero is live or waiting for results. Until the first summary
// arrives, the table and the numbers row stay hidden and the timetable takes
// the table's place. Preview pages fill them with sample data (?now=
// simulates a moment) unless ?relay= points at a relay.
//
// Runs once a second and only writes text and custom properties: no layout
// reads in the loop (the owner's Celeron is the performance floor).

import { resolveTeamId } from '@f1hub/shared/data/teams';

type Session = { key: string; name: string; start: string; end: string };
type Row = { pos: number; name: string; logo: string | null; gap: string; tyre: string | null; fastest: boolean; out?: boolean };
type Words = {
    leftIn: string; nextPart: string; partDone: string; minutes: string; remaining: string; lap: string;
    towerBest: string; towerThrough: string; towerInterval: string; eliminated: string; leader: string;
    yourTime: string; startsIn: string;
    track: Record<'green' | 'yellow' | 'sc' | 'vsc' | 'red', string>;
    compass: string[];
};
type State = {
    sessions: Session[];
    lastRaceEnd: string | null;
    intl: string;
    words: Words;
    /** Preview only: ?now= is honoured, and these fill what the feed will. */
    preview: { rows: Row[]; laps: number | null } | null;
    /** The relay, and the team logos by teams.json id. */
    relay: string;
    logos: Record<string, string>;
};
/** The relay's homepage summary (server/home.js). */
type Feed = {
    session: { key: number | null; name: string | null; type: 'practice' | 'quali' | 'race'; status: string | null };
    clock: { remaining: number | null; utc: string | null; running: boolean } | null;
    part: number | null;
    lap: { current: number | null; total: number | null } | null;
    track: keyof Words['track'] | null;
    weather: { air: number | null; track: number | null; wind: number | null; windDir: number | null; rain: boolean } | null;
    fastest: { time: string; name: string } | null;
    cars: { onTrack: number; running: number } | null;
    rows: { pos: number; number: number; name: string; team: string | null; time: string; gap: string; tyre: string | null; out: boolean; fastest: boolean }[];
};
type HeroState = 'upcoming' | 'live' | 'pending' | 'result';
type Running = { key: string; name: string; startMs: number; endMs: number };

const MIN = 60_000;
const RESULT_WINDOW = 24 * 60 * MIN;
// Qualifying format, in minutes (sporting regulations): the parts and the
// breaks between them, to place the part from the timetable without the
// feed. Cars through each part with a 22-car grid (2026): 16, then 10.
const QUALI: Record<string, { prefix: string; parts: number[]; breaks: number[] }> = {
    qualifying: { prefix: 'Q', parts: [18, 15, 12], breaks: [7, 8] },
    sprintQualy: { prefix: 'SQ', parts: [12, 10, 8], breaks: [7, 7] },
};
const THROUGH = [16, 10];
// The feed's tyre names → img/tyres/
const TYRES: Record<string, string> = { soft: 'soft', medium: 'medium', hard: 'hard', intermediate: 'inter', wet: 'wet' };

const isRace = (key: string) => key === 'race' || key === 'sprintRace';
const pad = (n: number) => String(n).padStart(2, '0');
const fill = (text: string, values: Record<string, string | number>) =>
    text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

/** "07:24", "1:40:04". */
function clock(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function setText(el: Element | null | undefined, text: string) {
    if (el && el.textContent !== text) el.textContent = text;
}

export function startHero() {
    const root = document.querySelector<HTMLElement>('[data-hero-root]');
    const json = root?.querySelector('[data-hero-state]')?.textContent;
    if (!root || !json) return;
    const state = JSON.parse(json) as State;
    const w = state.words;
    const time = new Intl.DateTimeFormat(state.intl, { hour: '2-digit', minute: '2-digit', hour12: false });
    const weekday = new Intl.DateTimeFormat(state.intl, { weekday: 'short' });
    const params = new URLSearchParams(location.search);

    const forced = state.preview ? Date.parse(params.get('now') ?? '') : NaN;
    const offset = Number.isNaN(forced) ? 0 : forced - Date.now();
    const now = () => Date.now() + offset;

    const sessions = state.sessions.map((s) => ({ ...s, startMs: Date.parse(s.start), endMs: Date.parse(s.end) }));
    const lastRaceEnd = state.lastRaceEnd ? Date.parse(state.lastRaceEnd) : null;
    const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
    const sections = new Map(qa('[data-state]').map((el) => [el.dataset['state'] as HeroState, el]));

    // Times in the visitor's zone, written once
    const zone = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC').split('/').pop()!.replace(/_/g, ' ');
    const offsetH = -new Date().getTimezoneOffset() / 60;
    const gmt = `GMT${offsetH >= 0 ? '+' : '−'}${Math.abs(offsetH)}`;
    qa('[data-zone]').forEach((el) => setText(el, fill(w.yourTime, { zone: `${zone} · ${gmt}` })));
    qa('[data-at]').forEach((el) => {
        const at = new Date(el.dataset['at']!);
        setText(el, el.dataset['fmt'] === 'day' ? weekday.format(at) : time.format(at));
    });

    // ── the live feed ───────────────────────────────────────────────────
    // ?relay= points the page at another relay (a local replay); with it, a
    // preview shows what the relay sends instead of its sample data.
    const relay = params.get('relay') ?? state.relay;
    const usePreview = Boolean(state.preview) && !params.has('relay');
    let feed: Feed | null = null;
    let socket: WebSocket | null = null;
    let retry = 0;
    let feedShape = '';

    function showFeed(on: boolean) {
        qa('[data-feed]').forEach((el) => { el.hidden = !on; });
        qa('[data-nofeed]').forEach((el) => { el.hidden = on; });
    }
    showFeed(usePreview);

    /** Opens the channel while it's wanted; closes it otherwise (no needless load on the relay). */
    function wantFeed(on: boolean) {
        if (usePreview) return;
        if (!on) {
            if (socket) { socket.onclose = null; socket.close(); socket = null; }
            return;
        }
        if (socket) return;
        socket = new WebSocket(`${relay}${relay.includes('?') ? '&' : '?'}proto=home`);
        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(String(event.data)) as { type: string; data: Feed | null };
                if (message.type !== 'home') return;
                feed = message.data && message.data.rows.length ? message.data : null;
                retry = 0;
                showFeed(feed !== null);
                feedShape = '';
                tick();
            } catch { /* a bad message: the next one comes in a second */ }
        };
        socket.onclose = () => {
            socket = null;
            retry = Math.min(retry + 1, 6);
            setTimeout(() => wantFeed(shown === 'live' || shown === 'pending'), 2 ** retry * 1000);
        };
    }

    const base = root.dataset['base'] ?? '/';
    const logoOf = (team: string | null) => (team ? state.logos[resolveTeamId(team, state.logos)] ?? null : null);
    const feedRows = (kind: 'practice' | 'quali' | 'race'): Row[] =>
        (feed?.rows ?? []).map((r) => ({
            pos: r.pos,
            name: r.name,
            logo: logoOf(r.team),
            // P1's own time in practice and qualifying; everyone else the gap
            gap: r.pos === 1 ? (kind === 'race' ? w.leader : r.time || '—') : r.gap || (kind === 'race' ? '' : r.time) || '—',
            tyre: r.tyre ? TYRES[r.tyre] ?? null : null,
            fastest: r.fastest,
            out: r.out,
        }));

    /** The numbers row from the feed. */
    function fillNumbers() {
        if (!feed) return;
        const v = (key: string, text: string) => qa(`[data-v="${key}"]`).forEach((el) => setText(el, text));
        v('fastest', feed.fastest?.time ?? '—');
        v('fastestName', feed.fastest?.name ?? '');
        v('cars', feed.cars ? `${feed.cars.onTrack} / ${feed.cars.running}` : '—');
        const status = feed.track ?? 'green';
        v('status', w.track[status]);
        qa('[data-v="status"]').forEach((el) => {
            el.classList.toggle('green', status === 'green');
            el.classList.toggle('yellow', status === 'yellow' || status === 'sc' || status === 'vsc');
            el.classList.toggle('red', status === 'red');
        });
        const wx = feed.weather;
        v('track', wx?.track != null ? `${wx.track.toFixed(1)}°` : '—');
        v('air', wx?.air != null ? `${wx.air.toFixed(1)}°` : '—');
        v('wind', wx?.wind != null ? `${Math.round(wx.wind * 3.6)} km/h` : '—');
        v('windFrom', wx?.windDir != null ? w.compass[Math.round(wx.windDir / 45) % 8] ?? '' : '');
        if (feed.lap?.current && feed.lap.total) v('laps', `${feed.lap.current} / ${feed.lap.total}`);
    }

    const rowHtml = (r: Row, out = false) =>
        `<div class="row${r.fastest ? ' row--fl' : ''}${out ? ' row--out' : ''}"><span class="row__pos">${r.pos}</span>` +
        (r.logo ? `<img class="row__team" src="${base}${r.logo}" alt="">` : '<span></span>') +
        `<span class="row__drv">${r.name}</span><span class="row__gap">${r.gap}</span>` +
        (r.tyre ? `<img class="row__tyre" src="${base}img/tyres/${r.tyre}.png" alt="${r.tyre[0]!.toUpperCase()}">` : '<span></span>') +
        '</div>';
    /** The rows a session shows: the top 10, and in qualifying the cut. */
    function tower(kind: 'practice' | 'quali' | 'race', part: number, shown: Row[]): { head: string; html: string } {
        if (kind === 'quali' && part < 2) {
            const cut = THROUGH[part]!;
            const top = shown.slice(0, Math.min(3, cut));
            const edge = shown[cut - 1];
            // Out of this part: everyone after the cut who's still in it
            const out = shown.slice(cut, part === 0 ? shown.length : THROUGH[part - 1]);
            return {
                head: fill(w.towerThrough, { part: `Q${part + 1}`, n: cut }),
                html: top.map((r) => rowHtml(r)).join('') +
                    (edge ? `<div class="row row--gap"><span class="row__pos">⋮</span><span></span><span class="row__drv">P${top.length + 1} – P${cut - 1}</span><span></span><span></span></div>${rowHtml(edge)}` : '') +
                    (out.length ? `<div class="cut">${w.eliminated}</div>${out.map((r) => rowHtml(r, true)).join('')}` : ''),
            };
        }
        return {
            head: kind === 'race' ? w.towerInterval : w.towerBest,
            html: shown.slice(0, 10).map((r) => rowHtml(r)).join(''),
        };
    }

    // ── live ────────────────────────────────────────────────────────────
    const live = {
        name: q('[data-live-name]'), clockV: q('[data-clock-v]'), clockK: q('[data-clock-k]'),
        bar: q('[data-bar]'), barFill: q('[data-bar-fill]'), parts: q('[data-parts]'),
        towerH: q('[data-tower-h]'), towerRows: q('[data-tower-rows]'),
        cells: new Map(qa('[data-cell]').map((el) => [el.dataset['cell']!, el])),
    };
    let liveShape = '';

    /** Where qualifying is: the feed's part and clock, or the timetable's. */
    function qualiPart(s: Running, t: number) {
        const f = QUALI[s.key]!;
        if (feed?.part && feed.clock?.remaining != null) {
            const at = Date.parse(feed.clock.utc ?? '');
            const left = feed.clock.remaining * 1000 - (feed.clock.running && !Number.isNaN(at) ? Date.now() - at : 0);
            return { f, part: feed.part - 1, running: feed.clock.running || left > 0, left: Math.max(0, left) };
        }
        let edge = s.startMs;
        for (let i = 0; i < 3; i++) {
            const end = edge + f.parts[i]! * MIN;
            if (t < end) return { f, part: i, running: true, left: end - t };
            const breakEnd = end + (f.breaks[i] ?? 0) * MIN;
            if (i < 2 && t < breakEnd) return { f, part: i + 1, running: false, left: breakEnd - t };
            edge = breakEnd;
        }
        return { f, part: 2, running: true, left: 0 };
    }

    function liveTick(s: Running, t: number) {
        const kind = isRace(s.key) ? 'race' : QUALI[s.key] ? 'quali' : 'practice';
        const qp = kind === 'quali' ? qualiPart(s, t) : null;
        // The feed's own name for the session when there is one ("Practice 2")
        const name = feed?.session.name ?? s.name;
        const shape = `${s.key}:${qp?.part ?? ''}:${name}`;
        if (shape !== liveShape) {
            liveShape = shape;
            feedShape = '';
            setText(live.name, qp ? `${name} · ${qp.f.prefix}${qp.part + 1}` : name);
            live.bar!.hidden = kind === 'quali';
            live.parts!.hidden = kind !== 'quali';
            // Practice and qualifying count the cars on track; a race says the track status
            live.cells.get('cars')!.hidden = kind === 'race';
            live.cells.get('status')!.hidden = kind !== 'race';
            if (qp && live.parts) {
                live.parts.style.gridTemplateColumns = qp.f.parts.map((m) => `${m}fr`).join(' ');
                live.parts.innerHTML = qp.f.parts.map((m, i) =>
                    `<div class="part"><div class="part__bar"><i></i></div><div class="part__lbl"><span>${qp.f.prefix}${i + 1}</span><span>${fill(w.minutes, { m })}</span></div></div>`).join('');
            }
        }
        // The table: the feed's rows, or the preview's sample
        const rows = feed ? feedRows(kind) : (usePreview ? (state.preview?.rows ?? []).map((r) => ({ ...r, gap: r.pos === 1 && kind === 'race' ? w.leader : r.gap })) : []);
        const tw = tower(kind, qp?.part ?? 2, rows);
        if (tw.html !== feedShape) {
            feedShape = tw.html;
            setText(live.towerH, tw.head);
            if (live.towerRows) live.towerRows.innerHTML = tw.html;
        }
        fillNumbers();

        if (kind === 'quali' && qp && live.parts) {
            const name = `${qp.f.prefix}${qp.part + 1}`;
            setText(live.clockV, clock(qp.left));
            setText(live.clockK, qp.running ? fill(w.leftIn, { part: name }) : fill(w.nextPart, { part: name }));
            [...live.parts.children].forEach((el, i) => {
                const length = qp.f.parts[i]! * MIN;
                const f = i < qp.part ? 1 : i > qp.part || !qp.running ? 0 : 1 - qp.left / length;
                el.classList.toggle('part--done', i < qp.part);
                el.classList.toggle('part--now', i === qp.part && qp.running);
                (el.querySelector('i') as HTMLElement).style.width = `${(f * 100).toFixed(2)}%`;
                setText(el.querySelector('.part__lbl span:last-child'), i < qp.part ? w.partDone : fill(w.minutes, { m: qp.f.parts[i]! }));
            });
            return;
        }
        const total = s.endMs - s.startMs;
        let share = Math.min(1, Math.max(0, (t - s.startMs) / total));
        if (kind === 'race') {
            const laps = feed?.lap?.total ?? state.preview?.laps ?? 0;
            const current = feed?.lap?.current ?? (usePreview ? Math.max(1, Math.ceil(share * laps)) : 0);
            if (laps && current) {
                share = current / laps;
                live.clockV!.innerHTML = `${current}<span class="clock__of">/${laps}</span>`;
            } else setText(live.clockV, clock(t - s.startMs));
            setText(live.clockK, w.lap);
        } else {
            // The session's clock: the feed's (it stops on a red flag), or the timetable's
            let left = s.endMs - t;
            if (feed?.clock?.remaining != null) {
                const at = Date.parse(feed.clock.utc ?? '');
                left = feed.clock.remaining * 1000 - (feed.clock.running && !Number.isNaN(at) ? Date.now() - at : 0);
                share = Math.min(1, Math.max(0, 1 - left / total));
            }
            setText(live.clockV, clock(left));
            setText(live.clockK, w.remaining);
        }
        live.barFill?.style.setProperty('width', `${(share * 100).toFixed(2)}%`);
    }

    // ── results on the way: the feed's provisional order ────────────────
    const pendingRows = q('[data-pending-rows]');
    function pendingTick() {
        if (!pendingRows) return;
        const rows = feed ? feedRows('race') : usePreview ? state.preview?.rows ?? [] : [];
        const html = rows.slice(0, 10).map((r) => rowHtml({ ...r, tyre: null })).join('');
        if (pendingRows.innerHTML !== html) pendingRows.innerHTML = html;
        fillNumbers();
    }

    // ── upcoming ────────────────────────────────────────────────────────
    const cd = { d: q('[data-cd="d"]'), h: q('[data-cd="h"]'), m: q('[data-cd="m"]'), s: q('[data-cd="s"]') };
    const timetable = qa('[data-session]');

    /** The timetable (upcoming, and the live table's stand-in without the feed). */
    function timetableTick(t: number) {
        const next = sessions.find((s) => s.startMs > t);
        timetable.forEach((row) => {
            const s = sessions.find((x) => x.key === row.dataset['session']);
            row.classList.toggle('sess--done', Boolean(s && s.endMs <= t));
            row.classList.toggle('sess--live', Boolean(s && s.startMs <= t && t < s.endMs));
            row.classList.toggle('sess--next', s === next);
        });
    }

    function upcomingTick(t: number) {
        const next = sessions.find((s) => s.startMs > t);
        if (!next) return;
        const sec = Math.floor(Math.max(0, next.startMs - t) / 1000);
        setText(cd.d, pad(Math.floor(sec / 86400)));
        setText(cd.h, pad(Math.floor((sec % 86400) / 3600)));
        setText(cd.m, pad(Math.floor((sec % 3600) / 60)));
        setText(cd.s, pad(sec % 60));
        setText(q('[data-next-label]'), fill(w.startsIn, { session: next.name }));
    }

    // ── the state ───────────────────────────────────────────────────────
    function pick(t: number): HeroState {
        if (sessions.some((s) => s.startMs <= t && t < s.endMs)) return 'live';
        if (lastRaceEnd !== null && t - lastRaceEnd < RESULT_WINDOW && sections.has('result')) return 'result';
        if (sessions.length && sessions.every((s) => s.endMs <= t) && sections.has('pending')) return 'pending';
        return sections.has('upcoming') ? 'upcoming' : 'result';
    }
    let shown: HeroState | null = null;

    function tick() {
        const t = now();
        const next = pick(t);
        if (next !== shown) {
            shown = next;
            sections.forEach((el, key) => { el.hidden = key !== next; });
            wantFeed(next === 'live' || next === 'pending');
        }
        timetableTick(t);
        if (next === 'upcoming') upcomingTick(t);
        else if (next === 'pending') pendingTick();
        else if (next === 'live') {
            const s = sessions.find((x) => x.startMs <= t && t < x.endMs);
            if (s) liveTick(s, t);
        }
    }
    tick();
    setInterval(tick, 1000);
}
