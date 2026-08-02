import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { screenings } from '../../../lib/screenings';

export const prerender = false;

/**
 * The leaderboard.
 *
 * Public counts only — a city, a number, and whether somebody there has put
 * their hand up. No names, no addresses. The point is to show a visitor
 * that this is a real queue their city can join, and to make a city with
 * momentum visible enough that people pile on.
 */
export const GET: APIRoute = async () => {
  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    type Row = {
      slug: string;
      city: string;
      region: string | null;
      country: string;
      status: string;
      requests: number;
      hosts: number;
    };

    const rows = await db
      .prepare(
        `SELECT c.slug, c.city, c.region, c.country, c.status,
                COUNT(r.id) AS requests,
                COALESCE(SUM(r.willing_to_host), 0) AS hosts
           FROM screening_cities c
           LEFT JOIN screening_requests r ON r.city_id = c.id
          WHERE c.film = ?1
       GROUP BY c.id
         HAVING requests > 0
       ORDER BY requests DESC, c.updated_at DESC
          LIMIT ?2`
      )
      .bind(screenings.film, screenings.topCities)
      .all<Row>();

    // Cities that exist but nobody has asked for yet. These are the seeded
    // ones, and they are the answer to the empty-map problem: a visitor
    // facing a blank text field has to know what to type and believe it
    // will lead anywhere, whereas one who sees their own city listed just
    // clicks it. Returned separately from `cities` so the page never shows
    // a zero as though it were demand.
    const openRows = await db
      .prepare(
        `SELECT c.slug, c.city, c.region, c.country, c.status,
                0 AS requests, 0 AS hosts
           FROM screening_cities c
           LEFT JOIN screening_requests r ON r.city_id = c.id
          WHERE c.film = ?1
       GROUP BY c.id
         HAVING COUNT(r.id) = 0
       ORDER BY c.region, c.city`
      )
      .bind(screenings.film)
      .all<Row>();

    const totals = await db
      .prepare(
        `SELECT COUNT(DISTINCT c.id) AS cities, COUNT(r.id) AS requests
           FROM screening_cities c
           JOIN screening_requests r ON r.city_id = c.id
          WHERE c.film = ?1`
      )
      .bind(screenings.film)
      .first<{ cities: number; requests: number }>();

    return new Response(
      JSON.stringify({
        ok: true,
        threshold: screenings.threshold,
        cities: rows.results ?? [],
        open: openRows.results ?? [],
        totals: { cities: totals?.cities ?? 0, requests: totals?.requests ?? 0 },
      }),
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          // A minute is plenty for a leaderboard and keeps a shared link
          // from hammering the database.
          'cache-control': 'public, max-age=60',
        },
      }
    );
  } catch (err) {
    console.error('top cities failed', err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
