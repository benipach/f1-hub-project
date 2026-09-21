// archive.js — el índice de temporadas.
//
// Archive ya no repite el campeonato y el calendario con un selector de año:
// eso lo hacen results.html y championship.html con ?season=AAAA. Acá va una
// tarjeta por temporada (campeón, equipo campeón, cuántas carreras), agrupadas
// por década, que linkea a esas dos páginas. Los datos salen de
// data/seasons-index.json, precalculado por scripts/build-seasons-index.js,
// así la página pide un solo JSON chico en vez de 37 season files.
//
// La tarjeta habla el mismo idioma que las de drivers.html: fondo teñido con
// el color del equipo del campeón, año gigante de marca de agua, logo que
// entra al hover y la tarjeta que se eleva.

(function(){
    const grid  = document.getElementById('archive-seasons');
    const empty = document.getElementById('archive-empty');
    const meta  = document.getElementById('archive-meta');
    const kicker = document.getElementById('archive-kicker');
    if(!grid) return;

    const esc = v => String(v ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const logoSrc = teamId => teamId ? `./img/teams/${esc(teamId)}-logo.png` : null;

    // "Max Verstappen" → nombre chico arriba, apellido grande abajo, como en
    // las tarjetas de pilotos.
    function splitName(full){
        const parts = String(full || '').trim().split(' ');
        const last = parts.length > 1 ? parts.pop() : '';
        return { first: parts.join(' '), last };
    }

    function card(season, teams, latestYear){
        const { year, rounds, raced, driverChampion: dc, teamChampion: tc } = season;
        const inProgress = year === latestYear && raced < rounds;
        const accent = teams[dc?.teamId]?.color || '#8a8a95';
        const { first, last } = splitName(dc?.name);
        const champLogo = logoSrc(dc?.teamId);
        const teamLogo = logoSrc(tc?.id);

        const status = inProgress
            ? `<span class="archive-card-status is-live"><i></i>Live · ${raced}/${rounds}</span>`
            : `<span class="archive-card-status">${rounds} rounds</span>`;

        const body = dc ? `
            <div class="archive-card-champ">
                <span class="archive-card-label">${inProgress ? 'Championship leader' : 'World Champion'}</span>
                <span class="archive-card-name">
                    <span class="archive-card-first">${esc(first)}</span>
                    <span class="archive-card-last">${esc(last || first)}</span>
                </span>
                <span class="archive-card-sub">${esc(dc.teamName ?? '')}${dc.wins ? ` · ${dc.wins} win${dc.wins === 1 ? '' : 's'}` : ''}</span>
            </div>
            <div class="archive-card-team">
                <span class="archive-card-label">${inProgress ? 'Leading team' : 'Constructors'}</span>
                <span class="archive-card-team-name">
                    ${teamLogo ? `<img src="${teamLogo}" alt="" onerror="this.remove()">` : ''}
                    <span>${esc(tc?.name ?? '—')}</span>
                </span>
                ${tc ? `<span class="archive-card-sub">${tc.points} pts</span>` : ''}
            </div>`
            : `<p class="archive-card-none">No results loaded yet.</p>`;

        return `
            <article class="archive-card" style="--accent:${accent}" data-href="./results.html?season=${year}" tabindex="0">
                <span class="archive-card-stripe" aria-hidden="true"></span>
                <span class="archive-card-year-bg" aria-hidden="true">${year}</span>
                ${champLogo ? `<img class="archive-card-logo-bg" src="${champLogo}" alt="" aria-hidden="true" onerror="this.remove()">` : ''}

                ${status}
                <div class="archive-card-head">
                    <span class="archive-card-year">${year}</span>
                </div>

                ${body}

                <div class="archive-card-actions">
                    <a class="archive-card-link" href="./results.html?season=${year}">Results <span aria-hidden="true">→</span></a>
                    <a class="archive-card-link" href="./championship.html?season=${year}">Championship <span aria-hidden="true">→</span></a>
                </div>
            </article>`;
    }

    // Los números de la cabecera: cuántas temporadas, carreras, campeones
    // distintos, y quién tiene más títulos en el archivo.
    function renderMeta(seasons){
        if(!meta) return;
        const finished = seasons.filter(s => s.driverChampion && s.raced >= s.rounds);
        const titles = new Map();
        for(const s of finished){
            const id = s.driverChampion.id;
            titles.set(id, { name: s.driverChampion.name, n: (titles.get(id)?.n || 0) + 1 });
        }
        const most = [...titles.values()].sort((a, b) => b.n - a.n);
        const top = most[0];
        const tied = most.filter(t => t.n === top?.n).map(t => splitName(t.name).last || t.name);
        const races = seasons.reduce((n, s) => n + s.raced, 0);

        const item = (label, value) => `<div class="archive-hero-meta-item">${label}<strong>${value}</strong></div>`;
        meta.innerHTML = [
            item('Seasons', seasons.length),
            item('Grands Prix', races),
            item('Champions', titles.size),
            top ? item('Most titles', `${top.n}× ${esc(tied.slice(0, 2).join(' · '))}`) : '',
        ].join('');
    }

    (async function init(){
        let seasons, teams, latest;
        try {
            [seasons, teams, latest] = await Promise.all([loadSeasonsSummary('.'), loadTeams('.'), loadLatest('.')]);
        } catch (err) {
            console.error('No se pudo cargar el índice de temporadas', err);
            if(empty){ empty.hidden = false; empty.textContent = "Couldn't load the seasons list."; }
            return;
        }

        if(!seasons.length){
            if(empty) empty.hidden = false;
            return;
        }

        const latestYear = Number(latest?.latestSeason) || null;
        const sorted = [...seasons].sort((a, b) => b.year - a.year);
        if(kicker) kicker.textContent = `Formula 1 · ${sorted[sorted.length - 1].year}–${sorted[0].year}`;
        renderMeta(seasons);

        // Una sección por década, más nueva primero.
        const decades = new Map();
        for(const s of sorted){
            const d = Math.floor(s.year / 10) * 10;
            if(!decades.has(d)) decades.set(d, []);
            decades.get(d).push(s);
        }
        grid.innerHTML = [...decades.entries()].map(([decade, list]) => `
            <section class="archive-decade">
                <h2 class="section-title">${decade}s</h2>
                <div class="archive-grid">${list.map(s => card(s, teams, latestYear)).join('')}</div>
            </section>`).join('');

        // La tarjeta entera lleva a los resultados del año; los links de
        // abajo siguen siendo links normales (Championship va a otra página).
        grid.querySelectorAll('.archive-card').forEach(c => {
            const go = () => { window.location.href = c.dataset.href; };
            c.addEventListener('click', e => { if(!e.target.closest('a')) go(); });
            c.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target === c) go(); });
        });

        // Las tarjetas entran escalonadas a medida que aparecen en pantalla.
        const cards = [...grid.querySelectorAll('.archive-card')];
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if(!entry.isIntersecting) return;
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.1 });
        cards.forEach((c, i) => { c.style.transitionDelay = `${(i % 4) * 70}ms`; observer.observe(c); });
        // Una vez que entraron, el delay no tiene que frenar el hover.
        cards.forEach(c => c.addEventListener('transitionend', () => { c.style.transitionDelay = ''; }, { once: true }));
    })();
})();
