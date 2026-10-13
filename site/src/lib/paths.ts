// Links inside the site. Everything is served under the base path
// (/f1-hub-project on GitHub Pages), old pages included, so every internal
// href goes through here instead of being written by hand.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** "results.html" → "/f1-hub-project/results.html"; "" → the home page. */
export function href(path: string): string {
    return `${BASE}/${path.replace(/^\//, '')}`;
}
