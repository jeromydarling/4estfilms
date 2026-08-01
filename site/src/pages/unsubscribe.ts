import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { page } from '../lib/mailpage';

export const prerender = false;

const drop = async (token: string) => {
  const db = env.DB;
  if (!db || !/^[a-f0-9]{32}$/.test(token)) return false;
  const r = await db
    .prepare(
      `UPDATE subscribers SET unsubscribed_at = datetime('now')
        WHERE token = ?1 AND unsubscribed_at IS NULL`
    )
    .bind(token)
    .run();
  return (r.meta?.changes ?? 0) > 0;
};

/**
 * One-click unsubscribe.
 *
 * The POST is what Gmail and Yahoo call directly from their own UI, with no
 * browser and no confirmation step — it must succeed silently and without
 * asking anything. The GET is the same link opened by a person.
 *
 * Neither says whether the address was on the list: answering that would
 * turn the endpoint into a way to test whether an address is subscribed.
 * Both are idempotent, because both get called more than once.
 */
export const POST: APIRoute = async ({ url }) => {
  await drop((url.searchParams.get('t') ?? '').trim());
  return new Response(null, { status: 200 });
};

export const GET: APIRoute = async ({ url }) => {
  const token = (url.searchParams.get('t') ?? '').trim();
  try {
    await drop(token);
  } catch (err) {
    console.error('unsubscribe failed', err);
    return page({
      heading: 'Something broke on our end.',
      body: 'Reply to any email from us and we’ll take you off by hand.',
      status: 500,
    });
  }

  return page({
    heading: 'You’re unsubscribed.',
    body: 'You won’t hear from us again. If this was a mistake, you can sign up again from any page on the site.',
    cta: { href: '/', label: '4estfilms.studio' },
  });
};
