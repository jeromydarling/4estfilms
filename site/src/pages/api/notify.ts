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
  let firstName = '';
  let honeypot = '';
  let attr: Record<string, unknown> = {};

  const ct = request.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      const b = (await request.json()) as Record<string, unknown>;
      email = String(b.email ?? '');
      film = String(b.film ?? '');
      firstName = String(b.first_name ?? '');
      honeypot = String(b.hp_url ?? '');
      attr = b;
    } else {
      const f = await request.formData();
      email = String(f.get('email') ?? '');
      film = String(f.get('film') ?? '');
      firstName = String(f.get('first_name') ?? '');
      honeypot = String(f.get('hp_url') ?? '');
      attr = Object.fromEntries(f);
    }
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  // Attribution is caller-supplied and therefore untrusted — capped and
  // stored as-is, never interpreted. It is a label on a row, not a decision.
  const tag = (k: string, max = 80) => {
    const v = attr[k];
    return typeof v === 'string' && v ? v.slice(0, max) : null;
  };

  // Bots fill every field they find; humans never see this one.
  if (honeypot.trim() !== '') return json({ ok: true });

  email = email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    return json({ ok: false, error: 'Please check that address.' }, 422);
  }

  // Optional, so a bad value must never cost someone their subscription —
  // it is trimmed and capped rather than validated and rejected.
  firstName = firstName.trim().slice(0, 80);

  try {
    await db
      .prepare(
        `INSERT INTO subscribers
           (email, first_name, source, film, ip_country, user_agent,
            utm_source, utm_medium, utm_campaign, utm_content, referrer, landing_path)
         VALUES (?1, ?2, 'site', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(email) DO NOTHING`
      )
      .bind(
        email,
        firstName || null,
        film.slice(0, 60) || null,
        request.headers.get('cf-ipcountry'),
        (request.headers.get('user-agent') ?? '').slice(0, 255),
        tag('utm_source'),
        tag('utm_medium'),
        tag('utm_campaign'),
        tag('utm_content'),
        tag('referrer', 200),
        tag('landing_path', 120)
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
