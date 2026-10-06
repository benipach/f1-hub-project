// season-hero.js: the "Season Poster", the hero of results.html.
//
// The season as a typographic poster, all of it from the season file:
//   - the title, and next to it the wins by team (logo, a bar in the team
//     color, the count);
//   - four big numbers (rounds, different winners, winning teams, most wins),
//     each with a small figure under it that shows what the number counts:
//     the rounds' progress, the winners' codes, the teams' colors, one block
//     per win;
//   - the season bar: one stretch per round in race order, painted in the
//     winning team's color (hatched where the round hasn't been run), with the
//     flags under it. In a season under way the next round is marked and the
//     caption names it.
//
// Only data, no photos: it reads the same for 1995 as for 2026.
//
// On load the title rises letter by letter, the numbers count up from 0, the
// bars grow and the season bar fills from left to right. Hovering a stretch
// names that race in the caption; clicking it goes down to that race in the
// table and opens its classification.
//
// Rebuilt on every year change (results.js → showSeason), so it all enters
// again. Classic script (defines globals).

// Builds the title letter by letter for the staggered entrance, the year in
// outline: "The 2026 Season", like the Drivers page's "The 2026 Grid".
function renderSeasonHeroTitle(title, year) {
    let i = 0;
    const nodes = ['The', String(year), 'Season'].flatMap((word, w) => {
        const wordEl = Object.assign(document.createElement('span'), { className: word === String(year) ? 'sp-year' : '' });
        wordEl.append(...[...word].map(char => {
            const charEl = Object.assign(document.createElement('span'), { className: 'sp-char', textContent: char });
            charEl.style.setProperty('--i', i++);
            return charEl;
        }));
        return w ? [' ', wordEl] : [wordEl];
    });
    title.replaceChildren(...nodes);
    title.classList.add('is-ready');
}

