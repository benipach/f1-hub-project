// ── HEADER: the hero and the "Driver info" card ──
//
// Everything comes from real data: drivers.json (name, abbreviation, nationality,
// birth), careers.json (number, debut, seasons, titles, current team and
// career totals) and countries.json (country name + flag). Nothing hardcoded.
//
// The three fields the old version showed by hand that don't exist in any JSON
// (full name with middle name, hometown, height/weight) were replaced
// with data we do have: current team, seasons and titles.

(function(){
    const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';
    const IMG_BASE = '../img';

    const driverId = new URLSearchParams(location.search).get('driver') || 'max-verstappen';

    const lastSlug = id => id.split('-').slice(-1)[0];
    // teamSlug() viene de js/shared/teams.js.

    const flagUrl = iso => {
        if(!iso || iso.length !== 2) return null;
        const code = [...iso.toUpperCase()]
            .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
            .join('-');
        return `${TWEMOJI_BASE}${code}.svg`;
    };

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const prettyDate = iso => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '—';
    };

    // Age as of today, or as of the date of death if there is one.
    function ageFrom(dob, dod){
        if(!dob) return '—';
        const born = new Date(dob);
        const ref = dod ? new Date(dod) : new Date();
        let age = ref.getFullYear() - born.getFullYear();
        const m = ref.getMonth() - born.getMonth();
        if(m < 0 || (m === 0 && ref.getDate() < born.getDate())) age--;
        return age;
    }

    const fmt = n => Number(n || 0).toLocaleString('en-US');

    // "Pit wall" hero: a panel in the team color cut diagonally, with the
    // name and career totals, and the driver's photo on the other side.
    function fillHero(root, driver, career, country, careers){
        const num = career?.number;
        const era = career?.eras?.[career.eras.length - 1] || null;
        const seasons = career?.seasons || [];
        const titles = career?.titleYears?.length || 0;
        const flag = flagUrl(country?.isoCode);
        const logo = era ? `${IMG_BASE}/teams/${teamSlug(era.teamId || era.team)}-logo.png` : null;

        // If they didn't race the dataset's last season, their team is "the last one".
        const latest = Math.max(...Object.values(careers).map(c => c.seasons?.[c.seasons.length - 1] || 0));

        if(era?.color) root.style.setProperty('--team', era.color);

        const stats = [
            ['Races',   career?.races],
            ['Wins',    career?.wins],
            ['Podiums', career?.podiums],
            ['Poles',   career?.poles],
        ];

        root.innerHTML = `
            <figure class="driver-hero-photo">
                <img src="${IMG_BASE}/drivers/${lastSlug(driverId)}-2.png" alt="" onerror="this.remove()">
            </figure>
            <div class="driver-hero-edge"></div>
            <div class="driver-hero-panel">
                <dl class="driver-hero-id">
                    <div>
                        <dt>Nationality</dt>
                        <dd>${flag ? `<img class="driver-hero-flag" src="${flag}" alt="" loading="lazy">` : ''}${country?.name || driver.nationality || '—'}</dd>
                    </div>
                    ${era ? `
                        <div>
                            <dt>${seasons.includes(latest) ? 'Team' : 'Last team'}</dt>
                            <dd>${logo ? `<img class="driver-hero-logo" src="${logo}" alt="" onerror="this.remove()">` : ''}${era.team}</dd>
                        </div>
                    ` : ''}
                </dl>
                <div class="driver-hero-numbox" aria-hidden="true">
                    ${num != null ? `<span class="driver-hero-num">${num}</span>` : ''}
                </div>
                <div class="driver-hero-body">
                    <p class="driver-hero-first">${driver.firstName}</p>
                    <h1 class="driver-hero-last" style="--len:${driver.lastName.length}">${driver.lastName}</h1>
                    ${titles ? `
                        <div class="driver-hero-crown">
                            <div class="driver-hero-crown-count">
                                <img src="${IMG_BASE}/wc1.png" alt="">
                                <span>${titles}</span>
                                <img src="${IMG_BASE}/wc2.png" alt="">
                            </div>
                            <div>
                                <p class="driver-hero-crown-label">World Champion</p>
                                <p class="driver-hero-crown-years">${career.titleYears.join(' · ')}</p>
                            </div>
                        </div>
                    ` : ''}
                    <dl class="driver-hero-stats">
                        ${stats.map(([k, v]) => `<div><dd>${fmt(v)}</dd><dt>${k}</dt></div>`).join('')}
                    </dl>
                    ${seasons.length ? `<p class="driver-hero-since">In Formula 1 since <b>${seasons[0]}</b> · <b>${seasons.length}</b> ${seasons.length === 1 ? 'season' : 'seasons'} · <b>${fmt(career?.points)}</b> points</p>` : ''}
                </div>
            </div>
        `;
    }

    // Profile card: only what the hero doesn't say. Code and number as a plate,
    // three big figures (age, debut, seasons) and the teams they've been with.
    function fillInfo(root, driver, career){
        const num = career?.number;
        const eras = career?.eras || [];
        const seasons = career?.seasons || [];
        const currentEra = eras[eras.length - 1] || null;

        // The background behind the driver cut-out is painted in the team color
        // (see .driver-info-visual in driver.css). Only if we have a real hex.
        if(currentEra?.color) root.style.setProperty('--team-color', currentEra.color);

        // The debut comes from the precomputed milestones: GP, flag and result.
        const debut = career?.milestones?.find(m => m.label === 'Debut') || null;
        const debutFlag = flagUrl(debut?.iso);
        const span = (from, to) => from === to ? `${from}` : `${from} — ${to}`;

        const tiles = [
            {
                key: driver.dateOfDeath ? 'Age at death' : 'Age',
                value: ageFrom(driver.dateOfBirth, driver.dateOfDeath),
                sub: `Born ${prettyDate(driver.dateOfBirth)}`,
            },
            {
                key: 'F1 debut',
                value: seasons[0] ?? '—',
                sub: debut
                    ? `${debutFlag ? `<img class="driver-info-flag" src="${debutFlag}" alt="" loading="lazy">` : ''}${debut.gp} GP${debut.pos != null ? ` · P${debut.pos}` : ''}`
                    : '',
            },
            {
                key: 'Seasons',
                value: seasons.length || '—',
                sub: seasons.length ? span(seasons[0], seasons[seasons.length - 1]) : '',
            },
        ];

        root.innerHTML = `
            <div class="driver-info-visual">
                <img class="driver-info-portrait" src="${IMG_BASE}/drivers/${lastSlug(driverId)}.png" alt="${driver.firstName} ${driver.lastName}" onerror="this.closest('.driver-info-visual').style.display='none'">
            </div>
            <div class="driver-info-facts">
                <div class="driver-info-head">
                    <span class="driver-info-code">${driver.shortName || driver.lastName.slice(0, 3)}</span>
                    ${num != null ? `<span class="driver-info-plate">${num}</span>` : ''}
                    <span class="driver-info-fullname">${driver.firstName} ${driver.lastName}</span>
                </div>
                <dl class="driver-info-tiles">
                    ${tiles.map(t => `
                        <div>
                            <dt>${t.key}</dt>
                            <dd>${t.value}</dd>
                            ${t.sub ? `<p class="driver-info-sub">${t.sub}</p>` : ''}
                        </div>
                    `).join('')}
                </dl>
                ${eras.length ? `
                    <div class="driver-info-teams">
                        <p class="driver-info-label">${eras.length === 1 ? 'Team' : `Teams · ${eras.length}`}</p>
                        <ul>
                            ${eras.map(e => `
                                <li style="--c:${e.color || 'var(--text-dim)'}">
                                    <span class="driver-info-team">${e.team}</span>
                                    <span class="driver-info-sub">${span(e.from, e.to)} · ${e.races} ${e.races === 1 ? 'race' : 'races'}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    (async function init(){
        const info = document.getElementById('driverInfo');
        let data;
        try {
            data = await window.driverData;
        } catch (err) {
            console.error('Could not load the driver data', err);
            if(info) info.classList.add('is-empty');
            return;
        }

        const driver = data.drivers[driverId];
        if(!driver){
            console.error('Driver not found:', driverId);
            if(info) info.classList.add('is-empty');
            return;
        }

        const career = data.careers[driverId] || null;
        const country = data.countries[driver.nationality] || null;

        document.title = `F1 Hub | ${driver.firstName} ${driver.lastName}`;

        const hero = document.getElementById('driverHero');
        if(hero) fillHero(hero, driver, career, country, data.careers);
        if(info) fillInfo(info, driver, career);
    })();
})();
