// The hover card of the profile's charts (FormChart, CareerChart): our own,
// never the browser's title. Each chart has a .fc__plot with one .fc__tip and
// .fc__hit areas carrying the card's lines in data-a … data-d (written at
// build time); the card follows the hovered one inside its plot. A hit with
// data-k lights up the marks with the same data-k (the dot grows) and, when
// the plot packs standings slices for it (SliceData.astro), the card draws
// them in Standings.astro's markup (keep the two alike).
// Moving from one to the next, the card glides there (chart.css); the first
// one it just appears at, and leaving the plot hides it.

/** [pos, name, team (-1 none), points (null blank), gap, moved, me 0/1, note] */
type Row = [number, number, number, number | null, number, number, 0 | 1, string];
type Pack = { h: string[]; m: boolean[]; n: string[]; r: Record<string, Row[][]> };

const packs = new WeakMap<Element, Pack | null>();
const packOf = (plot: Element) => {
    if (!packs.has(plot)) {
        const el = plot.querySelector('.fc__slices');
        packs.set(plot, el ? (JSON.parse(el.textContent ?? '{}') as Pack) : null);
    }
    return packs.get(plot)!;
};
const num = new Intl.NumberFormat(document.documentElement.lang || 'en', { maximumFractionDigits: 1 });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Places.astro's arrows
const places = (d: number) => !d ? '' : d > 0
    ? `<span class="places up"><svg class="tri" viewBox="0 0 10 8" aria-hidden="true"><path d="M5 0L10 8H0z"/></svg>${d}</span>`
    : `<span class="places down"><svg class="tri" viewBox="0 0 10 8" aria-hidden="true"><path d="M0 0h10L5 8z"/></svg>${-d}</span>`;

function slices(plot: Element, k: string): string {
    const P = packOf(plot);
    const tables = P?.r[k];
    if (!P || !tables) return '';
    const team = (i: number) => (i < 0 ? '<span></span>' : plot.querySelector<HTMLTemplateElement>(`template[data-team="${i}"]`)?.innerHTML ?? '<span></span>');
    return tables.map((rows, t) => {
        const moves = P.m[t];
        const body = rows.map(([pos, name, tm, pts, gap, moved, me, note]) =>
            `<span class="slice__r${me ? ' me' : ''}"><span class="slice__p">${pos}</span>${moves ? `<span class="slice__m">${places(moved)}</span>` : ''}${team(tm)}`
            + `<span class="slice__n">${esc(P.n[name] ?? '')}</span><span class="slice__v">${pts === null ? '' : num.format(pts)}</span>`
            + `<span class="slice__g">${note ? esc(note) : gap > 0 ? `-${num.format(gap)}` : ''}</span></span>`).join('');
        return `<span class="fc__tip-s">${P.h[t] ? `<span class="fc__tip-h">${esc(P.h[t]!)}</span>` : ''}<span class="slice${moves ? ' slice--moves' : ''}">${body}</span></span>`;
    }).join('');
}

const unmark = (plot: Element) => {
    for (const m of plot.querySelectorAll('.is-on:not(.fc__tip)')) m.classList.remove('is-on');
};
const hide = (plot: Element) => {
    plot.querySelector('.fc__tip')?.classList.remove('is-on');
    unmark(plot);
};

document.addEventListener('pointerover', (e) => {
    const target = e.target as Element;
    const plot = target.closest?.('.fc__plot') as HTMLElement | null;
    if (!plot) return;
    const tip = plot.querySelector<HTMLElement>('.fc__tip')!;
    const hit = target.closest('.fc__hit') as SVGElement | null;
    if (!hit) { hide(plot); return; }
    unmark(plot);
    for (const k of ['a', 'b', 'c', 'd'] as const) tip.querySelector<HTMLElement>(`.fc__tip-${k}`)!.textContent = hit.dataset[k] ?? '';
    const k = hit.dataset.k;
    const table = tip.querySelector<HTMLElement>('.fc__tip-t');
    if (table) table.innerHTML = k ? slices(plot, k) : '';
    if (k) for (const m of hit.ownerSVGElement?.querySelectorAll(`[data-k="${k}"]:not(.fc__hit)`) ?? []) m.classList.add('is-on');
    tip.dataset.dir = hit.dataset.dir ?? '';
    const box = plot.getBoundingClientRect(), r = hit.getBoundingClientRect();
    const left = `${Math.min(Math.max(r.left + r.width / 2 - box.left - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth)}px`;
    // Already showing: glide over. Hidden: put it in place first, then fade in
    tip.classList.toggle('fc__tip--glide', tip.classList.contains('is-on'));
    tip.style.left = left;
    tip.classList.add('is-on');
});
document.addEventListener('pointerleave', (e) => {
    if ((e.target as Element).classList?.contains('fc__plot')) hide(e.target as Element);
}, true);
