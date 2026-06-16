// ── Team metadata ──────────────────────────────────────────────────────────
// Maps the team name from the JSON to the CSS class and a display-friendly name.
const TEAM_META = {
    'Mercedes':        { cls: 'team-mercedes',  label: 'Mercedes' },
    'Ferrari':         { cls: 'team-ferrari',   label: 'Ferrari' },
    'McLaren':         { cls: 'team-mclaren',   label: 'McLaren' },
    'Red Bull Racing': { cls: 'team-redbull',   label: 'Red Bull' },
    'Williams':        { cls: 'team-williams',  label: 'Williams' },
    'Racing Bulls':    { cls: 'team-rbracing',  label: 'Racing Bulls' },
    'Alpine':          { cls: 'team-alpine',    label: 'Alpine' },
    'Haas F1 Team':    { cls: 'team-haas',      label: 'Haas' },
    'Aston Martin':    { cls: 'team-aston',     label: 'Aston Martin' },
    'Audi':            { cls: 'team-audi',      label: 'Audi' },
    'Cadillac':        { cls: 'team-cadillac',  label: 'Cadillac' },
};

// Maps full driver name → image filename (without extension).
// Used to resolve avatars even for GPs that don't include the `team` field.
const DRIVER_IMG = {
    'Alexander Albon':   'albon',
    'Arvid Lindblad':    'lindblad',
    'Carlos Sainz':      'sainz',
    'Charles Leclerc':   'leclerc',
    'Esteban Ocon':      'ocon',
    'Fernando Alonso':   'alonso',
    'Franco Colapinto':  'colapinto',
    'Gabriel Bortoleto': 'bortoleto',
    'George Russell':    'russell',
    'Isack Hadjar':      'hadjar',
    'Kimi Antonelli':    'antonelli',
    'Lance Stroll':      'stroll',
    'Lando Norris':      'norris',
    'Lewis Hamilton':    'hamilton',
    'Liam Lawson':       'lawson',
    'Max Verstappen':    'verstappen',
    'Nico Hulkenberg':   'hulkenberg',
    'Oliver Bearman':    'bearman',
    'Oscar Piastri':     'piastri',
    'Pierre Gasly':      'gasly',
    'Sergio Perez':      'perez',
    'Valtteri Bottas':   'bottas',
};

// Maps full driver name → team name (fallback for early GPs without team field).
const DRIVER_TEAM = {
    'Alexander Albon':   'Williams',
    'Arvid Lindblad':    'Racing Bulls',
    'Carlos Sainz':      'Williams',
    'Charles Leclerc':   'Ferrari',
    'Esteban Ocon':      'Haas F1 Team',
    'Fernando Alonso':   'Aston Martin',
    'Franco Colapinto':  'Alpine',
    'Gabriel Bortoleto': 'Audi',
    'George Russell':    'Mercedes',
    'Isack Hadjar':      'Red Bull Racing',
    'Kimi Antonelli':    'Mercedes',
    'Lance Stroll':      'Aston Martin',
    'Lando Norris':      'McLaren',
    'Lewis Hamilton':    'Ferrari',
    'Liam Lawson':       'Racing Bulls',
    'Max Verstappen':    'Red Bull Racing',
    'Nico Hulkenberg':   'Audi',
    'Oliver Bearman':    'Haas F1 Team',
    'Oscar Piastri':     'McLaren',
    'Pierre Gasly':      'Alpine',
    'Sergio Perez':      'Cadillac',
    'Valtteri Bottas':   'Cadillac',
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [season, circuits] = await Promise.all([
            loadSeason('.'),
            loadCircuits('.')
        ]);
        updateDashboard(season, circuits);
        buildStandings(season);
        setInterval(() => tickCountdown(season), 1000);
    } catch (err) {
        console.error('Error cargando datos:', err);
    }
});

function updateDashboard(season, circuits) {
    const now = new Date();
    const nextEntry = findNextRace(season);
    if (!nextEntry) return;
    const [nextId, nextGP] = nextEntry;

    // Mantuve esta variable por si la usás para otra cosa (botones, bordes, etc.)
    document.documentElement.style.setProperty('--race-gradient', buildGradient(nextGP.color));

    const circuit = circuits[CIRCUIT_MAP[nextId]];
    const heroImg = document.getElementById('hero-image');
    if (heroImg) heroImg.src = `./img/circuits/${CIRCUIT_MAP[nextId]}.png`;

    const gpTitle = document.getElementById('hero-gp-title');
    gpTitle.textContent = nextGP.name.replace(' Grand Prix', '').trim();
    // (Líneas de gradiente y recorte de texto removidas)

    document.getElementById('hero-circuit-label').textContent = circuit?.name || '—';
    document.getElementById('hero-round').textContent = `Round ${String(nextGP.round).padStart(2, '0')}`;
    document.getElementById('show-more-btn').href = `./races/race.html?gp=${nextId}`;

    const sprintPill = document.getElementById('hero-sprint-pill');
    if (sprintPill) sprintPill.style.display = nextGP.sprint ? 'inline-flex' : 'none';

    renderHeroTable(nextGP);
    tickCountdown(season);
    updateRacecards(season, nextId, now);
}

