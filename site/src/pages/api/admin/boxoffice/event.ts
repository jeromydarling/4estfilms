import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { getProducts } from '../../../../lib/boxoffice-db';
import { newHostToken, newPin } from '../../../../lib/door';

export const prerender = false;

/**
 * Create and edit a stop.
 *
 * Takes a form post and redirects, rather than returning JSON — the admin is
 * meant to be usable from a phone in a van with the keyboard half working,
 * and a page that reloads is a page that cannot get out of step with itself.
 */

/** Dollars as typed by a human — "1,850", "1850.00", "$1850" — to cents. */
export function toCents(raw: unknown): number {
  const s = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Rounded, not truncated: 18.99 must not become 1898.
  return Math.round(n * 100);
}

const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const action = String(f.get('action') ?? 'save');
  const db = env.DB;

  const str = (k: string, max = 200) => {
    const v = String(f.get(k) ?? '').trim();
    return v ? v.slice(0, max) : null;
  };

  // The offering is entered after the night, from a counted basket.
  if (action === 'offering') {
    const slug = str('slug');
    if (!slug) return back('/admin/boxoffice/');
    await db
      .prepare(`UPDATE bo_events SET offering_cents = ?1 WHERE slug = ?2`)
      .bind(toCents(f.get('offering')), slug)
      .run();
    return back(`/admin/boxoffice/report/?slug=${encodeURIComponent(slug)}`);
  }

  // A new PIN or host link, when the old one has been shared too widely.
  // The old one stops working the moment this lands.
  if (action === 'door_pin' || action === 'host_token') {
    const slug = str('slug');
    if (!slug) return back('/admin/boxoffice/');
    const col = action === 'door_pin' ? 'door_pin' : 'host_token';
    const val = action === 'door_pin' ? newPin() : newHostToken();
    await db.prepare(`UPDATE bo_events SET ${col} = ?1 WHERE slug = ?2`).bind(val, slug).run();
    return back(`/admin/boxoffice/report/?slug=${encodeURIComponent(slug)}`);
  }

  const slugIn = str('slug', 80);
  const newSlug = (str('new_slug', 80) ?? slugIn ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  if (!newSlug) return back('/admin/boxoffice/event/?error=slug');

  const capacity = Math.max(0, Math.min(100000, Number(f.get('capacity')) || 0));
  const holds = Math.max(0, Math.min(capacity, Math.floor(Number(f.get('holds')) || 0)));
  // Digits only; blank means "give me one". Never cleared by an edit.
  const pinIn = String(f.get('door_pin') ?? '').replace(/\D/g, '').slice(0, 8);
  const fields = {
    slug: newSlug,
    title: str('title') ?? 'His Name is Michael',
    venue: str('venue') ?? '',
    city: str('city') ?? '',
    region: str('region', 10),
    starts_at: str('starts_at', 40) ?? '',
    doors_at: str('doors_at', 40),
    capacity,
    blurb: str('blurb', 1000),
    poster: str('poster', 300),
    rental_cents: toCents(f.get('rental')),
    leg: str('leg', 80),
    status: ['draft', 'on_sale', 'closed', 'past'].includes(String(f.get('status')))
      ? String(f.get('status'))
      : 'draft',
    notes: str('notes', 2000),
  };

  if (!fields.venue || !fields.city || !fields.starts_at) {
    return back('/admin/boxoffice/event/?error=required');
  }

  const existing = slugIn
    ? await db.prepare(`SELECT id FROM bo_events WHERE slug = ?1`).bind(slugIn).first<{ id: number }>()
    : null;

  if (existing) {
    await db
      .prepare(
        `UPDATE bo_events SET slug=?1, title=?2, venue=?3, city=?4, region=?5, starts_at=?6,
                doors_at=?7, capacity=?8, blurb=?9, poster=?10, rental_cents=?11, leg=?12,
                status=?13, notes=?14, holds=?16,
                door_pin = COALESCE(NULLIF(?17, ''), door_pin, ?18),
                host_token = COALESCE(host_token, ?19)
          WHERE id=?15`
      )
      .bind(
        fields.slug, fields.title, fields.venue, fields.city, fields.region, fields.starts_at,
        fields.doors_at, fields.capacity, fields.blurb, fields.poster, fields.rental_cents,
        fields.leg, fields.status, fields.notes, existing.id,
        holds, pinIn, newPin(), newHostToken()
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO bo_events (slug,title,venue,city,region,starts_at,doors_at,capacity,
                                blurb,poster,rental_cents,leg,status,notes,holds,door_pin,host_token)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`
      )
      .bind(
        fields.slug, fields.title, fields.venue, fields.city, fields.region, fields.starts_at,
        fields.doors_at, fields.capacity, fields.blurb, fields.poster, fields.rental_cents,
        fields.leg, fields.status, fields.notes, holds, pinIn || newPin(), newHostToken()
      )
      .run();
  }

  const row = await db.prepare(`SELECT id FROM bo_events WHERE slug = ?1`).bind(fields.slug).first<{ id: number }>();
  const eventId = row?.id;

  // Which products this stop offers, and what it charges for them. Rewritten
  // wholesale rather than diffed: the form always posts the complete picture,
  // and a partial update is how a stop ends up selling something it stopped
  // offering three weeks ago.
  if (eventId) {
    const products = await getProducts();
    const stmts = [db.prepare(`DELETE FROM bo_event_products WHERE event_id = ?1`).bind(eventId)];
    for (const sku of products.keys()) {
      if (f.get(`offer_${sku}`) === null) continue;
      const override = String(f.get(`price_${sku}`) ?? '').trim();
      stmts.push(
        db
          .prepare(`INSERT INTO bo_event_products (event_id, sku, price_cents) VALUES (?1,?2,?3)`)
          .bind(eventId, sku, override ? toCents(override) : null)
      );
    }
    await db.batch(stmts);
  }

  return back(`/admin/boxoffice/report/?slug=${encodeURIComponent(fields.slug)}`);
};
