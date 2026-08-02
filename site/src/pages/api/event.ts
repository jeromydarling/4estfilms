import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// Closed set. An open one would let anyone with curl fill the table with
// whatever they liked, and every name here has to be something we chose to
// measure anyway.
const NAMES = new Set([
  'trailer_start',
  'trailer_25',
  'trailer_50',
  'trailer_75',
  'trailer_complete',
  'trailer_youtube_out',
  'press_kit_download',
  'track_start',
  'track_complete',
  'screening_request',
]);

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v ? v.slice(0, max) : null;

export const POST: APIRoute = async ({ request }) => {
  // 204 on every path, including the failures. The browser is not waiting on
  // this and there is nothing useful to tell an abusive caller.
  const ok = () => new Response(null, { status: 204 });

  const db = env.DB;
  if (!db) return ok();

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return ok();
  }

  const name = str(b.name, 40);
  if (!name || !NAMES.has(name)) return ok();

  try {
    await db
      .prepare(
        `INSERT INTO events (name, film, path, session, utm_source, utm_campaign, ip_country)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .bind(
        name,
        str(b.film, 60),
        str(b.path, 120),
        str(b.session, 24),
        str(b.utm_source, 80),
        str(b.utm_campaign, 80),
        request.headers.get('cf-ipcountry')
      )
      .run();
  } catch (err) {
    // A failed count must never surface to a viewer watching a trailer.
    console.error('event insert failed', err);
  }

  return ok();
};
