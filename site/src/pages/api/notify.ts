import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { confirmEmail, newToken, send } from '../../lib/email';

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

  let row: Row | null = null;
  try {
    await db
      .prepare(
        `INSERT INTO subscribers
           (email, first_name, source, film, ip_country, user_agent, token,
            utm_source, utm_medium, utm_campaign, utm_content, referrer, landing_path)
         VALUES (?1, ?2, 'site', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(email) DO NOTHING`
      )
      .bind(
        email,
        firstName || null,
        film.slice(0, 60) || null,
        request.headers.get('cf-ipcountry'),
        (request.headers.get('user-agent') ?? '').slice(0, 255),
        newToken(),
        tag('utm_source'),
        tag('utm_medium'),
        tag('utm_campaign'),
        tag('utm_content'),
        tag('referrer', 200),
        tag('landing_path', 120)
      )
      .run();

    row = await db
      .prepare(
        `SELECT id, first_name, token, confirmed_at, unsubscribed_at, confirm_sent_at
           FROM subscribers WHERE email = ?1`
      )
      .bind(email)
      .first<Row>();
  } catch (err) {
    console.error('notify insert failed', err);
    return json({ ok: false, error: 'Something broke on our end.' }, 500);
  }

  // Send the confirmation on the request rather than after it: this has to
  // finish before the response, or a cold Worker can be torn down first and
  // the person never hears anything.
  if (row && !row.confirmed_at && !row.unsubscribed_at && row.token && sendable(row)) {
    try {
      const mail = confirmEmail(row.token, row.first_name);
      await send({ to: email, token: row.token, campaign: 'confirm', ...mail });
      await db
        .prepare(`UPDATE subscribers SET confirm_sent_at = datetime('now') WHERE id = ?1`)
        .bind(row.id)
        .run();
    } catch (err) {
      // They are on the list; the confirmation can be re-sent by signing up
      // again. Reporting a mail failure here would only invite a retry that
      // sends a second copy.
      console.error('confirm send failed', err);
    }
  }

  // Already-subscribed and newly-subscribed return the same thing on
  // purpose — the endpoint should not reveal who is on the list.
  return json({ ok: true });
};

interface Row {
  id: number;
  first_name: string | null;
  token: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  confirm_sent_at: string | null;
}

/**
 * Re-signing up re-sends the confirmation, because the usual reason someone
 * does it is that the first one never arrived. Rate-limited to one an hour
 * so the form cannot be used to mailbomb an address by typing it repeatedly.
 */
const RESEND_AFTER_MS = 60 * 60 * 1000;
function sendable(row: Row): boolean {
  if (!row.confirm_sent_at) return true;
  const last = Date.parse(row.confirm_sent_at.replace(' ', 'T') + 'Z');
  return !Number.isFinite(last) || Date.now() - last > RESEND_AFTER_MS;
}
