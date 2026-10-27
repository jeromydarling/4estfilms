import type { APIRoute } from 'astro';
import { getEvent, quote, type SponsorPick } from '../../../lib/boxoffice-db';
import type { BasketLine } from '../../../lib/boxoffice';

export const prerender = false;

/**
 * Prices a basket without starting a payment.
 *
 * The page calls this when a code is entered or a quantity changes, so the
 * buyer sees the real total — and any "sold out" or "that code is for a
 * different stop" — before Stripe is involved at all.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  let body: { slug?: string; basket?: BasketLine[]; promo?: string; sponsor?: SponsorPick | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const event = await getEvent(String(body.slug ?? ''));
  if (!event) return json({ ok: false, error: 'No such stop.' }, 404);

  const q = await quote(event, Array.isArray(body.basket) ? body.basket : [], body.promo, {
    sponsor: body.sponsor ?? null,
  });
  if (!q.ok) return json({ ok: false, error: q.error, soldOut: q.soldOut ?? false, left: q.left });

  return json({
    ok: true,
    subtotal_cents: q.priced.subtotal_cents,
    discount_cents: q.priced.discount_cents,
    total_cents: q.priced.total_cents,
    grand_total_cents: q.grand_total_cents,
    admits: q.priced.admits,
    left: q.left,
    promo: q.promo ? { code: q.promo.code, partner: q.promo.partner } : null,
    sponsor: q.sponsor
      ? {
          tier: q.sponsor.tier.id,
          name: q.sponsor.tier.name,
          qty: q.sponsor.qty,
          seats: q.sponsor.seats,
          cents: q.sponsor.cents,
          stop: q.sponsor.stop.slug,
          city: q.sponsor.stop.city,
          left: q.sponsor.left,
        }
      : null,
  });
};
