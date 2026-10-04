// Generates data/careers.json from all the data/seasons/season*.json files.
//
// Why precompute: the season files add up to ~7 MB. The Biography section only
// needs milestones and eras per driver, so they're resolved once here and the page
// makes a single small fetch instead of 20 large ones.
//
// Regenerate whenever season data changes:  node scripts/build-careers.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEASONS_DIR = path.join(ROOT, 'data', 'seasons');
const OUT = path.join(ROOT, 'data', 'careers.json');

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const teams = readJson(path.join(ROOT, 'data', 'teams.json'));
const circuits = readJson(path.join(ROOT, 'data', 'circuits.json'));
const cities = readJson(path.join(ROOT, 'data', 'cities.json'));
const countries = readJson(path.join(ROOT, 'data', 'countries.json'));

// Team resolution (aliases + token trimming) lives in js/shared/teams.js,
// which is a classic browser script. It's evaluated here as-is so that
// the precomputation and the frontend resolve exactly the same way; otherwise a driver
// could have a "Mercedes-AMG" era separate from "Mercedes" just because the
// 2026 races were loaded by the OpenF1 adapter under another name.
const teamHelpers = new Function(
    fs.readFileSync(path.join(ROOT, 'js', 'shared', 'teams.js'), 'utf8')
    + '\nreturn { resolveTeamId };'
)();

function resolveTeam(rawId) {
    const id = teamHelpers.resolveTeamId(rawId, teams);
    const meta = teams[id] || null;
    return {
        id,
        name: meta?.name || id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        color: meta?.color || null,
    };
}

// GP → circuit → city → country → 2-letter ISO, for the flag.
function isoFor(gp) {
    const city = circuits[gp.circuitId]?.location?.city;
    return countries[cities[city]?.country]?.isoCode || null;
}

const sessionResults = (gp, key) => {
    const r = gp?.sessions?.[key]?.results;
    return Array.isArray(r) ? r : [];
};

const isRetired = row => /DN[FS]/i.test(String(row?.time || ''));

// ── Walk every season and collect each race per driver ──────────────────────
const files = fs.readdirSync(SEASONS_DIR)
    .filter(f => /^season\d{4}\.json$/.test(f))
    .sort();

const byDriver = new Map();          // driverId → [race, …] in chronological order
const seasonChampions = new Map();   // year → driverId
const seasonStandings = new Map();   // driverId → { year: championship position }

for (const file of files) {
    const year = Number(file.match(/\d{4}/)[0]);
    const season = readJson(path.join(SEASONS_DIR, file));
    const gps = Object.values(season).sort((a, b) => a.round - b.round);

    const seasonPoints = {};

    for (const gp of gps) {
        const race = sessionResults(gp, 'race');
        if (!race.length) continue;

        const quali = sessionResults(gp, 'qualifying');
        const sprint = sessionResults(gp, 'sprintRace');

        for (const key of ['race', 'sprintRace']) {
            for (const r of sessionResults(gp, key)) {
                seasonPoints[r.driver] = (seasonPoints[r.driver] || 0) + (r.pts || 0);
            }
        }

        for (const r of race) {
            const q = quali.find(x => x.driver === r.driver);
            const s = sprint.find(x => x.driver === r.driver);
            if (!byDriver.has(r.driver)) byDriver.set(r.driver, []);
            byDriver.get(r.driver).push({
                year,
                round: gp.round,
                gp: gp.name.replace(/ Grand Prix$/, ''),
                iso: isoFor(gp),
                date: (gp.sessions.race.date || '').slice(0, 10),
                pos: r.pos,
                // quali: qualifying position (poles come from here).
                // grid:  actual starting position, with penalties (0 = pit
                //        lane); if the season doesn't have it, the qualifying one.
                quali: q?.pos ?? null,
                grid: typeof r.grid === 'number' ? r.grid : (q?.pos ?? null),
                pts: (r.pts || 0) + (s?.pts || 0),
                dnf: isRetired(r),
                // Listed in the race but didn't start: doesn't count as a start
                // for the "most race starts" record.
                dns: /DNS/i.test(String(r.time || '')),
                fl: Boolean(r.fastestLap),
                team: r.team,
                number: r.number ?? null,
            });
        }
    }

    const standings = Object.entries(seasonPoints).sort((a, b) => b[1] - a[1]);
    standings.forEach(([id], i) => {
        if (!seasonStandings.has(id)) seasonStandings.set(id, {});
        seasonStandings.get(id)[year] = i + 1;
    });

    // Points still to be awarded. A weekend counts as
    // pending only if its race hasn't been run; if the race is in, the sprint
    // (if there is one) is too, even if its results are missing from the JSON. 25 per
    // race + 8 per sprint (F1 2026 doesn't award a fastest lap point).
    let pointsLeft = 0;
    for (const gp of gps) {
        if (gp.cancelled) continue;
        if (sessionResults(gp, 'race').length) continue;   // finde terminado
        pointsLeft += 25;
        if (gp.sprint) pointsLeft += 8;
    }

    // Champion only if the title is decided: either the season is over (nothing left
    // to award), or the leader's advantage over 2nd already exceeds all the points
    // in play, so they can't be caught.
    const gap = standings.length >= 2 ? standings[0][1] - standings[1][1] : Infinity;
    const decided = standings.length > 0 && (pointsLeft === 0 || gap > pointsLeft);
    if (decided) seasonChampions.set(year, standings[0][0]);
}

