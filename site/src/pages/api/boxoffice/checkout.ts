import type { APIRoute } from 'astro';
import { getEvent, quote } from '../../../lib/boxoffice-db';
import { stripeKey, type BasketLine } from '../../../lib/boxoffice';

export const prerender = false;

/**
 * Opens a Stripe Checkout session for a stop.
 *
 * Checkout gives us Apple Pay and Google Pay for free on the devices that
 * have them, and keeps every card number on Stripe's side of the fence —
 * which is the whole reason not to build a card form.
 *
 * The basket arrives as SKUs and quantities. Prices are looked up here.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, url }) => {
  let body: { slug?: string; basket?: BasketLine[]; promo?: string; email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const event = await getEvent(String(body.slug ?? ''));
  if (!event) return json({ ok: false, error: 'No such stop.' }, 404);
  if (event.status !== 'on_sale') {
    return json({ ok: false, error: 'Tickets for this stop aren’t on sale.' }, 409);
  }

  const q = await quote(event, Array.isArray(body.basket) ? body.basket : [], body.promo);
  if (!q.ok) return json({ ok: false, error: q.error, soldOut: q.soldOut }, 422);
  const { priced, promo } = q;

  const { key, error: keyError } = stripeKey();
  if (!key) {
    console.error('boxoffice checkout blocked:', keyError);
    return json({ ok: false, error: 'Checkout isn’t available right now.' }, 503);
  }

  const origin = url.origin;
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${origin}/boxoffice/thanks/?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/boxoffice/${event.slug}/`,
    // The webhook dispatches on this; the rest tells it what was bought
    // without having to trust anything that comes back from the browser.
    'metadata[kind]': 'boxoffice',
    'metadata[event_id]': String(event.id),
    'metadata[event_slug]': event.slug,
    'phone_number_collection[enabled]': 'true',
  });

  // Names are how will-call works when a phone is dead, so they are required
  // rather than optional.
  form.set('custom_fields[0][key]', 'attendee_name');
  form.set('custom_fields[0][label][type]', 'custom');
  form.set('custom_fields[0][label][custom]', 'Name for will-call');
  form.set('custom_fields[0][type]', 'text');
  form.set('custom_fields[0][optional]', 'false');

  if (body.email) form.set('customer_email', String(body.email).slice(0, 254));
  if (promo) {
    form.set('metadata[promo_code]', promo.code);
    form.set('metadata[promo_partner]', promo.partner.slice(0, 90));
  }

  // The basket goes in metadata so the webhook mints exactly what was priced
  // here, rather than re-deriving it from Stripe's line items.
  form.set(
    'metadata[basket]',
    JSON.stringify(priced.lines.map((l) => [l.sku, l.qty, l.size ?? ''])).slice(0, 480)
  );

  priced.lines.forEach((l, i) => {
    form.set(`line_items[${i}][price_data][currency]`, 'usd');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(l.unit_price_cents));
    form.set(
      `line_items[${i}][price_data][product_data][name]`,
      l.size ? `${l.name} (${l.size})` : l.name
    );
    form.set(
      `line_items[${i}][price_data][product_data][description]`,
      `${event.venue}, ${event.city} — ${event.starts_at.slice(0, 10)}`
    );
    form.set(`line_items[${i}][quantity]`, String(l.qty));
  });

  // A percentage code is applied as a Stripe coupon so the buyer sees the
  // discount on Stripe's own page, not just in our total.
  if (priced.discount_cents > 0) {
    try {
      const coupon = await fetch('https://api.stripe.com/v1/coupons', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          amount_off: String(priced.discount_cents),
          currency: 'usd',
          duration: 'once',
          name: `Promo ${promo?.code ?? ''}`.trim(),
        }),
      });
      const c = (await coupon.json()) as { id?: string };
      if (c.id) form.set('discounts[0][coupon]', c.id);
    } catch (err) {
      // A failed coupon must not block a sale; it only costs the buyer the
      // visible line, and our own total still records the discount.
      console.error('boxoffice coupon failed', err);
    }
  }

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const session = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !session.url) {
      console.error('boxoffice session failed', session.error);
      return json({ ok: false, error: 'Could not start checkout. Try again?' }, 502);
    }
    return json({ ok: true, url: session.url });
  } catch (err) {
    console.error('stripe unreachable', err);
    return json({ ok: false, error: 'Could not start checkout. Try again?' }, 502);
  }
};
