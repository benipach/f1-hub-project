// ── FUENTE DE VERDAD ÚNICA: colores de equipos de F1 ─────────────
// Para cambiar el color de un equipo, solo tocás acá.
// Este archivo se carga en todas las páginas que usen colores de equipos.
// Las variables CSS (--f1-*) y los rgba para charts se generan desde este objeto.

const TEAMS = {
    // ── EQUIPOS ACTUALES ─────────────────────────────────────────
    'Mercedes':        { color: 'rgb(43, 255, 219)',  cssVar: '--f1-mercedes',      logo: 'mercedes-logo',    aliases: ['mercedes'],
                         lineage: ['tyrrell', 'bar', 'honda', 'brawn-gp', 'mercedes'] },
    'Ferrari':         { color: 'rgb(255, 0, 25)',    cssVar: '--f1-ferrari',       logo: 'ferrari-logo',     aliases: ['ferrari'],
                         lineage: ['ferrari'] },
    'McLaren':         { color: 'rgb(255, 127, 0)',   cssVar: '--f1-mclaren',       logo: 'mclaren-logo',     aliases: ['mclaren'],
                         lineage: ['mclaren'] },
    'Red Bull Racing': { color: 'rgb(34, 71, 122)',   cssVar: '--f1-red-bull',      logo: 'redbull-logo',     aliases: ['Red Bull', 'red-bull', 'red-bull-racing'],
                         lineage: ['stewart', 'jaguar', 'red-bull'] },
    'Aston Martin':    { color: 'rgb(34, 153, 113)',  cssVar: '--f1-aston-martin',  logo: 'astonmartin-logo', aliases: ['aston-martin'],
                         lineage: ['jordan', 'midland', 'spyker', 'force-india', 'racing-point', 'aston-martin'] },
    'Alpine':          { color: 'rgb(0, 111, 186)',   cssVar: '--f1-alpine',        logo: 'alpine-logo',      aliases: ['alpine'],
                         lineage: ['toleman', 'benetton', 'renault', 'lotus', 'renault', 'alpine'] },
    'Williams':        { color: 'rgb(28, 122, 255)',  cssVar: '--f1-williams',      logo: 'williams-logo',    aliases: ['williams'],
                         lineage: ['williams'] },
    'Racing Bulls':    { color: 'rgb(102, 125, 255)', cssVar: '--f1-racing-bulls',  logo: 'racingbulls-logo', aliases: ['racing-bulls'],
                         lineage: ['minardi', 'toro-rosso', 'alpha-tauri', 'racing-bulls'] },
    'Haas F1 Team':    { color: 'rgb(222, 225, 226)', cssVar: '--f1-haas',          logo: 'haas-logo',        aliases: ['Haas', 'haas'],
                         lineage: ['haas'] },
    'Audi':            { color: 'rgb(255, 46, 46)',   cssVar: '--f1-audi',          logo: 'audi-logo',        aliases: ['audi'],
                         lineage: ['sauber', 'bmw-sauber', 'sauber', 'alfa-romeo', 'kick-sauber', 'audi'] },
    'Cadillac':        { color: 'rgb(170, 170, 173)', cssVar: '--f1-cadillac',      logo: 'cadillac-logo',    aliases: ['cadillac'],
                         lineage: ['cadillac'] },

    // ── EQUIPOS HISTÓRICOS — línea Mercedes ──────────────────────
    'Tyrrell':         { color: 'rgb(0, 93, 170)',    cssVar: '--f1-tyrrell',       logo: 'tyrrell-logo',     aliases: ['tyrrell'] }, // a chequear color
    'BAR':             { color: 'rgb(180, 0, 50)',    cssVar: '--f1-bar',           logo: 'bar-logo',         aliases: ['bar'] }, // a chequear color
    'Honda':           { color: 'rgb(235, 235, 225)', cssVar: '--f1-honda',         logo: 'honda-logo',       aliases: ['honda'] },
    'Brawn GP':        { color: 'rgb(233, 255, 0)',   cssVar: '--f1-brawn-gp',      logo: 'brawngp-logo',     aliases: ['brawn-gp', 'brawn'] },

    // ── EQUIPOS HISTÓRICOS — línea Red Bull ──────────────────────
    'Stewart':         { color: 'rgb(255, 255, 255)', cssVar: '--f1-stewart',       logo: 'stewart-logo',     aliases: ['stewart'] }, // a chequear color
    'Jaguar':          { color: 'rgb(0, 110, 56)',    cssVar: '--f1-jaguar',        logo: 'jaguar-logo',      aliases: ['jaguar'] }, // a chequear color

    // ── EQUIPOS HISTÓRICOS — línea Aston Martin ──────────────────
    'Jordan':          { color: 'rgb(255, 190, 0)',   cssVar: '--f1-jordan',        logo: 'jordan-logo',      aliases: ['jordan'] }, // a chequear color
    'Midland':         { color: 'rgb(200, 40, 40)',   cssVar: '--f1-midland',       logo: 'midland-logo',     aliases: ['midland'] }, // a chequear color
    'Spyker':          { color: 'rgb(255, 140, 0)',   cssVar: '--f1-spyker',        logo: 'spyker-logo',      aliases: ['spyker'] }, // a chequear color
    'Force India':     { color: 'rgb(240, 125, 0)',   cssVar: '--f1-force-india',   logo: 'forceindia-logo',  aliases: ['force-india'] },
    'Racing Point':    { color: 'rgb(255, 142, 188)', cssVar: '--f1-racing-point',  logo: 'racingpoint-logo', aliases: ['racing-point'] },

    // ── EQUIPOS HISTÓRICOS — línea Alpine ────────────────────────
    'Toleman':         { color: 'rgb(220, 60, 0)',    cssVar: '--f1-toleman',       logo: 'toleman-logo',     aliases: ['toleman'] }, // a chequear color
    'Benetton':        { color: 'rgb(0, 160, 80)',    cssVar: '--f1-benetton',      logo: 'benetton-logo',    aliases: ['benetton'] }, // a chequear color
    'Renault':         { color: 'rgb(255, 205, 44)',  cssVar: '--f1-renault',       logo: 'renault-logo',     aliases: ['renault'] },
    'Lotus':           { color: 'rgb(255, 215, 0)',   cssVar: '--f1-lotus',         logo: 'lotus-logo',       aliases: ['lotus'] }, // a chequear color

    // ── EQUIPOS HISTÓRICOS — línea Racing Bulls ───────────────────
    'Minardi':         { color: 'rgb(80, 80, 80)',    cssVar: '--f1-minardi',       logo: 'minardi-logo',     aliases: ['minardi'] }, // a chequear color
    'Toro Rosso':      { color: 'rgb(22, 23, 147)',   cssVar: '--f1-toro-rosso',    logo: 'tororosso-logo',   aliases: ['toro-rosso', 'Toro Rosso / Renault'] },
    'AlphaTauri':      { color: 'rgb(0, 40, 63)',     cssVar: '--f1-alpha-tauri',   logo: 'alphatauri-logo',  aliases: ['alpha-tauri'] },

    // ── EQUIPOS HISTÓRICOS — línea Audi ──────────────────────────
    'Sauber':          { color: 'rgb(222, 50, 39)',   cssVar: '--f1-sauber',        logo: 'sauber-logo',      aliases: ['sauber'] }, // a chequear color
    'BMW Sauber':      { color: 'rgb(0, 130, 200)',   cssVar: '--f1-bmw-sauber',    logo: 'bmwsauber-logo',   aliases: ['bmw-sauber'] }, // a chequear color
    'Alfa Romeo':      { color: 'rgb(157, 34, 53)',   cssVar: '--f1-alfa-romeo',    logo: 'alfaromeo-logo',   aliases: ['alfa-romeo'] },
    'Kick Sauber':     { color: 'rgb(90, 255, 33)',   cssVar: '--f1-kick',          logo: 'kicksauber-logo',  aliases: ['kick-sauber', 'Kick', 'kick'] },

    // ── OTROS HISTÓRICOS ─────────────────────────────────────────
    'Manor':           { color: 'rgb(200, 0, 0)',     cssVar: '--f1-manor',         logo: 'manor-logo',       aliases: ['manor'] }, // a chequear color

    // ── ALIASES COMBINADOS ────────────────────────────────────────
    'Ferrari / Haas':         { ref: 'Ferrari' },
    'Red Bull / Toro Rosso':  { ref: 'Red Bull Racing' },
    'Toro Rosso / Red Bull':  { ref: 'Toro Rosso' },
};

