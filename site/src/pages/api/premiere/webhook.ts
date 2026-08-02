import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { newTicketToken, premiere, dollars } from '../../../lib/premiere';
import { layout, send, SITE } from '../../../lib/email';

export const prerender = false;

/**
 * Stripe's checkout.session.completed webhook.
 *
 * This is the only thing that grants a ticket. The success page never does:
 * anyone can visit a success URL with a made-up session id, and only Stripe
 * can sign this request.
 */

/** Constant-time compare of two hex digests. */
const equalHex = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Verifies Stripe's `Stripe-Signature` header.
 *
 * Written out rather than taken from the SDK because the SDK's verifier
 * wants Node's crypto. The timestamp check is not optional: without it a
 * captured request could be replayed forever.
 */
async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;

  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    k,
    new TextEncoder().encode(`${parts.t}.${payload}`)
  );
  return equalHex(toHex(sig), parts.v1);
}

interface Session {
  id: string;
  payment_intent?: string;
  amount_total?: number;
  currency?: string;
  customer_details?: { email?: string; name?: string };
  customer_email?: string;
  metadata?: Record<string, string>;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = (env as unknown as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET;
  const db = env.DB;
  if (!secret || !db) return new Response('not configured', { status: 503 });

  const payload = await request.text();
  const header = request.headers.get('stripe-signature') ?? '';

  if (!(await verify(payload, header, secret))) {
    return new Response('bad signature', { status: 400 });
  }

  let event: { type?: string; data?: { object?: Session } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('bad payload', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    // Acknowledged, deliberately. A 4xx here makes Stripe retry an event we
    // are never going to want.
    return new Response('ignored', { status: 200 });
  }

  const s = event.data?.object;
  const email = (s?.customer_details?.email ?? s?.customer_email ?? '').trim().toLowerCase();
  if (!s?.id || !email) return new Response('incomplete', { status: 200 });

  const firstName = (s.metadata?.first_name ?? s.customer_details?.name ?? '').split(' ')[0] || null;

  try {
    // Stripe retries, and can deliver the same event twice. The UNIQUE on
    // stripe_session_id is what stops a retry double-counting the total.
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
        request.headers.get('cf-ipcountry'),
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
    // watch, so it is logged loudly — but still acknowledged, because a
    // Stripe retry would only try to insert an order that now exists.
    try {
      await sendTicket(email, firstName, token, s.amount_total ?? 0);
    } catch (err) {
      console.error('TICKET EMAIL FAILED', { session: s.id, email, err });
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('webhook failed', err);
    // 500 so Stripe retries: this one we do want again.
    return new Response('error', { status: 500 });
  }
};

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
