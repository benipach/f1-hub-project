import { defineConfig } from 'astro/config';
import legacySite from './integrations/legacy-site';

export default defineConfig({
    site: 'https://benipach.github.io',
    base: '/f1-hub-project',
    integrations: [legacySite(new URL('../', import.meta.url))],
});
