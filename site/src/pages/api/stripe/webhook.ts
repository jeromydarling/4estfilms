import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { verifySignature, type CheckoutSession } from '../../../lib/stripe';
import { newTicketToken, premiere, dollars } from '../../../lib/premiere';
import { known } from '../../../lib/known';
import { layout, send, SITE } from '../../../lib/email';

export const prerender = false;

/**
 * The one Stripe webhook for the whole account.
 *
 * Donations to Known and premiere tickets are different things, but they are
 * the same Stripe account and the same event, `checkout.session.completed`.
 * A second endpoint would mean a second signing secret to store, rotate and
 * eventually lose track of — so there is one endpoint, and it dispatches on
 * the `kind` we set when the session is created.
 *
 * Anything without a `kind` we recognise is acknowledged and dropped. That is
 * the safe default: a payment made by hand in the Stripe dashboard should not
 * silently mint a ticket to a film.
 */

export const POST: APIRoute = async ({ request }) => {
  const secret = (env as unknown as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET;
  const db = env.DB;
  if (!secret || !db) return new Response('not configured', { status: 503 });

  const payload = await request.text();
  const header = request.headers.get('stripe-signature') ?? '';

  if (!(await verifySignature(payload, header, secret))) {
    return new Response('bad signature', { status: 400 });
  }

  let event: { type?: string; data?: { object?: CheckoutSession } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('bad payload', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    // Acknowledged, deliberately. A 4xx makes Stripe retry an event we are
    // never going to want.
    return new Response('ignored', { status: 200 });
  }

  const s = event.data?.object;
  if (!s?.id) return new Response('incomplete', { status: 200 });

  const kind = s.metadata?.kind ?? (s.metadata?.film ? 'premiere' : '');
  const country = request.headers.get('cf-ipcountry');

  try {
    if (kind === 'donation') return await onDonation(db, s, country);
    if (kind === 'premiere') return await onTicket(db, s, country);

    console.warn('stripe session with no recognised kind', { session: s.id });
    return new Response('ignored', { status: 200 });
  } catch (err) {
    console.error('webhook failed', { session: s.id, kind, err });
    // 500 so Stripe retries: this one we do want again.
    return new Response('error', { status: 500 });
  }
};

/** A gift to Known. Recorded and nothing else — Stripe sends the receipt. */
async function onDonation(db: D1Database, s: CheckoutSession, country: string | null) {
  const email = (s.customer_details?.email ?? s.customer_email ?? '').trim().toLowerCase() || null;

  const ins = await db
    .prepare(
      `INSERT INTO donations
         (stripe_session_id, stripe_payment_intent, email, name,
          amount_cents, currency, fund, ip_country, utm_source, utm_campaign)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(stripe_session_id) DO NOTHING`
    )
    .bind(
      s.id,
      s.payment_intent ?? null,
      email,
      s.customer_details?.name ?? null,
      s.amount_total ?? 0,
      s.currency ?? known.currency,
      s.metadata?.fund ?? 'known',
      country,
      s.metadata?.utm_source ?? null,
      s.metadata?.utm_campaign ?? null
    )
    .run();

  if ((ins.meta?.changes ?? 0) === 0) return new Response('duplicate', { status: 200 });
  return new Response('ok', { status: 200 });
}

/**
 * A premiere ticket. Unchanged from when this lived under /api/premiere/ —
 * the order is recorded, a ticket minted, and the link emailed.
 */
async function onTicket(db: D1Database, s: CheckoutSession, country: string | null) {
  const email = (s.customer_details?.email ?? s.customer_email ?? '').trim().toLowerCase();
  if (!email) return new Response('incomplete', { status: 200 });

  const firstName = (s.metadata?.first_name ?? s.customer_details?.name ?? '').split(' ')[0] || null;

  const ins = await db
    .prepare(
      `INSERT INTO orders
         (stripe_session_id, stripe_payment_intent, email, first_name,
          amount_cents, currency, film, ip_country, utm_source, utm_campaign)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(stripe_session_id) DO NOTHING`
    )
    .bind(
      s.id,
      s.payment_intent ?? null,
      email,
      firstName,
      s.amount_total ?? 0,
      s.currency ?? premiere.currency,
      s.metadata?.film ?? premiere.film,
      country,
      s.metadata?.utm_source ?? null,
      s.metadata?.utm_campaign ?? null
    )
    .run();

  // Already handled — nothing more to do, and no second email.
  if ((ins.meta?.changes ?? 0) === 0) return new Response('duplicate', { status: 200 });

  const order = await db
    .prepare(`SELECT id FROM orders WHERE stripe_session_id = ?1`)
    .bind(s.id)
    .first<{ id: number }>();

  const token = newTicketToken();
  await db
    .prepare(
      `INSERT INTO tickets (token, order_id, email, film, expires_at)
       VALUES (?1, ?2, ?3, ?4, datetime('now', ?5))`
    )
    .bind(token, order?.id ?? null, email, premiere.film, `+${premiere.ticketDays} days`)
    .run();

  // The ticket is the email. If this fails the person has paid and cannot
  // watch, so it is logged loudly — but still acknowledged, because a Stripe
  // retry would only try to insert an order that now exists.
  try {
    await sendTicket(email, firstName, token, s.amount_total ?? 0);
  } catch (err) {
    console.error('TICKET EMAIL FAILED', { session: s.id, email, err });
  }

  return new Response('ok', { status: 200 });
}

async function sendTicket(email: string, name: string | null, token: string, cents: number) {
  const href = `${SITE}/watch/strung/?t=${token}`;
  const hello = name ? `Thank you, ${name}.` : 'Thank you.';
  await send({
    to: email,
    subject: 'Your ticket — Strung',
    html: layout({
      preheader: 'Your link to watch Strung.',
      heading: hello,
      body: `<p style="margin:0 0 14px;">Your ${dollars(cents)} goes to
             ${premiere.beneficiaries.map((b) => b.name).join(' and ')}, for people who
             cannot afford treatment.</p>
             <p style="margin:0 0 14px;">The link below opens the film. It is yours for
             ${premiere.ticketDays} days and you can come back to it as often as you like.</p>
             <p style="margin:0;">Keep this email — it is your ticket.</p>`,
      cta: { href, label: 'Watch Strung' },
      footer: `Or paste this into your browser:<br>
               <span style="color:#8b857a;word-break:break-all;">${href}</span><br><br>
               4est Films · Independent Film Production · Est. 2015`,
    }),
    text: `${hello}\n\nYour ${dollars(cents)} goes to addiction recovery.\n\nWatch Strung: ${href}\n\nYours for ${premiere.ticketDays} days. Keep this email — it is your ticket.`,
    campaign: 'strung-ticket',
  });
}
