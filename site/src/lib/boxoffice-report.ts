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
  /** Sponsor a Family: the pool for this screening. */
  partner_name: string | null;
  partner_confirmed: boolean;
  sponsored_seats: number;
  sponsor_orders: number;
  sponsor_claimed: number;
  sponsor_released: number;
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
              COALESCE(g.gifts, 0)        AS offerings,
              COALESCE(g.card, 0)         AS offering_card_cents,
              COALESCE(g.card_fees, 0)    AS offering_fees_cents,
              COALESCE(o.orders, 0)       AS orders,
              COALESCE(o.door_orders, 0)  AS door_orders,
              COALESCE(o.gross, 0)        AS gross_cents,
              COALESCE(o.discount, 0)     AS discount_cents,
              COALESCE(o.refunded, 0)     AS refunded_cents,
              COALESCE(o.fees, 0)         AS fees_cents,
              COALESCE(o.cash, 0)         AS cash_cents,
              COALESCE(o.tax, 0)          AS tax_cents,
              COALESCE(o.reserved, 0)     AS reserved_admits,
              COALESCE(t.attendees, 0)    AS attendees,
              COALESCE(t.checked_in, 0)   AS checked_in,
              COALESCE(t.comp_seats, 0)   AS comp_seats,
              COALESCE(s.tithe, 0)        AS tithe_paid_cents,
              COALESCE(s.offering, 0)     AS offering_paid_cents,
              COALESCE(s.rental, 0)       AS rental_paid_cents,
              e.partner_name, e.partner_confirmed, e.sponsor_claimed, e.sponsor_released,
              COALESCE(sp.seats, 0)       AS sponsored_seats,
              COALESCE(sp.orders, 0)      AS sponsor_orders
         FROM bo_events e
         LEFT JOIN (
           SELECT sponsor_stop_id AS event_id, SUM(sponsor_seats) AS seats, COUNT(*) AS orders
             FROM bo_orders WHERE status = 'paid' AND sponsor_seats > 0 GROUP BY sponsor_stop_id
         ) sp ON sp.event_id = e.id
         LEFT JOIN (
           SELECT event_id,
                  SUM(CASE WHEN status <> 'cancelled' THEN 1 ELSE 0 END) AS orders,
                  SUM(CASE WHEN channel IN ('door_card','door_cash') THEN 1 ELSE 0 END) AS door_orders,
                  SUM(CASE WHEN status IN ('paid','refunded') THEN total_cents ELSE 0 END) AS gross,
                  SUM(discount_cents)                                  AS discount,
                  SUM(refunded_cents)                                  AS refunded,
                  SUM(fee_cents)                                       AS fees,
                  SUM(CASE WHEN channel = 'door_cash' THEN total_cents ELSE 0 END) AS cash,
                  SUM(CASE WHEN status = 'paid' THEN tax_cents ELSE 0 END) AS tax,
                  SUM(CASE WHEN status = 'unpaid' THEN reserved_admits ELSE 0 END) AS reserved
             FROM bo_orders GROUP BY event_id
         ) o ON o.event_id = e.id
         LEFT JOIN (
           SELECT k.event_id,
                  SUM(CASE WHEN k.void_at IS NULL THEN 1 ELSE 0 END)     AS attendees,
                  SUM(CASE WHEN k.void_at IS NULL AND k.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checked_in,
                  SUM(CASE WHEN k.void_at IS NULL AND r.channel = 'comp' THEN 1 ELSE 0 END) AS comp_seats
             FROM bo_tickets k JOIN bo_orders r ON r.id = k.order_id GROUP BY k.event_id
         ) t ON t.event_id = e.id
         LEFT JOIN (
           SELECT event_id,
                  SUM(CASE WHEN kind = 'tithe' THEN amount_cents ELSE 0 END)    AS tithe,
                  SUM(CASE WHEN kind = 'offering' THEN amount_cents ELSE 0 END) AS offering,
                  SUM(CASE WHEN kind = 'rental' THEN amount_cents ELSE 0 END)   AS rental
             FROM bo_settlements GROUP BY event_id
         ) s ON s.event_id = e.id
         LEFT JOIN (
           SELECT event_id,
                  COUNT(*)                            AS gifts,
                  SUM(amount_cents - refunded_cents)  AS card,
                  SUM(fee_cents)                      AS card_fees
             FROM bo_offerings WHERE event_id IS NOT NULL GROUP BY event_id
         ) g ON g.event_id = e.id
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
    partner_name: (r.partner_name as string | null) ?? null,
    partner_confirmed: Number(r.partner_confirmed) === 1,
    sponsored_seats: Number(r.sponsored_seats),
    sponsor_orders: Number(r.sponsor_orders),
    sponsor_claimed: Number(r.sponsor_claimed),
    sponsor_released: Number(r.sponsor_released),
    ...stopReport({
      gross_cents: Number(r.gross_cents),
      discount_cents: Number(r.discount_cents),
      refunded_cents: Number(r.refunded_cents),
      fees_cents: Number(r.fees_cents),
      rental_cents: Number(r.rental_cents),
      offering_cents: Number(r.offering_cents),
      offering_card_cents: Number(r.offering_card_cents),
      offering_fees_cents: Number(r.offering_fees_cents),
      offerings: Number(r.offerings),
      comp_seats: Number(r.comp_seats),
      reserved_admits: Number(r.reserved_admits),
      tax_cents: Number(r.tax_cents),
      tithe_paid_cents: Number(r.tithe_paid_cents),
      offering_paid_cents: Number(r.offering_paid_cents),
      rental_paid_cents: Number(r.rental_paid_cents),
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

export interface OfferingLine {
  id: number;
  event_id: number | null;
  slug: string | null;
  venue: string | null;
  amount_cents: number;
  fee_cents: number;
  refunded_cents: number;
  giver_name: string | null;
  giver_email: string | null;
  created_at: string;
}

/**
 * Card offerings, newest first. For one stop, or — with null — the gifts
 * made to the tour as a whole, which belong to no stop's settlement and
 * would otherwise be invisible.
 */
export async function offeringsAt(eventId: number | null): Promise<OfferingLine[]> {
  const where = eventId === null ? `WHERE g.event_id IS NULL` : `WHERE g.event_id = ?1`;
  const q = env.DB.prepare(
    `SELECT g.id, g.event_id, e.slug, e.venue, g.amount_cents, g.fee_cents, g.refunded_cents,
            g.giver_name, g.giver_email, g.created_at
       FROM bo_offerings g LEFT JOIN bo_events e ON e.id = g.event_id
       ${where} ORDER BY g.created_at DESC LIMIT 500`
  );
  const rows = await (eventId === null ? q : q.bind(eventId)).all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: Number(r.id),
    event_id: r.event_id === null ? null : Number(r.event_id),
    slug: (r.slug as string | null) ?? null,
    venue: (r.venue as string | null) ?? null,
    amount_cents: Number(r.amount_cents),
    fee_cents: Number(r.fee_cents),
    refunded_cents: Number(r.refunded_cents),
    giver_name: (r.giver_name as string | null) ?? null,
    giver_email: (r.giver_email as string | null) ?? null,
    created_at: String(r.created_at),
  }));
}