// Counts a number up from 0 (ease-out), after `delay` ms.
function spCountUp(el, target, delay) {
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
    const DURATION = 900;
    const ease = t => 1 - Math.pow(1 - t, 3);
    let start = null;
    el.textContent = '0';
    const tick = now => {
        if (start === null) start = now + delay;
        const t = Math.min(Math.max((now - start) / DURATION, 0), 1);
        el.textContent = Math.round(target * ease(t));
        if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

const SP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const spDate = iso => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? `${d.getUTCDate()} ${SP_MONTHS[d.getUTCMonth()]}` : '';
};

// Opts: ctx (catalogs: drivers, teams…), flagOf(gpId, gp) → flag emoji,
// onPick(gpId) when a run round is chosen on the bar.
function renderSeasonHero(season, year, { ctx, flagOf, onPick }) {
    const hero = document.getElementById('season-hero');
    if (!hero) return;
    const entries = getSeasonEntries(season).filter(([, gp]) => !isGpCancelled(gp));

    const rounds = entries.map(([gpId, gp]) => {
        const p1 = getSessionResults(gp, 'race').find(r => Number(r.pos) === 1) || null;
        const teamId = p1 ? resolveTeamId(p1.team, ctx.teams) : null;
        const d = p1 ? ctx.drivers?.[p1.driver] : null;
        const last = p1 ? (d?.lastName ?? p1.driver.split('-').slice(-1)[0]) : '';
        return {
            gpId, gp,
            run: !!p1,
            driver: p1?.driver ?? null,
            winner: p1 ? `${d?.firstName ?? ''} ${last}`.trim() : '',
            last,
            code: p1 ? (d?.shortName || last.slice(0, 3)).toUpperCase() : '',
            teamId,
            team: teamId ? (ctx.teams?.[teamId]?.name ?? p1.team) : '',
            color: p1 ? (ctx.teams?.[teamId]?.color || '#8a8a96') : null,
            flag: flagOf(gpId, gp),
            date: spDate(gp.sessions?.race?.date),
        };
    });
    const run = rounds.filter(r => r.run);
    const next = run.length < rounds.length ? rounds.find(r => !r.run) : null;

    // Groups the run rounds by a key, most first; on a tie, whoever got
    // there first (the earlier last win).
    const rank = key => {
        const map = new Map();
        for (const r of run) map.set(r[key], [...(map.get(r[key]) || []), r]);
        return [...map.values()].sort((a, b) =>
            b.length - a.length || rounds.indexOf(a.at(-1)) - rounds.indexOf(b.at(-1)));
    };
    const drivers = rank('driver');
    const teams = rank('teamId');

    // ── Wins by team, next to the title ──
    const panel = hero.querySelector('.sp-teams');
    panel.hidden = !teams.length;
    panel.innerHTML = teams.length ? `
        <p class="sp-panel-title">Wins by team</p>
        <ul>${teams.map((list, i) => {
            const t = list.at(-1);
            const logo = teamLogoPath(t.teamId, '.');
            return `
                <li style="--c:${t.color}; --w:${(list.length / teams[0].length) * 100}%; --i:${i}">
                    <span class="sp-team-name">${logo ? `<img src="${logo}" alt="" onerror="this.remove()">` : ''}${t.team}</span>
                    <span class="sp-team-bar"><i></i></span>
                    <b>${list.length}</b>
                </li>`;
        }).join('')}</ul>` : '';

    // ── The four numbers, each with its figure ──
    const top = drivers[0];
    const tied = top ? drivers.filter(w => w.length === top.length).length : 0;
    const stats = [
        {
            value: run.length,
            of: next ? rounds.length : null,
            label: next ? 'Rounds run' : 'Rounds',
            figure: `<span class="sp-progress" style="--w:${rounds.length ? (run.length / rounds.length) * 100 : 0}%"><i></i></span>`,
        },
        {
            value: drivers.length,
            label: drivers.length === 1 ? 'Winner' : 'Different winners',
            figure: `<span class="sp-codes">${drivers.map(w => `<span style="--c:${w.at(-1).color}">${w[0].code}</span>`).join('')}</span>`,
        },
        {
            value: teams.length,
            label: 'Winning teams',
            figure: `<span class="sp-swatches">${teams.map(t => `<i style="--c:${t.at(-1).color}" title="${t.at(-1).team}"></i>`).join('')}</span>`,
        },
        top ? {
            value: top.length,
            label: `Most wins <b>${top[0].last}${tied > 1 ? ` +${tied - 1}` : ''}</b>`,
            color: top.at(-1).color,
            figure: `<span class="sp-blocks">${top.map(r => `<i style="--c:${r.color}"></i>`).join('')}</span>`,
        } : { value: 0, label: 'Most wins', figure: '' },
    ];

    hero.querySelector('.sp-stats').innerHTML = stats.map((s, i) => `
        <div class="sp-stat" style="--i:${i}${s.color ? `; --c:${s.color}` : ''}">
            <dd><span class="sp-num" data-value="${s.value}">${s.value}</span>${s.of ? `<span class="sp-of">/${s.of}</span>` : ''}</dd>
            <dt>${s.label}</dt>
            ${s.figure ? `<div class="sp-figure">${s.figure}</div>` : ''}
        </div>`).join('');

    hero.querySelectorAll('.sp-num').forEach((el, i) => spCountUp(el, Number(el.dataset.value), 700 + i * 120));

    // ── The season bar, with the flags under it ──
    const bar = hero.querySelector('.sp-bar');
    const flags = hero.querySelector('.sp-flags');
    const caption = hero.querySelector('.sp-caption');
    const restCaption = next
        ? `<b>Next</b> · R${next.gp.round} ${gpShortLabel(next.gp.name)} GP${next.date ? ` · ${next.date}` : ''}`
        : rounds.length ? 'Every race of the season, in the color of the team that won it' : 'No rounds on the calendar yet';

    bar.innerHTML = rounds.map((r, i) => r.run
        ? `<button type="button" class="sp-seg" data-i="${i}" style="--c:${r.color}; --i:${i}" aria-label="Round ${r.gp.round}, ${r.gp.name}: won by ${r.winner}"></button>`
        : `<span class="sp-seg is-upcoming${r === next ? ' is-next' : ''}" data-i="${i}" style="--i:${i}"></span>`
    ).join('');
    flags.innerHTML = rounds.map((r, i) => `<span style="--i:${i}">${r.flag}</span>`).join('');
    if (typeof twemoji !== 'undefined') twemoji.parse(hero.querySelector('.sp-season'), { folder: 'svg', ext: '.svg' });

    // The winner with their team's logo in front. Not every team has one:
    // without it, a dot in the team color takes its place.
    const winnerHtml = r => {
        const logo = teamLogoPath(r.teamId, '.');
        return `<span class="sp-caption-winner" style="--c:${r.color}">${logo
            ? `<img class="sp-caption-logo" src="${logo}" alt="${r.team}" onerror="this.replaceWith(Object.assign(document.createElement('i'), { className: 'sp-caption-dot' }))">`
            : '<i class="sp-caption-dot"></i>'}${r.winner}</span>`;
    };
    const captionFor = r => `<b>R${r.gp.round}</b> · ${gpShortLabel(r.gp.name)} GP · ${r.run ? winnerHtml(r) : `Not run yet${r.date ? ` · ${r.date}` : ''}`}`;
    caption.innerHTML = restCaption;

    // Assigned (not added) so a year change doesn't stack handlers.
    bar.onpointerover = e => {
        const seg = e.target.closest('.sp-seg');
        if (seg) caption.innerHTML = captionFor(rounds[Number(seg.dataset.i)]);
    };
    bar.onpointerleave = () => { caption.innerHTML = restCaption; };
    bar.onfocusin = bar.onpointerover;
    bar.onfocusout = bar.onpointerleave;
    bar.onclick = e => {
        const seg = e.target.closest('.sp-seg');
        if (!seg) return;
        const r = rounds[Number(seg.dataset.i)];
        // Without hover (touch screens), the first tap names the race.
        if (matchMedia('(hover: none)').matches && !seg.classList.contains('is-active')) {
            bar.querySelector('.is-active')?.classList.remove('is-active');
            seg.classList.add('is-active');
            caption.innerHTML = captionFor(r);
            return;
        }
        if (r.run) onPick(r.gpId);
    };

    renderSeasonHeroTitle(hero.querySelector('.sp-copy h1'), year);
}
