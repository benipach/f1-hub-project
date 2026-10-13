import { defineConfig } from 'astro/config';
import legacySite from './integrations/legacy-site';

const repoRoot = new URL('../', import.meta.url);

export default defineConfig({
    site: 'https://benipach.github.io',
    base: '/f1-hub-project',
    integrations: [legacySite(repoRoot)],
    vite: {
        // Where data/ lives, fixed here because import.meta.url inside a page
        // points to the build output, not to the source (see src/lib/data.ts).
        define: { __DATA_DIR__: JSON.stringify(new URL('data/', repoRoot).href) },
    },
});
