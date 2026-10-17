import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin';
import { getEvent, recordOrder } from '../../../../lib/boxoffice-db';
import { showTime } from '../../../../lib/boxoffice';
import { sendTickets } from '../../../../lib/boxoffice-webhook';

export const prerender = false;

/**
 * Complimentary seats: the pastor, the press, the family who fed the crew.
 *
 * A comp is an order at $0 with real tickets, so it scans at the door, counts
 * as a body in the room, and shows up in the report as what it is — a seat
 * given away, inside attendance and outside gross. Capacity is not checked:
 * issuing a comp over the house is a decision the admin is allowed to make
 * and the report will say so.
 */
const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const slug = String(f.get('slug') ?? '');
  const to = `/admin/boxoffice/report/?slug=${encodeURIComponent(slug)}`;
  const event = await getEvent(slug);
  if (!event) return back('/admin/boxoffice/');

  const seats = Math.max(1, Math.min(100, Math.floor(Number(f.get('seats')) || 0)));
  const name = String(f.get('name') ?? '').trim().slice(0, 120) || null;
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 254) || null;
  const note = String(f.get('note') ?? '').trim().slice(0, 300) || null;
  if (!name) return back(`${to}&comp=name`);

  const recorded = await recordOrder({
    event,
    lines: [{ sku: 'ticket', qty: seats, size: null, name: 'Complimentary seat', unit_price_cents: 0, admits: 1, kind: 'ticket' }],
    subtotal_cents: 0,
    discount_cents: 0,
    total_cents: 0,
    fee_cents: 0,
    promo_code: null,
    channel: 'comp',
    buyer_name: name,
    buyer_email: email,
    operator: 'admin',
    offline_id: `comp-${crypto.randomUUID()}`,
    note,
  });

  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    try {
      await sendTickets({
        to: email,
        name,
        codes: recorded.codes,
        venue: event.venue,
        city: `${event.city}${event.region ? `, ${event.region}` : ''}`,
        when: showTime(event.starts_at),
        doors: event.doors_at ? showTime(event.doors_at) : null,
        total: 0,
        items: [`${seats} × Complimentary seat`],
      });
    } catch (err) {
      console.error('COMP TICKET EMAIL FAILED', { order: recorded.orderId, err });
      return back(`${to}&comp=noemail`);
    }
  }

  return back(`${to}&comp=done`);
};
