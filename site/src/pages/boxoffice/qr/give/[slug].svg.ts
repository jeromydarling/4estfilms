import type { APIRoute } from 'astro';
import { giveUrl } from '../../../../lib/offering';
import { qrSvg, svgResponse } from '../../../../lib/qr';

export const prerender = false;

/**
 * The QR that goes on the offering sign: scan it, give what you like.
 *
 * Public, because it is printed. It only ever encodes a URL on our own domain
 * for a stop that exists (or `tour` for the tour as a whole), so there is no
 * open-redirect shape here to worry about.
 */
export const GET: APIRoute = async ({ params }) => {
  const target = await giveUrl(String(params.slug ?? ''));
  if (!target) return new Response('not found', { status: 404 });
  return svgResponse(qrSvg(target, 'Scan to make a free-will offering'), 'public, max-age=86400');
};
