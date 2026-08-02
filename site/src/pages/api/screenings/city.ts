import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { screenings } from '../../../lib/screenings';
import { placeLabel } from '../../../lib/place';
import { hasVenueResearch, researchVenues } from '../../../lib/venues';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * A city's numbers, and its venue shortlist.
 *
 * Research runs at most once per city per month, and only when somebody
 * asks for it — the `research=1` flag, which the page sets when a host is
 * actually looking. Otherwise a crawler hitting every city page would spend
 * the Perplexity budget in an afternoon.
 */
export const GET: APIRoute = async ({ url }) => {
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'unavailable' }, 503);

  const slug = (url.searchParams.get('slug') ?? '').trim().slice(0, 80);
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ ok: false, error: 'not found' }, 404);

  const city = await db
    .prepare(
      `SELECT id, slug, city, region, country, status, venues_fetched_at
         FROM screening_cities WHERE slug = ?1`
    )
    .bind(slug)
    .first<{
      id: number;
      slug: string;
      city: string;
      region: string | null;
      country: string;
      status: string;
      venues_fetched_at: string | null;
    }>();

  if (!city) return json({ ok: false, error: 'not found' }, 404);

  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS requests, COALESCE(SUM(willing_to_host), 0) AS hosts
         FROM screening_requests WHERE city_id = ?1`
    )
    .bind(city.id)
    .first<{ requests: number; hosts: number }>();

  const label = placeLabel(city);

  // Refresh the shortlist when asked, if what we hold is missing or stale.
  const wants = url.searchParams.get('research') === '1';
  const age = city.venues_fetched_at
    ? Date.now() - Date.parse(city.venues_fetched_at.replace(' ', 'T') + 'Z')
    : Infinity;
  const stale = age > screenings.venueMaxAgeDays * 86_400_000;

  if (wants && stale && hasVenueResearch()) {
    try {
      const found = await researchVenues(label);
      if (found.length) {
        for (const v of found) {
          await db
            .prepare(
              `INSERT INTO venue_leads (city_id, name, address, website, note, source_url)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(city_id, name) DO UPDATE SET
                 address = excluded.address, website = excluded.website,
                 note = excluded.note, source_url = excluded.source_url,
                 fetched_at = datetime('now')`
            )
            .bind(city.id, v.name, v.address ?? null, v.website ?? null, v.note ?? null, v.source_url ?? null)
            .run();
        }
      }
      // Stamped even when nothing came back, so a city with no findable
      // venues is not researched again on every single visit.
      await db
        .prepare(`UPDATE screening_cities SET venues_fetched_at = datetime('now') WHERE id = ?1`)
        .bind(city.id)
        .run();
    } catch (err) {
      console.error('venue research failed', err);
    }
  }

  const venues = await db
    .prepare(
      `SELECT name, address, website, note, source_url, fetched_at
         FROM venue_leads WHERE city_id = ?1 ORDER BY id LIMIT 6`
    )
    .bind(city.id)
    .all<{
      name: string;
      address: string | null;
      website: string | null;
      note: string | null;
      source_url: string | null;
      fetched_at: string;
    }>();

  return json({
    ok: true,
    slug: city.slug,
    label,
    status: city.status,
    requests: counts?.requests ?? 0,
    hosts: counts?.hosts ?? 0,
    threshold: screenings.threshold,
    venues: venues.results ?? [],
    venue_research_available: hasVenueResearch(),
    venues_checked: Boolean(city.venues_fetched_at),
  });
};
