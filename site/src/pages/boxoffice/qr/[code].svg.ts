import type { APIRoute } from 'astro';
import { qrSvg, svgResponse } from '../../../lib/qr';

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
  return svgResponse(qrSvg(code, `Ticket ${code}`), 'public, max-age=31536000, immutable');
};
