import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { send, welcomeEmail } from '../lib/email';
import { page } from '../lib/mailpage';

export const prerender = false;

/**
 * The link in the confirmation email.
 *
 * A plain page rather than a JSON endpoint, because the thing that opens it
 * is a mail client, and what arrives is a person.
 */
export const GET: APIRoute = async ({ url }) => {
  const token = (url.searchParams.get('t') ?? '').trim();
  const db = env.DB;

  if (!db || !/^[a-f0-9]{32}$/.test(token)) {
    return page({
      heading: 'That link didn’t work.',
      body: 'It may have been broken across two lines by your mail client. Try copying the whole address, or just sign up again.',
      status: 400,
    });
  }

  try {
    const row = await db
      .prepare(
        `SELECT id, email, first_name, confirmed_at FROM subscribers
          WHERE token = ?1 AND unsubscribed_at IS NULL`
      )
      .bind(token)
      .first<{ id: number; email: string; first_name: string | null; confirmed_at: string | null }>();

    if (!row) {
      return page({
        heading: 'That link didn’t work.',
        body: 'It may already have been used, or the subscription was cancelled. Signing up again will send a fresh one.',
        status: 404,
      });
    }

    // Idempotent: mail clients pre-fetch links, and people click twice.
    // A second visit must not send a second welcome.
    if (!row.confirmed_at) {
      await db
        .prepare(`UPDATE subscribers SET confirmed_at = datetime('now') WHERE id = ?1`)
        .bind(row.id)
        .run();

      try {
        const mail = welcomeEmail(token, row.first_name);
        await send({ to: row.email, token, campaign: 'welcome', ...mail });
      } catch (err) {
        // They are confirmed either way. Failing the page over a welcome
        // note would be a worse outcome than the note not arriving.
        console.error('welcome send failed', err);
      }
    }

    return page({
      heading: 'You’re on the list.',
      body: 'We’ll write when there is something real to say — a trailer, a date, a screening. Not otherwise.',
      cta: { href: '/films/his-name-is-michael/', label: 'See the film' },
    });
  } catch (err) {
    console.error('confirm failed', err);
    return page({
      heading: 'Something broke on our end.',
      body: 'Try the link again in a moment.',
      status: 500,
    });
  }
};