function updateRacecards(season, nextId, now) {
    document.querySelectorAll('.race-card').forEach(card => {
        const gpId   = card.dataset.id;
        const gp     = season[gpId];
        const spanEl = card.querySelector('.race-status');
        const linkEl = card.querySelector('.race-link');
        if (!gp) return;

        card.classList.remove('race-card-ended', 'race-card-next', 'race-card-upcoming', 'race-card-cancelled');
        if (spanEl) spanEl.className = 'race-status';
        if (linkEl) linkEl.href = `./races/race.html?gp=${gpId}`;

        if (gp.cancelled) {
            card.classList.add('race-card-cancelled');
            if (spanEl) { spanEl.classList.add('status-cancelled'); spanEl.innerText = 'CANCELLED'; }
            if (linkEl) linkEl.innerText = 'Cancelled';

        } else if (gp.horarios?.raceEndDate && new Date(gp.horarios.raceEndDate) < now) {
            card.classList.add('race-card-ended');
            if (spanEl) { spanEl.classList.add('status-ended'); spanEl.innerText = 'ENDED'; }
            if (linkEl) linkEl.innerText = 'View Results';

        } else if (gpId === nextId) {
            // (Líneas de gradiente en el <h3> removidas)
            card.classList.add('race-card-next');
            if (spanEl) { spanEl.classList.add('status-next'); spanEl.innerText = 'NEXT'; }
            if (linkEl) linkEl.innerText = 'Show More';

        } else {
            card.classList.add('race-card-upcoming');
            if (spanEl) { spanEl.classList.add('status-upcoming'); spanEl.innerText = 'UPCOMING'; }
            if (linkEl) linkEl.innerText = 'Show More';
        }
    });
}

function renderHeroTable(gp) {
    const tableCard = document.querySelector('.race-schedule-card');
    if (!tableCard || !gp.horarios) return;

    const h        = gp.horarios;
    const isSprint = !!h.sprintQualyDate;

    const fp1Start   = parseDate(h.fp1Date);
    const fp1End     = parseDate(h.fp1EndDate);
    const qualyStart = parseDate(h.qualyDate);
    const qualyEnd   = parseDate(h.qualyEndDate);
    const raceStart  = parseDate(h.raceStartDate);
    const raceEnd    = parseDate(h.raceEndDate);

    const sessionRow = (name, start, end) => `
        <div class="schedule-session">
            <span class="schedule-session-name">${name}</span>
            <span class="schedule-session-time">${formatRange(start, end)}</span>
        </div>`;

    const dayBlock = (date, ...sessions) => `
        <div class="schedule-day">
            <p class="schedule-day-title">${formatDate(date)}</p>
            ${sessions.join('')}
        </div>`;

    let html = '';

    if (isSprint) {
        const sqStart = parseDate(h.sprintQualyDate);
        const sqEnd   = parseDate(h.sprintQualyEndDate);
        const srStart = parseDate(h.sprintRaceDate);
        const srEnd   = parseDate(h.sprintRaceEndDate);
        html =
            dayBlock(fp1Start,
                sessionRow('FP 1', fp1Start, fp1End),
                sessionRow('Sprint Qualy', sqStart, sqEnd)) +
            dayBlock(srStart,
                sessionRow('Sprint Race', srStart, srEnd),
                sessionRow('Qualifying', qualyStart, qualyEnd)) +
            dayBlock(raceStart,
                sessionRow('Race', raceStart, raceEnd));
    } else {
        const fp2Start = parseDate(h.fp2Date);
        const fp2End   = parseDate(h.fp2EndDate);
        const fp3Start = parseDate(h.fp3Date);
        const fp3End   = parseDate(h.fp3EndDate);
        html =
            dayBlock(fp1Start,
                sessionRow('FP 1', fp1Start, fp1End),
                sessionRow('FP 2', fp2Start, fp2End)) +
            dayBlock(fp3Start,
                sessionRow('FP 3', fp3Start, fp3End),
                sessionRow('Qualifying', qualyStart, qualyEnd)) +
            dayBlock(raceStart,
                sessionRow('Race', raceStart, raceEnd));
    }

    tableCard.innerHTML = `
        <p class="race-schedule-title">${gp.name}</p>
        ${html}
        <div class="race-schedule-footer"><p>Local time in Buenos Aires, Argentina</p></div>`;
}

