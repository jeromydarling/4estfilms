import type { APIRoute } from 'astro';
import { encode } from 'uqr';

export const prerender = false;

/**
 * The same QR as a vector, for screens.
 *
 * The ticket page uses this; the email uses the PNG, because mail clients
 * and SVG are not reliably on speaking terms.
 */
export const GET: APIRoute = ({ params }) => {
  const code = String(params.code ?? '').toUpperCase();
  if (!/^[A-Z0-9]{6,32}$/.test(code)) return new Response('not found', { status: 404 });

  const qr = encode(code, { ecc: 'M', border: 0 });
  const quiet = 4;
  const side = qr.size + quiet * 2;

  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ` +
    `width="${side * 8}" height="${side * 8}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="Ticket ${code}">` +
    `<rect width="${side}" height="${side}" fill="#fff"/>` +
    `<path d="${d}" fill="#17110D"/></svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
