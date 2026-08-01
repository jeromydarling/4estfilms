import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.4estfilms.com',
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
});