/** Every card offering on the tour, oldest first, for the accountant's CSV. */
export async function allOfferings(): Promise<OfferingLine[]> {
  const rows = await env.DB
    .prepare(
      `SELECT g.id, g.event_id, e.slug, e.venue, g.amount_cents, g.fee_cents, g.refunded_cents,
              g.giver_name, g.giver_email, g.created_at
         FROM bo_offerings g LEFT JOIN bo_events e ON e.id = g.event_id
        ORDER BY g.created_at`
    )
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: Number(r.id),
    event_id: r.event_id === null ? null : Number(r.event_id),
    slug: (r.slug as string | null) ?? null,
    venue: (r.venue as string | null) ?? null,
    amount_cents: Number(r.amount_cents),
    fee_cents: Number(r.fee_cents),
    refunded_cents: Number(r.refunded_cents),
    giver_name: (r.giver_name as string | null) ?? null,
    giver_email: (r.giver_email as string | null) ?? null,
    created_at: String(r.created_at),
  }));
}

export interface SettlementLine {
  id: number;
  kind: string;
  amount_cents: number;
  paid_at: string;
  method: string | null;
  note: string | null;
}

/** What has gone out to this stop's parish and house, newest first. */
export async function settlementsAt(eventId: number): Promise<SettlementLine[]> {
  const r = await env.DB
    .prepare(
      `SELECT id, kind, amount_cents, paid_at, method, note
         FROM bo_settlements WHERE event_id = ?1 ORDER BY paid_at DESC, id DESC`
    )
    .bind(eventId)
    .all<SettlementLine>();
  return r.results ?? [];
}

