import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { layout, send, SITE } from '../../lib/email';
import { isAdmin } from '../../lib/admin';

export const prerender = false;

/**
 * Send one campaign to the confirmed list.
 *
 * Resumable by design. A Worker cannot sit in a loop through ten thousand
 * sends, and "start again from the top" is not an acceptable retry when the
 * cost of a mistake is a duplicate in somebody's inbox. Every send is
 * written to `sends` with a UNIQUE (campaign, subscriber_id), so a repeat
 * call picks up exactly where the last one stopped.
 *
 *   curl -X POST https://4estfilms.studio/api/broadcast \
 *     -H "authorization: Bearer $ADMIN_TOKEN" \
 *     -H 'content-type: application/json' \
 *     -d '{"campaign":"hnim-trailer","subject":"The trailer is here.",
 *          "heading":"The trailer is here.",
 *          "body":"<p>...</p>","cta":{"href":"...","label":"Watch it"},
 *          "test":"you@example.com"}'
 *
 * Pass `test` to send a single copy to one address and record nothing.
 * Do that first, every time.
 *
 * Call it repeatedly until `remaining` is 0. Each call sends at most
 * `limit` (default 40, hard cap 80) — Cloudflare's per-message recipient
 * ceiling is 50 and each subscriber needs their own message anyway, since
 * the unsubscribe link is per-person.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

interface Body {
  campaign?: string;
  subject?: string;
  heading?: string;
  /** Trusted HTML — this endpoint is admin-only and the author is you. */
  body?: string;
  preheader?: string;
  cta?: { href: string; label: string };
  /** Restrict to people who signed up against one film. */
  film?: string;
  limit?: number;
  test?: string;
}

interface Sub {
  id: number;
  email: string;
  first_name: string | null;
  token: string;
}

const stripTags = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const POST: APIRoute = async ({ request, url }) => {
  // Bearer token or an admin session — isAdmin() only honours the cookie on
  // a same-origin request, because a cookie is ambient and a header is not.
  if (!(await isAdmin(request, url))) return json({ ok: false }, 404);

  const db = env.DB;
  if (!db) return json({ ok: false, error: 'unavailable' }, 503);

  let b: Body;
  try {
    b = (await request.json()) as Body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const campaign = (b.campaign ?? '').trim();
  const subject = (b.subject ?? '').trim();
  const heading = (b.heading ?? subject).trim();
  const bodyHtml = (b.body ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(campaign)) {
    return json({ ok: false, error: 'campaign must be a slug, e.g. hnim-trailer' }, 422);
  }
  if (!subject || !bodyHtml) return json({ ok: false, error: 'subject and body required' }, 422);

  const limit = Math.min(Math.max(Number(b.limit) || 40, 1), 80);

  const render = (s: Pick<Sub, 'first_name' | 'token'>) => {
    const greeting = s.first_name
      ? `<p style="margin:0 0 14px;">${s.first_name},</p>`
      : '';
    return layout({
      preheader: b.preheader ?? subject,
      heading,
      body: greeting + bodyHtml,
      cta: b.cta,
      footer: `You’re receiving this because you subscribed at 4estfilms.studio.<br>
               <a href="${SITE}/unsubscribe?t=${s.token}" style="color:#8b857a;">Unsubscribe</a>
               · 4est Films · Independent Film Production · Est. 2015`,
    });
  };

  // A test send goes nowhere near the sends table, so it can be repeated
  // and never consumes a real subscriber's slot.
  if (b.test) {
    try {
      const r = await send({
        to: b.test,
        subject,
        html: render({ first_name: 'Test', token: '0'.repeat(32) }),
        text: stripTags(bodyHtml),
        token: '0'.repeat(32),
        campaign,
      });
      return json({ ok: true, test: true, messageId: r.messageId });
    } catch (err) {
      return json({ ok: false, error: String((err as Error).message ?? err) }, 502);
    }
  }

  let batch: Sub[];
  let remaining = 0;
  try {
    const where = `confirmed_at IS NOT NULL AND unsubscribed_at IS NULL AND token IS NOT NULL
                   ${b.film ? 'AND film = ?2' : ''}
                   AND id NOT IN (SELECT subscriber_id FROM sends WHERE campaign = ?1)`;

    const sel = db.prepare(
      `SELECT id, email, first_name, token FROM subscribers WHERE ${where} ORDER BY id LIMIT ${limit}`
    );
    const cnt = db.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE ${where}`);

    const bind = (s: D1PreparedStatement) =>
      (b.film ? s.bind(campaign, b.film) : s.bind(campaign)) as D1PreparedStatement;

    const [rows, count] = await Promise.all([
      bind(sel).all<Sub>(),
      bind(cnt).first<{ n: number }>(),
    ]);
    batch = rows.results ?? [];
    remaining = count?.n ?? 0;
  } catch (err) {
    console.error('broadcast query failed', err);
    return json({ ok: false, error: 'query failed' }, 500);
  }

  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  // Serial, not Promise.all: a fan-out of forty concurrent sends is how you
  // trip a provider's rate limit and get the whole batch rejected.
  for (const s of batch) {
    try {
      const r = await send({
        to: s.email,
        subject,
        html: render(s),
        text: stripTags(bodyHtml) + `\n\nUnsubscribe: ${SITE}/unsubscribe?t=${s.token}`,
        token: s.token,
        campaign,
      });
      await db
        .prepare(
          `INSERT INTO sends (campaign, subscriber_id, message_id) VALUES (?1, ?2, ?3)
           ON CONFLICT(campaign, subscriber_id) DO NOTHING`
        )
        .bind(campaign, s.id, r.messageId)
        .run();
      sent++;
    } catch (err) {
      const message = String((err as Error).message ?? err).slice(0, 200);
      failures.push({ email: s.email, error: message });
      // Recorded as attempted so a resume does not retry it forever. Clear
      // the row by hand to try a specific address again.
      await db
        .prepare(
          `INSERT INTO sends (campaign, subscriber_id, error) VALUES (?1, ?2, ?3)
           ON CONFLICT(campaign, subscriber_id) DO NOTHING`
        )
        .bind(campaign, s.id, message)
        .run();
    }
  }

  return json({
    ok: true,
    campaign,
    sent,
    failed: failures.length,
    failures: failures.slice(0, 10),
    remaining: Math.max(0, remaining - batch.length),
    done: remaining - batch.length <= 0,
  });
};
