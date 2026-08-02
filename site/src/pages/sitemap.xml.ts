import type { APIRoute } from 'astro';

export const prerender = true;

// Hand-rolled rather than @astrojs/sitemap: there are five pages, the set is
// known at build time, and the integration would pull a dependency in to
// produce this exact file. Add a page here when you add a page.
const PAGES: [path: string, priority: string, changefreq: string][] = [
  ['/', '1.0', 'monthly'],
  ['/films/his-name-is-michael/', '0.9', 'weekly'],
  ['/films/strung/', '0.8', 'monthly'],
  ['/screenings/', '0.8', 'daily'],
  ['/known/', '0.8', 'monthly'],
  ['/premiere/', '0.7', 'weekly'],
  ['/press/', '0.7', 'monthly'],
  ['/about/', '0.6', 'yearly'],
];

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://4estfilms.studio');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(
  ([path, priority, changefreq]) => `  <url>
    <loc>${new URL(path, base).href}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
