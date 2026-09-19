// archive.js — cualquier temporada pasada, con las mismas piezas del sitio.
//
// No dibuja nada propio: elige el año y llama a lo que ya existe.
//   - renderChampionship(root, year)   → js/championship.js (gráfico + tablas)
//   - renderRaceCards(season, ctx, el) → js/pages/index.js (tarjetas de carrera
//                                        con el podio, igual que en la portada)
// Así, cualquier mejora que se le haga a championship.html o al index llega
// al archivo sola.
//
// El año va en la URL (?season=2019), así se puede linkear y compartir; sin
// parámetro se abre la última temporada terminada.

(function(){
    const select   = document.getElementById('archive-season-select');
    const champ    = document.getElementById('archive-championship');
    const calendar = document.getElementById('archive-calendar');
    const title    = document.getElementById('archive-title');
    const subtitle = document.getElementById('archive-subtitle');
    const calTitle = document.getElementById('archive-calendar-title');
    const empty    = document.getElementById('archive-empty');
    if(!select || !champ || !calendar) return;

    const gpCount = season => Object.values(season).filter(gp => !gp.cancelled).length;
    const racedCount = season => Object.values(season)
        .filter(gp => Array.isArray(gp.sessions?.race?.results) && gp.sessions.race.results.length).length;

    let ctx = null;          // catálogos compartidos (circuits, cities, …)
    let rendering = 0;       // para descartar renders viejos si el usuario cambia rápido

    async function showSeason(year){
        const ticket = ++rendering;
        document.title = `F1 Hub | ${year} Archive`;
        if(title) title.textContent = `${year} Season`;
        if(calTitle) calTitle.textContent = `${year} Season Calendar`;

        // Estado de carga: se atenúa lo anterior en vez de vaciarlo, así no
        // parpadea la página al cambiar de año.
        champ.classList.add('is-loading');
        calendar.classList.add('is-loading');

        let season;
        try {
            season = await loadSeason('.', year);
        } catch (err) {
            console.error('No se pudo cargar la temporada', year, err);
            if(ticket !== rendering) return;
            champ.classList.remove('is-loading');
            calendar.classList.remove('is-loading');
            champ.classList.add('is-empty');
            calendar.querySelectorAll('.race-card').forEach(el => el.remove());
            if(empty){ empty.hidden = false; empty.textContent = `Couldn't load the ${year} season.`; }
            return;
        }
        if(ticket !== rendering) return;

        const raced = racedCount(season);
        if(subtitle){
            subtitle.textContent = raced
                ? `${raced} of ${gpCount(season)} rounds with results.`
                : 'No results loaded for this season yet.';
        }

        // Campeonato (gráfico + tablas). Si la temporada no tiene carreras
        // corridas, renderChampionship devuelve false y se oculta el bloque.
        const hasChamp = await renderChampionship(champ, year);
        if(ticket !== rendering) return;
        if(empty) empty.hidden = hasChamp;

        // Calendario con las tarjetas de carrera y el podio de cada una.
        renderRaceCards(season, ctx, calendar);
        if(typeof twemoji !== 'undefined') twemoji.parse(calendar, { folder: 'svg', ext: '.svg' });

        champ.classList.remove('is-loading');
        calendar.classList.remove('is-loading');
    }

    function setUrlYear(year){
        const url = new URL(window.location.href);
        url.searchParams.set('season', year);
        history.replaceState(null, '', url);
    }

    (async function init(){
        let years, latest;
        try {
            let circuits, cities, countries, teams, drivers;
            [years, latest, circuits, cities, countries, teams, drivers] = await Promise.all([
                loadSeasonsIndex('.'),
                loadLatest('.'),
                loadCircuits('.'), loadCities('.'), loadCountries('.'), loadTeams('.'), loadDrivers('.'),
            ]);
            ctx = { circuits, cities, countries, teams, drivers };
        } catch (err) {
            console.error('No se pudo iniciar el archivo', err);
            if(subtitle) subtitle.textContent = "Couldn't load the seasons list.";
            return;
        }

        if(!years.length){
            if(subtitle) subtitle.textContent = 'No seasons available.';
            return;
        }

        // Más nueva primero. La temporada vigente también está: ver el año en
        // curso desde acá es válido, aunque tenga su propia página.
        const sorted = [...years].sort((a, b) => b - a);
        select.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join('');

        // Por defecto, la última temporada terminada (la anterior a la vigente).
        const current = Number(latest?.latestSeason) || sorted[0];
        const requested = Number(new URLSearchParams(location.search).get('season'));
        const fallback = sorted.find(y => y < current) ?? sorted[0];
        const initial = years.includes(requested) ? requested : fallback;

        select.value = String(initial);
        select.addEventListener('change', () => {
            const year = Number(select.value);
            setUrlYear(year);
            showSeason(year);
        });

        setUrlYear(initial);
        await showSeason(initial);
    })();
})();
