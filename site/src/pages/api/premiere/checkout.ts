import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { premiere } from '../../../lib/premiere';

export const prerender = false;

/**
 * Opens a Stripe Checkout session for a pay-what-you-can ticket.
 *
 * Talks to Stripe's REST API directly rather than through the SDK: the SDK
 * pulls in Node built-ins that a Worker does not have, and this is two form
 * posts.
 *
 * The amount is validated here, on the server. A price posted from the
 * browser is a suggestion, not a fact.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, url }) => {
  const key = (env as unknown as { STRIPE_SECRET_KEY?: string }).STRIPE_SECRET_KEY;
  if (!premiere.open || !key) {
    return json({ ok: false, error: 'The premiere is not open yet.' }, 503);
  }

  let body: { amount_cents?: number; email?: string; first_name?: string; utm_source?: string; utm_campaign?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const amount = Math.round(Number(body.amount_cents));
  if (!Number.isFinite(amount) || amount < premiere.minimumCents) {
    return json(
      { ok: false, error: `Minimum is ${premiere.minimumCents / 100} dollars.` },
      422
    );
  }
  // A ceiling, because a typo that turns 25 into 2500 should bounce rather
  // than charge somebody's card for two and a half thousand dollars.
  if (amount > 100_000) {
    return json({ ok: false, error: 'For gifts over $1,000, please get in touch.' }, 422);
  }

  const origin = url.origin;
  const form = new URLSearchParams({
    mode: 'payment',
    // Stripe keys the idempotency of the session on our reference; the
    // webhook uses the session id, which is what actually guards double
    // counting if a customer refreshes the success page.
    success_url: `${origin}/watch/strung/?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/premiere/`,
    'line_items[0][price_data][currency]': premiere.currency,
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': `${premiere.title} — online premiere`,
    'line_items[0][price_data][product_data][description]':
      'Pay what you can. Every dollar goes to addiction recovery.',
    'line_items[0][quantity]': '1',
    'metadata[film]': premiere.film,
  });
  if (body.email) {
    form.set('customer_email', String(body.email).slice(0, 254));
  }
  if (body.first_name) form.set('metadata[first_name]', String(body.first_name).slice(0, 80));
  if (body.utm_source) form.set('metadata[utm_source]', String(body.utm_source).slice(0, 80));
  if (body.utm_campaign) form.set('metadata[utm_campaign]', String(body.utm_campaign).slice(0, 80));

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const session = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };

    if (!res.ok || !session.url) {
      console.error('stripe session failed', session.error);
      return json({ ok: false, error: 'Could not start checkout. Try again?' }, 502);
    }
    return json({ ok: true, url: session.url });
  } catch (err) {
    console.error('stripe unreachable', err);
    return json({ ok: false, error: 'Could not start checkout. Try again?' }, 502);
  }
};
