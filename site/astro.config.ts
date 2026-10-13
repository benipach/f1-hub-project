import { defineConfig } from 'astro/config';
import legacySite from './integrations/legacy-site';

const repoRoot = new URL('../', import.meta.url);

export default defineConfig({
    site: 'https://benipach.github.io',
    base: '/f1-hub-project',
    integrations: [legacySite(repoRoot)],
    // Languages (src/i18n/index.ts): English at the root with no prefix, so
    // today's URLs don't change; each new locale gets /<code>/. Keep this list
    // in step with LOCALES.
    i18n: {
        locales: ['en'],
        defaultLocale: 'en',
        routing: { prefixDefaultLocale: false },
    },
    vite: {
        // Where data/ lives, fixed here because import.meta.url inside a page
        // points to the build output, not to the source (see src/lib/data.ts).
        define: { __DATA_DIR__: JSON.stringify(new URL('data/', repoRoot).href) },
    },
});
