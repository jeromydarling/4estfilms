import { env } from 'cloudflare:workers';
import { stopReport, type StopReport } from './boxoffice';

/**
 * The numbers behind the reports.
 *
 * Kept out of the pages so the screen and the CSV cannot drift: both call
 * these, so a figure that is wrong is wrong in one place and gets fixed once.
 */

export interface StopTotals extends StopReport {
  event_id: number;
  slug: string;
  venue: string;
  city: string;
  region: string | null;
  starts_at: string;
  leg: string | null;
  capacity: number;
  orders: number;
  door_orders: number;
  cash_cents: number;
}

/** One row per stop, with the money already resolved. */
export async function stopTotals(eventId?: number): Promise<StopTotals[]> {
  const db = env.DB;
  const where = eventId ? `WHERE e.id = ?1` : '';
  const binds = eventId ? [eventId] : [];

  const rows = await db
    .prepare(
      `SELECT e.id AS event_id, e.slug, e.venue, e.city, e.region, e.starts_at,
              e.leg, e.capacity, e.rental_cents, e.offering_cents,
              COALESCE(o.orders, 0)       AS orders,
              COALESCE(o.door_orders, 0)  AS door_orders,
              COALESCE(o.gross, 0)        AS gross_cents,
              COALESCE(o.discount, 0)     AS discount_cents,
              COALESCE(o.refunded, 0)     AS refunded_cents,
              COALESCE(o.fees, 0)         AS fees_cents,
              COALESCE(o.cash, 0)         AS cash_cents,
              COALESCE(t.attendees, 0)    AS attendees,
              COALESCE(t.checked_in, 0)   AS checked_in
         FROM bo_events e
         LEFT JOIN (
           SELECT event_id,
                  COUNT(*)                                             AS orders,
                  SUM(CASE WHEN channel <> 'web' THEN 1 ELSE 0 END)    AS door_orders,
                  SUM(total_cents)                                     AS gross,
                  SUM(discount_cents)                                  AS discount,
                  SUM(refunded_cents)                                  AS refunded,
                  SUM(fee_cents)                                       AS fees,
                  SUM(CASE WHEN channel = 'door_cash' THEN total_cents ELSE 0 END) AS cash
             FROM bo_orders GROUP BY event_id
         ) o ON o.event_id = e.id
         LEFT JOIN (
           SELECT event_id,
                  SUM(CASE WHEN void_at IS NULL THEN 1 ELSE 0 END)     AS attendees,
                  SUM(CASE WHEN void_at IS NULL AND checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checked_in
             FROM bo_tickets GROUP BY event_id
         ) t ON t.event_id = e.id
         ${where}
        ORDER BY e.starts_at`
    )
    .bind(...binds)
    .all<Record<string, number | string | null>>();

  return (rows.results ?? []).map((r) => ({
    event_id: Number(r.event_id),
    slug: String(r.slug),
    venue: String(r.venue),
    city: String(r.city),
    region: (r.region as string | null) ?? null,
    starts_at: String(r.starts_at),
    leg: (r.leg as string | null) ?? null,
    capacity: Number(r.capacity),
    orders: Number(r.orders),
    door_orders: Number(r.door_orders),
    cash_cents: Number(r.cash_cents),
    ...stopReport({
      gross_cents: Number(r.gross_cents),
      discount_cents: Number(r.discount_cents),
      refunded_cents: Number(r.refunded_cents),
      fees_cents: Number(r.fees_cents),
      rental_cents: Number(r.rental_cents),
      offering_cents: Number(r.offering_cents),
      attendees: Number(r.attendees),
      checked_in: Number(r.checked_in),
    }),
  }));
}

export interface SkuLine {
  sku: string;
  name: string;
  units: number;
  gross_cents: number;
  admits: number;
}

/** What actually sold at a stop, by item. */
export async function soldBySku(eventId: number): Promise<SkuLine[]> {
  const r = await env.DB
    .prepare(
      `SELECT i.sku, i.name,
              SUM(i.qty)                        AS units,
              SUM(i.qty * i.unit_price_cents)   AS gross_cents,
              SUM(i.qty * i.admits)             AS admits
         FROM bo_order_items i
         JOIN bo_orders o ON o.id = i.order_id
        WHERE o.event_id = ?1 AND o.status <> 'refunded'
        GROUP BY i.sku, i.name
        ORDER BY gross_cents DESC`
    )
    .bind(eventId)
    .all<SkuLine>();
  return r.results ?? [];
}

export interface CodeLine {
  code: string;
  partner: string;
  event_id: number | null;
  orders: number;
  gross_cents: number;
  seats: number;
}

/** Sales by promo code — which parish actually filled the house. */
export async function salesByCode(eventId?: number): Promise<CodeLine[]> {
  const where = eventId ? `AND o.event_id = ?1` : '';
  const binds = eventId ? [eventId] : [];
  const r = await env.DB
    .prepare(
      `SELECT c.code, c.partner, c.event_id,
              COUNT(o.id)                     AS orders,
              COALESCE(SUM(o.total_cents), 0) AS gross_cents,
              COALESCE((SELECT COUNT(*) FROM bo_tickets t
                         JOIN bo_orders oo ON oo.id = t.order_id
                        WHERE oo.promo_code = c.code AND t.void_at IS NULL
                          ${eventId ? 'AND oo.event_id = ?1' : ''}), 0) AS seats
         FROM bo_promo_codes c
         LEFT JOIN bo_orders o ON o.promo_code = c.code ${where}
        GROUP BY c.code, c.partner, c.event_id
        ORDER BY gross_cents DESC, c.code`
    )
    .bind(...binds)
    .all<CodeLine>();
  return r.results ?? [];
}

export interface StockLine {
  sku: string;
  size: string;
  on_hand: number;
  low_at: number;
  low: boolean;
}

export async function stock(): Promise<StockLine[]> {
  const r = await env.DB
    .prepare(`SELECT sku, size, on_hand, low_at FROM bo_inventory ORDER BY sku, size`)
    .all<Omit<StockLine, 'low'>>();
  return (r.results ?? []).map((s) => ({ ...s, low: s.on_hand <= s.low_at }));
}
