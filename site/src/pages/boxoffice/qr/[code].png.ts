import type { APIRoute } from 'astro';
import { encode } from 'uqr';
import { greyPng } from '../../../lib/png';

export const prerender = false;

/**
 * The QR for a ticket code, as a PNG.
 *
 * No database lookup on purpose: this renders whatever code is in the URL.
 * The image is not the authority on anything — the door checks the code
 * against the tickets table — so there is nothing here to leak, and nothing
 * to go wrong if an email is opened six months later.
 */

const SCALE = 8;
const QUIET = 4;

export const GET: APIRoute = async ({ params }) => {
  const code = String(params.code ?? '').toUpperCase();
  if (!/^[A-Z0-9]{6,32}$/.test(code)) return new Response('not found', { status: 404 });

  // border: 0 gives the raw symbol; the quiet zone is added below, so the
  // scale maths and the margin are decided in one place rather than two.
  const qr = encode(code, { ecc: 'M', border: 0 });
  const side = (qr.size + QUIET * 2) * SCALE;
  const px = new Uint8Array(side * side).fill(255);

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.data[y][x]) continue;
      const x0 = (x + QUIET) * SCALE;
      const y0 = (y + QUIET) * SCALE;
      for (let dy = 0; dy < SCALE; dy++) {
        px.fill(0, (y0 + dy) * side + x0, (y0 + dy) * side + x0 + SCALE);
      }
    }
  }

  const png = await greyPng(px, side, side);
  return new Response(png as unknown as BodyInit, {
    headers: {
      'content-type': 'image/png',
      // Immutable: a given code always draws the same square.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
