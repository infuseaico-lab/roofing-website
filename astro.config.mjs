import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: replace with the real domain before launch.
export default defineConfig({
  site: 'https://www.example-roofing.com',
  integrations: [sitemap()],
});
