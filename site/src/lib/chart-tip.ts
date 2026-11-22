// The hover card of the profile's charts (FormChart, CareerChart): our own,
// never the browser's title. Each chart has a .fc__plot with one .fc__tip and
// .fc__hit areas carrying the card's lines in data-a … data-d (written at
// build time); the card follows the hovered one inside its plot. A hit with
// data-k lights up the marks with the same data-k (the dot grows) and, when
// the plot holds a <template data-k>, the card shows it (a standings table).
// Moving from one to the next, the card glides there (chart.css); the first
// one it just appears at, and leaving the plot hides it.

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
    if (table) table.innerHTML = (k && plot.querySelector<HTMLTemplateElement>(`template[data-k="${k}"]`)?.innerHTML) || '';
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
