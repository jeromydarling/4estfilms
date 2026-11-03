import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { getEvent, getOffered, getProducts, mintTickets } from '../../../../lib/boxoffice-db';
import { showTime } from '../../../../lib/boxoffice';
import { sendInvoice, sendTickets } from '../../../../lib/boxoffice-webhook';
import { toCents } from './event';

export const prerender = false;

/**
 * Group sales on an invoice: forty seats for a parish, paid by cheque.
 *
 * Created, the order holds its seats against capacity and mints nothing —
 * a ticket that exists before the money does is a ticket somebody will
 * scan. It also becomes a document: a number from the year's sequence, a
 * bill-to block, an issue date and a due date, so a parish business office
 * has something it can actually pay from. The invoice can be emailed from
 * here (and re-emailed; sent_at keeps the last time). Marked paid, it
 * mints the tickets and emails them, with the payment method and the
 * cheque number on the record. Cancelled, it lets the seats go.
 */
const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });

const addDays = (date: string, days: number): string => {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

/**
 * The default due date: the earlier of fourteen days after issue or a
 * week before the show — close enough to the night that the office feels
 * it, far enough out that a cheque can still cross the country. Never
 * before the day the invoice exists.
 */
const defaultDue = (issued: string, startsAt: string): string => {
  const byTerms = addDays(issued, 14);
  const byShow = addDays(startsAt.slice(0, 10), -7);
  const due = byTerms < byShow ? byTerms : byShow;
  return due < issued ? issued : due;
};

const PAY_METHODS = ['cheque', 'transfer', 'card', 'cash'];

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
    const contact = String(f.get('contact') ?? '').trim().slice(0, 120) || null;
    const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 254) || null;
    const address = String(f.get('address') ?? '').trim().slice(0, 400) || null;
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

    const issued = new Date().toISOString().slice(0, 10);
    const dueIn = String(f.get('due') ?? '').trim();
    const due = /^\d{4}-\d{2}-\d{2}$/.test(dueIn) ? dueIn : defaultDue(issued, event.starts_at);

    // The year's next invoice number. The upsert hands back the number it
    // allocated, so a second invoice created in the same moment takes the
    // one after rather than the same one twice.
    const year = Number(issued.slice(0, 4));
    const seq = await db
      .prepare(
        `INSERT INTO bo_invoice_seq (year, next) VALUES (?1, 2)
         ON CONFLICT(year) DO UPDATE SET next = next + 1
         RETURNING next - 1 AS n`
      )
      .bind(year)
      .first<{ n: number }>();
    const number = `INV-${year}-${String(seq?.n ?? 0).padStart(3, '0')}`;

    await db.batch([
      db
        .prepare(
          `INSERT INTO bo_orders (event_id, offline_id, buyer_name, buyer_email, subtotal_cents,
                                  total_cents, channel, status, operator, reserved_admits, note,
                                  invoice_number, org_name, contact_name, buyer_address,
                                  issued_on, due_on)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'invoice', 'unpaid', 'admin', ?6, ?7,
                   ?8, ?3, ?9, ?10, ?11, ?12)`
        )
        .bind(event.id, key, name, email, total, seats, note, number, contact, address, issued, due),
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
      `SELECT id, buyer_name, buyer_email, reserved_admits, status, total_cents,
              invoice_number, org_name, contact_name, due_on, note
         FROM bo_orders WHERE id = ?1 AND event_id = ?2 AND channel = 'invoice'`
    )
    .bind(orderId, event.id)
    .first<{
      id: number;
      buyer_name: string | null;
      buyer_email: string | null;
      reserved_admits: number;
      status: string;
      total_cents: number;
      invoice_number: string | null;
      org_name: string | null;
      contact_name: string | null;
      due_on: string | null;
      note: string | null;
    }>();
  if (!order || order.status !== 'unpaid') return back(`${to}&invoice=state`);

  if (action === 'send') {
    if (!order.buyer_email) return back(`${to}&invoice=noaddr`);
    const items = await db
      .prepare(`SELECT name, qty FROM bo_order_items WHERE order_id = ?1 ORDER BY id`)
      .bind(order.id)
      .all<{ name: string; qty: number }>();
    try {
      await sendInvoice({
        to: order.buyer_email,
        org: order.org_name ?? order.buyer_name ?? 'Your group',
        contact: order.contact_name,
        number: order.invoice_number ?? `#${order.id}`,
        dueOn: order.due_on,
        venue: event.venue,
        city: `${event.city}${event.region ? `, ${event.region}` : ''}`,
        when: showTime(event.starts_at),
        doors: event.doors_at ? showTime(event.doors_at) : null,
        items: (items.results ?? []).map((i) => `${i.qty} × ${i.name}`),
        total: order.total_cents,
        note: order.note,
      });
    } catch (err) {
      console.error('INVOICE EMAIL FAILED', { order: order.id, err });
      return back(`${to}&invoice=emailfail`);
    }
    await db
      .prepare(`UPDATE bo_orders SET sent_at = datetime('now') WHERE id = ?1`)
      .bind(order.id)
      .run();
    return back(`${to}&invoice=emailed`);
  }

  if (action === 'cancel') {
    await db
      .prepare(`UPDATE bo_orders SET status = 'cancelled', reserved_admits = 0 WHERE id = ?1`)
      .bind(order.id)
      .run();
    return back(`${to}&invoice=cancelled`);
  }

  if (action === 'paid') {
    const reference = String(f.get('reference') ?? '').trim().slice(0, 120) || null;
    const methodIn = String(f.get('method') ?? 'cheque');
    const method = PAY_METHODS.includes(methodIn) ? methodIn : 'cheque';
    const codes = await mintTickets(order.id, event, order.reserved_admits, order.buyer_name);
    await db
      .prepare(
        `UPDATE bo_orders SET status = 'paid', reserved_admits = 0, reference = ?2, pay_method = ?3 WHERE id = ?1`
      )
      .bind(order.id, reference, method)
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
