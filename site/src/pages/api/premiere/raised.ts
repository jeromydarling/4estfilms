import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { premiere } from '../../../lib/premiere';

export const prerender = false;

/**
 * The running fundraising total, public on purpose.
 *
 * A number that goes up is the campaign's own best advertisement, and it is
 * the honest way to report a fundraiser. Counts and sums only — no names,
 * no amounts per person.
 */
export const GET: APIRoute = async () => {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ ok: false }), { status: 503 });

  try {
    const row = await db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS tickets
           FROM orders WHERE film = ?1 AND status = 'paid'`
      )
      .bind(premiere.film)
      .first<{ cents: number; tickets: number }>();

    return new Response(
      JSON.stringify({
        ok: true,
        raised_cents: row?.cents ?? 0,
        tickets: row?.tickets ?? 0,
        open: premiere.open,
      }),
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          // Briefly cacheable: it is a headline figure, not an accounting
          // record, and this endpoint sits in front of a database.
          'cache-control': 'public, max-age=60',
        },
      }
    );
  } catch (err) {
    console.error('raised failed', err);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
};
