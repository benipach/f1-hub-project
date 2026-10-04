// shared/teams.js: from a result's `team` field to the team in data/teams.json.
//
// Season files store the team in several ways depending on who loaded the
// race:
//   - teams.json slug:               "mercedes", "red-bull-racing"
//   - OpenF1 adapter short name:     "Red Bull", "Mercedes-AMG", "Haas"
//   - Ergast constructorId:          "red-bull", "rb", "str"
//   - chassis scraped from F1.com:   "red-bull-racing-honda-rbpt",
//                                      "mclaren-mercedes", "aston-martin-aramco-mercedes"
// That's 145 different variants in the dataset. Plain slugifying isn't enough,
// and a hand-written table doesn't scale either, so resolveTeamId() does both
// things: explicit aliases for the abbreviations that don't look like the ID, and for the
// rest it trims tokens from the right until it hits a real ID
// ("aston-martin-aramco-mercedes" → "aston-martin-aramco" → "aston-martin").
// The team name always comes first and the engine after, so
// trimming from the right never changes the team.
//
// It's a classic script (defines globals): loaded with <script defer> before
// each page's script. scripts/build-careers.js reuses it as-is
// so the precomputation and the frontend resolve exactly the same way.

// Abbreviations and names that don't look like the teams.json ID. Everything else is
// resolved by resolveTeamId()'s token trimming.
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

// Aliases only, without looking at teams.json. Useful when there's no team data
// at hand; with data, use resolveTeamId().
function teamSlug(rawTeam) {
    const slug = slugifyTeam(rawTeam);
    return TEAM_SLUG_ALIASES[slug] || slug;
}

// Returns the teams.json ID that matches `rawTeam`, or the slug as-is
// (with aliases) if none fits, so the caller can
// keep using it as a key even without a color or logo.
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
