// The parts of the driver profile that change in the page: the season panel
// (picked from the season picker or "Season by season") and the all-time
// board (its tabs). Plain functions that return HTML, so the build writes the
// first state into the page and the browser script (DriverPage.astro) draws
// the next ones with the same code. Ported from the approved mockup
// (_design/driver/index.html, 18–29/10); every comment marked "owner" is a
// call the owner made there.

import { fill } from '../i18n/fill';
import type { Dict, Plural } from '../i18n';
import type { BoardRow, BoardStat, DriverProfile, DriverRound, DriverSeason, DriverSprint, DriverTeam } from './driver';

export type DriverWords = {
    readonly season: Dict['driver']['season'];
    readonly stats: Dict['driver']['stats'];
};

/** What the drawing needs besides the data: the language and the asset URLs. */
export type DriverView = {
    readonly intl: string;
    /** For the ordinals: English "1st", Spanish "1.º". */
    readonly lang: string;
    readonly w: DriverWords;
    /** Team id → its logo, already resized (TeamMark's way). */
    readonly logos: Readonly<Record<string, string>>;
    /** "/f1-hub-project/img/flags/": the flags are <iso>.svg in there. */
    readonly flags: string;
};

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function fmt(view: Pick<DriverView, 'intl'>, n: number): string {
    return n.toLocaleString(view.intl, { maximumFractionDigits: 1 });
}

