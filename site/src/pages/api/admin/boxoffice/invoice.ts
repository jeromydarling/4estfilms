import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { getEvent, getOffered, getProducts, mintTickets } from '../../../../lib/boxoffice-db';
import { showTime } from '../../../../lib/boxoffice';
import { sendTickets } from '../../../../lib/boxoffice-webhook';
import { toCents } from './event';

export const prerender = false;

/**
 * Group sales on an invoice: forty seats for a parish, paid by cheque.
 *
 * Created, the order holds its seats against capacity and mints nothing —
 * a ticket that exists before the money does is a ticket somebody will
 * scan. Marked paid, it mints the tickets and emails them, with the cheque
 * number on the record. Cancelled, it lets the seats go.
 */
const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const slug = String(f.get('slug') ?? '');
  const to = `/admin/boxoffice/report/?slug=${encodeURIComponent(slug)}`;
  const event = await getEvent(slug);
  if (!event) return back('/admin/boxoffice/');

  const action = String(f.get('action') ?? 'create');
  const db = env.DB;

  if (action === 'create') {
    const seats = Math.max(1, Math.min(2000, Math.floor(Number(f.get('seats')) || 0)));
    const name = String(f.get('name') ?? '').trim().slice(0, 120);
    const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 254) || null;
    const note = String(f.get('note') ?? '').trim().slice(0, 300) || null;
    if (!name) return back(`${to}&invoice=name`);

    // This stop's ticket price unless the admin typed a group rate.
    const [products, offered] = await Promise.all([getProducts(), getOffered(event.id)]);
    const ticket = products.get('ticket');
    const listed = offered.get('ticket') ?? ticket?.price_cents ?? 0;
    const rateIn = String(f.get('rate') ?? '').trim();
    const unit = rateIn ? toCents(rateIn) : listed;
    const total = unit * seats;
    const key = `inv-${crypto.randomUUID()}`;

    await db.batch([
      db
        .prepare(
          `INSERT INTO bo_orders (event_id, offline_id, buyer_name, buyer_email, subtotal_cents,
                                  total_cents, channel, status, operator, reserved_admits, note)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'invoice', 'unpaid', 'admin', ?6, ?7)`
        )
        .bind(event.id, key, name, email, total, seats, note),
      db
        .prepare(
          `INSERT INTO bo_order_items (order_id, sku, name, qty, unit_price_cents, size, admits)
           VALUES ((SELECT id FROM bo_orders WHERE offline_id = ?1), 'ticket', 'Group ticket', ?2, ?3, NULL, 1)`
        )
        .bind(key, seats, unit),
    ]);
    return back(`${to}&invoice=created`);
  }

  const orderId = Number(f.get('order_id'));
  const order = await db
    .prepare(
      `SELECT id, buyer_name, buyer_email, reserved_admits, status, total_cents
         FROM bo_orders WHERE id = ?1 AND event_id = ?2 AND channel = 'invoice'`
    )
    .bind(orderId, event.id)
    .first<{ id: number; buyer_name: string | null; buyer_email: string | null; reserved_admits: number; status: string; total_cents: number }>();
  if (!order || order.status !== 'unpaid') return back(`${to}&invoice=state`);

  if (action === 'cancel') {
    await db
      .prepare(`UPDATE bo_orders SET status = 'cancelled', reserved_admits = 0 WHERE id = ?1`)
      .bind(order.id)
      .run();
    return back(`${to}&invoice=cancelled`);
  }

  if (action === 'paid') {
    const reference = String(f.get('reference') ?? '').trim().slice(0, 120) || null;
    const codes = await mintTickets(order.id, event, order.reserved_admits, order.buyer_name);
    await db
      .prepare(`UPDATE bo_orders SET status = 'paid', reserved_admits = 0, reference = ?2 WHERE id = ?1`)
      .bind(order.id, reference)
      .run();

    if (order.buyer_email) {
      try {
        await sendTickets({
          to: order.buyer_email,
          name: order.buyer_name,
          codes,
          venue: event.venue,
          city: `${event.city}${event.region ? `, ${event.region}` : ''}`,
          when: showTime(event.starts_at),
          doors: event.doors_at ? showTime(event.doors_at) : null,
          total: order.total_cents,
          items: [`${codes.length} × Group ticket`],
        });
      } catch (err) {
        console.error('INVOICE TICKET EMAIL FAILED', { order: order.id, err });
        return back(`${to}&invoice=noemail`);
      }
    }
    return back(`${to}&invoice=paid`);
  }

  return back(to);
};
