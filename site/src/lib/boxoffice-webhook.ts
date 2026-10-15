import { getEventById, getOffered, getProducts, recordOrder } from './boxoffice-db';
import { money, priceBasket, showTime, stripeKey, type BasketLine } from './boxoffice';
import { layout, send, SITE } from './email';
import type { CheckoutSession } from './stripe';

/**
 * A box office sale, once Stripe says the money moved.
 *
 * This is the only thing that mints a ticket on the web path. The success
 * page never does: anyone can type a session id into a URL, and only Stripe
 * can sign this request.
 */

/**
 * What Stripe actually charged us for this sale.
 *
 * Read off the balance transaction rather than computed from 2.9% + 30¢,
 * because the published rate is not what lands: an Amex, an international
 * card or a Link payment all settle differently, and a tithe calculated
 * from a rate card is wrong by a few dollars at every single stop.
 *
 * Returns null when it cannot be read, and the caller stores 0 rather than a
 * guess — a visible zero gets fixed; an invented number does not.
 */
async function actualFeeCents(paymentIntentId: string, key: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}` +
        `?expand[]=latest_charge.balance_transaction`,
      { headers: { authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return null;
    const pi = (await res.json()) as {
      latest_charge?: { balance_transaction?: { fee?: number } };
    };
    const fee = pi.latest_charge?.balance_transaction?.fee;
    return typeof fee === 'number' ? fee : null;
  } catch {
    return null;
  }
}

export async function onBoxOffice(s: CheckoutSession): Promise<Response> {
  const eventId = Number(s.metadata?.event_id);
  const event = Number.isFinite(eventId) ? await getEventById(eventId) : null;
  if (!event) {
    console.error('boxoffice session for an unknown stop', { session: s.id, eventId });
    return new Response('unknown stop', { status: 200 });
  }

  // The basket we priced at checkout, not Stripe's line items. Re-pricing it
  // here against the same catalogue means the recorded order and the charged
  // amount are produced by one piece of arithmetic.
  let basket: BasketLine[] = [];
  try {
    const raw = JSON.parse(s.metadata?.basket ?? '[]') as [string, number, string][];
    basket = raw.map(([sku, qty, size]) => ({ sku, qty, size: size || null }));
  } catch {
    console.error('boxoffice basket unreadable', { session: s.id });
  }
  if (!basket.length) return new Response('empty basket', { status: 200 });

  const [products, offered] = await Promise.all([getProducts(), getOffered(event.id)]);
  const priced = priceBasket(basket, products, offered, null);
  if (priced.error) {
    console.error('boxoffice basket failed to price', { session: s.id, error: priced.error });
    return new Response('unpriceable', { status: 200 });
  }

  // Stripe's own total is the truth about what was taken — it carries the
  // coupon. Our subtotal is what the items came to before it.
  const total = typeof s.amount_total === 'number' ? s.amount_total : priced.total_cents;
  const discount = Math.max(0, priced.subtotal_cents - total);

  let fee = 0;
  const { key } = stripeKey();
  if (s.payment_intent && key) {
    fee = (await actualFeeCents(s.payment_intent, key)) ?? 0;
  }

  // Checkout returns custom fields in their own array, not in metadata.
  const willCall = s.custom_fields?.find((f) => f.key === 'attendee_name')?.text?.value;
  const buyerName = (willCall ?? s.customer_details?.name ?? '').trim() || null;

  const recorded = await recordOrder({
    event,
    lines: priced.lines,
    subtotal_cents: priced.subtotal_cents,
    discount_cents: discount,
    total_cents: total,
    fee_cents: fee,
    promo_code: s.metadata?.promo_code ?? null,
    channel: 'web',
    buyer_name: buyerName,
    buyer_email: s.customer_details?.email ?? s.customer_email ?? null,
    stripe_session_id: s.id,
    stripe_payment_intent: s.payment_intent ?? null,
  });

  if (recorded.duplicate) return new Response('duplicate', { status: 200 });

  // The email is the ticket. If it fails the buyer has paid and cannot get
  // in, so it is logged loudly — but still acknowledged, because a Stripe
  // retry would only try to insert an order that now exists.
  try {
    const to = s.customer_details?.email ?? s.customer_email;
    if (to) {
      await sendTickets({
        to,
        name: buyerName,
        codes: recorded.codes,
        venue: event.venue,
        city: `${event.city}${event.region ? `, ${event.region}` : ''}`,
        when: showTime(event.starts_at),
        doors: event.doors_at ? showTime(event.doors_at) : null,
        total,
        items: priced.lines.map((l) => `${l.qty} × ${l.name}${l.size ? ` (${l.size})` : ''}`),
      });
    }
  } catch (err) {
    console.error('BOXOFFICE TICKET EMAIL FAILED', { session: s.id, order: recorded.orderId, err });
  }

  return new Response('ok', { status: 200 });
}

async function sendTickets(t: {
  to: string;
  name: string | null;
  codes: string[];
  venue: string;
  city: string;
  when: string;
  doors: string | null;
  total: number;
  items: string[];
}) {
  const hello = t.name ? `You’re in, ${t.name.split(' ')[0]}.` : 'You’re in.';

  // One block per admission. The QR is served from our own domain rather than
  // inlined: a data: URI is stripped by a good share of mail clients, and a
  // ticket that does not render is a person arguing at a door.
  const tickets = t.codes
    .map(
      (code, i) => `
      <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 18px;">
        <tr>
          <td style="padding:14px;border:1px solid #d8cfbd;border-radius:6px;" align="center">
            <div style="font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.14em;
                        text-transform:uppercase;color:#8b857a;">
              Admit one &middot; ${i + 1} of ${t.codes.length}
            </div>
            <img src="${SITE}/boxoffice/qr/${code}.png" width="180" height="180"
                 alt="Ticket ${code}"
                 style="display:block;margin:12px auto 8px;width:180px;height:180px;" />
            <div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#17110D;">
              ${code}
            </div>
          </td>
        </tr>
      </table>`
    )
    .join('');

  await send({
    to: t.to,
    subject: `Your tickets — His Name is Michael, ${t.city}`,
    html: layout({
      preheader: `${t.codes.length} ${t.codes.length === 1 ? 'ticket' : 'tickets'} for ${t.venue}.`,
      heading: hello,
      body:
        `<p style="margin:0 0 6px;"><strong>${t.venue}</strong><br>${t.city}</p>` +
        `<p style="margin:0 0 4px;">${t.when}</p>` +
        (t.doors ? `<p style="margin:0 0 14px;color:#8b857a;">Doors ${t.doors}</p>` : '') +
        `<p style="margin:0 0 18px;color:#8b857a;">${t.items.join(' &middot; ')} — ${money(t.total)}</p>` +
        tickets +
        `<p style="margin:0;color:#8b857a;">Show a code at the door, on your phone or printed. ` +
        `If your battery dies we can find you by name.</p>`,
      footer: `4est Films &middot; Independent Film Production &middot; Est. 2015`,
    }),
    text:
      `${hello}\n\n${t.venue}\n${t.city}\n${t.when}\n` +
      (t.doors ? `Doors ${t.doors}\n` : '') +
      `\n${t.items.join(' · ')} — ${money(t.total)}\n\n` +
      `Ticket codes:\n${t.codes.join('\n')}\n\n` +
      `Show a code at the door. If your battery dies we can find you by name.`,
    campaign: 'boxoffice-tickets',
  });
}
