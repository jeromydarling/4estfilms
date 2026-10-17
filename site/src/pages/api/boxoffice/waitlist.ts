import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEvent } from '../../../lib/boxoffice-db';

export const prerender = false;

/**
 * "Put me on the list" for a stop that has sold out.
 *
 * Per stop, not a general sign-up: a second showing in Omaha is news to the
 * people who wanted Omaha and noise to everyone else. Replies the same way
 * whether the address was new or already there, so the form cannot be used
 * to check who is on it.
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  let body: { slug?: string; email?: string; name?: string; website?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  // Honeypot: a field no person sees. Filled in means a script, and a script
  // gets a cheerful yes and nothing stored.
  if (body.website) return json({ ok: true });

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return json({ ok: false, error: 'Please check that address.' }, 422);
  }
  const name = String(body.name ?? '').trim().slice(0, 80) || null;

  const event = await getEvent(String(body.slug ?? ''));
  if (!event) return json({ ok: false, error: 'No such stop.' }, 404);

  await env.DB
    .prepare(
      `INSERT INTO bo_waitlist (event_id, email, name, ip_country) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(event_id, email) DO NOTHING`
    )
    .bind(event.id, email, name, request.headers.get('cf-ipcountry'))
    .run();

  return json({ ok: true });
};
