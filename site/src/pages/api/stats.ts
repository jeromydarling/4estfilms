import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * The launch readout: where signups came from, and whether people finish the
 * trailer.
 *
 *   curl -H "authorization: Bearer $ADMIN_TOKEN" https://4estfilms.studio/api/stats
 *
 * Guarded by ADMIN_TOKEN, a Worker secret. Without one set, the route is
 * closed rather than open — a missing secret is a misconfiguration, and the
 * safe reading of a misconfiguration is "no".
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

/** Length-independent compare, so the token cannot be guessed a byte at a time. */
const constantTimeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Fold the length difference in rather than returning early on it.
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
};

export const GET: APIRoute = async ({ request }) => {
  const secret = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  const offered = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secret || !offered || !constantTimeEqual(secret, offered)) {
    return json({ ok: false }, 404);
  }

  const db = env.DB;
  if (!db) return json({ ok: false, error: 'unavailable' }, 503);

  const q = <T>(sql: string) => db.prepare(sql).all<T>();

  try {
    const [bySource, byFilm, totals, funnel, recent] = await Promise.all([
      // The aliases are `channel` and `for_film`, not `source` and `film`,
      // because subscribers already has columns by both those names. SQLite
      // resolves GROUP BY against the column before the alias, so the
      // obvious spelling silently groups every signup into one bucket.
      q<{ channel: string; signups: number }>(
        `SELECT COALESCE(utm_source, referrer, 'direct') AS channel, COUNT(*) AS signups
           FROM subscribers
          WHERE unsubscribed_at IS NULL
       GROUP BY channel ORDER BY signups DESC LIMIT 25`
      ),
      q<{ for_film: string; signups: number }>(
        `SELECT COALESCE(film, 'company') AS for_film, COUNT(*) AS signups
           FROM subscribers WHERE unsubscribed_at IS NULL
       GROUP BY for_film ORDER BY signups DESC`
      ),
      q<{ total: number; confirmed: number; unsubscribed: number; named: number }>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) AS unsubscribed,
                SUM(CASE WHEN first_name IS NOT NULL THEN 1 ELSE 0 END) AS named
           FROM subscribers`
      ),
      // Distinct sessions per step, so one viewer scrubbing back and forth
      // counts once. This is the number that says whether the trailer works.
      q<{ name: string; watches: number }>(
        `SELECT name, COUNT(DISTINCT session) AS watches
           FROM events WHERE name LIKE 'trailer_%'
       GROUP BY name ORDER BY name`
      ),
      q<{ day: string; signups: number }>(
        `SELECT date(created_at) AS day, COUNT(*) AS signups
           FROM subscribers GROUP BY day ORDER BY day DESC LIMIT 30`
      ),
    ]);

    const steps = Object.fromEntries(
      (funnel.results ?? []).map((r) => [r.name, r.watches])
    ) as Record<string, number>;
    const started = steps.trailer_start ?? 0;
    const finished = steps.trailer_complete ?? 0;

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      list: totals.results?.[0] ?? {},
      signups_by_source: bySource.results ?? [],
      signups_by_film: byFilm.results ?? [],
      signups_by_day: recent.results ?? [],
      trailer: {
        ...steps,
        completion_rate: started ? Number((finished / started).toFixed(3)) : null,
      },
    });
  } catch (err) {
    console.error('stats failed', err);
    return json({ ok: false, error: 'query failed' }, 500);
  }
};
