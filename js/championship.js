// ── CHAMPIONSHIP: points progression + standings table ──
//
// Fed by data/seasons/season{year}.json + drivers/teams/circuits/cities/
// countries. Replaces the hand-made SVG chart there was before: the axis, the
// tooltip and the highlighting are now the same as the driver's form curve
// (Chart.js), so both pages read the same way.
//
// Exposes window.renderChampionship(root, year): championship.html calls it
// once with the current season (data/latest.json), and archive.html every
// time a year is picked from the selector, on the same markup. It can be
// called again on the same root: it destroys the charts and listeners from
// the previous run before drawing.
//
// The idea behind the chart: a table says who's winning, a line says *how* they
// got there. With 22 overlapping drivers that's only readable if you can isolate
// one, so tapping a line (or a table row) focuses that driver and
// shows how many points they scored in each race.
//
// gpCode()/gpShortLabel() come from js/shared/gp.js.

(function(){
    const BASE = './data';
    const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

    // ── Helpers de datos ───────────────────────────────────────────────────
    const sessionResults = (gp, key) => {
        const r = gp?.sessions?.[key]?.results;
        return Array.isArray(r) ? r : [];
    };

    const isRetired = row => /DN[FS]/i.test(String(row?.time || ''));

    // Results sometimes carry the team as a slug ("red-bull-racing") and
    // sometimes as a name ("Racing Bulls"); we normalize to a slug for the color.
    // resolveTeamId() comes from js/shared/teams.js (it resolves "Red Bull",
    // "red-bull" or "red-bull-racing-honda" to the real teams.json ID).

    const esc = v => String(v)
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    // #RRGGBB → rgba(). teams.json colors are hex; dimming a line
    // needs the alpha channel.
    function withAlpha(hex, alpha){
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
        if(!m) return `rgba(255,255,255,${alpha})`;
        const [r, g, b] = m.slice(1).map(h => parseInt(h, 16));
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // 2-letter ISO → Twemoji flag SVG. Same calculation as
    // driver-header.js: each ISO letter is shifted into the Unicode
    // "regional indicator" block and the pair of code points is the file name.
    function isoFlagUrl(iso){
        if(!iso || iso.length !== 2) return null;
        const code = [...iso.toUpperCase()]
            .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
            .join('-');
        return `${TWEMOJI_BASE}${code}.svg`;
    }

    // GP → circuit → city → country → 2-letter ISO → flag.
    // Same path as driver-season.js.
    function flagUrlFor(gp, refs){
        const city = refs.circuits?.[gp.circuitId]?.location?.city;
        const iso = refs.countries?.[refs.cities?.[city]?.country]?.isoCode;
        return isoFlagUrl(iso);
    }

    // ── Calculation ────────────────────────────────────────────────────────

    // The chart's rounds are only the ones already run: a flat line
    // to the end of the year over races that don't exist says nothing. Cancelled ones
    // are always dropped (2026 lost Bahrain and Saudi Arabia).
    function buildRounds(season, refs){
        return Object.entries(season)
            .map(([gpId, gp]) => ({ gpId, ...gp }))
            .filter(gp => !gp.cancelled)
            .sort((a, b) => a.round - b.round)
            .filter(gp => sessionResults(gp, 'race').length)
            .map(gp => ({
                round: gp.round,
                gpId: gp.gpId,
                name: gpShortLabel(gp.name),
                code: gpCode(gp.name),
                flag: flagUrlFor(gp, refs),
                sprint: sessionResults(gp, 'sprintRace').length > 0,
                gp,
            }));
    }

    const totalScheduled = season => Object.values(season).filter(gp => !gp.cancelled).length;

    // Series = one chart line + one table row. It's built the same way for
    // drivers and for teams; the only difference is where each point comes from.
    function buildSeries(rounds, { keyOf, groupOf, metaOf }){
        const byKey = new Map();

        const ensure = key => {
            if(!byKey.has(key)){
                byKey.set(key, {
                    id: key,
                    perRound: rounds.map(() => null),
                    data: [],
                    total: 0,
                    wins: 0,
                    podiums: 0,
                });
            }
            return byKey.get(key);
        };

        rounds.forEach((round, i) => {
            const rows = [
                ...sessionResults(round.gp, 'race').map(r => ({ ...r, sprint: false })),
                ...sessionResults(round.gp, 'sprintRace').map(r => ({ ...r, sprint: true })),
            ];

            for(const row of rows){
                const key = keyOf(row);
                if(!key) continue;
                const entry = ensure(key);
                const slot = entry.perRound[i] || { pts: 0, sprintPts: 0, pos: null, retired: false, sprintPos: null, sprintRetired: false, won: false, cars: 0, dnfs: 0, best: null };

                slot.pts += row.pts || 0;
                if(row.sprint){
                    slot.sprintPts += row.pts || 0;
                    // Sprint position only for the chart tooltip.
                    slot.sprintPos = groupOf ? null : row.pos ?? null;
                    slot.sprintRetired = groupOf ? false : isRetired(row);
                } else {
                    // Position and retirement come from the main race; the sprint
                    // only adds points.
                    const retired = isRetired(row);
                    slot.pos = groupOf ? null : row.pos ?? null;
                    slot.retired = groupOf ? false : retired;
                    // For the Form column: in a team both cars count
                    // (won if either won; "DNF" only if neither finished).
                    slot.cars++;
                    if(retired) slot.dnfs++;
                    if(!retired){
                        if(row.pos === 1){ entry.wins++; slot.won = true; }
                        if(row.pos <= 3) entry.podiums++;
                        if(typeof row.pos === 'number' && (slot.best == null || row.pos < slot.best)) slot.best = row.pos;
                    }
                }

                entry.perRound[i] = slot;
                entry.meta = entry.meta || metaOf(row);
                if(row.team) entry.meta = { ...entry.meta, ...metaOf(row) };
            }
        });

        // Cumulative: drivers who didn't start a race keep their total (flat
        // line), not a gap, so the relative position stays readable.
        for(const entry of byKey.values()){
            let sum = 0;
            entry.data = entry.perRound.map(slot => {
                sum += slot?.pts || 0;
                return sum;
            });
            entry.total = sum;
        }

        return [...byKey.values()].sort((a, b) => b.total - a.total);
    }

    // A team's two cars share a color: the second one is dashed so they
    // can be followed separately without inventing a color that isn't the team's.
    function markTeammates(series){
        const seen = new Map();
        for(const s of series){
            const slug = s.meta?.teamSlug || '';
            const n = (seen.get(slug) || 0) + 1;
            seen.set(slug, n);
            s.dashed = n > 1;
        }
        return series;
    }

    // ── Tabla ──────────────────────────────────────────────────────────────

    // "Form": the last 5 races as small dots. Gold won, green scored,
    // grey didn't score, red retired (in a team, both cars). It's the only thing
    // the cumulative curve doesn't show at a glance: how they've been doing LATELY.
    const FORM_LENGTH = 5;
    function formHtml(s, rounds){
        const cells = [];
        for(let i = Math.max(0, rounds.length - FORM_LENGTH); i < rounds.length; i++){
            const slot = s.perRound[i];
            const round = rounds[i];
            let cls = 'is-absent', label = 'did not start';
            if(slot){
                const dnf = slot.cars > 0 && slot.dnfs === slot.cars;
                if(slot.won){ cls = 'is-win'; label = 'won'; }
                else if(dnf){ cls = 'is-dnf'; label = 'retired'; }
                else if(slot.pts > 0){ cls = 'is-points'; label = `+${slot.pts}`; }
                else { cls = 'is-none'; label = 'no points'; }
                if(slot.best != null && !slot.won) label = `P${slot.best} · ${label}`;
            }
            cells.push(`<i class="st-form-dot ${cls}" title="${esc(round.name)} · ${esc(label)}"></i>`);
        }
        return `<div class="st-form">${cells.join('')}</div>`;
    }

    function renderTable(wrap, series, kind, { rounds = [] } = {}){
        const leader = series[0]?.total ?? 0;

        const rows = series.map((s, i) => {
            const pos = i + 1;
            const gap = pos === 1 ? '—' : `−${leader - s.total}`;
            const color = s.meta.color || 'rgba(255,255,255,0.4)';
            const logo = s.meta.teamSlug
                ? `<img class="st-team-logo" src="img/teams/${esc(s.meta.teamSlug)}-logo.png" alt="" onerror="this.remove()">`
                : '';

            // Same cell as the results table in grandprix.html:
            // number in the team color, "First SURNAME" on desktop and
            // only the surname on phones.
            const nameCell = kind === 'drivers'
                ? `<div class="st-driver">
                       ${s.meta.number ? `<span class="st-driver-num" style="color:${color}">#${s.meta.number}</span>` : ''}
                       <span class="driver-fullname">${esc(s.meta.fullNameUpper)}</span>
                       <span class="driver-lastname">${esc(s.meta.lastName)}</span>
                   </div>`
                : `<div class="st-driver">${logo}<span class="constructor-fullname">${esc(s.meta.teamName)}</span><span class="constructor-short">${esc(s.meta.shortTeamName)}</span></div>`;

            // Drivers: country. Teams: base (city + country flag), with
            // the same cell style.
            const countryCell = kind === 'drivers'
                ? `<td class="st-col-country">
                       <div class="st-country">
                           ${s.meta.flagUrl ? `<img class="st-flag" src="${esc(s.meta.flagUrl)}" alt="" loading="lazy">` : ''}
                           <span>${esc(s.meta.countryName || '—')}</span>
                       </div>
                   </td>`
                : `<td class="st-col-country">
                       <div class="st-country">
                           ${s.meta.baseFlagUrl ? `<img class="st-flag" src="${esc(s.meta.baseFlagUrl)}" alt="" loading="lazy">` : ''}
                           <span>${esc(s.meta.baseName || '—')}</span>
                       </div>
                   </td>`;

            const teamCell = kind === 'drivers'
                ? `<td class="st-col-team"><div class="st-team-cell">${logo}<span class="team-name">${esc(s.meta.teamName)}</span></div></td>`
                : '';

            return `
                <tr class="st-row" data-series="${esc(s.id)}" style="--row-color:${color}" tabindex="0" role="button" aria-pressed="false">
                    <td class="st-pos"><span>${pos}</span></td>
                    <td>${nameCell}</td>
                    ${countryCell}
                    ${teamCell}
                    <td class="st-num st-col-wins"><span>${s.wins || 0}</span></td>
                    <td class="st-num st-col-podiums"><span>${s.podiums || 0}</span></td>
                    <td class="st-pts"><span>${s.total}</span></td>
                    <td class="st-gap"><span>${gap}</span></td>
                    <td class="st-col-form">${formHtml(s, rounds)}</td>
                </tr>`;
        }).join('');

        wrap.innerHTML = `
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>${kind === 'drivers' ? 'Driver' : 'Constructor'}</th>
                        <th class="st-col-country">${kind === 'drivers' ? 'Country' : 'Base'}</th>
                        ${kind === 'drivers' ? '<th class="st-col-team">Team</th>' : ''}
                        <th class="st-num st-col-wins">Wins</th>
                        <th class="st-num st-col-podiums">Podiums</th>
                        <th style="text-align:center">Pts</th>
                        <th>Gap</th>
                        <th class="st-col-form">Form</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // ── Chart ──────────────────────────────────────────────────────────────
    //
    // Same chart as the driver's form curve (js/driver-season.js):
    // a Chart.js line chart, same aspect ratio, same dots on the
    // line, same grid, same tooltip. The only thing specific to this page is that
    // there are 22 series instead of 2, so the dot radius starts
    // smaller and grows when one is focused.

    // Tooltip centered above the point; if it doesn't fit above (the leader's last
    // rounds touch the top of the chart), it drops below the point. Chart.js
    // lets the positioner return xAlign/yAlign, which override the ones in options.
    const TOOLTIP_GAP = 22;
    Chart.Tooltip.positioners.aboveOrBelow = function(elements, eventPosition){
        const el = elements[0]?.element;
        if(!el) return false;
        const { top } = this.chart.chartArea;
        const height = this.height || 96;          // 0 before the first draw
        const fits = el.y - TOOLTIP_GAP - height >= top;
        return { x: el.x, y: el.y, xAlign: 'center', yAlign: fits ? 'bottom' : 'top' };
    };

    // Team logo for the tooltip. Chart.js accepts a canvas as
    // pointStyle but draws it at natural size, so the PNG is scaled down once
    // to an 18px tile (contain) and cached per team. The tile
    // exists from the first call; the logo shows up once it finishes loading.
    const LOGO_TILE = 18;
    const logoTiles = new Map();
    function logoTile(slug){
        if(!slug) return null;
        if(logoTiles.has(slug)) return logoTiles.get(slug);
        const tile = document.createElement('canvas');
        tile.width = tile.height = LOGO_TILE;
        logoTiles.set(slug, tile);
        const img = new Image();
        img.onload = () => {
            const k = Math.min(LOGO_TILE / img.naturalWidth, LOGO_TILE / img.naturalHeight);
            const w = img.naturalWidth * k, h = img.naturalHeight * k;
            tile.getContext('2d').drawImage(img, (LOGO_TILE - w) / 2, (LOGO_TILE - h) / 2, w, h);
        };
        img.src = `./img/teams/${slug}-logo.png`;
        return tile;
    }

    // Draws, over the focused series, how many points it scored in each race. It's the
    // data the cumulative curve hides: the line goes up, but doesn't say how big
    // each step was. Equivalent to the podium band on the driver chart:
    // an editorial layer on top of the raw data.
    const roundPointsPlugin = {
        id: 'roundPoints',
        afterDatasetsDraw(chart, _args, opts){
            const focus = opts.focus?.();
            if(!focus) return;

            const index = chart.data.datasets.findIndex(d => d.seriesId === focus.id);
            const meta = index >= 0 && chart.getDatasetMeta(index);
            if(!meta || meta.hidden) return;

            const { ctx } = chart;
            ctx.save();
            // A plain number over each point, with no pill: the series'
            // color (red for DNF) and a dark halo to lift it off the
            // grid and the grey background curves. The halo is a strokeText
            // and not shadowBlur: the shadow is recomputed on every frame of the
            // animation and on a canvas this size it shows up as stutter.
            ctx.font = "600 12px 'F1-Regular', sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(10,10,20,0.85)';

            meta.data.forEach((point, i) => {
                const slot = focus.perRound[i];
                if(!slot) return;

                const dnf = slot.retired;
                const label = dnf ? 'DNF' : `+${slot.pts}`;
                if(!dnf && !slot.pts) return;          // a zero doesn't deserve a label

                ctx.fillStyle = dnf ? 'rgba(217,86,79,1)' : withAlpha(focus.meta.color, 1);
                ctx.strokeText(label, point.x, point.y - 15);
                ctx.fillText(label, point.x, point.y - 15);
            });

            ctx.restore();
        },
    };

    // Opens or closes a slot by animating its height in WHOLE pixels. With
    // grid-template-rows 0fr→1fr the card's height is fractional
    // on every frame and, since it has border-radius, the bottom edge is drawn
    // antialiased at a different position each time: it looks like a wobble
    // on the line while it opens. With rounding, the card's fraction
    // doesn't change during the animation and the edge stays still.
    const REVEAL_MS = 550;
    const revealEase = cubicBezier(0.32, 0.72, 0, 1);
    function revealTo(el, open){
        const inner = el.firstElementChild;
        const from = el.getBoundingClientRect().height;
        const to = open ? Math.round(inner.getBoundingClientRect().height) : 0;
        el.classList.toggle('is-open', open);
        cancelAnimationFrame(el._raf);
        if(from === to && !(open && el.style.height === 'auto')){
            el.style.height = open ? 'auto' : '0px';
            return;
        }
        el.style.height = `${Math.round(from)}px`;
        const start = performance.now();
        const step = now => {
            const t = Math.min(1, (now - start) / REVEAL_MS);
            const h = Math.round(from + (to - from) * revealEase(t));
            el.style.height = `${h}px`;
            if(t < 1) el._raf = requestAnimationFrame(step);
            else if(open) el.style.height = 'auto';   // the content may grow afterwards
        };
        el._raf = requestAnimationFrame(step);
    }

    // cubic-bezier(x1, y1, x2, y2) as a t → progress function, the same curve
    // the site's CSS transitions use.
    function cubicBezier(x1, y1, x2, y2){
        const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
        const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
        const sx = t => ((ax * t + bx) * t + cx) * t;
        const sy = t => ((ay * t + by) * t + cy) * t;
        const dx = t => (3 * ax * t + 2 * bx) * t + cx;
        return x => {
            let t = x;
            for(let i = 0; i < 6; i++){
                const d = dx(t);
                if(Math.abs(d) < 1e-6) break;
                t -= (sx(t) - x) / d;
            }
            return sy(Math.max(0, Math.min(1, t)));
        };
    }

    // Comparing two series: between each round's points a vertical
    // connector is drawn and, next to it, the cumulative difference (+32, +45…) in the
    // color of whoever is ahead. `progress` (0→1) is animated by mountPanel: the
    // connector grows from the lower point and the figure appears at the end.
    const comparePlugin = {
        id: 'compare',

        // The two heavy parts go on different layers: connectors below the
        // series (so the dots stay on top) and the figures above everything.
        beforeDatasetsDraw(chart, _args, opts){
            const cmp = comparePlugin._resolve(chart, opts);
            if(!cmp) return;
            const { ctx } = chart;
            ctx.save();
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.setLineDash([]);
            comparePlugin._each(cmp, ({ x, top, bottom, lead }) => {
                const len = (bottom - top) * cmp.progress;
                ctx.strokeStyle = withAlpha(lead.meta.color, 0.55 * cmp.progress);
                ctx.beginPath();
                ctx.moveTo(x, bottom);
                ctx.lineTo(x, bottom - len);
                ctx.stroke();
            });
            ctx.restore();
        },

        afterDatasetsDraw(chart, _args, opts){
            const cmp = comparePlugin._resolve(chart, opts);
            if(!cmp) return;
            const { ctx, chartArea } = chart;
            const isPhone = chart.width < 520;
            const labelEvery = isPhone ? Math.ceil(cmp.ptsA.length / 8) : 1;

            ctx.save();
            ctx.font = `600 ${isPhone ? 11 : 12}px 'F1-Regular', sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = Math.max(0, (cmp.progress - 0.55) / 0.45);
            ctx.lineJoin = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(10,10,20,0.85)';
            comparePlugin._each(cmp, ({ i, x, top, bottom, lead, diff }) => {
                // Figure: only if the gap is big enough to read it, and not all of them on phones.
                if(bottom - top < 16 || i % labelEvery) return;
                const label = `+${Math.abs(diff)}`;
                const w = ctx.measureText(label).width;
                const right = x + 7 + w <= chartArea.right;
                ctx.textAlign = right ? 'left' : 'right';
                ctx.fillStyle = lead.meta.color;
                ctx.strokeText(label, right ? x + 7 : x - 7, (top + bottom) / 2);
                ctx.fillText(label, right ? x + 7 : x - 7, (top + bottom) / 2);
            });
            ctx.restore();
        },

        // State shared by both layers: points and values of the two series.
        _resolve(chart, opts){
            const cmp = opts.compare?.();
            if(!cmp || cmp.progress <= 0) return null;
            const idxA = chart.data.datasets.findIndex(d => d.seriesId === cmp.a.id);
            const idxB = chart.data.datasets.findIndex(d => d.seriesId === cmp.b.id);
            if(idxA < 0 || idxB < 0) return null;
            return {
                ...cmp,
                ptsA: chart.getDatasetMeta(idxA).data,
                ptsB: chart.getDatasetMeta(idxB).data,
                valA: chart.data.datasets[idxA].data,
                valB: chart.data.datasets[idxB].data,
            };
        },

        // Walks the rounds with data in both series and a non-zero difference.
        _each(cmp, fn){
            cmp.ptsA.forEach((pa, i) => {
                const pb = cmp.ptsB[i];
                if(!pb || cmp.valA[i] == null || cmp.valB[i] == null) return;
                const diff = cmp.valA[i] - cmp.valB[i];
                if(!diff) return;
                fn({
                    i, diff,
                    x: pa.x,
                    top: Math.min(pa.y, pb.y),
                    bottom: Math.max(pa.y, pb.y),
                    lead: diff > 0 ? cmp.a : cmp.b,
                });
            });
        },
    };

    // Series whose stroke passes within `radius` px of the mouse, or null. It walks
    // the segments between consecutive points of each visible line, so
    // hover responds anywhere on the curve and not just over a point.
    function seriesNear(chart, mx, my, radius = 12){
        const { chartArea } = chart;
        if(mx < chartArea.left || mx > chartArea.right || my < chartArea.top || my > chartArea.bottom) return null;
        let best = null, bestD = radius;
        chart.data.datasets.forEach((ds, i) => {
            const meta = chart.getDatasetMeta(i);
            if(meta.hidden) return;
            const pts = meta.data;
            for(let k = 1; k < pts.length; k++){
                const a = pts[k - 1], b = pts[k];
                if(a.skip || b.skip) continue;
                const vx = b.x - a.x, vy = b.y - a.y;
                const len2 = vx * vx + vy * vy || 1;
                const t = Math.max(0, Math.min(1, ((mx - a.x) * vx + (my - a.y) * vy) / len2));
                const d = Math.hypot(mx - (a.x + t * vx), my - (a.y + t * vy));
                if(d < bestD){ bestD = d; best = ds.seriesId; }
            }
        });
        return best;
    }

    function makeChart(canvas, rounds, series, getFocus, getCompare, onHover){
        // On phones the card is narrow: the chart is almost square (taller)
        // with smaller dots/type so it doesn't feel cramped.
        const isPhone = window.matchMedia('(max-width: 700px)').matches;

        // Make sure the logos are already loaded the first time the tooltip appears.
        series.forEach(s => logoTile(s.meta.teamSlug));

        const datasets = series.map(s => ({
            seriesId: s.id,
            label: s.meta.label,
            data: s.data,
            borderColor: s.meta.color,
            borderWidth: isPhone ? 2 : 2.5,
            borderDash: s.dashed ? [7, 5] : [],
            pointBackgroundColor: s.meta.color,
            pointBorderColor: s.meta.color,
            pointRadius: isPhone ? 2 : 3,
            pointHoverRadius: 7,
            pointHitRadius: 14,
            tension: 0.25,
            spanGaps: true,
        }));

        return new Chart(canvas.getContext('2d'), {
            type: 'line',
            plugins: [roundPointsPlugin, comparePlugin],
            data: { labels: rounds.map(r => r.code), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 650, easing: 'easeOutQuart' },
                // Hover highlighting is shorter than a tap's:
                // it has to follow the hand, not arrive later.
                transitions: { hover: { animation: { duration: 220, easing: 'easeOutQuart' } } },
                // Passing near a line highlights it (and its row); far away, nothing.
                // It's measured against the whole stroke, not just the points.
                onHover: (event, _els, chart) => onHover?.(seriesNear(chart, event.x, event.y), event.native),
                aspectRatio: isPhone ? 0.95 : 2.9,
                // 'index' would show all 22 series together; with this many
                // lines the tooltip has to talk about just one.
                interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: isPhone ? 10 : 11, weight: 600 },
                            maxTicksLimit: isPhone ? 6 : 9,
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    },
                    x: {
                        ticks: {
                            font: { size: isPhone ? 9 : 11, weight: 600 },
                            maxRotation: isPhone ? 90 : 50,
                            autoSkip: false,
                        },
                        grid: { display: false },
                    },
                },
                plugins: {
                    legend: { display: false },
                    roundPoints: { focus: getFocus },
                    compare: { compare: getCompare },
                    tooltip: {
                        backgroundColor: 'rgba(10,10,20,0.94)',
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderWidth: 1,
                        padding: 12,
                        // The name line's "color box" is the team
                        // logo (see logoTile).
                        displayColors: true,
                        usePointStyle: true,
                        boxWidth: LOGO_TILE,
                        boxHeight: LOGO_TILE,
                        boxPadding: 6,
                        // See Chart.Tooltip.positioners.aboveOrBelow. The spacing is
                        // so it doesn't cover the point's points label (+25).
                        position: 'aboveOrBelow',
                        caretPadding: TOOLTIP_GAP,
                        caretSize: 6,
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        callbacks: {
                            title: items => `Round ${rounds[items[0].dataIndex].round}`,
                            label: item => {
                                const s = series.find(x => x.id === item.dataset.seriesId);
                                return s?.meta.label || item.dataset.label;
                            },
                            labelPointStyle: item => {
                                const s = series.find(x => x.id === item.dataset.seriesId);
                                return { pointStyle: logoTile(s?.meta.teamSlug) || 'circle', rotation: 0 };
                            },
                            afterBody: items => {
                                const item = items[0];
                                const r = rounds[item.dataIndex];
                                const s = series.find(x => x.id === item.dataset.seriesId);
                                const slot = s?.perRound[item.dataIndex];
                                const lines = [`${r.name} GP`];
                                if(slot?.pos) lines.push(`Race    ${slot.retired ? 'DNF' : 'P' + slot.pos}`);
                                if(slot?.sprintPos) lines.push(`Sprint  ${slot.sprintRetired ? 'DNF' : 'P' + slot.sprintPos}`);
                                lines.push(`Total   ${item.parsed.y} pts`);
                                return lines;
                            },
                        },
                    },
                },
            },
        });
    }

    // ── Panel (drivers or teams) ───────────────────────────────────────────
    // Each tab is an instance of this: chart + table sharing the
    // same focus. The pieces of the box are the same as on the driver
    // page: header, band, canvas and a footnote derived from the data.
    function mountPanel({ panel, kind, rounds, series }){
        // Re-render (archive changes year on the same panel): throw away the
        // chart and listeners from the previous run, if any.
        panel._chart?.destroy();
        panel._abort?.abort();
        const abort = new AbortController();
        const { signal } = abort;
        panel._abort = abort;

        const canvas = panel.querySelector('.champ-form-canvas canvas');
        const tableWrap = panel.querySelector('.standings-table-wrap');
        const badge = panel.querySelector('.champ-form-badge');
        const note = panel.querySelector('.champ-form-note');
        const reveals = {
            badge: panel.querySelector('.champ-form-reveal[data-reveal="badge"]'),
            compare: panel.querySelector('.champ-form-reveal[data-reveal="compare"]'),
        };
        const tray = panel.querySelector('.champ-compare');
        const compareToggle = panel.querySelector('.champ-compare-toggle');
        const subject = kind === 'drivers' ? 'driver' : 'team';

        // Two mutually exclusive modes: focus (one series) or comparison (up to two).
        let focusId = null;
        let compareOn = false;
        let compareIds = [];
        const byId = id => series.find(s => s.id === id) || null;
        const focused = () => compareOn ? null : byId(focusId);
        const compared = () => compareOn ? compareIds.map(byId).filter(Boolean) : [];
        // Series under the mouse (table row or chart line): it's
        // highlighted on both sides, above whatever was picked with a tap.
        let hoverId = null;

        // Only a real pointer movement counts as hover. When the
        // band opens and pushes the table and chart down, Chrome
        // fires mouseover/mousemove for every row passing under the still
        // cursor; without this filter the hover walks the table row by row
        // for the whole animation and it looks like stuttering.
        let lastPointer = null;
        const pointerMoved = e => {
            if(!e || e.clientX == null) return true;
            const moved = !lastPointer || lastPointer.x !== e.clientX || lastPointer.y !== e.clientY;
            lastPointer = { x: e.clientX, y: e.clientY };
            return moved;
        };

        // Comparison connector/figures animation (see comparePlugin).
        // Chart.js animates colors and radii on its own; this runs alongside.
        const overlay = { progress: 0, raf: 0, pair: null };
        const getCompare = () => overlay.pair && overlay.progress > 0
            ? { a: overlay.pair[0], b: overlay.pair[1], progress: overlay.progress }
            : null;

        renderTable(tableWrap, series, kind, { rounds });
        const chart = makeChart(canvas, rounds, series, focused, getCompare, (id, e) => { if(pointerMoved(e)) setHover(id); });
        const isPhone = window.matchMedia('(max-width: 700px)').matches;
        const basePointRadius = isPhone ? 2 : 3;

        function animateOverlay(target){
            cancelAnimationFrame(overlay.raf);
            const from = overlay.progress;
            if(from === target) return;
            const start = performance.now();
            const dur = target > from ? 750 : 380;
            const ease = t => 1 - Math.pow(1 - t, 4);
            const step = now => {
                const t = Math.min(1, (now - start) / dur);
                overlay.progress = from + (target - from) * ease(t);
                chart.draw();
                if(t < 1) overlay.raf = requestAnimationFrame(step);
                else if(target === 0) overlay.pair = null;
            };
            overlay.raf = requestAnimationFrame(step);
        }

        // Footnote: a computed editorial line, same as the driver's.
        // It's what you read when nothing is focused.
        (function writeNote(){
            const leader = series[0];
            const second = series[1];
            if(!leader) return;

            const winners = new Set();
            rounds.forEach((_, i) => {
                const best = series.find(s => s.perRound[i]?.pos === 1);
                if(best) winners.add(best.id);
            });

            const gap = second ? leader.total - second.total : 0;
            note.innerHTML = `<b>${esc(leader.meta.label)}</b> leads on <b>${leader.total}</b> points`
                + (second ? `, <b>${gap}</b> clear of ${esc(second.meta.label)}` : '')
                + ` after <b>${rounds.length}</b> rounds.`
                + (winners.size ? ` <b>${winners.size}</b> different ${winners.size > 1 ? `${subject}s have` : `${subject} has`} won a race so far.` : '')
                + ` Tap a line — or a row in the table — to follow one ${subject}, or hit Compare to put two side by side.`;
        })();

        const openReveal = (key, open) => revealTo(reveals[key], open);

        function slotHtml(s, i){
            if(!s) return `
                <div class="champ-compare-slot is-empty">
                    <span class="champ-compare-slot-hint">${i === 0 ? `Pick a ${subject}` : `Pick another ${subject}`}</span>
                </div>`;
            const pos = series.indexOf(s) + 1;
            const logo = s.meta.teamSlug
                ? `<img class="champ-compare-logo" src="img/teams/${esc(s.meta.teamSlug)}-logo.png" alt="" onerror="this.remove()">`
                : '';
            return `
                <div class="champ-compare-slot is-filled" style="--slot-color:${s.meta.color}" data-series="${esc(s.id)}">
                    ${logo}
                    <span class="champ-compare-name">${esc(s.meta.label)}</span>
                    <span class="champ-compare-sub">P${pos} · ${s.total} pts</span>
                    <button type="button" class="champ-compare-remove" aria-label="Remove ${esc(s.meta.label)}">×</button>
                </div>`;
        }

        function summaryHtml(a, b){
            if(!a || !b) return '';
            const diff = a.total - b.total;
            if(!diff) return `<b>Level</b> on ${a.total} points.`;
            const lead = diff > 0 ? a : b, trail = diff > 0 ? b : a;
            // Round where the difference was largest.
            let peak = 0, peakRound = null;
            a.data.forEach((va, i) => {
                const vb = b.data[i];
                if(va == null || vb == null) return;
                const d = Math.abs(va - vb);
                if(d > peak){ peak = d; peakRound = rounds[i]; }
            });
            return `<b style="color:${lead.meta.color}">${esc(lead.meta.label)}</b> leads ${esc(trail.meta.label)} by <b>${Math.abs(diff)}</b>`
                + (peakRound && peak !== Math.abs(diff) ? ` · widest gap <b>${peak}</b> after the ${esc(peakRound.name)} GP` : '')
                + '.';
        }

        function renderTray(){
            const [a, b] = compared();
            const key = `${a?.id ?? ''}|${b?.id ?? ''}`;
            if(tray.dataset.key === key) return;
            tray.dataset.key = key;
            tray.innerHTML = `
                <div class="champ-compare-row">
                    ${slotHtml(a, 0)}
                    <span class="champ-compare-vs">vs</span>
                    ${slotHtml(b, 1)}
                    <button type="button" class="champ-form-badge-clear champ-compare-close">Close</button>
                </div>
                <div class="champ-compare-summary-reveal${a && b ? ' is-open' : ''}">
                    <p class="champ-compare-summary">${summaryHtml(a, b)}</p>
                </div>`;
        }

        function paint(mode){
            const active = focused();
            const pair = compared();
            const lit = new Set(pair.length ? pair.map(s => s.id) : active ? [active.id] : []);
            const dimming = lit.size > 0;
            const hover = hoverId && !lit.has(hoverId) ? hoverId : null;

            chart.data.datasets.forEach(ds => {
                const s = series.find(x => x.id === ds.seriesId);
                const isLit = lit.has(ds.seriesId);
                const isHover = ds.seriesId === hover;
                const dim = dimming && !isLit && !isHover;

                // With nothing picked, the mouse only lifts its own: the rest
                // is just slightly dimmed so the context isn't lost.
                const restAlpha = dimming ? (pair.length === 2 ? 0.07 : 0.13) : hover ? 0.35 : 1;
                ds.borderColor = isLit || isHover ? s.meta.color : withAlpha(s.meta.color, restAlpha);
                ds.borderWidth = isLit ? 3.2 : isHover ? 3 : dim ? 1.2 : (isPhone ? 2 : 2.5);
                ds.pointRadius = isLit ? 5 : isHover ? 4 : dim ? 0 : basePointRadius;
                ds.pointBackgroundColor = s.meta.color;
                ds.pointBorderColor = s.meta.color;
                ds.order = isLit ? -2 : isHover ? -1 : 0;
            });
            chart.update(mode);

            if(pair.length === 2){ overlay.pair = pair; animateOverlay(1); }
            else animateOverlay(0);

            tableWrap.querySelectorAll('.st-row').forEach(row => {
                const on = lit.has(row.dataset.series);
                const hov = row.dataset.series === hover;
                row.classList.toggle('is-focused', on);
                row.classList.toggle('is-hover', hov);
                row.classList.toggle('is-dimmed', dimming && !on && !hov);
                row.setAttribute('aria-pressed', on ? 'true' : 'false');
            });

            compareToggle.setAttribute('aria-pressed', compareOn ? 'true' : 'false');
            panel.querySelector('.champ-form').classList.toggle('is-comparing', compareOn);
            if(compareOn) renderTray();
            openReveal('compare', compareOn);

            if(!active){
                openReveal('badge', false);
                badge.dataset.key = '';
                return;
            }

            openReveal('badge', true);
            // Only rebuilt when the focused series changes: paint() also runs
            // on every hover, and redoing the innerHTML requested the logo again
            // (and removed it if it didn't exist), shifting everything below.
            if(badge.dataset.key === active.id) return;
            badge.dataset.key = active.id;

            const pos = series.indexOf(active) + 1;
            // Best race finish of the season (slot.best: for a team it's
            // the best of its two cars).
            const best = active.perRound.reduce((m, s) => (s?.best != null && (m == null || s.best < m)) ? s.best : m, null);
            const scored = active.perRound.filter(s => s?.pts > 0).length;
            const dnfs = active.perRound.filter(s => s?.retired).length;

            panel.querySelector('.champ-form').style.setProperty('--focus-color', active.meta.color);
            const badgeLogo = active.meta.teamSlug
                ? `<img class="champ-form-badge-logo" src="img/teams/${esc(active.meta.teamSlug)}-logo.png" alt="" onerror="this.remove()">`
                : '';
            badge.innerHTML = `
                ${badgeLogo}
                ${esc(active.meta.label)}
                <span class="champ-form-badge-sub">
                    P${pos} · ${active.total} pts${best != null ? ` · best result P${best}` : ''}
                    · scored in ${scored} of ${rounds.length}${dnfs ? ` · ${dnfs} DNF${dnfs > 1 ? 's' : ''}` : ''}
                </span>
                <button type="button" class="champ-form-badge-clear">Clear</button>`;
        }

        // A tap picks: in focus mode it toggles the series; in comparison it fills the
        // first free slot (or replaces the second if there are already two), and tapping
        // a picked one removes it.
        const pick = id => {
            if(!compareOn){ focusId = focusId === id ? null : id; return paint(); }
            if(compareIds.includes(id)) compareIds = compareIds.filter(x => x !== id);
            else if(compareIds.length < 2) compareIds = [...compareIds, id];
            else compareIds = [compareIds[0], id];
            paint();
        };
        const clearAll = () => { focusId = null; compareIds = []; compareOn = false; paint(); };
        // A mousemove can arrive more than once per frame: the hover
        // repaint is batched into a single requestAnimationFrame.
        let hoverRaf = 0;
        const setHover = id => {
            if(id === hoverId) return;
            hoverId = id;
            if(hoverRaf) return;
            hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; paint('hover'); });
        };
        const setCompare = on => {
            compareOn = on;
            // The focused series becomes the first in the comparison, and vice versa.
            if(on && focusId){ compareIds = [focusId]; focusId = null; }
            if(!on){ focusId = compareIds[0] ?? null; compareIds = []; }
            paint();
        };

        // Tapping the line (or near it) picks; tapping empty space releases the focus.
        canvas.addEventListener('click', event => {
            const hit = chart.getElementsAtEventForMode(event, 'nearest', { intersect: false, axis: 'xy' }, true)[0];
            if(!hit) return compareOn ? null : clearAll();

            const rect = canvas.getBoundingClientRect();
            const dx = (event.clientX - rect.left) - hit.element.x;
            const dy = (event.clientY - rect.top) - hit.element.y;
            const id = chart.data.datasets[hit.datasetIndex]?.seriesId;

            if(id && Math.hypot(dx, dy) <= 45) pick(id);
            else if(!compareOn) clearAll();
        }, { signal });

        badge.addEventListener('click', e => {
            if(e.target.closest('.champ-form-badge-clear')) clearAll();
        }, { signal });

        compareToggle.addEventListener('click', () => setCompare(!compareOn), { signal });

        tray.addEventListener('click', e => {
            if(e.target.closest('.champ-compare-close')) return setCompare(false);
            const remove = e.target.closest('.champ-compare-remove');
            if(remove) pick(remove.closest('.champ-compare-slot').dataset.series);
        }, { signal });

        tableWrap.addEventListener('click', e => {
            const row = e.target.closest('.st-row');
            if(row) pick(row.dataset.series);
        }, { signal });

        // Hover on the table → its line; leaving the chart or the table releases it.
        tableWrap.addEventListener('mousemove', e => {
            if(!pointerMoved(e)) return;
            const row = e.target.closest('.st-row');
            setHover(row ? row.dataset.series : null);
        }, { signal });
        tableWrap.addEventListener('mouseleave', () => setHover(null), { signal });
        canvas.addEventListener('mouseleave', () => setHover(null), { signal });

        tableWrap.addEventListener('keydown', e => {
            if(e.key !== 'Enter' && e.key !== ' ') return;
            const row = e.target.closest('.st-row');
            if(!row) return;
            e.preventDefault();
            pick(row.dataset.series);
        }, { signal });

        document.addEventListener('keydown', e => {
            if(e.key === 'Escape' && (focusId || compareOn)) clearAll();
        }, { signal });

        tray.dataset.key = '';
        paint();
        panel._chart = chart;
        return chart;
    }

    // ── Tabs ───────────────────────────────────────────────────────────────
    function initTabs(root){
        const bar = root.querySelector('.champ-tab-bar');
        if(!bar || bar.dataset.ready) return;
        bar.dataset.ready = '1';

        const indicator = document.createElement('span');
        indicator.className = 'tab-indicator';
        bar.appendChild(indicator);

        const move = btn => {
            indicator.style.left = `${btn.offsetLeft}px`;
            indicator.style.width = `${btn.offsetWidth}px`;
        };

        // Same as in grandprix.js: the panel slides in from the
        // side of the tab that was left.
        const buttons = [...bar.querySelectorAll('.tab-btn')];
        buttons.forEach((btn, nextIndex) => {
            btn.addEventListener('click', () => {
                const prevIndex = buttons.findIndex(b => b.classList.contains('active'));
                const direction = prevIndex === -1 || nextIndex === prevIndex ? 0 : (nextIndex > prevIndex ? 1 : -1);
                buttons.forEach(b => b.classList.remove('active'));
                root.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = root.querySelector(`#tab-${btn.dataset.tab}`);
                if (panel) {
                    panel.style.setProperty('--tab-slide-x', direction > 0 ? '24px' : direction < 0 ? '-24px' : '0px');
                    panel.classList.add('active');
                }
                move(btn);
            });
        });

        const active = bar.querySelector('.tab-btn.active') || bar.querySelector('.tab-btn');
        if(active) requestAnimationFrame(() => move(active));
        // Re-measure when the F1 font loads: the buttons change width.
        document.fonts?.ready.then(() => { const c = bar.querySelector('.tab-btn.active'); if(c) move(c); });
        window.addEventListener('resize', () => {
            const current = bar.querySelector('.tab-btn.active');
            if(current) move(current);
        });
    }

    // ── Shared catalogs (they don't change with the year): requested only once ──
    let sharedPromise = null;
    function loadShared(){
        return (sharedPromise ??= Promise.all([
            fetch(`${BASE}/drivers.json`).then(r => r.json()),
            fetch(`${BASE}/teams.json`).then(r => r.json()),
            fetch(`${BASE}/circuits.json`).then(r => r.json()),
            fetch(`${BASE}/cities.json`).then(r => r.json()),
            fetch(`${BASE}/countries.json`).then(r => r.json()),
        ]).then(([drivers, teams, circuits, cities, countries]) => ({ drivers, teams, circuits, cities, countries })));
    }

    // ── Render ─────────────────────────────────────────────────────────────
    // Returns true if it drew something, false if the season has no races.
    async function renderChampionship(root, year){
        initTabs(root);
        root.classList.remove('is-empty');

        let season, drivers, teams, circuits, cities, countries;
        try {
            [season, { drivers, teams, circuits, cities, countries }] = await Promise.all([
                fetch(`${BASE}/seasons/season${year}.json`).then(r => { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
                loadShared(),
            ]);
        } catch (err) {
            console.error('Could not load the championship', year, err);
            root.classList.add('is-empty');
            return false;
        }

        const rounds = buildRounds(season, { circuits, cities, countries });
        if(!rounds.length){ root.classList.add('is-empty'); return false; }

        const teamMeta = slug => {
            const team = teams[slug];
            // Team base: teams.json → cities.json → countries.json, the
            // same path as a driver's nationality.
            const baseCity = cities[team?.base] || null;
            const baseCountry = baseCity ? (countries[baseCity.country] || null) : null;
            return {
                teamSlug: slug,
                teamName: team?.name || slug.replace(/-/g, ' '),
                shortTeamName: (team?.name || slug).split(' ').slice(0, 2).join(' '),
                color: team?.color || '#ffffff',
                baseName: baseCity?.name || null,
                baseFlagUrl: isoFlagUrl(baseCountry?.isoCode),
            };
        };

        const driverSeries = markTeammates(buildSeries(rounds, {
            keyOf: row => row.driver,
            metaOf: row => {
                const d = drivers[row.driver];
                const slug = resolveTeamId(row.team, teams);
                const country = countries[d?.nationality] || null;
                return {
                    ...teamMeta(slug),
                    label: d?.lastName || row.driver.replace(/-/g, ' '),
                    lastName: d?.lastName || row.driver.replace(/-/g, ' '),
                    fullNameUpper: d
                        ? `${d.firstName} ${String(d.lastName).toUpperCase()}`
                        : row.driver.replace(/-/g, ' '),
                    number: row.number ?? null,
                    countryName: country?.name || null,
                    flagUrl: isoFlagUrl(country?.isoCode),
                };
            },
        }));

        const teamSeries = buildSeries(rounds, {
            keyOf: row => resolveTeamId(row.team, teams),
            groupOf: true,
            metaOf: row => {
                const meta = teamMeta(resolveTeamId(row.team, teams));
                return { ...meta, label: meta.teamName };
            },
        });

        // Header: how many rounds have been run out of those still standing.
        const scheduled = totalScheduled(season);
        const sub = root.parentElement?.querySelector('#champHeaderSub');
        if(sub) sub.textContent = `After ${rounds.length} of ${scheduled} rounds`;

        if(typeof Chart === 'undefined'){
            console.error('Chart.js is not available');
            root.classList.add('is-empty');
            return false;
        }

        await (document.fonts?.ready ?? Promise.resolve());
        Chart.defaults.font.family = "'F1-Regular', sans-serif";
        Chart.defaults.color = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-dim').trim() || '#888';

        mountPanel({
            panel: root.querySelector('#tab-drivers'),
            kind: 'drivers',
            rounds,
            series: driverSeries,
        });

        mountPanel({
            panel: root.querySelector('#tab-constructors'),
            kind: 'constructors',
            rounds,
            series: teamSeries,
        });
        return true;
    }

    window.renderChampionship = renderChampionship;

    // ── Startup in championship.html ───────────────────────────────────────
    // The year goes in the URL (?season=2019) and is changed with the header's
    // selector; without a parameter the current season opens (data/latest.json).
    // The available seasons come from data/seasons-index.json
    // (loadSeasonsSummary, js/shared/api.js).
    const root = document.getElementById('championship');
    if(root){
        const select = document.getElementById('champ-season-select');
        const h1 = document.querySelector('.champ-header h1');
        const sub = document.getElementById('champHeaderSub');
        let rendering = 0;

        async function showSeason(year){
            const ticket = ++rendering;
            document.title = `F1 Hub | ${year} Championship`;
            if(h1) h1.textContent = `${year} Championship`;
            root.classList.add('is-loading');
            const ok = await renderChampionship(root, year);
            if(ticket !== rendering) return;
            root.classList.remove('is-loading');
            if(!ok && sub) sub.textContent = `No results loaded for the ${year} season yet.`;
        }

        function setUrlYear(year){
            const url = new URL(window.location.href);
            url.searchParams.set('season', year);
            history.replaceState(null, '', url);
        }

        (async () => {
            try {
                const [seasons, latest] = await Promise.all([loadSeasonsSummary('.'), loadLatest('.')]);
                const years = seasons.map(s => s.year).sort((a, b) => b - a);
                if(select) select.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

                const latestYear = Number(latest?.latestSeason) || years[0];
                const requested = Number(new URLSearchParams(location.search).get('season'));
                const initial = years.includes(requested) ? requested : latestYear;

                if(select){
                    select.value = String(initial);
                    select.addEventListener('change', () => {
                        const year = Number(select.value);
                        setUrlYear(year);
                        showSeason(year);
                    });
                }
                setUrlYear(initial);
                await showSeason(initial);
            } catch (err) {
                console.error('Could not resolve the season', err);
                root.classList.add('is-empty');
            }
        })();
    }
})();
