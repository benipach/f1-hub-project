import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import sirv from 'sirv';

// The pages built before the move to Astro, published exactly as they are
// until each one is rebuilt here. They live at the repo root and fetch data/
// at runtime with relative paths, so nothing is moved: the build copies them
// next to the new pages, and the dev server serves them from the repo.
//
// A page is either legacy or new, never both: when a new page replaces an
// old one, take the old one out of this list. The build fails if a legacy
// file would land on a file Astro generated, so a forgotten entry can't
// silently hide the new page.
const LEGACY_PATHS = [
    'index.html',
    'live.html',
    'drivers.html',
    'teams.html',
    'results.html',
    'championship.html',
    'archive.html',
    'drivers',
    'teams',
    'grandsprix',
    'js',
    'styles',
    'data',
    'img',
    'fonts',
];

export default function legacySite(repoRoot: URL): AstroIntegration {
    return {
        name: 'legacy-site',
        hooks: {
            'astro:server:setup': ({ server }) => {
                const base = server.config.base.replace(/\/$/, '');
                // extensions: GitHub Pages serves live.html at /live too.
                const serve = sirv(fileURLToPath(repoRoot), { dev: true, extensions: ['html'] });

                server.middlewares.use((req, res, next) => {
                    const url = req.url ?? '/';
                    if (!url.startsWith(base + '/')) return next();
                    const path = url.slice(base.length);
                    const first = path.slice(1).split(/[/?#]/)[0] ?? '';
                    const isLegacy = first === ''
                        || LEGACY_PATHS.includes(first)
                        || LEGACY_PATHS.includes(first + '.html');
                    if (!isLegacy) return next();
                    req.url = path;
                    // sirv calls next() on a miss, which hands the request
                    // back to Astro with its original URL.
                    serve(req, res, () => {
                        req.url = url;
                        next();
                    });
                });
            },

            'astro:build:done': async ({ dir, logger }) => {
                for (const entry of LEGACY_PATHS) {
                    await cp(new URL(entry, repoRoot), new URL(entry, dir), {
                        recursive: true,
                        force: false,
                        errorOnExist: true,
                    });
                }
                logger.info(`Copied ${LEGACY_PATHS.length} legacy entries into the build.`);
            },
        },
    };
}
