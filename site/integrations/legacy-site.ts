import { existsSync, statSync } from 'node:fs';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
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

// Option B (_design/DESIGN.md, section 5 "Old pages"): the old pages get the
// new navbar and footer, so the site looks like one while its pages are
// rebuilt one at a time. src/pages/legacy-chrome.astro renders the two; here
// they replace the old <header class="navbar"> and <footer class="footer">
// (which js/navbar.js and js/footer.js drove: their scripts go), and the
// chrome's stylesheets and scripts join the old page's <head>, after its own.
// Pages without the old navbar (live.html, the two redirects) stay as they are.
const CHROME_PAGE = 'legacy-chrome';

/** The section an old page belongs to, marked in the new menu. */
const CURRENT: Record<string, string> = {
    'drivers.html': 'drivers.html',
    'drivers/driver.html': 'drivers.html',
    'teams.html': 'teams.html',
    'teams/team.html': 'teams.html',
    'results.html': 'results.html',
};

type Chrome = { head: string; top: string; bottom: string };

/** The parts of the rendered chrome page an old page takes. */
function readChrome(html: string): Chrome {
    const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
    const split = body.indexOf('<footer class="foot');
    if (split < 0) throw new Error(`[legacy-site] no footer in the rendered ${CHROME_PAGE} page`);
    // Stylesheets and scripts only: the old page keeps its own title and meta
    const assets = head.match(/<link\b[^>]*rel="stylesheet"[^>]*>|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>/g) ?? [];
    return { head: assets.join('\n'), top: body.slice(0, split), bottom: body.slice(split) };
}

/** An old page with the new navbar and footer, or null if it has no old navbar. */
function withChrome(page: string, chrome: Chrome, file: string): string | null {
    if (!/<header class="navbar">/.test(page)) return null;
    const current = CURRENT[file];
    const top = current
        ? chrome.top.replace(new RegExp(`(<a\\b[^>]*href="[^"]*/${current.replace('.', '\\.')}")`, 'g'), '$1 aria-current="page"')
        : chrome.top;
    const theme = /name="theme-color"/.test(page) ? '' : '<meta name="theme-color" content="#121212">\n';
    return page
        .replace(/[ \t]*<script\b[^>]*src="[^"]*js\/(?:navbar|footer)\.js"[^>]*><\/script>\r?\n?/g, '')
        .replace(/<header class="navbar">[\s\S]*?<\/header>/, () => top)
        .replace(/<footer class="footer"[^>]*>[\s\S]*?<\/footer>/, () => chrome.bottom)
        .replace('</head>', () => `${theme}${chrome.head}\n</head>`);
}

/** Every .html file under a folder, relative to it ("drivers/driver.html"). */
async function htmlFiles(dir: URL, prefix = ''): Promise<string[]> {
    const found: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const rel = prefix + entry.name;
        if (entry.isDirectory()) found.push(...(await htmlFiles(new URL(`${entry.name}/`, dir), `${rel}/`)));
        else if (entry.name.endsWith('.html')) found.push(rel);
    }
    return found;
}

export default function legacySite(repoRoot: URL): AstroIntegration {
    let base = '';
    return {
        name: 'legacy-site',
        hooks: {
            'astro:config:done': ({ config }) => {
                base = config.base.replace(/\/$/, '');
            },

            'astro:server:setup': ({ server }) => {
                base = server.config.base.replace(/\/$/, '');
                // extensions: GitHub Pages serves live.html at /live too.
                const serve = sirv(fileURLToPath(repoRoot), { dev: true, extensions: ['html'] });

                server.middlewares.use(async (req, res, next) => {
                    const url = req.url ?? '/';
                    if (!url.startsWith(base + '/')) return next();
                    const path = url.slice(base.length);
                    const first = path.slice(1).split(/[/?#]/)[0] ?? '';
                    const isLegacy = first === ''
                        || LEGACY_PATHS.includes(first)
                        || LEGACY_PATHS.includes(first + '.html');
                    if (!isLegacy) return next();

                    // An old page: served with the new chrome, rendered by the
                    // dev server itself (so editing the navbar shows at once)
                    const clean = decodeURIComponent(path.split(/[?#]/)[0] ?? '/');
                    const file = clean.endsWith('/') ? `${clean}index.html` : extname(clean) ? clean : `${clean}.html`;
                    const disk = new URL(`.${file}`, repoRoot);
                    if (file.endsWith('.html') && existsSync(disk) && statSync(disk).isFile()) {
                        try {
                            const page = await readFile(disk, 'utf8');
                            const rendered = await fetch(`http://${req.headers.host}${base}/${CHROME_PAGE}/`);
                            const out = withChrome(page, readChrome(await rendered.text()), file.slice(1));
                            res.setHeader('Content-Type', 'text/html; charset=utf-8');
                            res.end(out ?? page);
                            return;
                        } catch (err) {
                            server.config.logger.error(`[legacy-site] ${file}: ${(err as Error).message}`);
                        }
                    }

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

                const chromeDir = new URL(`${CHROME_PAGE}/`, dir);
                const chrome = readChrome(await readFile(new URL('index.html', chromeDir), 'utf8'));
                // The pages, and the folders holding pages (not the assets)
                const assets = new Set(['js', 'styles', 'data', 'img', 'fonts']);
                const pages = LEGACY_PATHS.filter((entry) => !assets.has(entry));
                let changed = 0;
                for (const entry of pages) {
                    const files = entry.endsWith('.html') ? [entry] : (await htmlFiles(new URL(`${entry}/`, dir))).map((f) => `${entry}/${f}`);
                    for (const file of files) {
                        const target = new URL(file, dir);
                        const out = withChrome(await readFile(target, 'utf8'), chrome, file);
                        if (out === null) continue;
                        await writeFile(target, out);
                        changed++;
                    }
                }
                await rm(chromeDir, { recursive: true });
                logger.info(`New navbar and footer on ${changed} legacy pages.`);
            },
        },
    };
}
