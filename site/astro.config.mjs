import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://www.4estfilms.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: { enabled: true },
  }),
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
  // Content pages are pure static; only the API routes need the server.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
});
