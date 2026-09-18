// shared/grid.js — posición de largada de cada piloto en una carrera.
//
// Clasificar P1 no es largar P1: penalizaciones por cambio de motor o de
// caja, sanciones de la sesión anterior y largadas desde boxes mueven la
// parrilla. Por eso las filas de carrera y sprint guardan su propio `grid`
// (la parrilla oficial; 0 = salió desde el pit lane), cargado por
// scripts/build-season.js --grid y por el adapter de OpenF1.
//
// Hasta que una temporada tenga ese campo, se cae a la posición de la
// clasificación correspondiente (Qualifying para la carrera, Sprint
// Qualifying para el sprint), que es lo que el sitio usaba antes.
//
// Script clásico (define globales), como shared/gp.js y shared/teams.js.

const GRID_SOURCE_SESSION = { race: 'qualifying', sprintRace: 'sprintQualy' };

// Map driver → { pos, pitLane, official }.
//   pos:      posición de largada usable para cálculos (pit lane cuenta como
//             último, detrás de todos los que largaron desde la parrilla)
//   pitLane:  true si largó desde boxes
//   official: true si el dato es la parrilla real; false si es el fallback
//             a la clasificación
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

// Atajo para un solo piloto: número de largada o null.
function startingPositionFor(gp, sessionKey, driverId) {
    return startingGridFor(gp, sessionKey)[driverId]?.pos ?? null;
}

// "P7", o "PL" si largó desde boxes.
function gridLabel(entry) {
    if (!entry) return '—';
    return entry.pitLane ? 'PL' : `P${entry.pos}`;
}
