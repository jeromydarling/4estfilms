import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { premiere } from '../../../lib/premiere';

export const prerender = false;

/**
 * Redeems a ticket and streams the film.
 *
 * The check happens here, on every request, rather than once when the page
 * loads — a page that checked at render time and then pointed a <video> at
 * an open URL would not be gated at all. Range requests are proxied through
 * so seeking still works.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const db = env.DB;
  const bucket = env.MEDIA;
  const token = (url.searchParams.get('t') ?? '').trim();

  if (!db || !bucket) return new Response('unavailable', { status: 503 });
  if (!/^[a-f0-9]{32}$/.test(token)) return new Response('not found', { status: 404 });

  const ticket = await db
    .prepare(
      `SELECT id, film, expires_at, revoked_at FROM tickets
        WHERE token = ?1 AND film = ?2`
    )
    .bind(token, premiere.film)
    .first<{ id: number; film: string; expires_at: string | null; revoked_at: string | null }>();

  // One answer for "no such ticket", "revoked" and "expired". Telling them
  // apart would let someone probe for valid tokens.
  if (!ticket || ticket.revoked_at) return new Response('not found', { status: 404 });
  if (ticket.expires_at && Date.parse(ticket.expires_at.replace(' ', 'T') + 'Z') < Date.now()) {
    return new Response('not found', { status: 404 });
  }

  // Counted once per request, not per range chunk — a browser issues many
  // ranges for one viewing, so only the opening request is a view.
  const range = request.headers.get('range');
  if (!range || /^bytes=0-/.test(range)) {
    await db
      .prepare(
        `UPDATE tickets
            SET views = views + 1,
                last_seen_at = datetime('now'),
                first_seen_at = COALESCE(first_seen_at, datetime('now'))
          WHERE id = ?1`
      )
      .bind(ticket.id)
      .run();
  }

  const key = `${premiere.videoKey}-1080.mp4`;
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  const headers = new Headers({
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    // Never cached by an intermediary: the URL carries a ticket.
    'cache-control': 'private, no-store',
  });

  if (match) {
    const head = await bucket.head(key);
    if (!head) return new Response('not found', { status: 404 });

    const size = head.size;
    const [, rawStart, rawEnd] = match;
    let start: number;
    let end: number;

    if (rawStart === '') {
      // Suffix range: the last N bytes.
      const n = Number(rawEnd);
      if (!Number.isFinite(n) || n <= 0) return new Response('bad range', { status: 416 });
      start = Math.max(0, size - n);
      end = size - 1;
    } else {
      start = Number(rawStart);
      end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
    }

    if (!Number.isFinite(start) || start >= size || end < start) {
      return new Response('bad range', {
        status: 416,
        headers: { 'content-range': `bytes */${size}` },
      });
    }

    const object = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!object) return new Response('not found', { status: 404 });

    headers.set('content-range', `bytes ${start}-${end}/${size}`);
    headers.set('content-length', String(end - start + 1));
    return new Response(object.body, { status: 206, headers });
  }

  const object = await bucket.get(key);
  if (!object) return new Response('not found', { status: 404 });
  headers.set('content-length', String(object.size));
  return new Response(object.body, { status: 200, headers });
};
