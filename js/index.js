document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [season, circuits] = await Promise.all([
            loadSeason('.'),
            loadCircuits('.')
        ]);
        updateDashboard(season, circuits);
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

    document.documentElement.style.setProperty('--race-gradient', buildGradient(nextGP.color));

    const circuit = circuits[CIRCUIT_MAP[nextId]];
    const heroImg = document.getElementById('hero-image');
    if (heroImg) heroImg.src = `./img/circuits/${CIRCUIT_MAP[nextId]}.png`;

    const gpTitle = document.getElementById('hero-gp-title');
    gpTitle.textContent = nextGP.name.replace(' Grand Prix', '').trim();
    gpTitle.style.background = buildGradient(nextGP.color);
    gpTitle.style.webkitBackgroundClip = 'text';
    gpTitle.style.backgroundClip = 'text';
    gpTitle.style.color = 'transparent';

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
            const h3 = card.querySelector('h3');
            if (h3 && gp.color) {
                h3.style.background = buildGradient(gp.color);
                h3.style.webkitBackgroundClip = 'text';
                h3.style.backgroundClip = 'text';
                h3.style.color = 'transparent';
            }
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

    const target = [
        h.fp1Date, h.fp2Date, h.fp3Date,
        h.sprintQualyDate, h.sprintRaceDate,
        h.qualyDate, h.raceStartDate
    ].filter(Boolean)
     .map(parseDate)
     .filter(d => d > now)
     .sort((a, b) => a - b)[0] ?? parseDate(h.raceEndDate);

    const diff = target - now;
    const pad  = n => String(Math.max(0, n)).padStart(2, '0');

    document.getElementById('time-days').innerText  = pad(Math.floor(diff / 86400000));
    document.getElementById('time-hours').innerText = pad(Math.floor((diff / 3600000) % 24));
    document.getElementById('time-mins').innerText  = pad(Math.floor((diff / 60000) % 60));
    document.getElementById('time-secs').innerText  = pad(Math.floor((diff / 1000) % 60));
}