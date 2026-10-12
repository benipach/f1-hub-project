// From a result's free-form `team` field to a teams.json id.
//
// Port of resolveTeamId() in js/shared/teams.js, with the same behaviour
// (test/teams.test.ts runs both over every team value in data/ and
// requires the same answer). The legacy file stays as it is while old pages
// and scripts/build-careers.js still load it.
//
// Season files store the team in several ways depending on who loaded the
// race:
//   - teams.json id:               "mercedes", "red-bull-racing"
//   - OpenF1 adapter short name:   "Red Bull", "Mercedes-AMG", "Haas"
//   - Ergast constructorId:        "red-bull", "rb", "str"
//   - chassis scraped from F1.com: "red-bull-racing-honda-rbpt",
//                                    "aston-martin-aramco-mercedes"
// Explicit aliases cover the abbreviations that don't look like the id. For
// the rest, tokens are trimmed from the right until a real id is found
// ("aston-martin-aramco-mercedes" → "aston-martin-aramco" → "aston-martin").
// The team name always comes before the engine, so trimming from the right
// never changes the team.

/** Abbreviations and names that don't look like their teams.json id. */
export const TEAM_SLUG_ALIASES: Readonly<Record<string, string>> = {
    'red-bull': 'red-bull-racing',
    'rbr': 'red-bull-racing',
    'mercedes-amg': 'mercedes',
    'str': 'toro-rosso',
    'scuderia-toro-rosso': 'toro-rosso',
    'rb': 'racing-bulls',
    'visa-cash-app-rb': 'racing-bulls',
    'mrt': 'manor',
    'mf1': 'midland',
    'brawn': 'brawn-gp',
    'team-lotus': 'lotus',
    'footwork': 'arrows',
    'euro-brun': 'eurobrun',
    'moda': 'andrea-moda',
    // Added on main by fix/data-catalogs (12/10). The legacy teams.js on
    // `next` gets them with the big merge; see the parity test.
    'lambo': 'modena', // 1991: the Modena team raced the Lambo chassis
    'venturi': 'larrousse', // 1992: Larrousse ran as Venturi Larrousse
};

// Own keys only: a plain `TEAM_SLUG_ALIASES[slug]` finds Object.prototype
// members, so "constructor" would resolve to a function.
function aliasOf(slug: string): string | undefined {
    return Object.hasOwn(TEAM_SLUG_ALIASES, slug) ? TEAM_SLUG_ALIASES[slug] : undefined;
}

/** "Red Bull Racing Honda RBPT" → "red-bull-racing-honda-rbpt". */
export function slugifyTeam(rawTeam: string): string {
    return rawTeam
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** Aliases only, without looking at teams.json. With the catalog at hand, use resolveTeamId(). */
export function teamSlug(rawTeam: string): string {
    const slug = slugifyTeam(rawTeam);
    return aliasOf(slug) ?? slug;
}

/**
 * The teams.json id that matches `rawTeam`, or its slug (with aliases) when
 * none does, so callers can still use it as a key without a color or logo.
 *
 * `teams` only needs its keys. Lookups use own keys only, where the legacy
 * code used plain property access: same result for every real team, but
 * "constructor" or "to-string" can't match Object.prototype members.
 */
export function resolveTeamId(rawTeam: string, teams?: Readonly<Record<string, unknown>>): string {
    const slug = slugifyTeam(rawTeam);
    if (!teams) return aliasOf(slug) ?? slug;

    const tokens = slug.split('-');
    for (let n = tokens.length; n > 0; n--) {
        const candidate = tokens.slice(0, n).join('-');
        const id = aliasOf(candidate) ?? candidate;
        if (Object.hasOwn(teams, id)) return id;
    }
    return aliasOf(slug) ?? slug;
}
