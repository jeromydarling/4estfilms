import type { APIRoute } from 'astro';
import { sameOrigin } from '../../../../lib/admin';
import { getEvent } from '../../../../lib/boxoffice-db';
import {
  closeDoor, doorCookie, doorFailure, doorRateLimited, openDoor, pinMatches,
} from '../../../../lib/door';

export const prerender = false;

/**
 * A door PIN for a session: four digits, one stop, one night.
 *
 * Same message whether the stop or the PIN is wrong, so the form cannot be
 * used to learn which stops exist. Ten misses from one address and it stops
 * answering for fifteen minutes.
 */
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const POST: APIRoute = async ({ request, url }) => {
  if (!sameOrigin(request, url)) return json({ ok: false }, 403);
  if (await doorRateLimited(request)) {
    return json({ ok: false, error: 'Too many tries. Wait fifteen minutes.' }, 429);
  }

  let body: { slug?: string; pin?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const event = await getEvent(String(body.slug ?? ''));
  const pin = String(body.pin ?? '').replace(/\s/g, '');
  if (!event || !pinMatches(event, pin)) {
    await doorFailure(request);
    return json({ ok: false, error: 'That’s not the PIN for this door.' }, 401);
  }

  const id = await openDoor(event.id);
  if (!id) return json({ ok: false, error: 'Session storage unavailable.' }, 503);
  return json({ ok: true }, 200, { 'set-cookie': doorCookie(id) });
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!sameOrigin(request, url)) return json({ ok: false }, 403);
  await closeDoor(request);
  return json({ ok: true }, 200, { 'set-cookie': doorCookie('', 0) });
};
