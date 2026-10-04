// archive.js: the season index.
//
// Archive no longer repeats the championship and the calendar with a year selector:
// results.html and championship.html do that with ?season=YYYY. Here there's one
// card per season (champion, champion team, how many races), grouped
// by decade, linking to those two pages. The data comes from
// data/seasons-index.json, precomputed by scripts/build-seasons-index.js,
// so the page requests a single small JSON instead of 37 season files.
//
// The card speaks the same language as the ones in drivers.html: a background tinted with
// the champion's team color, a giant watermark year, a logo that
// slides in on hover and the card lifting.

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

    // "Max Verstappen" → small first name on top, big surname below, as in
    // the driver cards.
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

    // The header numbers: how many seasons, races, different
    // champions, and who has the most titles in the archive.
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
            console.error('Could not load the season index', err);
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

        // One section per decade, newest first.
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

        // The whole card leads to that year's results; the links
        // below are still normal links (Championship goes to another page).
        grid.querySelectorAll('.archive-card').forEach(c => {
            const go = () => { window.location.href = c.dataset.href; };
            c.addEventListener('click', e => { if(!e.target.closest('a')) go(); });
            c.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target === c) go(); });
        });

        // The cards enter staggered as they appear on screen.
        const cards = [...grid.querySelectorAll('.archive-card')];
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if(!entry.isIntersecting) return;
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.1 });
        cards.forEach((c, i) => { c.style.transitionDelay = `${(i % 4) * 70}ms`; observer.observe(c); });
        // Once they've entered, the delay mustn't hold back the hover.
        cards.forEach(c => c.addEventListener('transitionend', () => { c.style.transitionDelay = ''; }, { once: true }));
    })();
})();
