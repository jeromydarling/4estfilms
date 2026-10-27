import { env } from 'cloudflare:workers';
import { getEventById, getOffered, getProducts, recordOrder } from './boxoffice-db';
import {
  TOUR, money, priceBasket, showTime, sponsorFamilies, sponsorTier, stripeKey, type BasketLine,
} from './boxoffice';
import { confirmEmail, layout, newToken, send, SITE } from './email';
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

  // Sponsor a Family, as the session was opened: the tier and the stop it
  // was bound to, re-checked against the catalogue so a stray value cannot
  // write a seat count the tier does not have.
  const sponsor = readSponsor(s.metadata);
  const sponsorStop = sponsor ? await getEventById(sponsor.stop_id) : null;

  // Stripe's own total is the truth about what was taken — it carries the
  // coupon. Sales tax is taken out of it first: the tax is remitted, not
  // earned, and gross has to mean the price of the seats.
  const tax = Math.max(0, s.total_details?.amount_tax ?? 0);
  const total = (typeof s.amount_total === 'number' ? s.amount_total : priced.total_cents) - tax;
  const subtotal = priced.subtotal_cents + (sponsor ? sponsor.tier.cents * sponsor.qty : 0);
  const discount = Math.max(0, subtotal - total);

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
    subtotal_cents: subtotal,
    discount_cents: discount,
    total_cents: total,
    fee_cents: fee,
    tax_cents: tax,
    sponsor: sponsor && sponsorStop ? { ...sponsor, stop_id: sponsorStop.id } : null,
    promo_code: s.metadata?.promo_code ?? null,
    // The door's card sales come through here too, flagged when the session
    // was opened, so the report can tell presale from walk-up.
    channel: s.metadata?.door === '1' ? 'door_card' : 'web',
    operator: s.metadata?.operator || null,
    buyer_name: buyerName,
    buyer_email: s.customer_details?.email ?? s.customer_email ?? null,
    stripe_session_id: s.id,
    stripe_payment_intent: s.payment_intent ?? null,
  });

  if (recorded.duplicate) return new Response('duplicate', { status: 200 });

  // The payment's own metadata gets the buyer's address now that Checkout
  // has collected it, so a sponsorship can be traced from the Stripe side
  // alone. Best effort: our record already has it.
  const buyerEmail = s.customer_details?.email ?? s.customer_email ?? null;
  if (sponsor && s.payment_intent && key && buyerEmail) {
    try {
      await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(s.payment_intent)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'metadata[buyer_email]': buyerEmail.slice(0, 254) }),
      });
    } catch (err) {
      console.error('could not stamp buyer_email on the payment', { session: s.id, err });
    }
  }

  // They ticked "keep me posted". Double opt-in like everyone else on the
  // list: a row and a confirmation email, never a silent subscription.
  if (s.metadata?.subscribe === '1') {
    try {
      await subscribeBuyer(s.customer_details?.email ?? s.customer_email ?? '', buyerName);
    } catch (err) {
      console.error('boxoffice subscribe failed', { session: s.id, err });
    }
  }

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
        sponsor: sponsor && sponsorStop ? sponsorLine(sponsor.tier, sponsor.qty, sponsor.seats, sponsorStop.city) : null,
      });
    }
  } catch (err) {
    console.error('BOXOFFICE TICKET EMAIL FAILED', { session: s.id, order: recorded.orderId, err });
  }

  return new Response('ok', { status: 200 });
}

function readSponsor(m: Record<string, string> | undefined) {
  const tier = sponsorTier(m?.sponsor_tier);
  if (!tier) return null;
  const qty = Math.floor(Number(m?.sponsor_qty));
  const stop_id = Number(m?.sponsor_stop_id);
  if (!Number.isFinite(qty) || qty < 1 || !Number.isFinite(stop_id)) return null;
  // Seats are the tier's arithmetic, never the metadata's word for it.
  return { tier, qty, seats: tier.seats * qty, stop_id };
}

/**
 * "You sponsored 4 seats for a foster or adoptive family in Omaha."
 *
 * Specific about the seats and the city; silent about the family. Placement
 * is anonymous, through the local partner, and the buyer is promised
 * nothing about who sat where.
 */
export function sponsorLine(tier: ReturnType<typeof sponsorTier> & object, qty: number, seats: number, city: string): string {
  return `You sponsored ${seats} seats for ${sponsorFamilies(tier, qty)} in ${city}.`;
}

async function subscribeBuyer(rawEmail: string, name: string | null): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
  const db = env.DB;
  await db
    .prepare(
      `INSERT INTO subscribers (email, first_name, source, film, token)
       VALUES (?1, ?2, 'boxoffice', ?3, ?4) ON CONFLICT(email) DO NOTHING`
    )
    .bind(email, name?.split(' ')[0] ?? null, TOUR.film, newToken())
    .run();
  const row = await db
    .prepare(`SELECT first_name, token, confirmed_at, unsubscribed_at, confirm_sent_at FROM subscribers WHERE email = ?1`)
    .bind(email)
    .first<{ first_name: string | null; token: string | null; confirmed_at: string | null; unsubscribed_at: string | null; confirm_sent_at: string | null }>();
  if (!row || row.confirmed_at || row.unsubscribed_at || row.confirm_sent_at || !row.token) return;
  const mail = confirmEmail(row.token, row.first_name);
  await send({ to: email, token: row.token, campaign: 'confirm', ...mail });
  await db.prepare(`UPDATE subscribers SET confirm_sent_at = datetime('now') WHERE email = ?1`).bind(email).run();
}

