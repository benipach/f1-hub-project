// ── CAREER STATS: the career measured against everyone else ──
//
// A number alone says nothing: "3 wins" can be a lot or a little. Since
// data/careers.json has all 120 drivers in the dataset, each figure is shown with
// its ranking position and a standings table where you can see where it falls.
//
// Replaces the old js/driver.js, which had a hardcoded, made-up season
// (80 wins, titles 2021-2023) and drew a 382-cell heatmap whose
// calendar repeated identically across 19 seasons.

(function(){
    const root = document.getElementById('driverCareer');
    if(!root) return;

    const driverId = new URLSearchParams(location.search).get('driver') || 'max-verstappen';

    const CATEGORIES = [
        { key: 'wins',    label: 'Race wins' },
        { key: 'podiums', label: 'Podiums' },
        { key: 'poles',   label: 'Poles' },
        { key: 'points',  label: 'Points' },
        { key: 'fastestLaps', label: 'Fastest laps' },
        { key: 'races',   label: 'Races' },
    ];

    const ordinal = n => {
        const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const fmt = n => Number(n).toLocaleString('en-US');

    // Descending ranking per category, tiebroken by seniority: between two
    // drivers with the same figure, whoever reached it first goes first. Example:
    // with 5 titles each, Schumacher (2004) ranks above Hamilton
    // (2018), because he reached that number fourteen years earlier.
    //
    // The date comes from careers[id].achievedAt[key], precomputed by
    // scripts/build-careers.js: it's the day of the last event that raised that
    // counter, i.e. when the driver reached the total shown today.
    //
    // Drivers at 0 don't have that date, so they're tiebroken by their
    // debut: they all stay last (0 is 0), but among them seniority
    // wins. A 2001 driver who never won ranks above one who
    // debuted last year and has barely had any chances yet. Previously the
    // 99 drivers without wins shared 32nd place and a rookie showed up as
    // high as someone with twenty years of racing without a win.
    //
    // As a last criterion, the id: so the order doesn't change between reloads.
    function rankDate(career, key){
        return (career.achievedAt && career.achievedAt[key]) || career.debut || null;
    }

    function compareDates(a, b){
        if(a && b) return a < b ? -1 : a > b ? 1 : 0;
        if(a) return -1;   // no date (neither achievement nor debut) goes to the bottom
        if(b) return 1;
        return 0;
    }

    // Only those tied on figure AND date share a position: 1,2,2,4.
    function buildRanking(careers, key){
        const rows = Object.entries(careers)
            .map(([id, c]) => ({ id, value: c[key] || 0, date: rankDate(c, key) }))
            .sort((a, b) => (b.value - a.value) || compareDates(a.date, b.date) || a.id.localeCompare(b.id));
        let rank = 0, prevValue = null, prevDate = null;
        rows.forEach((row, i) => {
            if(row.value !== prevValue || row.date !== prevDate){
                rank = i + 1;
                prevValue = row.value;
                prevDate = row.date;
            }
            row.rank = rank;
        });
        return rows;
    }

    // Being champion isn't just another stat, so when there are titles the section
    // opens with a gold block that dominates the screen, and each trophy carries the details
    // of that season instead of being pure decoration.
    function renderTitles(el, career){
        const titles = career.titles || [];
        if(titles.length){
            el.classList.add('is-champion');
            el.innerHTML = `
                <div class="career-champion">
                    <div class="career-champion-mark">
                        <img src="../img/wc1.png" alt="" class="career-champion-laurel">
                        <span class="career-champion-count">${titles.length}<i>&times;</i></span>
                        <img src="../img/wc2.png" alt="" class="career-champion-laurel career-champion-laurel--right">
                    </div>
                    <p class="career-champion-title">World Champion</p>

                    <ul class="career-champion-list">
                        ${titles.map(t => `
                            <li class="career-champion-year" style="--title-color:${t.color || '#E8C77A'}">
                                ${t.teamId ? `<img src="../img/teams/${t.teamId}-logo.png" alt="${t.team}" class="career-champion-teamlogo" onerror="this.remove()">` : ''}
                                <img src="../img/trophies/wdc.png" alt="World Championship ${t.year}" class="career-champion-trophy">
                                <span class="career-champion-season">${t.year}</span>
                                <span class="career-champion-team">${t.team}</span>
                                <span class="career-champion-detail">${t.wins} ${t.wins === 1 ? 'win' : 'wins'} &middot; ${fmt(t.points)} pts</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
            return;
        }
        // Without titles there's still something to say: their best championship,
        // with every year they achieved it.
        el.classList.remove('is-champion');
        const best = career.bestFinish;
        const years = best?.years ?? (best?.year != null ? [best.year] : []);
        el.innerHTML = best
            ? `<p class="career-crown-label career-crown-label--modest">
                   Best championship finish
                   <strong>P${best.pos}</strong>
                   <span>in ${years.join(', ')}</span>
               </p>`
            : '';
    }

    function renderStanding(el, career, rankings){
        el.innerHTML = CATEGORIES.map(({ key, label }) => {
            const row = rankings[key].find(r => r.id === driverId);
            const total = rankings[key].length;
            return `
                <div class="career-stat">
                    <strong class="career-stat-value">${fmt(career[key] || 0)}</strong>
                    <span class="career-stat-label">${label}</span>
                    <span class="career-stat-rank">${ordinal(row?.rank ?? total)} <i>of ${total}</i></span>
                </div>
            `;
        }).join('');
    }

    // Top 5 plus the driver if they're outside it, so you always see where they fall.
    // The cut (the ellipsis) only goes in if there really are drivers
    // skipped between 5th and them: if they're 6th, it just continues as one more row,
    // since an "…" there hides nobody and only breaks the list's rhythm.
    function boardRows(ranking, topN = 5){
        const top = ranking.slice(0, topN);
        if(top.some(r => r.id === driverId)) return { rows: top, gap: false };
        const idx = ranking.findIndex(r => r.id === driverId);
        if(idx === -1) return { rows: top, gap: false };
        return { rows: [...top, ranking[idx]], gap: idx > topN };
    }

    function renderBoard(el, ranking, names){
        const { rows, gap } = boardRows(ranking);
        const leader = ranking[0]?.value || 1;
        el.innerHTML = rows.map((r, i) => {
            const name = names[r.id] || { full: r.id, last: r.id };
            return `
            ${gap && i === rows.length - 1 ? '<li class="career-board-gap" aria-hidden="true"><span></span></li>' : ''}
            <li class="career-board-row${r.id === driverId ? ' is-self' : ''}">
                <span class="career-board-rank">${r.rank}</span>
                <span class="career-board-name">
                    <span class="career-board-name-full">${name.full}</span>
                    <span class="career-board-name-last">${name.last}</span>
                </span>
                <span class="career-board-bar"><span style="width:${leader ? (r.value / leader) * 100 : 0}%"></span></span>
                <span class="career-board-value">${fmt(r.value)}</span>
            </li>
        `;
        }).join('');
    }

    (async function init(){
        let careers, drivers;
        try {
            ({ careers, drivers } = await window.driverData);
        } catch (err) {
            console.error('Could not load careers.json', err);
            root.classList.add('is-empty');
            return;
        }

        const career = careers[driverId];
        if(!career){ root.classList.add('is-empty'); return; }

        // The section's highlights (positions, own row, active tab) use
        // the current team's color instead of a fixed red.
        const currentColor = career.eras?.[career.eras.length - 1]?.color;
        if(currentColor) root.style.setProperty('--team-color', currentColor);

        const names = {};
        for(const id of Object.keys(careers)){
            const d = drivers[id];
            names[id] = d
                ? { full: `${d.firstName} ${d.lastName}`, last: d.lastName }
                : { full: id.replace(/-/g, ' '), last: id.replace(/-/g, ' ') };
        }

        const rankings = {};
        for(const { key } of CATEGORIES) rankings[key] = buildRanking(careers, key);

        renderTitles(root.querySelector('#careerCrown'), career);
        renderStanding(root.querySelector('#careerStanding'), career, rankings);

        // How many drivers have ever won: it gives the number scale.
        const winners = Object.values(careers).filter(c => c.wins > 0).length;
        const note = root.querySelector('#careerNote');
        if(note){
            note.innerHTML = `Only <b>${winners}</b> of the <b>${Object.keys(careers).length}</b> drivers
                in the database have ever won a race.`;
        }

        const board = root.querySelector('#careerBoard');
        const tabs = [...root.querySelectorAll('.career-board-tab')];
        const ORDER = CATEGORIES.map(c => c.key);
        let current = null;

        // A pill that slides from one tab to the other instead of jumping:
        // it copies the position and size of the active tab.
        const tabBar = root.querySelector('.career-board-tabs');
        const pill = document.createElement('span');
        pill.className = 'career-board-pill';
        tabBar?.prepend(pill);

        function placePill(){
            const active = tabs.find(t => t.dataset.cat === current);
            if(!active) return;
            pill.style.left   = `${active.offsetLeft}px`;
            pill.style.top    = `${active.offsetTop}px`;
            pill.style.width  = `${active.offsetWidth}px`;
            pill.style.height = `${active.offsetHeight}px`;
        }

        window.addEventListener('resize', placePill);

        function show(key){
            if(key === current) return;                 // tapping the active tab does nothing
            const prev = current ? ORDER.indexOf(current) : -1;
            const next = ORDER.indexOf(key);
            const dir = prev === -1 || next === prev ? 0 : (next > prev ? 1 : -1);
            current = key;

            tabs.forEach(t => t.classList.toggle('is-active', t.dataset.cat === key));
            placePill();
            renderBoard(board, rankings[key], names);

            board.classList.remove('is-switching');
            void board.offsetWidth;
            board.style.setProperty('--board-slide-x', dir > 0 ? '24px' : dir < 0 ? '-24px' : '0px');
            board.classList.add('is-switching');
        }

        tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.cat)));
        show('wins');

        // The first position has no animation; only afterwards does it slide.
        requestAnimationFrame(() => pill.classList.add('is-ready'));
        // Fonts may load later and change the tabs' width.
        document.fonts?.ready.then(placePill);
    })();
})();
