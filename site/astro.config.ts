import { defineConfig } from 'astro/config';
import legacySite from './integrations/legacy-site';

const repoRoot = new URL('../', import.meta.url);

export default defineConfig({
    site: 'https://benipach.github.io',
    base: '/f1-hub-project',
    integrations: [legacySite(repoRoot)],
    // No dev toolbar (14/10): its audit app watches the DOM and, on every
    // change, fetches every <img> again to check its size. The hero changes
    // text every second (the countdown), so in `astro dev` with the browser's
    // cache disabled it piled up thousands of requests (7,717 and 248 MB in
    // 1.6 minutes). Dev only: the toolbar never ships in a build.
    devToolbar: { enabled: false },
    // Languages (src/i18n/index.ts): English at the root with no prefix, so
    // today's URLs don't change; each new locale gets /<code>/. Keep this list
    // in step with LOCALES.
    i18n: {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        routing: { prefixDefaultLocale: false },
    },
    vite: {
        // Where data/ lives, fixed here because import.meta.url inside a page
        // points to the build output, not to the source (see src/lib/data.ts).
        define: { __DATA_DIR__: JSON.stringify(new URL('data/', repoRoot).href) },
    },
});
