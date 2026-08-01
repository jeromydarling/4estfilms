import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// Deliberately permissive but not useless: catches the common typos
// (missing @, trailing dot, spaces) without trying to out-clever RFC 5322.
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@.]{2,}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export const POST: APIRoute = async ({ request }) => {
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'unavailable' }, 503);

  let email = '';
  let film = '';
  let honeypot = '';

  const ct = request.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      const b = (await request.json()) as Record<string, unknown>;
      email = String(b.email ?? '');
      film = String(b.film ?? '');
      honeypot = String(b.company ?? '');
    } else {
      const f = await request.formData();
      email = String(f.get('email') ?? '');
      film = String(f.get('film') ?? '');
      honeypot = String(f.get('company') ?? '');
    }
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  // Bots fill every field they find; humans never see this one.
  if (honeypot.trim() !== '') return json({ ok: true });

  email = email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    return json({ ok: false, error: 'Please check that address.' }, 422);
  }

  try {
    await db
      .prepare(
        `INSERT INTO subscribers (email, source, film, ip_country, user_agent)
         VALUES (?1, 'site', ?2, ?3, ?4)
         ON CONFLICT(email) DO NOTHING`
      )
      .bind(
        email,
        film.slice(0, 60) || null,
        request.headers.get('cf-ipcountry'),
        (request.headers.get('user-agent') ?? '').slice(0, 255)
      )
      .run();
  } catch (err) {
    console.error('notify insert failed', err);
    return json({ ok: false, error: 'Something broke on our end.' }, 500);
  }

  // Already-subscribed and newly-subscribed return the same thing on
  // purpose — the endpoint should not reveal who is on the list.
  return json({ ok: true });
};
