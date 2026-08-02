/**
 * Outbound mail, over Cloudflare Email Service.
 *
 * Everything the site sends is transactional or a broadcast to people who
 * confirmed, so every message carries a working List-Unsubscribe: Gmail and
 * Yahoo require it from bulk senders, and a list that is hard to leave is a
 * list that gets marked as spam instead.
 */

import { env } from 'cloudflare:workers';

export const SITE = 'https://4estfilms.studio';
export const FROM = { email: 'hello@4estfilms.studio', name: '4est Films' };

interface SendBinding {
  send(message: {
    to: string | { email: string; name?: string };
    from: string | { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string | { email: string; name?: string };
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

const binding = () => (env as unknown as { EMAIL?: SendBinding }).EMAIL;

export interface Outgoing {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Per-subscriber token; drives the unsubscribe headers. */
  token?: string;
  campaign?: string;
  /**
   * Where a reply should land. Defaults to the sending address, which is
   * right for anything we send to a subscriber. It is wrong for a message
   * we send to ourselves about somebody — hitting reply there should reach
   * them, not us.
   */
  replyTo?: string;
}

export async function send(msg: Outgoing): Promise<{ messageId: string }> {
  const EMAIL = binding();
  if (!EMAIL) throw new Error('EMAIL binding not configured');

  const headers: Record<string, string> = {};
  if (msg.token) {
    const url = `${SITE}/unsubscribe?t=${msg.token}`;
    headers['List-Unsubscribe'] = `<${url}>`;
    // One-click. Without the Post header the mail clients render their own
    // "report spam" affordance instead, which costs the whole domain.
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  if (msg.campaign) headers['X-Campaign-ID'] = msg.campaign;

  return EMAIL.send({
    to: msg.to,
    from: FROM,
    replyTo: msg.replyTo ?? FROM.email,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    headers: Object.keys(headers).length ? headers : undefined,
  });
}

/** 32 hex characters from the platform CSPRNG. */
export function newToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * House shell. Table-based and inline-styled because that is what mail
 * clients render; Outlook's engine is Word, and it does not do flexbox.
 */
export function layout(opts: {
  preheader: string;
  heading: string;
  body: string;
  cta?: { href: string; label: string };
  footer: string;
}): string {
  const { preheader, heading, body, cta, footer } = opts;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#08080a;color:#f2ede3;">
  <!-- shown in the inbox list next to the subject, then hidden -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#08080a;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;">
        <tr><td style="padding-bottom:28px;">
          <img src="${SITE}/brand/4est-logo-bone.webp" width="150" height="123" alt="4est Films"
               style="display:block;border:0;width:150px;height:auto;">
        </td></tr>
        <tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:30px;
                       line-height:1.15;color:#f2ede3;padding-bottom:20px;">${esc(heading)}</td></tr>
        <tr><td style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
                       font-size:16px;line-height:1.65;color:#b9b2a5;">${body}</td></tr>
        ${
          cta
            ? `<tr><td style="padding-top:30px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:#96001f;">
              <a href="${esc(cta.href)}"
                 style="display:inline-block;padding:15px 30px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
                        font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
                        color:#ffffff;text-decoration:none;">${esc(cta.label)}</a>
            </td></tr></table></td></tr>`
            : ''
        }
        <tr><td style="padding-top:40px;border-top:1px solid #23262b;margin-top:40px;
                       font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
                       font-size:12px;line-height:1.6;color:#6c675e;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function confirmEmail(token: string, name?: string | null) {
  const href = `${SITE}/confirm?t=${token}`;
  const hi = name ? `${name}, one` : 'One';
  return {
    subject: 'Confirm your email — 4est Films',
    html: layout({
      preheader: 'One click and you are on the list.',
      heading: 'One click and you’re on the list.',
      body: `<p style="margin:0 0 14px;">${esc(hi)} click and we’ll write to you when
             <em>His Name is Michael</em> has a date, a trailer, or a screening near you.</p>
             <p style="margin:0;">If you didn’t sign up, ignore this — nothing happens
             without the confirmation below, and we won’t write again.</p>`,
      cta: { href, label: 'Confirm subscription' },
      footer: `Or paste this into your browser:<br>
               <span style="color:#8b857a;word-break:break-all;">${href}</span><br><br>
               4est Films · Independent Film Production · Est. 2015`,
    }),
    text: `${hi} click and you're on the list.\n\nConfirm: ${href}\n\nIf you didn't sign up, ignore this — nothing happens without that link, and we won't write again.\n\n4est Films`,
  };
}

export function welcomeEmail(token: string, name?: string | null) {
  const hello = name ? `Thank you, ${name}.` : 'Thank you.';
  return {
    subject: 'You’re on the list — 4est Films',
    html: layout({
      preheader: 'One email when there is something real to say.',
      heading: hello,
      body: `<p style="margin:0 0 14px;">You’ll hear from us when there is something real
             to say — a trailer, a date, a screening. Not otherwise.</p>
             <p style="margin:0 0 14px;"><em>His Name is Michael</em> is a supernatural
             Western musical set in Virginia City, Nevada, and filmed entirely in South
             Dakota. It arrives late 2026.</p>
             <p style="margin:0;">Before it, there was <em>Strung</em> — twelve awards
             across eight festivals, and a premiere that raised money for people who
             could not afford addiction treatment.</p>`,
      cta: { href: `${SITE}/films/his-name-is-michael/`, label: 'See the film' },
      footer: `You’re receiving this because you subscribed at 4estfilms.studio.<br>
               <a href="${SITE}/unsubscribe?t=${token}" style="color:#8b857a;">Unsubscribe</a>
               · 4est Films · Independent Film Production · Est. 2015`,
    }),
    text: `${hello}\n\nYou'll hear from us when there is something real to say — a trailer, a date, a screening. Not otherwise.\n\nHis Name is Michael arrives late 2026.\n${SITE}/films/his-name-is-michael/\n\nUnsubscribe: ${SITE}/unsubscribe?t=${token}`,
  };
}
