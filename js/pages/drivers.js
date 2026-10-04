// pages/drivers.js: sorts the hero and the cards in drivers.html by the
// current championship and puts the season's year in the title.
// Teams follow the constructors' standings and, within each team, its two
// drivers follow the drivers' standings. The HTML has a fixed order that stays as-is if
// the data doesn't load.

// Points per key (driver or team), adding up races and sprints from GPs that weren't
// cancelled, plus race finishes to break ties.
function computeStandings(season) {
    const drivers = new Map();
    const teams = new Map();
    const entry = (map, key) => {
        if (!map.has(key)) map.set(key, { pts: 0, finishes: [] });
        return map.get(key);
    };

    for (const gp of Object.values(season)) {
        if (isGpCancelled(gp)) continue;
        for (const key of ['race', 'sprintRace']) {
            for (const row of getSessionResults(gp, key)) {
                const targets = [entry(drivers, row.driver), entry(teams, resolveTeamId(row.team))];
                for (const t of targets) {
                    t.pts += row.pts || 0;
                    if (key === 'race' && typeof row.pos === 'number') t.finishes.push(row.pos);
                }
            }
        }
    }
    return { drivers, teams };
}

// FIA regulations: on equal points, whoever has more wins goes ahead; if
// still equal, more second places, and so on. Without data, the HTML order
// is kept (Array.sort is stable).
function compareStanding(a, b) {
    if (!a || !b) return (b ? 1 : 0) - (a ? 1 : 0);
    if (a.pts !== b.pts) return b.pts - a.pts;
    const worst = Math.max(0, ...a.finishes, ...b.finishes);
    for (let pos = 1; pos <= worst; pos++) {
        const diff = b.finishes.filter(p => p === pos).length - a.finishes.filter(p => p === pos).length;
        if (diff) return diff;
    }
    return 0;
}

function sortHero({ drivers, teams }) {
    const strip = document.querySelector('.lv-strip');
    const driverId = slice => new URL(slice.href).searchParams.get('driver');

    const pairs = [...strip.querySelectorAll('.lv-pair')];
    pairs.sort((a, b) => compareStanding(teams.get(a.dataset.team), teams.get(b.dataset.team)));

    for (const pair of pairs) {
        const slices = [...pair.querySelectorAll('.lv-slice')];
        slices.sort((a, b) => compareStanding(drivers.get(driverId(a)), drivers.get(driverId(b))));
        // The logo goes between the two drivers
        pair.append(slices[0], pair.querySelector('.lv-logo-slot'), slices[1]);
        strip.append(pair);
    }
    // On phones the strip scrolls sideways: when reordering (or reloading,
    // since the browser restores the scroll) it can end up shifted. It goes back to the
    // start so the first team is fully visible.
    strip.scrollLeft = 0;
}

// The cards' team blocks, in the same order as the hero
function sortGrid({ drivers, teams }) {
    const grid = document.querySelector('.drivers-grid');
    const driverId = card => new URL(card.href).searchParams.get('driver');

    const blocks = [...grid.querySelectorAll('.dc-team')];
    blocks.sort((a, b) => compareStanding(teams.get(a.dataset.team), teams.get(b.dataset.team)));

    for (const block of blocks) {
        const pair = block.querySelector('.dc-pair');
        const cards = [...pair.querySelectorAll('.drivercard')];
        cards.sort((a, b) => compareStanding(drivers.get(driverId(a)), drivers.get(driverId(b))));
        pair.append(...cards);
        grid.append(block);
    }
}

// Each team's name in its block header, exactly as in
// teams.json. The HTML has the same ones in case the data doesn't load.
function fillTeamNames(teamsData) {
    for (const block of document.querySelectorAll('.dc-team')) {
        const name = teamsData[block.dataset.team]?.name;
        if (name) block.querySelector('.dc-team-full').textContent = name;
    }
}

// Builds the title letter by letter for the staggered entrance. Without a year (if the
// data doesn't load) it stays "The Grid".
function renderTitle(year) {
    const title = document.querySelector('.lv-copy h1');
    const words = year ? ['The', String(year), 'Grid'] : ['The', 'Grid'];
    let i = 0;
    const nodes = words.flatMap((word, w) => {
        const wordEl = Object.assign(document.createElement('span'), { className: word === String(year) ? 'lv-year' : '' });
        wordEl.append(...[...word].map(char => {
            const charEl = Object.assign(document.createElement('span'), { className: 'lv-char', textContent: char });
            charEl.style.setProperty('--i', i++);
            return charEl;
        }));
        return w ? [' ', wordEl] : [wordEl];
    });
    title.replaceChildren(...nodes);
    title.classList.add('is-ready');
}

// Numbers the strips in their final order for the cascading entrance and
// shows them. Each logo takes the number of its spot, between its two drivers.
function revealHero() {
    const strip = document.querySelector('.lv-strip');
    let i = 0;
    for (const el of strip.querySelectorAll('.lv-slice, .lv-logo')) {
        el.style.setProperty('--i', el.classList.contains('lv-logo') ? i - 0.5 : i++);
    }
    strip.classList.add('is-ready');
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!document.querySelector('.lv-strip')) return;
    let latest;
    try {
        latest = await loadLatest('.');
    } catch (err) {
        console.error('Error loading drivers page data:', err);
    }
    loadTeams('.').then(fillTeamNames).catch(err => console.error('Error loading drivers page data:', err));
    if (latest) {
        try {
            const season = await loadSeason('.', latest.latestSeason);
            const standings = computeStandings(season);
            sortHero(standings);
            sortGrid(standings);
        } catch (err) {
            console.error('Error loading drivers page data:', err);
        }
    }
    // With or without data: if it doesn't load, they enter in HTML order. The title
    // goes along with the hero so its delay counts from the same moment.
    renderTitle(latest?.latestSeason);
    revealHero();
});
