// The repo's data/ folder, for the loaders in @f1hub/shared (loadSeason,
// loadTeams, loadLatestYear). Pages read it at build time; nothing is fetched
// in the browser.

declare const __DATA_DIR__: string;

export const DATA_DIR = new URL(__DATA_DIR__);
