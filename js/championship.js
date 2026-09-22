// ── CHAMPIONSHIP — progresión de puntos + tabla de posiciones ──
//
// Se alimenta de data/seasons/season{año}.json + drivers/teams/circuits/cities/
// countries. Reemplaza al gráfico SVG hecho a mano que había antes: el eje, el
// tooltip y el resaltado ahora son los mismos de la curva de forma del piloto
// (Chart.js), así las dos páginas se leen igual.
//
// Expone window.renderChampionship(root, year): championship.html lo llama
// una vez con la temporada vigente (data/latest.json), y archive.html cada
// vez que se elige un año del selector, sobre el mismo marcado. Se puede
// volver a llamar sobre el mismo root: destruye los gráficos y listeners de
// la vuelta anterior antes de dibujar.
//
// La idea del gráfico: una tabla dice quién va ganando, una línea dice *cómo* se
// llegó hasta ahí. Con 22 pilotos superpuestos eso sólo se lee si se puede aislar
// uno, así que tocar una línea (o una fila de la tabla) enfoca ese piloto y
// muestra cuántos puntos sumó en cada carrera.
//
// gpCode()/gpShortLabel() vienen de js/shared/gp.js.

(function(){
    const BASE = './data';
    const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

    // ── Helpers de datos ───────────────────────────────────────────────────
    const sessionResults = (gp, key) => {
        const r = gp?.sessions?.[key]?.results;
        return Array.isArray(r) ? r : [];
    };

    const isRetired = row => /DN[FS]/i.test(String(row?.time || ''));

    // Los resultados traen el equipo a veces como slug ("red-bull-racing") y a
    // veces como nombre ("Racing Bulls"); normalizamos a slug para el color.
    // resolveTeamId() viene de js/shared/teams.js (resuelve "Red Bull",
    // "red-bull" o "red-bull-racing-honda" al ID real de teams.json).

    const esc = v => String(v)
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    // #RRGGBB → rgba(). Los colores de teams.json son hex; para atenuar una línea
    // hace falta el canal alfa.
    function withAlpha(hex, alpha){
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
        if(!m) return `rgba(255,255,255,${alpha})`;
        const [r, g, b] = m.slice(1).map(h => parseInt(h, 16));
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // ISO de 2 letras → SVG de bandera de Twemoji. Mismo cálculo que
    // driver-header.js: cada letra del ISO se corre al bloque Unicode de
    // "regional indicator" y el par de códigos es el nombre del archivo.
    function isoFlagUrl(iso){
        if(!iso || iso.length !== 2) return null;
        const code = [...iso.toUpperCase()]
            .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
            .join('-');
        return `${TWEMOJI_BASE}${code}.svg`;
    }

    // GP → circuito → ciudad → país → ISO de 2 letras → bandera.
    // Mismo recorrido que driver-season.js.
    function flagUrlFor(gp, refs){
        const city = refs.circuits?.[gp.circuitId]?.location?.city;
        const iso = refs.countries?.[refs.cities?.[city]?.country]?.isoCode;
        return isoFlagUrl(iso);
    }

    // ── Cálculo ────────────────────────────────────────────────────────────

    // Las rondas del gráfico son sólo las que ya se corrieron: una línea plana
    // hasta fin de año sobre carreras que no existen no dice nada. Las canceladas
    // se descartan siempre (2026 perdió Bahrein y Arabia Saudita).
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

    // Serie = una línea del gráfico + una fila de la tabla. Se arma igual para
    // pilotos y para equipos; lo único que cambia es de dónde sale cada punto.
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
                    // Puesto del sprint sólo para el tooltip del gráfico.
                    slot.sprintPos = groupOf ? null : row.pos ?? null;
                    slot.sprintRetired = groupOf ? false : isRetired(row);
                } else {
                    // El puesto y el abandono son los de la carrera larga; el sprint
                    // sólo aporta puntos.
                    const retired = isRetired(row);
                    slot.pos = groupOf ? null : row.pos ?? null;
                    slot.retired = groupOf ? false : retired;
                    // Para la columna Form: en un equipo cuentan los dos autos
                    // (ganó si alguno ganó; "DNF" sólo si no llegó ninguno).
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

        // Acumulado: los que no largaron una carrera mantienen su total (línea
        // plana), no un hueco, para que la posición relativa siga siendo legible.
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

    // Los dos autos de un equipo comparten color: el segundo va punteado para
    // poder seguirlos por separado sin inventar un color que no es del equipo.
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

    // "Form": las últimas 5 carreras como puntitos. Dorado ganó, verde puntuó,
    // gris no puntuó, rojo abandonó (en un equipo, los dos autos). Es lo único
    // que la curva acumulada no muestra de un vistazo: cómo viene ÚLTIMAMENTE.
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

            // Misma celda que la tabla de resultados de grandprix.html:
            // número en el color del equipo, "Nombre APELLIDO" en escritorio y
            // sólo el apellido en el celular.
            const nameCell = kind === 'drivers'
                ? `<div class="st-driver">
                       ${s.meta.number ? `<span class="st-driver-num" style="color:${color}">#${s.meta.number}</span>` : ''}
                       <span class="driver-fullname">${esc(s.meta.fullNameUpper)}</span>
                       <span class="driver-lastname">${esc(s.meta.lastName)}</span>
                   </div>`
                : `<div class="st-driver">${logo}<span class="constructor-fullname">${esc(s.meta.teamName)}</span><span class="constructor-short">${esc(s.meta.shortTeamName)}</span></div>`;

            // Pilotos: país. Equipos: sede (ciudad + bandera del país), con
            // el mismo estilo de celda.
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

    // ── Gráfico ────────────────────────────────────────────────────────────
    //
    // Mismo gráfico que la curva de forma del piloto (js/driver-season.js):
    // Chart.js de líneas, misma relación de aspecto, mismos puntos sobre la
    // línea, misma grilla, mismo tooltip. Lo único propio de esta página es que
    // hay 22 series en vez de 2, así que el radio de los puntos arranca más
    // chico y crece al enfocar una.

    // Tooltip centrado encima del punto; si arriba no entra (las últimas rondas
    // del líder rozan el techo del gráfico), cae debajo del punto. Chart.js
    // deja que el posicionador devuelva xAlign/yAlign y pisan a los de options.
    const TOOLTIP_GAP = 22;
    Chart.Tooltip.positioners.aboveOrBelow = function(elements, eventPosition){
        const el = elements[0]?.element;
        if(!el) return false;
        const { top } = this.chart.chartArea;
        const height = this.height || 96;          // 0 antes del primer dibujo
        const fits = el.y - TOOLTIP_GAP - height >= top;
        return { x: el.x, y: el.y, xAlign: 'center', yAlign: fits ? 'bottom' : 'top' };
    };

    // Logo del equipo para el tooltip. Chart.js acepta un canvas como
    // pointStyle pero lo dibuja a tamaño natural, así que el PNG se reduce una
    // sola vez a una teja de 18px (contain) y se cachea por equipo. La teja
    // existe desde el primer llamado; el logo aparece cuando termina de cargar.
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

    // Dibuja, sobre la serie enfocada, cuántos puntos sumó en cada carrera. Es el
    // dato que la curva acumulada esconde: la línea sube, pero no dice de cuánto
    // fue cada escalón. Equivale a la banda del podio del gráfico del piloto:
    // una capa editorial encima de los datos crudos.
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
            // Número suelto sobre cada punto, sin cápsula: el color de la
            // serie (rojo para DNF) y un halo oscuro para despegarlo de la
            // grilla y de las curvas grises de fondo. El halo es un strokeText
            // y no shadowBlur: la sombra se recalcula en cada frame de la
            // animación y en un canvas de este tamaño se nota como tirones.
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
                if(!dnf && !slot.pts) return;          // un cero no merece una etiqueta

                ctx.fillStyle = dnf ? 'rgba(217,86,79,1)' : withAlpha(focus.meta.color, 1);
                ctx.strokeText(label, point.x, point.y - 15);
                ctx.fillText(label, point.x, point.y - 15);
            });

            ctx.restore();
        },
    };

    // Abre o cierra una ranura animando su altura en píxeles ENTEROS. Con
    // grid-template-rows 0fr→1fr la altura de la tarjeta queda fraccionaria
    // en cada frame y, como tiene border-radius, el borde inferior se dibuja
    // antialiasado en una posición distinta cada vez: se ve como un tembleque
    // en la línea mientras se abre. Redondeando, la fracción de la tarjeta
    // no cambia durante la animación y el borde queda quieto.
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
            else if(open) el.style.height = 'auto';   // el contenido puede crecer después
        };
        el._raf = requestAnimationFrame(step);
    }

    // cubic-bezier(x1, y1, x2, y2) como función t → progreso, la misma curva
    // que usan las transiciones CSS del sitio.
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

    // Comparación de dos series: entre los puntos de cada ronda se dibuja un
    // conector vertical y, al lado, la diferencia acumulada (+32, +45…) en el
    // color del que va adelante. `progress` (0→1) lo anima mountPanel: el
    // conector crece desde el punto de abajo y la cifra aparece al final.
    const comparePlugin = {
        id: 'compare',

        // Los dos gruesos van en capas distintas: los conectores debajo de las
        // series (así los puntos quedan encima) y las cifras por arriba de todo.
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
                // Cifra: sólo si el hueco da para leerla, y no todas en celular.
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

        // Estado común a las dos capas: puntos y valores de las dos series.
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

        // Recorre las rondas con dato en las dos series y diferencia no nula.
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

    // Serie cuyo trazo pasa a menos de `radius` px del mouse, o null. Recorre
    // los segmentos entre puntos consecutivos de cada línea visible, así el
    // hover responde en cualquier parte de la curva y no sólo sobre un punto.
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
        // En celular la tarjeta es angosta: el gráfico va casi cuadrado (más alto)
        // y con puntos/tipografía más chicos para que no quede apretado.
        const isPhone = window.matchMedia('(max-width: 700px)').matches;

        // Que los logos ya estén cargados la primera vez que aparece el tooltip.
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
                // El resaltado al pasar el mouse es más corto que el de un toque:
                // tiene que seguir la mano, no llegar después.
                transitions: { hover: { animation: { duration: 220, easing: 'easeOutQuart' } } },
                // Pasar cerca de una línea la resalta (y a su fila); lejos, nada.
                // Se mide contra el trazo entero, no sólo contra los puntos.
                onHover: (event, _els, chart) => onHover?.(seriesNear(chart, event.x, event.y), event.native),
                aspectRatio: isPhone ? 0.95 : 2.9,
                // 'index' mostraría las 22 series juntas; con esta cantidad de
                // líneas el tooltip tiene que hablar de una sola.
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
                        // La "caja de color" de la línea del nombre es el logo
                        // del equipo (ver logoTile).
                        displayColors: true,
                        usePointStyle: true,
                        boxWidth: LOGO_TILE,
                        boxHeight: LOGO_TILE,
                        boxPadding: 6,
                        // Ver Chart.Tooltip.positioners.aboveOrBelow. El aire es
                        // para no tapar la etiqueta de puntos (+25) del punto.
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

    // ── Panel (pilotos o equipos) ──────────────────────────────────────────
    // Cada pestaña es una instancia de esto: gráfico + tabla compartiendo el
    // mismo enfoque. Las piezas del recuadro son las mismas que en la página del
    // piloto: cabecera, franja, lienzo y una nota al pie sacada de los datos.
    function mountPanel({ panel, kind, rounds, series }){
        // Re-render (archive cambia de año sobre el mismo panel): tirar el
        // gráfico y los listeners de la vuelta anterior, si los hay.
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

        // Dos modos excluyentes: foco (una serie) o comparación (hasta dos).
        let focusId = null;
        let compareOn = false;
        let compareIds = [];
        const byId = id => series.find(s => s.id === id) || null;
        const focused = () => compareOn ? null : byId(focusId);
        const compared = () => compareOn ? compareIds.map(byId).filter(Boolean) : [];
        // Serie bajo el mouse (fila de la tabla o línea del gráfico): se
        // resalta en los dos lados, por encima de lo elegido con un toque.
        let hoverId = null;

        // Sólo cuenta como hover un movimiento real del puntero. Cuando la
        // franja se abre y empuja la tabla y el gráfico hacia abajo, Chrome
        // dispara mouseover/mousemove por cada fila que pasa bajo el cursor
        // quieto; sin este filtro el hover recorre la tabla fila por fila
        // durante toda la animación y se ve como un tartamudeo.
        let lastPointer = null;
        const pointerMoved = e => {
            if(!e || e.clientX == null) return true;
            const moved = !lastPointer || lastPointer.x !== e.clientX || lastPointer.y !== e.clientY;
            lastPointer = { x: e.clientX, y: e.clientY };
            return moved;
        };

        // Animación del conector/cifras de la comparación (ver comparePlugin).
        // Chart.js anima colores y radios por su cuenta; esto corre a la par.
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

        // Nota al pie: una línea editorial calculada, igual que la del piloto.
        // Es lo que se lee cuando no hay nada enfocado.
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
            // Ronda en la que la diferencia fue más grande.
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

                // Sin nada elegido, el mouse sólo levanta la suya: el resto
                // apenas se atenúa para que no se pierda el contexto.
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
            // Sólo se reconstruye al cambiar de enfocado: paint() también corre
            // con cada hover, y rehacer el innerHTML volvía a pedir el logo
            // (y a quitarlo si no existía), moviendo todo lo de abajo.
            if(badge.dataset.key === active.id) return;
            badge.dataset.key = active.id;

            const pos = series.indexOf(active) + 1;
            // Mejor puesto de carrera de la temporada (slot.best: en un equipo es
            // el mejor de sus dos autos).
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

        // Un toque elige: en foco alterna la serie; en comparación llena la
        // primera ranura libre (o reemplaza la segunda si ya hay dos), y tocar
        // una elegida la saca.
        const pick = id => {
            if(!compareOn){ focusId = focusId === id ? null : id; return paint(); }
            if(compareIds.includes(id)) compareIds = compareIds.filter(x => x !== id);
            else if(compareIds.length < 2) compareIds = [...compareIds, id];
            else compareIds = [compareIds[0], id];
            paint();
        };
        const clearAll = () => { focusId = null; compareIds = []; compareOn = false; paint(); };
        // Un mousemove puede llegar más de una vez por frame: el repintado del
        // hover se agrupa en un solo requestAnimationFrame.
        let hoverRaf = 0;
        const setHover = id => {
            if(id === hoverId) return;
            hoverId = id;
            if(hoverRaf) return;
            hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; paint('hover'); });
        };
        const setCompare = on => {
            compareOn = on;
            // El enfocado pasa a ser el primero de la comparación, y al revés.
            if(on && focusId){ compareIds = [focusId]; focusId = null; }
            if(!on){ focusId = compareIds[0] ?? null; compareIds = []; }
            paint();
        };

        // Tocar la línea (o cerca de ella) elige; tocar el vacío suelta el foco.
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

        // Hover en la tabla → su línea; salir del gráfico o de la tabla lo suelta.
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

    // ── Pestañas ───────────────────────────────────────────────────────────
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

        // Igual que en grandprix.js: el panel entra deslizándose desde el
        // lado de la pestaña que se dejó.
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
        // Re-medir cuando carga la fuente F1: los botones cambian de ancho.
        document.fonts?.ready.then(() => { const c = bar.querySelector('.tab-btn.active'); if(c) move(c); });
        window.addEventListener('resize', () => {
            const current = bar.querySelector('.tab-btn.active');
            if(current) move(current);
        });
    }

    // ── Catálogos compartidos (no cambian con el año): se piden una sola vez ──
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
    // Devuelve true si dibujó algo, false si la temporada no tiene carreras.
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
            console.error('No se pudo cargar el campeonato', year, err);
            root.classList.add('is-empty');
            return false;
        }

        const rounds = buildRounds(season, { circuits, cities, countries });
        if(!rounds.length){ root.classList.add('is-empty'); return false; }

        const teamMeta = slug => {
            const team = teams[slug];
            // Sede del equipo: teams.json → cities.json → countries.json, el
            // mismo recorrido que la nacionalidad de un piloto.
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

        // Cabecera: cuántas rondas van de las que quedan en pie.
        const scheduled = totalScheduled(season);
        const sub = root.parentElement?.querySelector('#champHeaderSub');
        if(sub) sub.textContent = `After ${rounds.length} of ${scheduled} rounds`;

        if(typeof Chart === 'undefined'){
            console.error('Chart.js no está disponible');
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

    // ── Arranque en championship.html ──────────────────────────────────────
    // El año va en la URL (?season=2019) y se cambia con el selector de la
    // cabecera; sin parámetro se abre la temporada vigente (data/latest.json).
    // Las temporadas disponibles salen de data/seasons-index.json
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
                console.error('No se pudo resolver la temporada', err);
                root.classList.add('is-empty');
            }
        })();
    }
})();