// ── Lookup plano: cualquier nombre/alias → definición canónica ────
// Todas las claves se normalizan a lowercase para que los teamId de la URL
// (siempre lowercase) matcheen sin importar cómo estén escritos acá arriba.
const _TEAM_LOOKUP = (() => {
    const map = {};
    for (const [canonical, def] of Object.entries(TEAMS)) {
        if (!def.ref && !def.name) def.name = canonical;
        const resolved = def.ref ? TEAMS[def.ref] : def;
        map[canonical.toLowerCase()] = resolved;
        if (def.aliases) def.aliases.forEach(a => { map[a.toLowerCase()] = resolved; });
    }
    return map;
})();

// ── Helpers públicos ──────────────────────────────────────────────

/** Devuelve el color rgba(r,g,b,0.9) para usar en charts */
function teamColor(teamId) {
    const def = _TEAM_LOOKUP[teamId?.toLowerCase()];
    if (!def) return 'rgba(136, 136, 136, 0.9)';
    return def.color.replace('rgb(', 'rgba(').replace(')', ', 0.9)');
}

/** Devuelve el nombre de la CSS var, ej: '--f1-mercedes' */
function teamCssVar(teamId) {
    return _TEAM_LOOKUP[teamId?.toLowerCase()]?.cssVar || '--primary-red';
}

/** Devuelve el nombre oficial/canónico del equipo dado cualquier alias,
 *  ej: teamCanonicalName('Red Bull') → 'Red Bull Racing'.
 *  Útil para evitar que el mismo equipo se cuente dos veces cuando distintas
 *  fuentes de datos (drivers.json, resultados OpenF1, etc.) usan nombres distintos. */
function teamCanonicalName(teamId) {
    return _TEAM_LOOKUP[teamId?.toLowerCase()]?.name || teamId;
}

/** Devuelve el filename del logo sin extensión, ej: 'mercedes-logo' */
function teamLogo(teamId) {
    return _TEAM_LOOKUP[teamId?.toLowerCase()]?.logo || null;
}

/** Devuelve el array de ids ordenado cronológicamente para el gráfico de historia,
 *  ej: ['tyrrell','bar','honda','brawn-gp','mercedes'] para Mercedes.
 *  Si el equipo no tiene lineage, devuelve [teamId]. */
function teamLineage(teamId) {
    return _TEAM_LOOKUP[teamId?.toLowerCase()]?.lineage || [teamId];
}

// ── Inyecta las --f1-* en :root (reemplaza los valores estáticos de style.css) ──
(function injectTeamCssVars() {
    const root = document.documentElement;
    for (const def of Object.values(TEAMS)) {
        if (def.ref || !def.cssVar) continue;
        root.style.setProperty(def.cssVar, def.color);
    }
})();