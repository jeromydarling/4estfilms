import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { canDoor } from '../../../../lib/door';
import { getEvent, getOffered, getProducts, soldAdmits } from '../../../../lib/boxoffice-db';

export const prerender = false;

/**
 * Everything a door needs to work with no signal at all.
 *
 * Pulled once when the device still has bars, then kept in IndexedDB. It is
 * the whole will-call list and every live ticket code for this stop — a few
 * hundred kilobytes for even the anchor house, and the difference between a
 * working door and a queue in the cold.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const GET: APIRoute = async ({ request, url }) => {
  const slug = url.searchParams.get('slug') ?? '';
  const event = await getEvent(slug);
  if (!event) return json({ ok: false, error: 'No such stop.' }, 404);
  if (!(await canDoor(request, url, event.id))) return json({ ok: false }, 404);

  const db = env.DB;
  const [tickets, orders, products, offered, sold] = await Promise.all([
    db
      .prepare(
        `SELECT k.code, k.label, k.seq, k.checked_in_at, k.void_at, k.order_id
           FROM bo_tickets k WHERE k.event_id = ?1 ORDER BY k.id`
      )
      .bind(event.id)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT o.id, o.buyer_name, o.buyer_email, o.channel, o.total_cents, o.status,
                (SELECT COUNT(*) FROM bo_tickets t WHERE t.order_id = o.id AND t.void_at IS NULL) AS seats
           FROM bo_orders o
          WHERE o.event_id = ?1 AND o.status IN ('paid', 'refunded')
          ORDER BY o.buyer_name`
      )
      .bind(event.id)
      .all<Record<string, unknown>>(),
    getProducts(),
    getOffered(event.id),
    soldAdmits(event.id),
  ]);

  // The catalogue as this stop sells it, with its overrides already applied,
  // so the door can price a walk-up sale without asking the network.
  const catalogue = [...products.values()]
    .filter((p) => offered.has(p.sku))
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      kind: p.kind,
      price_cents: offered.get(p.sku) ?? p.price_cents,
      admits: p.admits,
      needs_size: !!p.needs_size,
      sort: p.sort,
    }))
    .sort((a, b) => a.sort - b.sort);

  return json({
    ok: true,
    pulled_at: new Date().toISOString(),
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      venue: event.venue,
      city: event.city,
      region: event.region,
      starts_at: event.starts_at,
      capacity: event.capacity,
      holds: event.holds ?? 0,
      sold,
    },
    catalogue,
    tickets: tickets.results ?? [],
    orders: orders.results ?? [],
  });
};
