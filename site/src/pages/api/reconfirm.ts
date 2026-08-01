import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { confirmEmail, send } from '../../lib/email';

export const prerender = false;

/**
 * Send the confirmation to people who signed up before there was any way to
 * send it.
 *
 * The list already contains addresses collected in good faith that have
 * never received anything. Broadcasting to them cold would be the worst
 * possible first impression and the fastest way to get the domain filtered:
 * nobody remembers signing up months ago, so they hit "spam" rather than
 * "unsubscribe". This asks first.
 *
 *   curl -X POST -H "authorization: Bearer $ADMIN_TOKEN" \
 *        https://4estfilms.studio/api/reconfirm
 *
 * Paged like the broadcast — call until `remaining` is 0. Anyone who has
 * been sent one in the last 24 hours is skipped, so repeating the call is
 * safe and does not mean a second copy.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const constantTimeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

interface Sub {
  id: number;
  email: string;
  first_name: string | null;
  token: string;
}

const WHERE = `confirmed_at IS NULL
               AND unsubscribed_at IS NULL
               AND token IS NOT NULL
               AND (confirm_sent_at IS NULL
                    OR confirm_sent_at < datetime('now', '-1 day'))`;

export const POST: APIRoute = async ({ request }) => {
  const secret = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  const offered = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secret || !offered || !constantTimeEqual(secret, offered)) return json({ ok: false }, 404);

  const db = env.DB;
  if (!db) return json({ ok: false, error: 'unavailable' }, 503);

  let limit = 40;
  try {
    const b = (await request.json().catch(() => ({}))) as { limit?: number };
    limit = Math.min(Math.max(Number(b.limit) || 40, 1), 80);
  } catch {
    /* body is optional */
  }

  let batch: Sub[] = [];
  let remaining = 0;
  try {
    const [rows, count] = await Promise.all([
      db
        .prepare(
          `SELECT id, email, first_name, token FROM subscribers
            WHERE ${WHERE} ORDER BY id LIMIT ${limit}`
        )
        .all<Sub>(),
      db.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE ${WHERE}`).first<{ n: number }>(),
    ]);
    batch = rows.results ?? [];
    remaining = count?.n ?? 0;
  } catch (err) {
    console.error('reconfirm query failed', err);
    return json({ ok: false, error: 'query failed' }, 500);
  }

  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (const s of batch) {
    try {
      const mail = confirmEmail(s.token, s.first_name);
      await send({ to: s.email, token: s.token, campaign: 'reconfirm', ...mail });
      // Stamped whether or not they act on it — this is the rate limit, not
      // a record of consent. Consent is confirmed_at.
      await db
        .prepare(`UPDATE subscribers SET confirm_sent_at = datetime('now') WHERE id = ?1`)
        .bind(s.id)
        .run();
      sent++;
    } catch (err) {
      failures.push({ email: s.email, error: String((err as Error).message ?? err).slice(0, 200) });
    }
  }

  return json({
    ok: true,
    sent,
    failed: failures.length,
    failures: failures.slice(0, 10),
    remaining: Math.max(0, remaining - sent),
    done: remaining - sent <= 0,
  });
};
