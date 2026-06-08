// ── FUENTE DE VERDAD ÚNICA: colores de equipos de F1 ─────────────
// Para cambiar el color de un equipo, solo tocás acá.
// Este archivo se carga en todas las páginas que usen colores de equipos.
// Las variables CSS (--f1-*) y los rgba para charts se generan desde este objeto.

const TEAMS = {
    // Equipos actuales
    'Mercedes':        { color: 'rgb(43, 255, 219)',  cssVar: '--f1-mercedes',      logo: 'mercedes-logo',    aliases: ['mercedes'] },
    'Ferrari':         { color: 'rgb(255, 0, 25)',    cssVar: '--f1-ferrari',       logo: 'ferrari-logo',     aliases: ['ferrari'] },
    'McLaren':         { color: 'rgb(255, 127, 0)',   cssVar: '--f1-mclaren',       logo: 'mclaren-logo',     aliases: ['mclaren'] },
    'Red Bull Racing': { color: 'rgb(34, 71, 122)',   cssVar: '--f1-red-bull',      logo: 'redbull-logo',     aliases: ['Red Bull', 'red-bull', 'red-bull-racing'] },
    'Aston Martin':    { color: 'rgb(34, 153, 113)',  cssVar: '--f1-aston-martin',  logo: 'astonmartin-logo', aliases: ['aston-martin'] },
    'Alpine':          { color: 'rgb(0, 111, 186)',   cssVar: '--f1-alpine',        logo: 'alpine-logo',      aliases: ['alpine'] },
    'Williams':        { color: 'rgb(28, 122, 255)',  cssVar: '--f1-williams',      logo: 'williams-logo',    aliases: ['williams'] },
    'Racing Bulls':    { color: 'rgb(102, 125, 255)', cssVar: '--f1-racing-bulls',  logo: 'racingbulls-logo', aliases: ['racing-bulls'] },
    'Haas F1 Team':    { color: 'rgb(222, 225, 226)', cssVar: '--f1-haas',          logo: 'haas-logo',        aliases: ['Haas', 'haas'] },
    'Audi':            { color: 'rgb(255, 46, 46)',   cssVar: '--f1-audi',          logo: 'audi-logo',        aliases: ['audi'] },
    'Cadillac':        { color: 'rgb(170, 170, 173)', cssVar: '--f1-cadillac',      logo: 'cadillac-logo',    aliases: ['cadillac'] },
    // Equipos históricos
    'Renault':         { color: 'rgb(255, 205, 44)',  cssVar: '--f1-renault',       logo: 'renault-logo',     aliases: ['renault'] },
    'Racing Point':    { color: 'rgb(255, 142, 188)', cssVar: '--f1-racing-point',  logo: 'racingpoint-logo', aliases: ['racing-point'] },
    'Force India':     { color: 'rgb(240, 125, 0)',   cssVar: '--f1-force-india',   logo: 'forceindia-logo',  aliases: ['force-india'] },
    'AlphaTauri':      { color: 'rgb(0, 40, 63)',     cssVar: '--f1-alpha-tauri',   logo: 'alphatauri-logo',  aliases: ['alpha-tauri'] },
    'Toro Rosso':      { color: 'rgb(22, 23, 147)',   cssVar: '--f1-toro-rosso',    logo: 'tororosso-logo',   aliases: ['toro-rosso', 'Toro Rosso / Renault'] },
    'Sauber':          { color: 'rgb(222, 50, 39)',   cssVar: '--f1-sauber',        logo: 'sauber-logo',      aliases: ['sauber'] },
    'Alfa Romeo':      { color: 'rgb(157, 34, 53)',   cssVar: '--f1-alfa-romeo',    logo: 'alfaromeo-logo',   aliases: ['alfa-romeo'] },
    'Kick Sauber':     { color: 'rgb(90, 255, 33)',   cssVar: '--f1-kick',          logo: 'kicksauber-logo',  aliases: ['kick-sauber', 'Kick', 'kick'] },
    'Manor':           { color: 'rgb(200, 0, 0)',     cssVar: '--f1-manor',         logo: 'manor-logo',       aliases: ['manor'] },
    'Minardi':         { color: 'rgb(80, 80, 80)',    cssVar: '--f1-minardi',       logo: 'minardi-logo',     aliases: ['minardi'] },
    // Aliases de equipos combinados (apuntan a un equipo existente)
    'Ferrari / Haas':         { ref: 'Ferrari' },
    'Red Bull / Toro Rosso':  { ref: 'Red Bull Racing' },
    'Toro Rosso / Red Bull':  { ref: 'Toro Rosso' },
};

// ── Lookup plano: cualquier nombre/alias → definición canónica ────
const _TEAM_LOOKUP = (() => {
    const map = {};
    for (const [canonical, def] of Object.entries(TEAMS)) {
        const resolved = def.ref ? TEAMS[def.ref] : def;
        map[canonical] = resolved;
        if (def.aliases) def.aliases.forEach(a => { map[a] = resolved; });
    }
    return map;
})();

// ── Helpers públicos ──────────────────────────────────────────────

/** Devuelve el color rgba(r,g,b,0.9) para usar en charts */
function teamColor(teamId) {
    const def = _TEAM_LOOKUP[teamId];
    if (!def) return 'rgba(136, 136, 136, 0.9)';
    return def.color.replace('rgb(', 'rgba(').replace(')', ', 0.9)');
}

/** Devuelve el nombre de la CSS var, ej: '--f1-mercedes' */
function teamCssVar(teamId) {
    return _TEAM_LOOKUP[teamId]?.cssVar || '--primary-red';
}

/** Devuelve el filename del logo sin extensión, ej: 'mercedes-logo' */
function teamLogo(teamId) {
    return _TEAM_LOOKUP[teamId]?.logo || null;
}

// ── Inyecta las --f1-* en :root (reemplaza los valores estáticos de style.css) ──
(function injectTeamCssVars() {
    const root = document.documentElement;
    for (const def of Object.values(TEAMS)) {
        if (def.ref || !def.cssVar) continue;
        root.style.setProperty(def.cssVar, def.color);
    }
})();