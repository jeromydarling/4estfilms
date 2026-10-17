import type { APIRoute } from 'astro';
import { getEvent } from '../../../lib/boxoffice-db';
import { OFFERING, money, stripeKey } from '../../../lib/boxoffice';

export const prerender = false;

/**
 * Opens a Stripe Checkout session for a free-will offering.
 *
 * Any amount within reason, attributed to the stop whose QR was scanned so
 * the parish's settlement shows what their own people gave. The amount is
 * the only thing the browser decides, and it is bounded here rather than
 * trusted: a dollar at the bottom, where the fee stops being the gift, and
 * a ceiling where a slipped finger stops being a gift too.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, url }) => {
  let body: { slug?: string; amount_cents?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const amount = Math.round(Number(body.amount_cents));
  if (!Number.isFinite(amount) || amount < OFFERING.minCents) {
    return json({ ok: false, error: `Give at least ${money(OFFERING.minCents)}.` }, 422);
  }
  if (amount > OFFERING.maxCents) {
    return json(
      { ok: false, error: 'That’s more than we can take by card here — write to hello@4estfilms.studio and we’ll sort it.' },
      422
    );
  }

  const slug = String(body.slug ?? '').trim();
  const event = slug ? await getEvent(slug) : null;
  if (slug && !event) return json({ ok: false, error: 'No such stop.' }, 404);
  if (event?.status === 'draft') return json({ ok: false, error: 'That stop isn’t announced yet.' }, 409);

  const { key, error: keyError } = stripeKey();
  if (!key) {
    console.error('offering blocked:', keyError);
    return json({ ok: false, error: 'Giving isn’t available right now.' }, 503);
  }

  const origin = url.origin;
  const where = event
    ? `${event.venue}, ${event.city}${event.region ? `, ${event.region}` : ''} — ${event.starts_at.slice(0, 10)}`
    : 'His Name is Michael — the 2027 tour';

  const form = new URLSearchParams({
    mode: 'payment',
    // Stripe's "Donate" button and wording rather than "Pay".
    submit_type: 'donate',
    success_url: `${origin}/boxoffice/give/thanks/?session={CHECKOUT_SESSION_ID}`,
    cancel_url: event ? `${origin}/boxoffice/give/${event.slug}/` : `${origin}/boxoffice/give/`,
    'metadata[kind]': 'offering',
    'metadata[event_id]': event ? String(event.id) : '',
    'metadata[event_slug]': event?.slug ?? '',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': event
      ? `Free-will offering — ${event.venue}`
      : 'Free-will offering — the 2027 tour',
    'line_items[0][price_data][product_data][description]': where,
    'line_items[0][quantity]': '1',
  });

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const session = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !session.url) {
      console.error('offering session failed', session.error);
      return json({ ok: false, error: 'Could not open the giving page. Try again?' }, 502);
    }
    return json({ ok: true, url: session.url });
  } catch (err) {
    console.error('stripe unreachable', err);
    return json({ ok: false, error: 'Could not open the giving page. Try again?' }, 502);
  }
};