export function ord(view: Pick<DriverView, 'lang'>, n: number): string {
    if (view.lang === 'es') return `${n}.º`;
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export function plural(view: Pick<DriverView, 'intl'>, forms: Plural, n: number, values: Record<string, string | number> = {}): string {
    return fill(new Intl.PluralRules(view.intl).select(n) === 'one' ? forms.one : forms.other, { n, ...values });
}

/** A team's mark: its logo, or the color square (TeamMark's markup). */
export function logoHtml(view: Pick<DriverView, 'logos'>, t: Pick<DriverTeam, 'id' | 'color'> | undefined, size = 20): string {
    const src = t ? view.logos[t.id] : undefined;
    return src
        ? `<img class="team-mark" src="${src}" alt="" style="--size:${size}px" width="${size}" height="${size}" loading="lazy" decoding="async">`
        : `<span class="sq" style="--c:${t?.color ?? '#8a857b'}"></span>`;
}

/** The flag of a country (flag-icons, 4:3), by ISO code. */
export function flagHtml(view: Pick<DriverView, 'flags'>, iso: string | null): string {
    return iso ? `<img class="flag" src="${view.flags}${iso.toLowerCase()}.svg" alt="" width="40" height="30" loading="lazy" decoding="async">` : '';
}

// Fastest lap: the stopwatch of the icon lab, in the fastest-lap purple (owner, 18/10)
const stopwatch = (label: string) => `<svg class="flw" viewBox="0 0 90 100" role="img" aria-label="${esc(label)}"><rect x="31" y="0" width="28" height="9"/><rect x="74" y="16" width="9" height="15" transform="rotate(45 78.5 23.5)"/><path fill-rule="evenodd" d="M45 15a42 42 0 1 1 0 84a42 42 0 1 1 0-84zm0 9a33 33 0 1 0 0 66a33 33 0 1 0 0-66z"/><rect x="41" y="34" width="8" height="26" rx="4" transform="rotate(38 45 57)"/><circle cx="45" cy="57" r="6"/></svg>`;

const delta = (r: { grid: number | null; pos: number | null; out: string | null }) => (r.grid && r.pos && !r.out ? r.grid - r.pos : null);
const arrow = (d: number | null) => (d == null ? '—' : d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '=');
const arrowCls = (d: number | null) => (d && d > 0 ? 'up' : d && d < 0 ? 'down' : '');

// Rounded, but never past a point (owner, 18/10: "un poquito más
// redondeadas"): monotone cubic (Fritsch–Carlson), the curve Chart.js draws
// with cubicInterpolationMode 'monotone' on the old page, so it can't
// overshoot above P1 or below the last place.
function smooth(p: readonly (readonly [number, number])[]): string {
    if (!p.length) return '';
    if (p.length < 3) return p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const n = p.length, dx: number[] = [], m: number[] = [], t: number[] = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1]![0] - p[i]![0]; m[i] = (p[i + 1]![1] - p[i]![1]) / dx[i]!; }
    t[0] = m[0]!; t[n - 1] = m[n - 2]!;
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
        const a = t[i]! / m[i]!, b = t[i + 1]! / m[i]!, h = a * a + b * b;
        if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]!; t[i + 1] = k * b * m[i]!; }
    }
    let d = `M${p[0]![0].toFixed(1)},${p[0]![1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
        const h = dx[i]! / 3, [x0, y0] = p[i]!, [x1, y1] = p[i + 1]!;
        d += `C${(x0 + h).toFixed(1)},${(y0 + t[i]! * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - t[i + 1]! * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
}

/** The form curve: start against finish, race by race. */
function chart(rs: readonly DriverRound[], label: string, pointsLine: string): string {
    // The foot is that season's field: the most cars in any of its races (27
    // in 1990, 20 in 2005, 22 in 2026), as fieldSizeOf() on the old page
    const field = Math.max(0, ...rs.map((r) => r.field)) || 20;
    const W = 1000, H = 360, padL = 40, padB = 26;
    const x = (i: number) => padL + (i + 0.5) * ((W - padL) / rs.length);
    const y = (p: number) => 8 + ((p - 1) / Math.max(1, field - 1)) * (H - padB - 16);
    // A retirement sits where it was classified ("classified P16", as the old
    // page); the foot only when there's no position
    const outPos = (r: DriverRound) => r.pos ?? field;
    // The × as two strokes through the dot's exact center (a "×" character
    // sits on its font's baseline, never centered)
    const cross = (cx: number, cy: number, s = 2.2) => `<path d="M${cx - s} ${cy - s}L${cx + s} ${cy + s}M${cx + s} ${cy - s}L${cx - s} ${cy + s}" stroke="var(--red)" stroke-width="2" stroke-linecap="square" pointer-events="none"/>`;
    // The lines never break (owner, 18/10): a retirement takes the finish line
    // to its ×, a missed race is stepped over, only the rounds to come end it
    const line = (key: 'pos' | 'grid') => {
        const runs: [number, number][][] = [[]];
        rs.forEach((r, i) => {
            if (r.upcoming) { if (runs.at(-1)!.length) runs.push([]); return; }
            if (r.missed) return;
            const v = key === 'pos' ? (r.out ? outPos(r) : r.pos) : r.grid;
            if (v == null) return;
            runs.at(-1)!.push([x(i), y(v)]);
        });
        return runs.map(smooth).join(' ');
    };
    const ticks = [1, 3, 10, field].filter((v, i, a) => a.indexOf(v) === i);
    return `
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
  <rect x="${padL}" y="${y(1) - 6}" width="${W - padL}" height="${y(3) - y(1) + 12}" fill="var(--paper)" opacity=".07"></rect>
  <line x1="${padL}" x2="${W}" y1="${y(10.5)}" y2="${y(10.5)}" stroke="var(--mute-ink)" stroke-dasharray="2 4"></line>
  <text x="${W}" y="${y(10.5) - 6}" text-anchor="end" font-size="10" font-weight="700" fill="var(--mute-ink)" letter-spacing="1">${esc(pointsLine)}</text>
  ${ticks.map((t) => `<text x="0" y="${y(t) + 4}" font-size="11" font-weight="700" fill="var(--mute-ink)">P${t}</text>`).join('')}
  <path d="${line('grid')}" fill="none" stroke="var(--mute-ink)" stroke-width="2" stroke-dasharray="5 5" stroke-linejoin="round" stroke-linecap="round"></path>
  <path d="${line('pos')}" fill="none" stroke="var(--paper)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>
  ${rs.map((r, i) => {
      const lab = `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${r.missed || r.upcoming ? 'var(--rule-ink)' : 'var(--mute-ink)'}">${r.round}</text>`;
      if (r.missed || r.upcoming) return lab;
      const g = r.grid ? `<circle cx="${x(i)}" cy="${y(r.grid)}" r="3.5" fill="var(--ink)" stroke="var(--mute-ink)" stroke-width="1.5"></circle>` : '';
      const f = r.out
          // A retirement keeps its white dot, with the red × on top (owner, 18/10)
          ? `<circle class="dot" cx="${x(i)}" cy="${y(outPos(r))}" r="5" fill="var(--paper)"></circle>${cross(x(i), y(outPos(r)))}`
          : r.pos ? `<circle class="dot" cx="${x(i)}" cy="${y(r.pos)}" r="5" fill="${r.pos === 1 ? 'var(--red)' : 'var(--paper)'}"></circle>` : '';
      return lab + g + f;
  }).join('')}
  ${rs.map((r, i) => (r.missed || r.upcoming ? '' : `<rect class="hit" data-i="${i}" x="${x(i) - (W - padL) / rs.length / 2}" y="0" width="${(W - padL) / rs.length}" height="${H - padB}" fill="transparent"></rect>`)).join('')}
