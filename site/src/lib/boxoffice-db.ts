import { env } from 'cloudflare:workers';
import {
  newTicketCode,
  parseConsumes,
  priceBasket,
  type BasketLine,
  type EventRow,
  type PricedLine,
  type Product,
} from './boxoffice';

/**
 * Everything that touches the box office tables.
 *
 * One module, because the webhook, the door and the admin all have to agree
 * about what a sale does — and three copies of "mint the tickets and draw
 * down the shirts" is three chances to disagree.
 */

const db = () => env.DB;

export async function getEvent(slug: string): Promise<EventRow | null> {
  return (
    (await db()
      .prepare(`SELECT * FROM bo_events WHERE slug = ?1`)
      .bind(slug)
      .first<EventRow>()) ?? null
  );
}

export async function getEventById(id: number): Promise<EventRow | null> {
  return (await db().prepare(`SELECT * FROM bo_events WHERE id = ?1`).bind(id).first<EventRow>()) ?? null;
}

export async function listEvents(statuses?: string[]): Promise<EventRow[]> {
  const sql = statuses?.length
    ? `SELECT * FROM bo_events WHERE status IN (${statuses.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY starts_at`
    : `SELECT * FROM bo_events ORDER BY starts_at`;
  const r = await db().prepare(sql).bind(...(statuses ?? [])).all<EventRow>();
  return r.results ?? [];
}

export async function getProducts(): Promise<Map<string, Product>> {
  const r = await db().prepare(`SELECT * FROM bo_products WHERE active = 1 ORDER BY sort`).all<Product>();
  return new Map((r.results ?? []).map((p) => [p.sku, p]));
}

/** SKU → price override (null means use the catalogue price). */
export async function getOffered(eventId: number): Promise<Map<string, number | null>> {
  const r = await db()
    .prepare(`SELECT sku, price_cents FROM bo_event_products WHERE event_id = ?1`)
    .bind(eventId)
    .all<{ sku: string; price_cents: number | null }>();
  return new Map((r.results ?? []).map((x) => [x.sku, x.price_cents]));
}

/** SKUs that are stocked per size, read from inventory rather than hard-coded. */
export async function sizedSkus(): Promise<Set<string>> {
  const r = await db()
    .prepare(`SELECT DISTINCT sku FROM bo_inventory WHERE size <> ''`)
    .all<{ sku: string }>();
  return new Set((r.results ?? []).map((x) => x.sku));
}

/**
 * Seats sold, counted from the tickets themselves.
 *
 * Not from a column on the event that something has to remember to update,
 * and not from order line items — tickets are what the door scans, so they
 * are what capacity has to mean.
 */
export async function soldAdmits(eventId: number): Promise<number> {
  // Plus the seats an unpaid group invoice is holding: a parish that has
  // been promised forty seats on a cheque must not find them sold under it.
  const r = await db()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM bo_tickets WHERE event_id = ?1 AND void_at IS NULL)
            + (SELECT COALESCE(SUM(reserved_admits), 0) FROM bo_orders
                WHERE event_id = ?1 AND status = 'unpaid') AS n`
    )
    .bind(eventId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * Mint tickets for an order that exists without any — a group invoice that
 * has just been paid. Same shape as the tickets recordOrder writes, so the
 * door cannot tell the difference.
 */
export async function mintTickets(orderId: number, event: EventRow, admits: number, label: string | null): Promise<string[]> {
  const d = db();
  const codes = Array.from({ length: admits }, () => newTicketCode());
  const stmts = codes.map((code, i) =>
    d
      .prepare(`INSERT INTO bo_tickets (code, order_id, event_id, label, seq) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(code, orderId, event.id, label, i + 1)
  );
  if (stmts.length) await d.batch(stmts);
  return codes;
}

export interface PromoRow {
  id: number;
  code: string;
  partner: string;
  event_id: number | null;
  kind: string;
  value: number;
  max_uses: number | null;
  uses: number;
  active: number;
}

