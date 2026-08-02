import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { known } from '../../../lib/known';

export const prerender = false;

/**
 * Opens a Stripe Checkout session for a one-time gift to Known.
 *
 * Talks to Stripe's REST API directly rather than through the SDK, which
 * pulls in Node built-ins a Worker does not have.
 *
 * The amount is validated here, on the server. A price posted from the
 * browser is a suggestion, not a fact.
 *
 * No email is collected before checkout: Stripe asks for one anyway, and a
 * field the donor has to fill in twice is a field some of them abandon.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, url }) => {
  const key = (env as unknown as { STRIPE_SECRET_KEY?: string }).STRIPE_SECRET_KEY;
  if (!known.open || !key) {
    return json({ ok: false, error: 'Giving is not open yet.' }, 503);
  }

  let body: { amount_cents?: number; utm_source?: string; utm_campaign?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const amount = Math.round(Number(body.amount_cents));
  if (!Number.isFinite(amount) || amount < known.minimumCents) {
    return json({ ok: false, error: `Minimum is $${known.minimumCents / 100}.` }, 422);
  }
  if (amount > known.maximumCents) {
    return json(
      {
        ok: false,
        error: `For gifts over $${(known.maximumCents / 100).toLocaleString('en-US')}, write to ${known.contact} — we would rather talk to you.`,
      },
      422
    );
  }

  const origin = url.origin;
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${origin}/known/thanks/?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/known/`,
    'line_items[0][price_data][currency]': known.currency,
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': `Gift to ${known.name}`,
    'line_items[0][price_data][product_data][description]':
      'The non-profit arm of 4est Films. Music, original plays, films.',
    'line_items[0][quantity]': '1',
    // The webhook is shared with premiere tickets and dispatches on this.
    'metadata[kind]': 'donation',
    'metadata[fund]': 'known',
    // Turns the checkout button from "Pay" into "Donate". Stripe emails the
    // receipt to the address it collects here; we send nothing.
    submit_type: 'donate',
  });

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
    const session = (await res.json()) as { url?: string; error?: { message?: string } };

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
