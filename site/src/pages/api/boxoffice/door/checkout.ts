import type { APIRoute } from 'astro';
import { canDoor } from '../../../../lib/door';
import { getEvent, quote } from '../../../../lib/boxoffice-db';
import { stripeKey, type BasketLine } from '../../../../lib/boxoffice';

export const prerender = false;

/**
 * A card sale at the window.
 *
 * Opens a Checkout session the buyer finishes on their own phone, from a QR
 * the door shows them — which is how a traveling box office takes a card
 * without carrying a terminal through forty-eight airports. The webhook does
 * the recording, exactly as it does for a sale made at home.
 *
 * Needs a connection by definition. Cash is the offline path.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, url }) => {
  let body: { slug?: string; basket?: BasketLine[]; operator?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const event = await getEvent(String(body.slug ?? ''));
  if (!event) return json({ ok: false, error: 'No such stop.' }, 404);
  if (!(await canDoor(request, url, event.id))) return json({ ok: false }, 404);

  const q = await quote(event, Array.isArray(body.basket) ? body.basket : [], null, { door: true });
  if (!q.ok) return json({ ok: false, error: q.error }, 422);

  const { key, error: keyError } = stripeKey();
  if (!key) {
    console.error('door checkout blocked:', keyError);
    return json({ ok: false, error: keyError ?? 'Card sales unavailable.' }, 503);
  }

  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${url.origin}/boxoffice/thanks/?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/boxoffice/${event.slug}/`,
    'metadata[kind]': 'boxoffice',
    'metadata[event_id]': String(event.id),
    'metadata[event_slug]': event.slug,
    // Marks the row as taken at the window, so the per-stop report can tell
    // presale from walk-up without anybody keeping a separate tally.
    'metadata[door]': '1',
    'metadata[operator]': String(body.operator ?? '').slice(0, 40),
    'metadata[basket]': JSON.stringify(
      q.priced.lines.map((l) => [l.sku, l.qty, l.size ?? ''])
    ).slice(0, 480),
  });

  q.priced.lines.forEach((l, i) => {
    form.set(`line_items[${i}][price_data][currency]`, 'usd');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(l.unit_price_cents));
    form.set(
      `line_items[${i}][price_data][product_data][name]`,
      l.size ? `${l.name} (${l.size})` : l.name
    );
    form.set(`line_items[${i}][quantity]`, String(l.qty));
  });

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
      console.error('door session failed', session.error);
      return json({ ok: false, error: 'Stripe refused that. Take cash?' }, 502);
    }
    return json({ ok: true, url: session.url, total_cents: q.priced.total_cents });
  } catch {
    return json({ ok: false, error: 'No connection to Stripe. Take cash?' }, 502);
  }
};