// ── Build each driver's record ──────────────────────────────────────────────
function milestone(race, label) {
    if (!race) return null;
    const t = resolveTeam(race.team);
    return {
        label,
        year: race.year,
        gp: race.gp,
        iso: race.iso,
        date: race.date,
        pos: race.pos,
        grid: race.grid,
        team: t.name,
        teamColor: t.color,
    };
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// The race where a title was mathematically sealed: the season is replayed
// round by round looking for the first one where the champion's lead
// over the best of the rest exceeds all the points still in play.
function findClinchRace(year, champId) {
    let season;
    try { season = readJson(path.join(SEASONS_DIR, `season${year}.json`)); }
    catch { return null; }

    const gps = Object.values(season).filter(g => !g.cancelled).sort((a, b) => a.round - b.round);
    const running = {};

    for (let i = 0; i < gps.length; i++) {
        const gp = gps[i];
        for (const key of ['race', 'sprintRace']) {
            for (const r of sessionResults(gp, key)) {
                running[r.driver] = (running[r.driver] || 0) + (r.pts || 0);
            }
        }

        // Maximum points a rival could score in the remaining rounds.
        let remaining = 0;
        for (let j = i + 1; j < gps.length; j++) {
            remaining += 25;
            if (gps[j].sprint) remaining += 8;
        }

        const champPts = running[champId] || 0;
        const bestOther = Math.max(0, ...Object.entries(running)
            .filter(([id]) => id !== champId)
            .map(([, p]) => p));

        if (champPts - bestOther > remaining) {
            const row = sessionResults(gp, 'race').find(r => r.driver === champId);
            return {
                year,
                round: gp.round,
                gp: gp.name.replace(/ Grand Prix$/, ''),
                iso: isoFor(gp),
                date: (gp.sessions?.race?.date || '').slice(0, 10),
                pos: row?.pos ?? null,
                grid: null,
                team: row?.team ?? null,
            };
        }
    }
    return null;   // the clinch couldn't be verified (incomplete data)
}

// Consecutive stretches with the same team. Grouped by *resolved* team, so
// "red-bull" and "red-bull-racing" count as a single era.
function buildEras(races) {
    const eras = [];
    for (const r of races) {
        const t = resolveTeam(r.team);
        const last = eras[eras.length - 1];
        if (last && last.teamId === t.id) {
            last.races.push(r);
        } else {
            eras.push({ teamId: t.id, teamName: t.name, teamColor: t.color, races: [r] });
        }
    }
    return eras.map(e => {
        const finished = e.races.filter(r => !r.dnf);
        const years = [...new Set(e.races.map(r => r.year))].sort();
        // Race with the best finish in that stint (the earliest if tied).
        const bestRace = finished.length
            ? finished.reduce((b, r) => (r.pos < b.pos ? r : b))
            : null;
        const eraWins = finished.filter(r => r.pos === 1);   // already in chronological order
        return {
            teamId: e.teamId,
            team: e.teamName,
            color: e.teamColor,
            // seasons are the years actually present in the data: the dataset
            // doesn't have 2018-2025, so a from-to range would just be lying.
            seasons: years,
            from: years[0],
            to: years[years.length - 1],
            races: e.races.length,
            points: e.races.reduce((a, r) => a + r.pts, 0),
            wins: eraWins.length,
            podiums: finished.filter(r => r.pos <= 3).length,
            poles: e.races.filter(r => r.quali === 1).length,
            best: bestRace ? bestRace.pos : null,
            bestRace,                            // input for the "best result in the team" milestone
            firstWin: eraWins[0] ?? null,        // inputs for "first/last win with the team"
            lastWin: eraWins[eraWins.length - 1] ?? null,
            titles: years.filter(y => seasonChampions.get(y) === e.driverId),
        };
    });
}

// ── ALL-TIME RECORDS ────────────────────────────────────────────────────────
// Every race in the database is walked in order, keeping each driver's total
// in each category, and noting when someone takes the record.
// "All-time" means all-time *within the database*: no outside
// numbers are added. Today the database starts in 1990 and has no complete qualifying before
// 2003 or fastest laps before 2004, so the first records in each
// category come from whatever there is; as the season files grow, the
// result corrects itself.
//
// A driver's states in a category: no record, co-holder (tied at the top)
// or sole holder. Milestones come from state changes:
//   · no record → co-holder       "Equalled all-time record"
//   · no record → sole holder     "Broke all-time record"
//   · co-holder → sole holder     "Broke", unless in that same streak they had already
//     been sole holder (extending a record that was already theirs: not repeated).
// Extending your own record doesn't create a milestone; losing it and getting it back does.
//
// When nobody had anything yet in the category (the first race in the database,
// or the first year with poles or fastest laps loaded) there's no previous record to
// break or equal: it's taken as the starting point, with no milestone.
const RECORDS = [
    { key: 'titles',      amount: null },   // added at the GP where the title was sealed
    { key: 'wins',        amount: r => !r.dnf && r.pos === 1 ? 1 : 0 },
    { key: 'podiums',     amount: r => !r.dnf && r.pos <= 3 ? 1 : 0 },
    { key: 'poles',       amount: r => r.quali === 1 ? 1 : 0 },
    { key: 'points',      amount: r => r.pts || 0 },
    { key: 'fastestLaps', amount: r => r.fl ? 1 : 0 },
    { key: 'starts',      amount: r => r.dns ? 0 : 1 },
];

const raceKey = r => `${r.year}-${String(r.round).padStart(2, '0')}`;

// Every row of every race, grouped by race.
const raceRows = new Map();   // raceKey → [{ driverId, race }]
for (const [driverId, races] of byDriver) {
    for (const race of races) {
        const k = raceKey(race);
        if (!raceRows.has(k)) raceRows.set(k, []);
        raceRows.get(k).push({ driverId, race });
    }
}

// Titles: they count at the race where they were sealed. If that race
// can't be determined, the title doesn't enter the record (no date is made up).
const clinchByRace = new Map();   // raceKey → { driverId, race }
for (const [year, champId] of seasonChampions) {
    const race = findClinchRace(year, champId);
    if (race) clinchByRace.set(raceKey(race), { driverId: champId, race });
}

const recordMilestones = new Map();   // driverId → [milestone]
const addRecordMilestone = (driverId, m) => {
    if (!recordMilestones.has(driverId)) recordMilestones.set(driverId, []);
    recordMilestones.get(driverId).push(m);
};

const placeOf = race => ({ year: race.year, gp: race.gp, date: race.date });

for (const { key, amount } of RECORDS) {
    const totals = new Map();       // driverId → total acumulado
    let recordValue = 0;
    let holders = new Set();
    // Streak of each current holder: their milestones, whether they've already been sole holder in it and
    // who last equalled them (cleared if they pull ahead again).
    const tenures = new Map();      // driverId → { events, everSole, equalledBy }

    // When a streak closes (or at the end, if it's still open) the last
    // milestone is completed with what happened afterwards: how far they extended it and who caught them.
    // If they were overtaken, the ceiling is the record they held before that race: whatever
    // they added in the same race where they were passed was no longer a record.
    const closeTenure = (driverId, surpassedBy, heldValue) => {
        const t = tenures.get(driverId);
        tenures.delete(driverId);
        const last = t?.events[t.events.length - 1];
        if (!last) return;
        const peak = heldValue ?? (totals.get(driverId) || 0);
        if (peak > last.record.value) last.record.peak = peak;
        if (surpassedBy) last.record.after = { type: 'surpassed', ...surpassedBy };
        else if (t.equalledBy) last.record.after = { type: 'equalled', ...t.equalledBy };
        else last.record.current = true;
    };

    for (const k of [...raceRows.keys()].sort()) {
        const changed = [];
        const bump = (driverId, race, n) => {
            if (!n) return;
            totals.set(driverId, (totals.get(driverId) || 0) + n);
            changed.push({ driverId, race });
        };

        if (key === 'titles') {
            const c = clinchByRace.get(k);
            if (c) bump(c.driverId, c.race, 1);
        } else {
            for (const { driverId, race } of raceRows.get(k)) bump(driverId, race, amount(race));
        }
        if (!changed.length) continue;

        const top = Math.max(recordValue, ...changed.map(c => totals.get(c.driverId)));
        const atTop = changed.filter(c => totals.get(c.driverId) === top);
        const prevValue = recordValue;
        const prevHolders = holders;

        if (top > prevValue) {
            holders = new Set(atTop.map(c => c.driverId));
            // Those left behind lose the record: beaten by whoever passed them.
            const by = atTop[0];
            for (const id of prevHolders) {
                if (!holders.has(id)) closeTenure(id, { by: by.driverId, ...placeOf(by.race) }, prevValue);
            }
        } else if (top === prevValue) {
            holders = new Set([...prevHolders, ...atTop.map(c => c.driverId)]);
        } else {
            continue;
        }
        recordValue = top;

        const sole = holders.size === 1;
        for (const { driverId, race } of atTop) {
            const wasHolder = prevHolders.has(driverId);
            let t = tenures.get(driverId);
            if (!t) {
                t = { events: [], everSole: false, equalledBy: null };
                tenures.set(driverId, t);
            }

            // Passing the previous record's figure is breaking it, even if someone else who
            // didn't hold it either reaches the same number in that race. It's only
            // "equalled" if it ends up tied with someone who was already a holder.
            const passedOldOwners = top > prevValue && ![...prevHolders].some(id => holders.has(id));
            let kind = null;
            if (prevValue > 0) {
                if (!wasHolder) kind = sole || passedOldOwners ? 'broke' : 'equalled';
                else if (sole && !t.everSole) kind = 'broke';
            }
            if (sole || kind === 'broke') t.everSole = true;
            if (sole) t.equalledBy = null;

            if (kind) {
                const m = milestone(race, kind === 'broke' ? 'Broke all-time record' : 'Equalled all-time record');
                m.record = { key, kind, value: totals.get(driverId) };
                t.events.push(m);
                addRecordMilestone(driverId, m);
            }

            // Whoever reaches it leaves a note, in the streak of those who already held it,
            // that they were equalled.
            if (!wasHolder && !sole) {
                for (const id of prevHolders) {
                    if (holders.has(id)) tenures.get(id).equalledBy = { by: driverId, ...placeOf(race) };
                }
            }
        }
    }

    for (const id of [...tenures.keys()]) closeTenure(id, null);
}

// If a driver equalled a record and later broke it (even if they lost it
// in between), only "Broke" remains: the earlier "Equalled" is redundant.
for (const [driverId, list] of recordMilestones) {
    recordMilestones.set(driverId, list.filter(m =>
        m.record.kind !== 'equalled'
        || !list.some(b => b.record.kind === 'broke' && b.record.key === m.record.key && b.date > m.date)
    ));
}

const careers = {};

for (const [driverId, races] of byDriver) {
    races.sort((a, b) => a.year - b.year || a.round - b.round);
    const finished = races.filter(r => !r.dnf);

    const eras = buildEras(races);
    // titles is resolved here because buildEras doesn't know the driverId.
    const titleYears = [...seasonChampions.entries()]
        .filter(([, id]) => id === driverId)
        .map(([y]) => y);
    for (const era of eras) {
        era.titles = titleYears.filter(y => y >= era.from && y <= era.to);
    }

    // Best finish in a championship (and every year they achieved it): it's what's
    // shown when the driver has no titles, so the section still says
    // something.
    const standings = seasonStandings.get(driverId) || {};
    const standingYears = Object.entries(standings).map(([year, pos]) => ({ year: Number(year), pos }));
    const bestPos = standingYears.length ? Math.min(...standingYears.map(s => s.pos)) : null;
    const bestFinish = bestPos == null ? null : {
        pos: bestPos,
        years: standingYears.filter(s => s.pos === bestPos).map(s => s.year).sort((a, b) => a - b),
    };

    // Each title with that season's details: without this the trophies would be
    // just decoration, and the idea is for each one to tell something.
    const titles = titleYears.map(year => {
        const seasonRaces = races.filter(r => r.year === year);
        const seasonFinished = seasonRaces.filter(r => !r.dnf);
        const team = resolveTeam(seasonRaces[seasonRaces.length - 1]?.team);
        return {
            year,
            teamId: team.id,
            team: team.name,
            color: team.color,
            races: seasonRaces.length,
            wins: seasonFinished.filter(r => r.pos === 1).length,
            podiums: seasonFinished.filter(r => r.pos <= 3).length,
            points: seasonRaces.reduce((a, r) => a + r.pts, 0),
        };
    });

    // Car number: the one from the most recent season they raced in.
    const lastNumbered = [...races].reverse().find(r => r.number != null);

    // Longest winning streak: the longest run of consecutive races
    // won. Only meaningful from 2 up (a single win isn't a streak).
    // It's emitted as one more timeline milestone, at the GP where it ended.
    let streakMilestone = null, streakRace = null;
    {
        let run = 0, endRace = null, best = 0, bestEnd = null;
        for (const r of races) {
            if (!r.dnf && r.pos === 1) {
                run++; endRace = r;
                if (run > best) { best = run; bestEnd = endRace; }
            } else {
                run = 0;
            }
        }
        if (best >= 2) {
            streakMilestone = { ...milestone(bestEnd, 'Longest winning streak'), streakLength: best };
            streakRace = bestEnd;
        }
    }

    const firstWinRace = finished.find(r => r.pos === 1) || null;
    const lastWinRace = [...finished].reverse().find(r => r.pos === 1) || null;
    const sameRace = (a, b) => a && b && a.year === b.year && a.round === b.round;

    // Teams with 2+ wins: they're the only ones that emit first/last
    // win with the team milestones.
    const winEras = eras.filter(e => e.wins >= 2);

    // Every race that already emits a win milestone. "Best result in the
    // team" is always that same win when it lands here, so it's skipped: saying
    // "first win & best result in the team" is redundant.
    const winRaces = [
        firstWinRace,
        ...winEras.map(e => e.firstWin),
        ...winEras.map(e => e.lastWin),
        streakRace,
    ].filter(Boolean);
    const isWinRace = r => winRaces.some(w => sameRace(w, r));

    const milestones = [
        milestone(races[0], 'Debut'),
        milestone(races.find(r => r.pts > 0), 'First points'),
        milestone(finished.find(r => r.pos <= 3), 'First podium'),
        milestone(firstWinRace, 'First win'),
        milestone(races.find(r => r.quali === 1), 'First pole'),
        streakMilestone,
        // One milestone per title, at the GP where it was sealed.
        ...titleYears
            .sort((a, b) => a - b)
            .map((y, i) => milestone(findClinchRace(y, driverId), `${ordinal(i + 1)} World Title`)),
        // First and last win with each team, only if they won there 2+ times.
        // The "first with the team" is skipped if it matches the first of their
        // career (otherwise "first win" would always drag it along).
        ...winEras
            .filter(e => !sameRace(e.firstWin, firstWinRace))
            .map(e => milestone(e.firstWin, 'First win with the team')),
        // When the last win with the team is also the last of their whole
        // career, adding "with the team" is redundant and suggests they later won
        // with another one: there the milestone is simply the last win.
        ...winEras
            .map(e => milestone(e.lastWin, sameRace(e.lastWin, lastWinRace) ? 'Last win' : 'Last win with the team')),
        // Best result with each team. Lowest priority. Skipped if that
        // race is already a win milestone: the win says it all and the pair
        // "first win & best result in the team" is redundant.
        ...eras
            .filter(e => e.bestRace && !isWinRace(e.bestRace))
            .map(e => milestone(e.bestRace, 'Best result in the team')),
        // All-time records (see ALL-TIME RECORDS above).
        ...(recordMilestones.get(driverId) || []),
    ].filter(Boolean);

    // Inputs that don't go into the JSON.
    for (const e of eras) { delete e.bestRace; delete e.firstWin; delete e.lastWin; }

    // ── WHEN EACH FIGURE WAS REACHED ───────────────────────────────────────
    // Date of the last event that raised each counter, i.e. the day
    // the driver reached the total their profile shows today. It's used to
    // break ties in rankings: between two with the same number, whoever
    // got there first goes first (Schumacher reached 5 titles in 2004, Hamilton 5 in
    // 2018, so with 5 and 5 Schumacher would go on top).
    //
    // It's computed here and not in the frontend because the frontend only downloads careers.json:
    // recomputing it there would mean reading the ~7 MB of season files.
    const lastDateOf = list => list.length ? list[list.length - 1].date || null : null;

    const achievedAt = {
        races:   lastDateOf(races),
        wins:    lastDateOf(finished.filter(r => r.pos === 1)),
        podiums: lastDateOf(finished.filter(r => r.pos <= 3)),
        poles:   lastDateOf(races.filter(r => r.quali === 1)),
        fastestLaps: lastDateOf(races.filter(r => r.fl)),
        // Points only go up in races where they scored, so the date
        // of the total is the last time they scored.
        points:  lastDateOf(races.filter(r => r.pts > 0)),
        // For titles, the day the last one was sealed counts, which is
        // exactly the milestone already computed above.
        titles: titleYears.length
            ? (milestones.find(m => m.label === `${ordinal(titleYears.length)} World Title`)?.date ?? null)
            : null,
    };

    careers[driverId] = {
        races: races.length,
        // Debut date. Used as a tiebreaker in rankings for
        // drivers who still have 0 in a category: there's no "when they
        // achieved it", but there is "since when they've been trying".
        debut: races[0]?.date ?? null,
        seasons: [...new Set(races.map(r => r.year))].sort(),
        number: lastNumbered?.number ?? null,
        points: races.reduce((a, r) => a + r.pts, 0),
        wins: finished.filter(r => r.pos === 1).length,
        podiums: finished.filter(r => r.pos <= 3).length,
        poles: races.filter(r => r.quali === 1).length,
        fastestLaps: races.filter(r => r.fl).length,
        titleYears,
        titles,
        bestFinish,
        eras,
        milestones,
        achievedAt,
    };
}

fs.writeFileSync(OUT, JSON.stringify(careers));
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`careers.json written: ${Object.keys(careers).length} drivers, ${kb} KB`);
