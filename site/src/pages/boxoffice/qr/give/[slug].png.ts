import type { APIRoute } from 'astro';
import { giveUrl } from '../../../../lib/offering';
import { pngResponse, qrPng } from '../../../../lib/qr';

export const prerender = false;

/** The offering QR as a PNG, for a printer or a slide. See the .svg route. */
export const GET: APIRoute = async ({ params }) => {
  const target = await giveUrl(String(params.slug ?? ''));
  if (!target) return new Response('not found', { status: 404 });
  // Scale 12: a URL is a denser symbol than a ticket code, and this one is
  // read from across a lobby.
  return pngResponse(await qrPng(target, 12), 'public, max-age=86400');
};
