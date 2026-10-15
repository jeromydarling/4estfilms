import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { stripeKey } from '../../../../lib/boxoffice';

export const prerender = false;

/**
 * Refund an order through Stripe and stop its tickets working.
 *
 * Order of operations matters: Stripe first, our books second. If the refund
 * fails we have changed nothing; if our write fails after a successful
 * refund we have money out and a ticket still live, which is visible and
 * fixable. The other order would void a ticket for a refund that never
 * happened — a person turned away at a door with their money still gone.
 *
 * Cash is handled here too, with no Stripe call: the refund happened out of
 * the box at the window and this is the record of it.
 */

const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const orderId = Number(f.get('order_id'));
  const slug = String(f.get('slug') ?? '');
  const to = `/admin/boxoffice/report/?slug=${encodeURIComponent(slug)}`;
  if (!Number.isFinite(orderId)) return back(to);

  const db = env.DB;
  const order = await db
    .prepare(
      `SELECT id, stripe_payment_intent, total_cents, refunded_cents, status, channel
         FROM bo_orders WHERE id = ?1`
    )
    .bind(orderId)
    .first<{
      id: number;
      stripe_payment_intent: string | null;
      total_cents: number;
      refunded_cents: number;
      status: string;
      channel: string;
    }>();

  if (!order || order.status === 'refunded') return back(`${to}&refund=already`);

  const outstanding = order.total_cents - order.refunded_cents;
  if (outstanding <= 0) return back(`${to}&refund=already`);

  if (order.channel !== 'door_cash') {
    const { key, error } = stripeKey();
    if (!key) {
      console.error('refund blocked:', error);
      return back(`${to}&refund=nokey`);
    }
    if (!order.stripe_payment_intent) return back(`${to}&refund=nopi`);

    try {
      const res = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/x-www-form-urlencoded',
          // Stripe's own idempotency, so a double-submitted form or a retried
          // request cannot refund the same money twice.
          'idempotency-key': `refund-order-${order.id}`,
        },
        body: new URLSearchParams({
          payment_intent: order.stripe_payment_intent,
          amount: String(outstanding),
        }),
      });
      const body = (await res.json()) as { id?: string; error?: { message?: string } };
      if (!res.ok || !body.id) {
        console.error('stripe refund failed', body.error);
        return back(`${to}&refund=failed`);
      }
    } catch (err) {
      console.error('stripe unreachable on refund', err);
      return back(`${to}&refund=failed`);
    }
  }

  // Stripe is satisfied (or it was cash). Now the books: the order is marked,
  // its tickets stop admitting anybody, and the stock goes back on the shelf.
  const items = await db
    .prepare(`SELECT sku, qty, size FROM bo_order_items WHERE order_id = ?1`)
    .bind(order.id)
    .all<{ sku: string; qty: number; size: string | null }>();

  const products = await db
    .prepare(`SELECT sku, consumes FROM bo_products`)
    .all<{ sku: string; consumes: string | null }>();
  const consumesBy = new Map((products.results ?? []).map((p) => [p.sku, p.consumes]));
  const sized = await db
    .prepare(`SELECT DISTINCT sku FROM bo_inventory WHERE size <> ''`)
    .all<{ sku: string }>();
  const sizedSet = new Set((sized.results ?? []).map((s) => s.sku));

  const stmts = [
    db
      .prepare(
        `UPDATE bo_orders SET status = 'refunded', refunded_cents = total_cents WHERE id = ?1`
      )
      .bind(order.id),
    db
      .prepare(`UPDATE bo_tickets SET void_at = datetime('now') WHERE order_id = ?1 AND void_at IS NULL`)
      .bind(order.id),
  ];

  for (const it of items.results ?? []) {
    const raw = consumesBy.get(it.sku);
    if (!raw) continue;
    let consumes: Record<string, number> = {};
    try { consumes = JSON.parse(raw) as Record<string, number>; } catch { continue; }
    for (const [csku, per] of Object.entries(consumes)) {
      const size = sizedSet.has(csku) ? (it.size ?? '') : '';
      stmts.push(
        db
          .prepare(`UPDATE bo_inventory SET on_hand = on_hand + ?1 WHERE sku = ?2 AND size = ?3`)
          .bind(per * it.qty, csku, size)
      );
    }
  }

  await db.batch(stmts);
  return back(`${to}&refund=done`);
};
