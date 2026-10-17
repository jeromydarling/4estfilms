import { encode } from 'uqr';
import { greyPng } from './png';

/**
 * One QR, two renderings.
 *
 * SVG for screens, PNG for email and print — mail clients and SVG are not
 * reliably on speaking terms, and a QR that does not render is a person
 * arguing at a door. Both add the same four-module quiet zone, so a code
 * scans the same off a phone, a printout and an inbox.
 *
 * Nothing here looks anything up. These draw whatever they are given; the
 * authority on what a code means is the table it is checked against.
 */
const QUIET = 4;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function qrSvg(text: string, label: string): string {
  // border: 0 gives the raw symbol; the quiet zone is added here, so the
  // margin is decided in one place rather than two.
  const qr = encode(text, { ecc: 'M', border: 0 });
  const side = qr.size + QUIET * 2;

  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y][x]) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ` +
    `width="${side * 8}" height="${side * 8}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="${esc(label)}">` +
    `<rect width="${side}" height="${side}" fill="#fff"/>` +
    `<path d="${d}" fill="#17110D"/></svg>`
  );
}

export async function qrPng(text: string, scale = 8): Promise<Uint8Array> {
  const qr = encode(text, { ecc: 'M', border: 0 });
  const side = (qr.size + QUIET * 2) * scale;
  const px = new Uint8Array(side * side).fill(255);

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.data[y][x]) continue;
      const x0 = (x + QUIET) * scale;
      const y0 = (y + QUIET) * scale;
      for (let dy = 0; dy < scale; dy++) {
        px.fill(0, (y0 + dy) * side + x0, (y0 + dy) * side + x0 + scale);
      }
    }
  }

  return greyPng(px, side, side);
}

export const svgResponse = (svg: string, cacheControl: string) =>
  new Response(svg, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': cacheControl },
  });

export const pngResponse = (png: Uint8Array, cacheControl: string) =>
  new Response(png as unknown as BodyInit, {
    headers: { 'content-type': 'image/png', 'cache-control': cacheControl },
  });
