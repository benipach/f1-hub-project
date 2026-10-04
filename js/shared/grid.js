// shared/grid.js: each driver's starting position in a race.
//
// Qualifying P1 isn't starting P1: engine or gearbox change
// penalties, sanctions from the previous session and pit lane starts move the
// grid. That's why race and sprint rows store their own `grid`
// (the official grid; 0 = started from the pit lane), loaded by
// scripts/build-season.js --grid and by the OpenF1 adapter.
//
// Until a season has that field, it falls back to the position from the
// corresponding qualifying (Qualifying for the race, Sprint
// Qualifying for the sprint), which is what the site used before.
//
// Classic script (defines globals), like shared/gp.js and shared/teams.js.

const GRID_SOURCE_SESSION = { race: 'qualifying', sprintRace: 'sprintQualy' };

// Map driver → { pos, pitLane, official }.
//   pos:      starting position usable for calculations (pit lane counts as
//             last, behind everyone who started from the grid)
//   pitLane:  true if they started from the pits
//   official: true if the data is the real grid; false if it's the fallback
//             to qualifying
function startingGridFor(gp, sessionKey) {
    const session = gp?.sessions?.[sessionKey];
    const results = Array.isArray(session?.results) ? session.results : [];
    const map = {};

    const withGrid = results.filter(r => r && typeof r.grid === 'number');
    if (withGrid.length) {
        const fieldSize = results.length;
        for (const r of withGrid) {
            const pitLane = r.grid === 0;
            map[r.driver] = { pos: pitLane ? fieldSize : r.grid, pitLane, official: true };
        }
        return map;
    }

    const fallbackKey = GRID_SOURCE_SESSION[sessionKey];
    const quali = Array.isArray(gp?.sessions?.[fallbackKey]?.results) ? gp.sessions[fallbackKey].results : [];
    for (const r of quali) {
        if (r?.driver != null && typeof r.pos === 'number') map[r.driver] = { pos: r.pos, pitLane: false, official: false };
    }
    return map;
}

// Shortcut for a single driver: starting number or null.
function startingPositionFor(gp, sessionKey, driverId) {
    return startingGridFor(gp, sessionKey)[driverId]?.pos ?? null;
}

// "P7", or "PL" if they started from the pits.
function gridLabel(entry) {
    if (!entry) return '—';
    return entry.pitLane ? 'PL' : `P${entry.pos}`;
}