/** Looks up a code and says plainly why it will not work, if it will not. */
export async function checkPromo(
  code: string,
  eventId: number
): Promise<{ promo: PromoRow | null; error?: string }> {
  const c = code.trim().toUpperCase();
  if (!c) return { promo: null };
  if (!/^[A-Z0-9][A-Z0-9-]{1,30}$/.test(c)) return { promo: null, error: 'That code isn’t valid.' };

  const row = await db()
    .prepare(`SELECT * FROM bo_promo_codes WHERE code = ?1`)
    .bind(c)
    .first<PromoRow>();

  if (!row || !row.active) return { promo: null, error: 'That code isn’t valid.' };
  if (row.event_id !== null && row.event_id !== eventId) {
    return { promo: null, error: 'That code is for a different stop.' };
  }
  if (row.max_uses !== null && row.uses >= row.max_uses) {
    return { promo: null, error: 'That code has been used up.' };
  }
  return { promo: row };
}

export interface RecordOrderInput {
  event: EventRow;
  lines: PricedLine[];
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  fee_cents: number;
  promo_code: string | null;
  channel: 'web' | 'door_card' | 'door_cash' | 'comp';
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  operator?: string | null;
  /** Sales tax Stripe collected on top of the total. Zero for cash and comps. */
  tax_cents?: number;
  /** Why a comp was issued, or anything else worth remembering. */
  note?: string | null;
  stripe_session_id?: string | null;
  stripe_payment_intent?: string | null;
  /** A door device's id for a sale it made offline. Makes replay safe. */
  offline_id?: string | null;
  /** Codes minted by the door while offline, so its printed stubs still scan. */
  ticket_codes?: string[];
}

export interface RecordedOrder {
  orderId: number;
  codes: string[];
  duplicate: boolean;
}

/**
 * Write a sale: the order, its lines, one ticket per admission, and the stock
 * it draws down — in a single D1 batch, which runs as one transaction.
 *
 * Idempotent on whichever key the channel has. Stripe retries webhooks, and a
 * door on a bad connection will replay its queue; neither may sell a seat
 * twice. The order id is resolved by sub-select on that unique key rather
 * than last_insert_rowid(), which stops being the order's id the moment the
 * first line item is inserted.
 */