</svg>`;
}

/** The season panel: figures, racecraft, teammate duel, form curve, rounds. */
export function seasonHtml(view: DriverView, D: Pick<DriverProfile, 'id' | 'last'>, s: DriverSeason): string {
    const { w } = view;
    const S = w.season;
    const n = (v: number) => fmt(view, v);
    const rs = s.rounds;
    const rc = s.racecraft;
    const top = rc && rc.id === D.id;
    const hasSprints = rs.some((r) => r.sprint);
    // The Grand Prix by its whole name, with the flag of where it's held (owner, 18/10)
    const gpName = (r: DriverRound) => `<span class="gpn">${flagHtml(view, r.iso)}<span class="cond">${esc(r.full)}</span></span>`;
    const res = (r: { pos: number | null; out: string | null }) => (r.out
        ? `<span class="down">${r.out}</span>${r.pos ? `<span class="lbl mute" style="margin-left:10px">${esc(fill(S.classified, { n: r.pos }))}</span>` : ''}`
        : r.pos === 1 ? '<span class="podium win cond">P1</span>' : r.pos && r.pos <= 3 ? `<span class="podium cond">P${r.pos}</span>` : r.pos ? `P${r.pos}` : '—');
    // Teammate duel: qualifying, race and points (owner, 18/10: "juntos los de
    // race y qualy"), each a split bar with the counts at its ends
    const duelRow = (label: string, [a, b]: readonly [number, number]) => {
        if (!(a + b)) return `<div class="duel__row"><span class="lbl">${esc(label)}</span><span class="duel__none lbl mute">${esc(S.noData)}</span></div>`;
        const lead = a > b ? 'me' : a < b ? 'mate' : '';
        return `<div class="duel__row ${lead}"><span class="lbl">${esc(label)}</span><b class="cond duel__a">${n(a)}</b><span class="duel__bar"><i style="flex:${a}"></i><i style="flex:${b}"></i></span><b class="cond duel__b">${n(b)}</b></div>`;
    };
    const duel = s.mate ? `
  <div class="duel">
    <div class="duel__who"><span class="lbl mute">${esc(fill(S.duel, { n: s.mate.together }))}</span><p class="cond"><span>${esc(D.last)}</span> <span class="mute">${esc(S.vs)}</span> ${esc(s.mate.last)}</p></div>
    <div class="duel__rows">${duelRow(S.qualifying, s.mate.quali)}${duelRow(S.race, s.mate.race)}${duelRow(S.points, s.mate.pts)}</div>
  </div>` : '';
    const sprintCells = (sp: DriverSprint | null) => (!hasSprints ? '' : sp
        ? `<td class="gf cond spr">${sp.grid ? 'P' + sp.grid : '—'}<span class="arr">→</span>${res(sp)}</td><td class="n d cond spr ${arrowCls(delta(sp))}">${arrow(delta(sp))}</td><td class="n d cond spr">${sp.pts ? n(sp.pts) : '·'}</td>`
        : '<td></td><td></td><td></td>');
    const craft = s.hasGrid
        ? top ? `<span>${fill(S.bestOf, { year: s.year, n: s.gained })}</span>`
              : `<span>${esc(s.gained ? fill(S.gained, { n: s.gained, rank: ord(view, s.gainedRank ?? 0), year: s.year }) : S.noGained)}</span>${rc ? `<span class="mute">${esc(fill(S.best, { name: `${rc.first} ${rc.last}`, n: rc.places }))}</span>` : ''}`
        : `<span class="mute">${esc(fill(S.noGrid, { year: s.year }))}</span>`;
    return `
  <div class="band">
    <div><b class="cond">${s.pos ? ord(view, s.pos) : '—'}</b><span class="lbl mute">${esc(s.done ? S.championship : S.championshipNow)}</span></div>
    <div><b class="cond">${n(s.pts)}</b><span class="lbl mute">${esc(S.points)}</span></div>
    <div><b class="cond">${s.wins}</b><span class="lbl mute">${esc(S.wins)}</span></div>
    <div><b class="cond">${s.podiums}</b><span class="lbl mute">${esc(S.podiums)}</span></div>
    <div><b class="cond">${s.poles}</b><span class="lbl mute">${esc(S.poles)}</span></div>
    <div><b class="cond">${s.fls}</b><span class="lbl mute">${esc(S.fastestLaps)}</span></div>
  </div>
  <div class="craft lbl">
    <span class="craft__tag ${top ? 'is-top' : ''}">${esc(S.racecraft)}</span>
    ${craft}
    <span class="craft__team">${s.teams.map((t) => `<span>${logoHtml(view, t, 24)}<span class="mark-text cond">${esc(t.name)}</span></span>`).join('')}</span>
  </div>
  ${duel}
  <div class="chart">
    <div class="chart__head lbl"><span>${esc(S.formCurve)}</span><span class="chart__key"><span><i></i>${esc(S.finish)}</span><span><i class="g"></i>${esc(S.start)}</span><span style="color:var(--red-hi)">${esc(S.out)}</span></span></div>
    <div class="chart__plot">${chart(rs, S.chart, S.pointsLine)}<div class="tip" data-tip></div></div>
  </div>
  <div class="rounds-wrap"><table class="rounds ${hasSprints ? 'with-spr' : ''}">
    <thead class="lbl mute">
      ${hasSprints ? `<tr class="grp"><th colspan="2"></th><th colspan="3" class="grp__spr">${esc(S.sprint)}</th><th colspan="3" class="grp__race s1">${esc(S.race)}</th></tr>` : ''}
      <tr><th>${esc(S.rd)}</th><th>${esc(S.grandPrix)}</th>${hasSprints ? `<th>${esc(S.startFinish)}</th><th class="n">${esc(S.delta)}</th><th class="n">${esc(S.pts)}</th>` : ''}<th class="${hasSprints ? 's1' : ''}">${esc(S.startFinish)}</th><th class="n">${esc(S.delta)}</th><th class="n">${esc(S.pts)}</th></tr>
    </thead>
    <tbody>${rs.map((r, i) => {
        if (r.upcoming || r.missed) return `<tr class="is-dim"><td class="r cond">${r.round}</td><td class="gp">${gpName(r)}</td><td class="lbl" colspan="${3 + (hasSprints ? 3 : 0)}">${esc(r.upcoming ? S.toCome : S.didNotRace)}</td></tr>`;
        const d = delta(r);
        // Race and sprint side by side, one row per weekend, never added up;
        // sprint first, the order they're run in (owner, 18/10)
        return `<tr data-i="${i}"><td class="r cond">${r.round}</td><td class="gp">${gpName(r)}</td>${sprintCells(r.sprint)}<td class="gf cond ${hasSprints ? 's1' : ''}">${r.grid ? 'P' + r.grid : '—'}<span class="arr">→</span>${res(r)}${r.fl ? stopwatch(S.fastestLap) : ''}</td><td class="n d cond ${arrowCls(d)}">${arrow(d)}</td><td class="n d cond">${r.racePts ? n(r.racePts) : '·'}</td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/** The race card on the form curve: round, start → finish, places, points. */
export function tipHtml(view: DriverView, r: DriverRound): string {
    const S = view.w.season;
    const d = delta(r);
    const fin = r.out ? `<span class="tip__out">${r.out}</span>` : `<span class="${r.pos === 1 ? 'tip__win' : ''}">P${r.pos}</span>`;
    const places = r.out ? (r.pos ? `<span class="mute">${esc(fill(S.classified, { n: r.pos }))}</span>` : '')
        : d == null ? '' : `<span class="${d > 0 ? 'up' : d < 0 ? 'down' : 'mute'}">${esc(d > 0 ? plural(view, S.up, d) : d < 0 ? plural(view, S.down, -d) : S.same)}</span>`;
    const pts = (v: number) => esc(v ? fill(S.ptsN, { n: fmt(view, v) }) : S.noPoints);
    const sp = r.sprint;
    return `
      <span class="lbl mute">R${r.round} · ${esc(r.gp)}</span>
      <span class="tip__gf cond">${r.grid ? 'P' + r.grid : '—'}<span class="tip__arr">→</span>${fin}</span>
      <span class="tip__ft lbl">${places}<span class="mute">${pts(r.racePts)}</span></span>
      ${sp ? `<span class="tip__spr lbl"><span>${esc(S.sprint)}</span><span class="cond">${sp.grid ? 'P' + sp.grid : '—'} → ${sp.out ? `<span class="tip__out">${sp.out}</span>` : 'P' + sp.pos}</span><span class="${arrowCls(delta(sp))}">${arrow(delta(sp))}</span><span class="mute">${pts(sp.pts)}</span></span>` : ''}`;
}

/** The all-time board of one stat: the top five, and the driver after them. */
export function boardHtml(view: DriverView, D: Pick<DriverProfile, 'id' | 'first' | 'last' | 'totals' | 'ranks' | 'boards'>, k: BoardStat): string {
    const top = D.boards[k];
    const me: BoardRow = { id: D.id, first: D.first, last: D.last, value: D.totals[k], rank: D.ranks[k] };
    const rows: (BoardRow | null)[] = top.some((r) => r.id === D.id) ? [...top] : [...top, ...(me.rank > 6 ? [null] : []), me];
    const max = Math.max(1, ...rows.map((r) => r?.value ?? 0));
    return rows.map((r, i) => (!r ? `<li class="gap lbl" style="--d:${i}">···</li>`
        : `<li class="${r.id === D.id ? 'me' : ''}" style="--d:${i};--w:${(r.value / max) * 100}%"><b class="cond">${r.rank}</b><span><span class="lbl ${r.id === D.id ? '' : 'mute'}">${esc(r.first)}</span> <b class="cond">${esc(r.last)}</b></span><span class="v cond" data-v="${r.value}">${fmt(view, r.value)}</span></li>`)).join('');
}
