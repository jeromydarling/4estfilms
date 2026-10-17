import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { stock, stopTotals } from '../../../../lib/boxoffice-report';
import { money, showTime } from '../../../../lib/boxoffice';
import { layout, send, FROM, SITE } from '../../../../lib/email';

export const prerender = false;

/**
 * The morning email. What sold yesterday, which upcoming stops are soft,
 * who is still owed money, who is waiting for a seat, what is running low.
 *
 * Fired by a GitHub Actions cron with the admin bearer token — the same
 * token that already guards /api/stats — so there is no second scheduler
 * to look after. Sent to DIGEST_TO, or the house address.
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return json({ ok: false }, 404);

  const db = env.DB;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const [sales, gifts, stops, low, waiting] = await Promise.all([
    db
      .prepare(
        `SELECT e.venue, e.city, COUNT(*) AS orders, SUM(o.total_cents) AS gross,
                (SELECT COUNT(*) FROM bo_tickets t WHERE t.order_id IN
                   (SELECT id FROM bo_orders WHERE event_id = e.id AND created_at LIKE ?1)) AS seats
           FROM bo_orders o JOIN bo_events e ON e.id = o.event_id
          WHERE o.created_at LIKE ?1 AND o.status = 'paid'
          GROUP BY e.id ORDER BY gross DESC`
      )
      .bind(`${yesterday}%`)
      .all<{ venue: string; city: string; orders: number; gross: number; seats: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM bo_offerings WHERE created_at LIKE ?1`)
      .bind(`${yesterday}%`)
      .first<{ n: number; cents: number }>(),
    stopTotals(),
    stock(),
    db
      .prepare(
        `SELECT e.venue, COUNT(*) AS n FROM bo_waitlist w JOIN bo_events e ON e.id = w.event_id
          WHERE w.notified_at IS NULL GROUP BY e.id ORDER BY n DESC`
      )
      .all<{ venue: string; n: number }>(),
  ]);

  const soft = stops.filter(
    (s) => s.starts_at.slice(0, 10) >= today && s.starts_at.slice(0, 10) <= horizon && s.capacity > 0
  );
  const owed = stops.filter((s) => s.starts_at.slice(0, 10) < today && s.parish_due_cents > 0);
  const lowStock = low.filter((l) => l.low);

  const li = (items: string[]) =>
    items.length ? `<ul style="margin:0 0 18px;padding-left:18px;">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';
  const h = (t: string) => `<p style="margin:0 0 6px;font-weight:600;color:#f2ede3;">${t}</p>`;

  const salesRows = sales.results ?? [];
  const yGross = salesRows.reduce((n, r) => n + Number(r.gross), 0);
  const ySeats = salesRows.reduce((n, r) => n + Number(r.seats), 0);

  const body =
    h(`Yesterday — ${money(yGross)}, ${ySeats} seats, ${salesRows.length ? salesRows.length + ' stops' : 'nothing sold'}`) +
    li(salesRows.map((r) => `${esc(r.venue)}, ${esc(r.city)}: ${r.seats} seats · ${money(Number(r.gross))}`)) +
    (gifts && gifts.n ? h(`Offerings yesterday — ${gifts.n}, ${money(gifts.cents)}`) + '<p style="margin:0 0 18px;"></p>' : '') +
    h(`Next 14 days — ${soft.length} ${soft.length === 1 ? 'stop' : 'stops'}`) +
    li(
      soft.map((s) => {
        const pct = Math.round((s.attendees / s.capacity) * 100);
        const flag = pct < 50 ? ' — <strong style="color:#e8c98a;">soft</strong>' : '';
        return `${esc(s.venue)}, ${esc(s.city)} · ${showTime(s.starts_at)}: ${s.attendees}/${s.capacity} (${pct}%)${flag}`;
      })
    ) +
    (owed.length
      ? h(`Still owed — ${money(owed.reduce((n, s) => n + s.parish_due_cents, 0))} to ${owed.length} ${owed.length === 1 ? 'parish' : 'parishes'}`) +
        li(owed.map((s) => `${esc(s.venue)}, ${esc(s.city)}: ${money(s.parish_due_cents)}`))
      : '') +
    ((waiting.results ?? []).length
      ? h('Waiting for a seat') + li((waiting.results ?? []).map((w) => `${esc(w.venue)}: ${w.n}`))
      : '') +
    (lowStock.length
      ? h('Low stock') + li(lowStock.map((l) => `${l.sku}${l.size ? ' ' + l.size : ''}: ${l.on_hand} left`))
      : '');

  const to = (env as unknown as { DIGEST_TO?: string }).DIGEST_TO || FROM.email;
  try {
    await send({
      to,
      subject: `Box office — ${yesterday}: ${money(yGross)}, ${ySeats} seats`,
      html: layout({
        preheader: `${money(yGross)} yesterday across ${salesRows.length} stops.`,
        heading: 'The morning box office',
        body,
        cta: { href: `${SITE}/admin/boxoffice/`, label: 'Open the box office' },
        footer: '4est Films · sent by the daily digest',
      }),
      text:
        `Yesterday: ${money(yGross)}, ${ySeats} seats\n` +
        salesRows.map((r) => `- ${r.venue}, ${r.city}: ${r.seats} seats, ${money(Number(r.gross))}`).join('\n') +
        `\n\nNext 14 days:\n` +
        soft.map((s) => `- ${s.venue}: ${s.attendees}/${s.capacity}`).join('\n') +
        (owed.length ? `\n\nStill owed:\n` + owed.map((s) => `- ${s.venue}: ${money(s.parish_due_cents)}`).join('\n') : ''),
      campaign: 'boxoffice-digest',
    });
  } catch (err) {
    console.error('digest send failed', err);
    return json({ ok: false, error: 'send failed' }, 502);
  }

  return json({ ok: true, to, yesterday, gross_cents: yGross, seats: ySeats, soft: soft.length, owed: owed.length });
};