export async function recordOrder(input: RecordOrderInput): Promise<RecordedOrder> {
  const d = db();
  const key = input.stripe_session_id
    ? { col: 'stripe_session_id', val: input.stripe_session_id }
    : { col: 'offline_id', val: input.offline_id! };

  if (!key.val) throw new Error('recordOrder needs a stripe_session_id or an offline_id');

  const existing = await d
    .prepare(`SELECT id FROM bo_orders WHERE ${key.col} = ?1`)
    .bind(key.val)
    .first<{ id: number }>();

  if (existing) {
    const t = await d
      .prepare(`SELECT code FROM bo_tickets WHERE order_id = ?1 ORDER BY seq`)
      .bind(existing.id)
      .all<{ code: string }>();
    return { orderId: existing.id, codes: (t.results ?? []).map((x) => x.code), duplicate: true };
  }

  const admits = input.lines.reduce((n, l) => n + l.admits * l.qty, 0);
  const supplied = input.ticket_codes ?? [];
  const codes = Array.from({ length: admits }, (_, i) => supplied[i] ?? newTicketCode());

  const sized = await sizedSkus();
  const products = await getProducts();

  const orderIdSql = `(SELECT id FROM bo_orders WHERE ${key.col} = ?1)`;
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    d
      .prepare(
        `INSERT INTO bo_orders
           (event_id, stripe_session_id, stripe_payment_intent, offline_id,
            buyer_name, buyer_email, buyer_phone, subtotal_cents, discount_cents,
            total_cents, fee_cents, promo_code, channel, operator, tax_cents, note)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`
      )
      .bind(
        input.event.id,
        input.stripe_session_id ?? null,
        input.stripe_payment_intent ?? null,
        input.offline_id ?? null,
        input.buyer_name ?? null,
        (input.buyer_email ?? '').toLowerCase() || null,
        input.buyer_phone ?? null,
        input.subtotal_cents,
        input.discount_cents,
        input.total_cents,
        input.fee_cents,
        input.promo_code,
        input.channel,
        input.operator ?? null,
        input.tax_cents ?? 0,
        input.note ?? null
      )
  );

  for (const l of input.lines) {
    stmts.push(
      d
        .prepare(
          `INSERT INTO bo_order_items (order_id, sku, name, qty, unit_price_cents, size, admits)
           VALUES (${orderIdSql}, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .bind(key.val, l.sku, l.name, l.qty, l.unit_price_cents, l.size ?? null, l.admits)
    );

    // Stock. A package draws down the same shirts a standalone shirt does,
    // so this walks `consumes` rather than the SKU that was bought.
    const p = products.get(l.sku);
    if (p) {
      for (const [csku, per] of Object.entries(parseConsumes(p))) {
        const size = sized.has(csku) ? (l.size ?? '') : '';
        stmts.push(
          d
            .prepare(
              `UPDATE bo_inventory SET on_hand = on_hand - ?1 WHERE sku = ?2 AND size = ?3`
            )
            .bind(per * l.qty, csku, size)
        );
      }
    }
  }

  codes.forEach((code, i) => {
    stmts.push(
      d
        .prepare(
          `INSERT INTO bo_tickets (code, order_id, event_id, label, seq)
           VALUES (?2, ${orderIdSql}, ?3, ?4, ?5)`
        )
        .bind(key.val, code, input.event.id, input.buyer_name ?? null, i + 1)
    );
  });

  if (input.promo_code) {
    stmts.push(
      d.prepare(`UPDATE bo_promo_codes SET uses = uses + 1 WHERE code = ?1`).bind(input.promo_code)
    );
  }

  await d.batch(stmts);

  const row = await d
    .prepare(`SELECT id FROM bo_orders WHERE ${key.col} = ?1`)
    .bind(key.val)
    .first<{ id: number }>();

  return { orderId: row?.id ?? 0, codes, duplicate: false };
}

/**
 * Price a basket against a stop, checking the code and the house.
 *
 * Shared by the public checkout and the door so that a seat sold at the
 * window and a seat sold on a phone are counted by the same arithmetic.
 */
export type Quote =
  | { ok: false; error: string; soldOut?: boolean; left?: number }
  | {
      ok: true;
      priced: ReturnType<typeof priceBasket>;
      promo: PromoRow | null;
      sold: number;
      left: number;
    };

export async function quote(
  event: EventRow,
  basket: BasketLine[],
  promoCode?: string | null,
  opts: { door?: boolean } = {}
): Promise<Quote> {
  const [products, offered] = await Promise.all([getProducts(), getOffered(event.id)]);
  const { promo, error: promoError } = promoCode
    ? await checkPromo(promoCode, event.id)
    : { promo: null, error: undefined };

  if (promoCode && promoError) return { ok: false, error: promoError };

  const priced = priceBasket(basket, products, offered, promo);
  if (priced.error) return { ok: false, error: priced.error };

  // Holds come off what the web may sell. The door is the house's own hand
  // and sells into them — that is what they are held for.
  const sold = await soldAdmits(event.id);
  const left = (opts.door ? event.capacity : event.capacity - (event.holds ?? 0)) - sold;
  if (priced.admits > left) {
    return {
      ok: false,
      error:
        left <= 0
          ? 'This stop is sold out.'
          : `Only ${left} ${left === 1 ? 'seat is' : 'seats are'} left.`,
      soldOut: left <= 0,
      left,
    };
  }

  return { ok: true, priced, promo, sold, left };
}
