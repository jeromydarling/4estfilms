import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { showTime } from '../../../../lib/boxoffice';
import { layout, send, SITE } from '../../../../lib/email';

export const prerender = false;

/**
 * The countdown. Buyers hear from us four times as a show approaches:
 * two weeks out, one week, three days, and the day before. Each email
 * carries their ticket codes again, because the email is the ticket and
 * inboxes are where tickets go to be lost.
 *
 * Fired daily by a GitHub Actions cron with the admin bearer, the same
 * alarm clock the morning digest uses. One row in bo_reminders per order
 * per threshold, so a re-run on the same day sends nothing twice. A buyer
 * who purchases inside a threshold simply starts at the next one.
 *
 * POST { "dry": true } reports what would be sent without sending it.
 */

const THRESHOLDS = [14, 7, 3, 1] as const;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface EventRow {
  id: number;
  slug: string;
  title: string;
  venue: string;
  city: string;
  region: string | null;
  starts_at: string;
  doors_at: string | null;
}

/** Whole days from the venue-local today to the venue-local show date. */
function daysUntil(startsAt: string, nowMs: number): number {
  const m = /([+-]\d{2}):(\d{2})$/.exec(startsAt);
  const offsetMin = m
    ? (m[1].startsWith('-') ? -1 : 1) * (Math.abs(Number(m[1])) * 60 + Number(m[2]))
    : 0;
  const local = new Date(nowMs + offsetMin * 60_000);
  const [sy, sm, sd] = startsAt.slice(0, 10).split('-').map(Number);
  const show = Date.UTC(sy, sm - 1, sd);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return Math.round((show - today) / 86_400_000);
}

const HEADINGS: Record<number, string> = {
  14: 'Two weeks to go.',
  7: 'One week to go.',
  3: 'Three days to go.',
  1: 'Tomorrow night.',
};

const SUBJECTS: Record<number, string> = {
  14: 'Two weeks to go',
  7: 'One week to go',
  3: 'Three days to go',
  1: 'Tomorrow',
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return json({ ok: false }, 404);

  let dry = false;
  try {
    const body = (await request.json()) as { dry?: boolean };
    dry = body?.dry === true;
  } catch {
    /* no body is a live run */
  }

  const db = env.DB;
  const now = Date.now();

  const ev = await db
    .prepare(
      `SELECT id, slug, title, venue, city, region, starts_at, doors_at
         FROM bo_events WHERE status IN ('on_sale', 'closed') ORDER BY starts_at`
    )
    .all<EventRow>();
  const events = ev.results ?? [];

  let sent = 0;
  let wouldSend = 0;
  const detail: { event: string; days: number; sent: number }[] = [];

  for (const event of events) {
    const days = daysUntil(event.starts_at, now);
    if (!THRESHOLDS.includes(days as (typeof THRESHOLDS)[number])) continue;

    const orders = await db
      .prepare(
        `SELECT o.id, o.buyer_name, o.buyer_email
           FROM bo_orders o
          WHERE o.event_id = ?1 AND o.status = 'paid'
            AND o.buyer_email IS NOT NULL AND o.buyer_email <> ''
            AND NOT EXISTS (
              SELECT 1 FROM bo_reminders r
               WHERE r.event_id = o.event_id AND r.order_id = o.id AND r.threshold_days = ?2
            )
          ORDER BY o.id`
      )
      .bind(event.id, days)
      .all<{ id: number; buyer_name: string | null; buyer_email: string }>();

    let eventSent = 0;
    for (const order of orders.results ?? []) {
      const tix = await db
        .prepare(
          `SELECT code FROM bo_tickets WHERE order_id = ?1 AND void_at IS NULL ORDER BY seq`
        )
        .bind(order.id)
        .all<{ code: string }>();
      const codes = (tix.results ?? []).map((t) => t.code);
      if (!codes.length) continue;

      wouldSend++;
      if (dry) continue;

      await sendReminder({
        to: order.buyer_email,
        name: order.buyer_name,
        codes,
        event,
        days,
      });
      await db
        .prepare(
          `INSERT INTO bo_reminders (event_id, order_id, buyer_email, threshold_days)
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(event.id, order.id, order.buyer_email, days)
        .run();
      sent++;
      eventSent++;
    }
    detail.push({ event: event.slug, days, sent: dry ? 0 : eventSent });
  }

  return json({ ok: true, dry, events_checked: events.length, would_send: wouldSend, sent, detail });
};

async function sendReminder(t: {
  to: string;
  name: string | null;
  codes: string[];
  event: EventRow;
  days: number;
}) {
  const { event, days } = t;
  const city = `${event.city}${event.region ? `, ${event.region}` : ''}`;
  const first = t.name?.split(' ')[0];
  const hello = first ? `${HEADINGS[days].replace('.', '')}, ${esc(first)}.` : HEADINGS[days];
  const when = showTime(event.starts_at);
  const doors = event.doors_at ? showTime(event.doors_at) : null;

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
    subject: `${SUBJECTS[days]} — ${event.title}, ${event.city}`,
    html: layout({
      preheader: `${event.venue}, ${when}. Your ${t.codes.length === 1 ? 'ticket is' : 'tickets are'} in this email.`,
      heading: hello,
      body:
        `<p style="margin:0 0 6px;"><strong>${esc(event.venue)}</strong><br>${esc(city)}</p>` +
        `<p style="margin:0 0 4px;">${when}</p>` +
        (doors ? `<p style="margin:0 0 14px;color:#8b857a;">Doors ${doors}</p>` : '') +
        tickets +
        `<p style="margin:0;color:#8b857a;">Show a code at the door, on your phone or printed. ` +
        `If your battery dies we can find you by name.</p>`,
      footer: `4est Films &middot; Independent Film Production &middot; Est. 2015`,
    }),
    text:
      `${hello}\n\n${event.venue}\n${city}\n${when}\n` +
      (doors ? `Doors ${doors}\n` : '') +
      `\nTicket codes:\n${t.codes.join('\n')}\n\n` +
      `Show a code at the door. If your battery dies we can find you by name.`,
    campaign: 'boxoffice-reminder',
  });
}
