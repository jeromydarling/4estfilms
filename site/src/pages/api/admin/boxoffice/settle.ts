import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { getEvent } from '../../../../lib/boxoffice-db';
import { toCents } from './event';

export const prerender = false;

/**
 * Record money going out: the tithe cheque, the offering handed over, the
 * rental paid to the house. The report already says what is owed; this is
 * the other column.
 */
const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });
const KINDS = ['tithe', 'offering', 'rental'];

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const slug = String(f.get('slug') ?? '');
  const to = `/admin/boxoffice/report/?slug=${encodeURIComponent(slug)}`;
  const event = await getEvent(slug);
  if (!event) return back('/admin/boxoffice/');

  const db = env.DB;
  if (String(f.get('action')) === 'delete') {
    await db
      .prepare(`DELETE FROM bo_settlements WHERE id = ?1 AND event_id = ?2`)
      .bind(Number(f.get('id')), event.id)
      .run();
    return back(`${to}&settled=removed`);
  }

  const kind = String(f.get('kind') ?? '');
  const amount = toCents(f.get('amount'));
  if (!KINDS.includes(kind) || amount <= 0) return back(`${to}&settled=bad`);

  const paidAt = String(f.get('paid_at') ?? '').trim();
  const method = String(f.get('method') ?? '').trim().slice(0, 40) || null;
  const note = String(f.get('note') ?? '').trim().slice(0, 300) || null;

  await db
    .prepare(
      `INSERT INTO bo_settlements (event_id, kind, amount_cents, paid_at, method, note)
       VALUES (?1, ?2, ?3, COALESCE(NULLIF(?4, ''), date('now')), ?5, ?6)`
    )
    .bind(event.id, kind, amount, /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? paidAt : '', method, note)
    .run();

  return back(`${to}&settled=done`);
};