export async function sendTickets(t: {
  to: string;
  name: string | null;
  codes: string[];
  venue: string;
  city: string;
  when: string;
  doors: string | null;
  total: number;
  items: string[];
  /** The Sponsor a Family thank-you, when there is one. */
  sponsor?: string | null;
}) {
  const hello = t.name ? `You’re in, ${t.name.split(' ')[0]}.` : 'You’re in.';
  const sponsorHtml = t.sponsor
    ? `<p style="margin:0 0 18px;padding:12px 14px;border-left:3px solid #96001f;color:#f2ede3;">${t.sponsor} Thank you.</p>`
    : '';

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
        sponsorHtml +
        tickets +
        `<p style="margin:0;color:#8b857a;">Show a code at the door, on your phone or printed. ` +
        `If your battery dies we can find you by name.</p>`,
      footer: `4est Films &middot; Independent Film Production &middot; Est. 2015`,
    }),
    text:
      `${hello}\n\n${t.venue}\n${t.city}\n${t.when}\n` +
      (t.doors ? `Doors ${t.doors}\n` : '') +
      `\n${t.items.join(' · ')} — ${money(t.total)}\n\n` +
      (t.sponsor ? `${t.sponsor} Thank you.\n\n` : '') +
      `Ticket codes:\n${t.codes.join('\n')}\n\n` +
      `Show a code at the door. If your battery dies we can find you by name.`,
    campaign: 'boxoffice-tickets',
  });
}

/**
 * A free-will offering, once Stripe says the money moved.
 *
 * Recorded against the stop whose QR was scanned (or no stop at all, for a
 * gift to the tour), with the fee Stripe actually took, and answered with the
 * gift: a link to the making-of and the songs. The link is the thank-you, so
 * like the ticket email it is logged loudly if it fails and never retried
 * into a duplicate.
 */
export async function onOffering(s: CheckoutSession, country: string | null): Promise<Response> {
  const amount = typeof s.amount_total === 'number' ? s.amount_total : 0;
  if (amount <= 0) return new Response('nothing taken', { status: 200 });

  const eventId = Number(s.metadata?.event_id);
  const event = Number.isFinite(eventId) && eventId > 0 ? await getEventById(eventId) : null;

  let fee = 0;
  const { key } = stripeKey();
  if (s.payment_intent && key) fee = (await actualFeeCents(s.payment_intent, key)) ?? 0;

  const email = (s.customer_details?.email ?? s.customer_email ?? '').trim().toLowerCase() || null;
  const name = (s.customer_details?.name ?? '').trim() || null;
  const token = newToken();

  const ins = await env.DB
    .prepare(
      `INSERT INTO bo_offerings
         (event_id, stripe_session_id, stripe_payment_intent, amount_cents, fee_cents,
          giver_name, giver_email, gift_token, ip_country)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(stripe_session_id) DO NOTHING`
    )
    .bind(event?.id ?? null, s.id, s.payment_intent ?? null, amount, fee, name, email, token, country)
    .run();

  if ((ins.meta?.changes ?? 0) === 0) return new Response('duplicate', { status: 200 });

  try {
    if (email) {
      await sendGift({
        to: email,
        name,
        amount,
        venue: event?.venue ?? null,
        city: event ? `${event.city}${event.region ? `, ${event.region}` : ''}` : null,
        href: `${SITE}/boxoffice/gift/${token}/`,
      });
    }
  } catch (err) {
    console.error('OFFERING GIFT EMAIL FAILED', { session: s.id, err });
  }

  return new Response('ok', { status: 200 });
}

async function sendGift(g: {
  to: string;
  name: string | null;
  amount: number;
  venue: string | null;
  city: string | null;
  href: string;
}) {
  const hello = g.name ? `Thank you, ${g.name.split(' ')[0]}.` : 'Thank you.';
  const where = g.venue ? `at ${g.venue}, ${g.city}` : 'to the 2027 tour';
  const goes = g.venue
    ? 'Free-will offerings go to the parish that opened its doors for the night — in full, ' +
      'less only what the card processor takes.'
    : 'It carries the film to the next town: the projector, the drive, the room.';

  await send({
    to: g.to,
    subject: g.venue ? `Thank you — your gift at ${g.venue}` : 'Thank you for your gift to the tour',
    html: layout({
      preheader: 'The making-of and the songs from the film, yours to keep.',
      heading: hello,
      body:
        `<p style="margin:0 0 14px;">Your gift of <strong>${money(g.amount)}</strong> ${where} — thank you.</p>` +
        `<p style="margin:0 0 14px;">${goes}</p>` +
        `<p style="margin:0 0 14px;">As our thanks: the making-of documentary and the songs from ` +
        `<em>His Name is Michael</em>, yours to keep. The link below is yours and doesn’t expire.</p>` +
        `<p style="margin:0;">Stripe has sent your receipt separately.</p>`,
      cta: { href: g.href, label: 'Open your gift' },
      footer:
        `Or paste this into your browser:<br>` +
        `<span style="color:#8b857a;word-break:break-all;">${g.href}</span><br><br>` +
        `4est Films &middot; Independent Film Production &middot; Est. 2015`,
    }),
    text:
      `${hello}\n\nYour gift of ${money(g.amount)} ${where} — thank you.\n\n${goes}\n\n` +
      `As our thanks: the making-of documentary and the songs from His Name is Michael, ` +
      `yours to keep.\n\n${g.href}\n\nThe link is yours and doesn't expire. Stripe has sent your receipt separately.`,
    campaign: 'boxoffice-offering',
  });
}
