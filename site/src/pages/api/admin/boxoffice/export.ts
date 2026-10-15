import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { getEvent } from '../../../../lib/boxoffice-db';
import { salesByCode, soldBySku, stopTotals } from '../../../../lib/boxoffice-report';
import { TOUR, csv } from '../../../../lib/boxoffice';

export const prerender = false;

/**
 * CSV for the accountant.
 *
 * Money is written in dollars with two decimals rather than cents, because
 * the person opening this is reconciling against a bank statement, not
 * reading our schema.
 */
const d = (cents: number) => (cents / 100).toFixed(2);

const file = (name: string, body: string) =>
  new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });

export const GET: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const what = url.searchParams.get('what') ?? 'tour';
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = url.searchParams.get('slug') ?? '';

  if (what === 'tour') {
    const stops = await stopTotals();
    return file(
      `tour-${TOUR.year}-${stamp}.csv`,
      csv(
        ['leg', 'stop', 'city', 'region', 'date', 'capacity', 'seats_sold', 'checked_in',
         'orders', 'door_orders', 'gross', 'discounts', 'refunds', 'stripe_fees', 'rental',
         'net', `tithe_${TOUR.tithePercent}pc`, 'offering', 'retained', 'revenue_per_attendee'],
        stops.map((s) => [
          s.leg ?? '', s.venue, s.city, s.region ?? '', s.starts_at, s.capacity,
          s.attendees, s.checked_in, s.orders, s.door_orders,
          d(s.gross_cents), d(s.discount_cents), d(s.refunded_cents), d(s.fees_cents),
          d(s.rental_cents), d(s.net_cents), d(s.tithe_cents), d(s.offering_cents),
          d(s.retained_cents), d(s.revenue_per_attendee_cents),
        ])
      )
    );
  }

  const event = await getEvent(slug);
  if (!event) return new Response('not found', { status: 404 });

  if (what === 'stop') {
    const [t] = await stopTotals(event.id);
    const [items, codes] = await Promise.all([soldBySku(event.id), salesByCode(event.id)]);
    const lines: unknown[][] = [
      ['Stop', event.venue], ['City', `${event.city}${event.region ? `, ${event.region}` : ''}`],
      ['Showtime', event.starts_at], ['Capacity', event.capacity], [],
      ['Gross', d(t.gross_cents)], ['Refunds', d(t.refunded_cents)],
      ['Stripe fees', d(t.fees_cents)], ['Rental', d(t.rental_cents)],
      ['Net', d(t.net_cents)], [`Tithe ${TOUR.tithePercent}%`, d(t.tithe_cents)],
      ['Retained', d(t.retained_cents)], ['Offering', d(t.offering_cents)], [],
      ['Seats sold', t.attendees], ['Checked in', t.checked_in],
      ['Cash taken', d(t.cash_cents)], ['Revenue per attendee', d(t.revenue_per_attendee_cents)], [],
      ['Item', 'Units', 'Seats', 'Gross'],
      ...items.map((i) => [i.name, i.units, i.admits, d(i.gross_cents)]),
      [],
      ['Code', 'Partner', 'Orders', 'Seats', 'Gross'],
      ...codes.filter((c) => c.orders > 0).map((c) => [c.code, c.partner, c.orders, c.seats, d(c.gross_cents)]),
    ];
    return file(`${event.slug}-${stamp}.csv`, csv(['', '', '', '', ''], lines));
  }

  if (what === 'orders') {
    const r = await env.DB
      .prepare(
        `SELECT o.created_at, o.buyer_name, o.buyer_email, o.channel, o.operator, o.status,
                o.subtotal_cents, o.discount_cents, o.total_cents, o.fee_cents, o.refunded_cents,
                o.promo_code,
                (SELECT COUNT(*) FROM bo_tickets t WHERE t.order_id=o.id AND t.void_at IS NULL) AS seats,
                (SELECT GROUP_CONCAT(i.qty || ' x ' || i.name || CASE WHEN i.size IS NOT NULL THEN ' (' || i.size || ')' ELSE '' END, '; ')
                   FROM bo_order_items i WHERE i.order_id=o.id) AS items
           FROM bo_orders o WHERE o.event_id = ?1 ORDER BY o.created_at`
      )
      .bind(event.id)
      .all<Record<string, unknown>>();
    return file(
      `${event.slug}-orders-${stamp}.csv`,
      csv(
        ['when', 'buyer', 'email', 'channel', 'operator', 'status', 'subtotal', 'discount',
         'paid', 'stripe_fee', 'refunded', 'promo_code', 'seats', 'items'],
        (r.results ?? []).map((o) => [
          o.created_at, o.buyer_name, o.buyer_email, o.channel, o.operator, o.status,
          d(Number(o.subtotal_cents)), d(Number(o.discount_cents)), d(Number(o.total_cents)),
          d(Number(o.fee_cents)), d(Number(o.refunded_cents)), o.promo_code, o.seats, o.items,
        ])
      )
    );
  }

  return new Response('not found', { status: 404 });
};
