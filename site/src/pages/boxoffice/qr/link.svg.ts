import type { APIRoute } from 'astro';
import { encode } from 'uqr';
import { isAdmin } from '../../../lib/admin';

export const prerender = false;

/**
 * A QR for a Stripe Checkout link, so the door can take a card without
 * carrying a terminal: the buyer scans this off the operator's screen and
 * pays on their own phone.
 *
 * Admin-only and restricted to Stripe's own host — otherwise this is a free
 * QR generator for anybody's URL, served from our domain, which is exactly
 * the shape of thing that ends up in a phishing email.
 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const raw = url.searchParams.get('u') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('bad url', { status: 400 });
  }
  if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') {
    return new Response('refused', { status: 400 });
  }

  const qr = encode(target.href, { ecc: 'M', border: 0 });
  const quiet = 4;
  const side = qr.size + quiet * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }

  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ` +
      `width="${side * 8}" height="${side * 8}" shape-rendering="crispEdges" role="img" ` +
      `aria-label="Scan to pay"><rect width="${side}" height="${side}" fill="#fff"/>` +
      `<path d="${d}" fill="#17110D"/></svg>`,
    { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' } }
  );
};
