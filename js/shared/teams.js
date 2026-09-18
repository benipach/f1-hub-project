// shared/teams.js — del campo `team` de un resultado al equipo de data/teams.json.
//
// Los season files guardan el equipo de varias formas según quién cargó la
// carrera:
//   - slug de teams.json:            "mercedes", "red-bull-racing"
//   - nombre corto del adapter OpenF1: "Red Bull", "Mercedes-AMG", "Haas"
//   - constructorId de Ergast:         "red-bull", "rb", "str"
//   - chasis scrapeado de F1.com:      "red-bull-racing-honda-rbpt",
//                                      "mclaren-mercedes", "aston-martin-aramco-mercedes"
// Son 145 variantes distintas en el dataset. Slugificar a secas no alcanza,
// y una tabla a mano tampoco escala, así que resolveTeamId() hace las dos
// cosas: alias explícitos para las siglas que no se parecen al ID, y para el
// resto va recortando tokens por la derecha hasta dar con un ID real
// ("aston-martin-aramco-mercedes" → "aston-martin-aramco" → "aston-martin").
// El nombre del equipo siempre va primero y el motor después, así que
// recortar por la derecha nunca cambia de equipo.
//
// Es un script clásico (define globales): se carga con <script defer> antes
// del script de cada página. scripts/build-careers.js lo reutiliza tal cual
// para que el precálculo y el front resuelvan exactamente igual.

// Siglas y nombres que no se parecen al ID de teams.json. Todo lo demás lo
// resuelve el recorte de tokens de resolveTeamId().
const TEAM_SLUG_ALIASES = {
    'red-bull':             'red-bull-racing',
    'rbr':                  'red-bull-racing',
    'mercedes-amg':         'mercedes',
    'str':                  'toro-rosso',
    'scuderia-toro-rosso':  'toro-rosso',
    'rb':                   'racing-bulls',
    'visa-cash-app-rb':     'racing-bulls',
    'mrt':                  'manor',
    'mf1':                  'midland',
    'brawn':                'brawn-gp',
    'team-lotus':           'lotus',
    'footwork':             'arrows',
    'euro-brun':            'eurobrun',
    'moda':                 'andrea-moda',
};

function slugifyTeam(rawTeam) {
    return String(rawTeam || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// Sólo alias, sin mirar teams.json. Sirve cuando no hay datos de equipos a
// mano; con datos, usar resolveTeamId().
function teamSlug(rawTeam) {
    const slug = slugifyTeam(rawTeam);
    return TEAM_SLUG_ALIASES[slug] || slug;
}

// Devuelve el ID de teams.json que corresponde a `rawTeam`, o el slug tal
// cual (con alias) si no hay ninguno que encaje — así el que llama puede
// seguir usándolo como clave aunque no tenga color ni logo.
function resolveTeamId(rawTeam, teamsData) {
    const slug = slugifyTeam(rawTeam);
    if (!teamsData) return TEAM_SLUG_ALIASES[slug] || slug;

    const tokens = slug.split('-');
    for (let n = tokens.length; n > 0; n--) {
        const candidate = tokens.slice(0, n).join('-');
        const id = TEAM_SLUG_ALIASES[candidate] || candidate;
        if (teamsData[id]) return id;
    }
    return TEAM_SLUG_ALIASES[slug] || slug;
}

function getTeamMeta(teamId, teamsData) {
    const team = teamsData?.[teamId];
    return {
        cls:   teamId ? `team-${teamId}` : '',
        label: team?.name ?? teamId,
        color: team?.color ?? null,
        logo:  team?.logo ?? null,
    };
}

// Atajo: de un valor crudo de `team` a su meta (nombre, color, logo).
function resolveTeam(rawTeam, teamsData) {
    return getTeamMeta(resolveTeamId(rawTeam, teamsData), teamsData);
}
