// shared/resolve.js — GP/circuit/team/driver resolution helpers, no DOM.
// Used by pages/index.js and pages/race.js.

// ── Location (GP → circuit → city → country) ───────────────────────────────

function getGpLocation(gp, ctx) {
    const circuit = ctx.circuits?.[gp.circuitId] ?? null;
    const city    = ctx.cities?.[circuit?.location?.city] ?? null;
    const country = ctx.countries?.[city?.country] ?? null;
    return { circuit, city, country };
}

function isoToFlagEmoji(isoCode) {
    if (!isoCode || isoCode.length !== 2) return '';
    return String.fromCodePoint(
        ...[...isoCode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    );
}

function getGpFlag(gp, ctx)     { return isoToFlagEmoji(getGpLocation(gp, ctx).country?.isoCode); }
function getGpCityName(gp, ctx) { return getGpLocation(gp, ctx).city?.name ?? ''; }
function gpShortName(gp) { return gp.name.replace(/Grand Prix/i, 'GP'); }

function getCircuitLayout(circuit, year) {
    const layouts = Object.values(circuit?.layouts ?? {});
    return layouts.find(l => l.validFrom <= year && (l.validTo == null || l.validTo >= year))
        ?? layouts[layouts.length - 1] ?? null;
}

// ── Team (season2026.json is mid-migration: driver/team are a mix of raw
// display names and real IDs — see project notes) ─────────────────────────

function toTeamSlugGuess(name) {
    return name
        ?.toLowerCase()
        .replace(/ f1 team$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') ?? '';
}

function resolveTeamId(rawTeamName, teamsData) {
    if (teamsData?.[rawTeamName]) return rawTeamName;
    return toTeamSlugGuess(rawTeamName);
}

function resolveTeam(rawTeamName, teamsData) {
    return getTeamMeta(resolveTeamId(rawTeamName, teamsData), teamsData);
}

function teamLogoPath(teamId, basePath = '.') {
    return teamId ? `${basePath}/img/teams/${teamId}-logo.png` : null;
}

function resolveDriverCode(rawDriver, driversData) {
    return driversData?.[rawDriver]?.shortName ?? '';
}

function resolveDriverName(rawDriver, driversData) {
    const d = driversData?.[rawDriver];
    return d ? `${d.firstName} ${d.lastName}` : (rawDriver ?? '');
}

function resolveDriverNameUpper(rawDriver, driversData) {
    const d = driversData?.[rawDriver];
    if (d) return `${d.firstName} ${d.lastName.toUpperCase()}`;

    const raw = rawDriver ?? '';
    const parts = raw.trim().split(' ');
    if (parts.length < 2) return raw.toUpperCase();
    const lastName = parts.pop().toUpperCase();
    return `${parts.join(' ')} ${lastName}`;
}