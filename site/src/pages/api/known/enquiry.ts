import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { known } from '../../../lib/known';
import { SITE, layout, send } from '../../../lib/email';

export const prerender = false;

/**
 * Somebody who wants to support KNOWN, while there is no way to take their
 * card.
 *
 * Two things happen: the row is written, and the company is told. The row is
 * the one that matters — an email is a thing that gets buried, and this list
 * is what gets worked through when Stripe is live again.
 */

// Deliberately permissive but not useless: catches the common typos without
// trying to out-clever RFC 5322.
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@.]{2,}$/;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const POST: APIRoute = async ({ request }) => {
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'unavailable' }, 503);

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  // Bots fill every field they find; humans never see this one.
  if (String(b.hp_url ?? '').trim() !== '') return json({ ok: true });

  const str = (k: string, max: number) => {
    const v = b[k];
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s.slice(0, max) : null;
  };

  const email = (str('email', 254) ?? '').toLowerCase();
  if (!EMAIL.test(email)) {
    return json({ ok: false, error: 'Please check that address.' }, 422);
  }

  const name = str('name', 120);
  const message = str('message', 4000);
  const wantsHost = b.wants_host === true || b.wants_host === 'on' ? 1 : 0;

  // The band is chosen from a fixed list, so anything else is discarded
  // rather than stored — this string ends up in an email we send ourselves.
  const submitted = str('amount_band', 60);
  const band = submitted && (known.bands as readonly string[]).includes(submitted) ? submitted : null;

  try {
    await db
      .prepare(
        `INSERT INTO support_enquiries
           (name, email, amount_band, message, wants_host, ip_country, utm_source, utm_campaign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(
        name,
        email,
        band,
        message,
        wantsHost,
        request.headers.get('cf-ipcountry'),
        str('utm_source', 80),
        str('utm_campaign', 80)
      )
      .run();
  } catch (err) {
    console.error('enquiry insert failed', err);
    return json({ ok: false, error: 'Something went wrong. Try again?' }, 500);
  }

  // Both emails are best-effort. The row is already saved, and telling
  // somebody their message failed when it did not is worse than a quiet log.
  try {
    await notifyCompany({ name, email, band, message, wantsHost });
  } catch (err) {
    console.error('enquiry notification failed', { email, err });
  }
  try {
    await acknowledge(email, name);
  } catch (err) {
    console.error('enquiry acknowledgement failed', { email, err });
  }

  return json({ ok: true });
};

async function notifyCompany(e: {
  name: string | null;
  email: string;
  band: string | null;
  message: string | null;
  wantsHost: number;
}) {
  const rows = [
    ['Name', e.name ?? '—'],
    ['Email', e.email],
    ['Had in mind', e.band ?? '—'],
    ['Wants to host a screening', e.wantsHost ? 'Yes' : 'No'],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#8b857a;">${k}</td><td style="padding:4px 0;">${esc(v)}</td></tr>`
    )
    .join('');

  await send({
    to: known.contact,
    replyTo: e.email,
    subject: `Supporter: ${e.name ?? e.email}${e.band ? ` — ${e.band}` : ''}`,
    html: layout({
      preheader: `${e.name ?? e.email} wants to support ${known.name}.`,
      heading: 'Someone wants to support KNOWN',
      body:
        `<table style="border-collapse:collapse;font-size:15px;">${rows}</table>` +
        (e.message
          ? `<p style="margin:18px 0 0;white-space:pre-wrap;">${esc(e.message)}</p>`
          : ''),
      footer: 'Reply straight to this email and it goes to them.',
    }),
    text: [
      `Name: ${e.name ?? '—'}`,
      `Email: ${e.email}`,
      `Had in mind: ${e.band ?? '—'}`,
      `Wants to host a screening: ${e.wantsHost ? 'Yes' : 'No'}`,
      e.message ? `\n${e.message}` : '',
    ].join('\n'),
    campaign: 'known-enquiry',
  });
}

async function acknowledge(email: string, name: string | null) {
  const hello = name ? `Thank you, ${name.split(' ')[0]}.` : 'Thank you.';
  await send({
    to: email,
    replyTo: known.contact,
    subject: 'Thank you — KNOWN',
    html: layout({
      preheader: 'We have your note, and we will come back to you.',
      heading: hello,
      body: `<p style="margin:0 0 14px;">You've told us you want to help ${known.name}
             make films, and that matters more than you'd guess — most people
             think about it and never say so.</p>
             <p style="margin:0 0 14px;">We're finishing the paperwork on our giving
             setup. As soon as it's open we'll write to you personally, rather
             than putting you into a queue.</p>
             <p style="margin:0;">If you'd rather just talk, reply to this email.
             It comes straight to us.</p>`,
      footer: `4est Films · Independent Film Production · Est. 2015<br>
               <a href="${SITE}/known/" style="color:#8b857a;">${SITE}/known/</a>`,
    }),
    text: `${hello}\n\nYou've told us you want to help ${known.name} make films.\n\nWe're finishing the paperwork on our giving setup. As soon as it's open we'll write to you personally.\n\nIf you'd rather just talk, reply to this email.\n\n4est Films`,
    campaign: 'known-enquiry-ack',
  });
}