function tickCountdown(season) {
    const now       = new Date();
    const nextEntry = findNextRace(season);
    if (!nextEntry) return;
    const [, nextGP] = nextEntry;
    const h = nextGP.horarios;
    if (!h) return;

    const sessions = [
        { name: 'FP 1',           start: parseDate(h.fp1Date),         end: parseDate(h.fp1EndDate)         },
        { name: 'FP 2',           start: parseDate(h.fp2Date),         end: parseDate(h.fp2EndDate)         },
        { name: 'FP 3',           start: parseDate(h.fp3Date),         end: parseDate(h.fp3EndDate)         },
        { name: 'Sprint Qualy',   start: parseDate(h.sprintQualyDate), end: parseDate(h.sprintQualyEndDate) },
        { name: 'Sprint Race',    start: parseDate(h.sprintRaceDate),  end: parseDate(h.sprintRaceEndDate)  },
        { name: 'Qualifying',     start: parseDate(h.qualyDate),       end: parseDate(h.qualyEndDate)       },
        { name: 'Race',           start: parseDate(h.raceStartDate),   end: parseDate(h.raceEndDate)        },
    ].filter(s => s.start && s.end);

    // Sesión en curso (started pero no terminada)
    const live = sessions.find(s => s.start <= now && s.end > now);
    // Próxima sesión que aún no empezó
    const next = sessions.filter(s => s.start > now).sort((a, b) => a.start - b.start)[0];

    let target, label;
    if (live) {
        target = live.end;
        label  = `${live.name} ends in`;
    } else if (next) {
        target = next.start;
        label  = `${next.name} starts in`;
    } else {
        target = parseDate(h.raceEndDate);
        label  = 'Race ends in';
    }

    const labelEl = document.getElementById('hero-countdown-label');
    if (labelEl) labelEl.textContent = label;

    const diff = target - now;
    const pad  = n => String(Math.max(0, n)).padStart(2, '0');

    document.getElementById('time-days').innerText  = pad(Math.floor(diff / 86400000));
    document.getElementById('time-hours').innerText = pad(Math.floor((diff / 3600000) % 24));
    document.getElementById('time-mins').innerText  = pad(Math.floor((diff / 60000) % 60));
    document.getElementById('time-secs').innerText  = pad(Math.floor((diff / 1000) % 60));
}
// ── Driver Standings ────────────────────────────────────────────────────────

function buildStandings(season) {
    // 1. Accumulate points from race + sprintRace across every GP.
    const driverMap = {}; // { fullName: { pts, team, lastRound } }

    for (const [, gp] of Object.entries(season)) {
        if (!gp || typeof gp !== 'object') continue;
        const results = gp.results;
        if (!results || typeof results !== 'object' || Array.isArray(results)) continue;

        for (const sessionKey of ['race', 'sprintRace']) {
            const entries = results[sessionKey];
            if (!Array.isArray(entries)) continue;

            for (const entry of entries) {
                const driver = entry.driver;
                const pts    = Number(entry.pts) || 0;
                const team   = entry.team || DRIVER_TEAM[driver] || '';
                if (!driver) continue;

                if (!driverMap[driver]) {
                    driverMap[driver] = { pts: 0, team, lastRound: 0 };
                }
                driverMap[driver].pts += pts;
                // Keep the most recent team name we see
                if (team) driverMap[driver].team = team;
                if (gp.round > driverMap[driver].lastRound) {
                    driverMap[driver].lastRound = gp.round;
                }
            }
        }
    }

    // 2. Sort by points desc, then by last round (more recent = better tiebreak)
    const standings = Object.entries(driverMap)
        .filter(([, d]) => d.pts > 0)
        .sort(([, a], [, b]) => b.pts - a.pts || b.lastRound - a.lastRound);

    if (!standings.length) return; // No results yet

    // 3. Find the last completed round for the subtitle
    const lastRound = Math.max(
        ...Object.values(season)
            .filter(gp => gp && typeof gp === 'object' && !Array.isArray(gp))
            .filter(gp => {
                const r = gp.results;
                return r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.race) && r.race.length > 0;
            })
            .map(gp => gp.round)
    );
    const lastGP = Object.values(season).find(gp =>
        gp && typeof gp === 'object' && !Array.isArray(gp) && gp.round === lastRound
    );

    // 4. Update subtitle
    const subtitleEl = document.querySelector('.standings-subtitle');
    if (subtitleEl && lastGP) {
        subtitleEl.textContent = `After ${lastGP.name.replace(' Grand Prix', ' GP')} · Round ${String(lastRound).padStart(2, '0')}`;
    }

    // 5. Render rows (top 10)
    const list = document.querySelector('.standings-list');
    if (!list) return;

    list.innerHTML = standings.slice(0, 10).map(([driver, data], i) => {
        const pos        = i + 1;
        const teamName   = data.team;
        const teamMeta   = TEAM_META[teamName] || { cls: '', label: teamName };
        const imgSlug    = DRIVER_IMG[driver] || driver.split(' ').pop().toLowerCase();
        const lastName   = driver.split(' ').slice(1).join(' ') || driver;

        return `
        <div class="standing-row ${teamMeta.cls}">
            <span class="standing-pos">${pos}</span>
            <img class="standing-avatar"
                 src="./img/drivers/${imgSlug}.png"
                 alt="${driver}"
                 onerror="this.style.visibility='hidden'">
            <span class="standing-name">${lastName}</span>
            <span class="standing-pts">${data.pts}</span>
            <span class="standing-delta delta-neutral">—</span>
        </div>`;
    }).join('');
}