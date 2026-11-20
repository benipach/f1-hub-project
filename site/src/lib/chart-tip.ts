// The hover card of the profile's charts (FormChart, CareerChart): our own,
// never the browser's title. Each chart has a .fc__plot with one .fc__tip and
// .fc__hit areas carrying the card's lines in data-a … data-d (written at
// build time); the card follows the hovered one inside its plot.

document.addEventListener('pointerover', (e) => {
    const target = e.target as Element;
    const plot = target.closest?.('.fc__plot') as HTMLElement | null;
    if (!plot) return;
    const tip = plot.querySelector<HTMLElement>('.fc__tip')!;
    const hit = target.closest('.fc__hit') as SVGElement | null;
    if (!hit) { tip.hidden = true; return; }
    for (const k of ['a', 'b', 'c', 'd'] as const) tip.querySelector<HTMLElement>(`.fc__tip-${k}`)!.textContent = hit.dataset[k] ?? '';
    tip.dataset.dir = hit.dataset.dir ?? '';
    tip.hidden = false;
    const box = plot.getBoundingClientRect(), r = hit.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(r.left + r.width / 2 - box.left - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth)}px`;
});
document.addEventListener('pointerleave', () => document.querySelectorAll<HTMLElement>('.fc__tip').forEach((tip) => (tip.hidden = true)), true);
