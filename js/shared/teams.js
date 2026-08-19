// shared/teams.js

function getTeamMeta(teamSlug, teamsData) {
    const team = teamsData?.[teamSlug];
    return {
        cls:   teamSlug ? `team-${teamSlug}` : '',
        label: team?.name ?? teamSlug,
        color: team?.color ?? null,
        logo:  team?.logo ?? null,
    };
}