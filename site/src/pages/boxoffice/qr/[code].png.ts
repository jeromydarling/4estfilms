import type { APIRoute } from 'astro';
import { pngResponse, qrPng } from '../../../lib/qr';

export const prerender = false;

/**
 * The QR for a ticket code, as a PNG.
 *
 * No database lookup on purpose: this renders whatever code is in the URL.
 * The image is not the authority on anything — the door checks the code
 * against the tickets table — so there is nothing here to leak, and nothing
 * to go wrong if an email is opened six months later.
 */
export const GET: APIRoute = async ({ params }) => {
  const code = String(params.code ?? '').toUpperCase();
  if (!/^[A-Z0-9]{6,32}$/.test(code)) return new Response('not found', { status: 404 });
  // Immutable: a given code always draws the same square.
  return pngResponse(await qrPng(code), 'public, max-age=31536000, immutable');
};
