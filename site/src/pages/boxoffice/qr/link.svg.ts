import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/admin';
import { qrSvg, svgResponse } from '../../../lib/qr';

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

  return svgResponse(qrSvg(target.href, 'Scan to pay'), 'no-store');
};