export interface WaitlistLine {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
  notified_at: string | null;
}

export async function waitlistAt(eventId: number): Promise<WaitlistLine[]> {
  const r = await env.DB
    .prepare(
      `SELECT id, email, name, created_at, notified_at
         FROM bo_waitlist WHERE event_id = ?1 ORDER BY created_at`
    )
    .bind(eventId)
    .all<WaitlistLine>();
  return r.results ?? [];
}

/**
 * Everyone with a live seat at a stop and an address to write to. One row
 * per address, so a family that bought twice is written to once.
 */
export async function buyersAt(eventId: number): Promise<{ email: string; name: string | null }[]> {
  const r = await env.DB
    .prepare(
      `SELECT lower(buyer_email) AS email, MIN(buyer_name) AS name
         FROM bo_orders
        WHERE event_id = ?1 AND status = 'paid' AND buyer_email IS NOT NULL AND buyer_email <> ''
        GROUP BY lower(buyer_email) ORDER BY email`
    )
    .bind(eventId)
    .all<{ email: string; name: string | null }>();
  return r.results ?? [];
}

export interface InvoiceLine {
  id: number;
  buyer_name: string | null;
  buyer_email: string | null;
  total_cents: number;
  reserved_admits: number;
  status: string;
  reference: string | null;
  note: string | null;
  created_at: string;
  seats: number;
}

export async function invoicesAt(eventId: number): Promise<InvoiceLine[]> {
  const r = await env.DB
    .prepare(
      `SELECT o.id, o.buyer_name, o.buyer_email, o.total_cents, o.reserved_admits, o.status,
              o.reference, o.note, o.created_at,
              (SELECT COUNT(*) FROM bo_tickets t WHERE t.order_id = o.id AND t.void_at IS NULL) AS seats
         FROM bo_orders o WHERE o.event_id = ?1 AND o.channel = 'invoice' ORDER BY o.created_at DESC`
    )
    .bind(eventId)
    .all<InvoiceLine>();
  return r.results ?? [];
}

export interface SponsorshipLine {
  id: number;
  buyer_name: string | null;
  buyer_email: string | null;
  sponsor_tier: string;
  sponsor_qty: number;
  sponsor_seats: number;
  created_at: string;
  /** The stop the tickets on the same order were for, when it differs. */
  bought_at: string;
}

/** Every paid sponsorship bound to a stop, newest first. */
export async function sponsorshipsAt(eventId: number): Promise<SponsorshipLine[]> {
  const r = await env.DB
    .prepare(
      `SELECT o.id, o.buyer_name, o.buyer_email, o.sponsor_tier, o.sponsor_qty, o.sponsor_seats,
              o.created_at, e.slug AS bought_at
         FROM bo_orders o JOIN bo_events e ON e.id = o.event_id
        WHERE o.sponsor_stop_id = ?1 AND o.sponsor_seats > 0 AND o.status = 'paid'
        ORDER BY o.created_at DESC`
    )
    .bind(eventId)
    .all<SponsorshipLine>();
  return r.results ?? [];
}
