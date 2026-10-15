import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { toCents } from './event';

export const prerender = false;

/** Issue, amend or retire a partner code. */
const back = () => new Response(null, { status: 303, headers: { location: '/admin/boxoffice/codes/' } });

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const db = env.DB;
  const action = String(f.get('action') ?? 'save');

  if (action === 'toggle') {
    await db
      .prepare(`UPDATE bo_promo_codes SET active = 1 - active WHERE id = ?1`)
      .bind(Number(f.get('id')))
      .run();
    return back();
  }

  const code = String(f.get('code') ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);
  const partner = String(f.get('partner') ?? '').trim().slice(0, 120);
  if (!code || !partner) return back();

  const kind = ['none', 'percent', 'fixed'].includes(String(f.get('kind'))) ? String(f.get('kind')) : 'none';
  // A percentage is points; a fixed discount is money. Reading both out of
  // one box with one rule is how a $10 code becomes a 1000% one.
  const rawValue = String(f.get('value') ?? '').trim();
  const value = kind === 'percent'
    ? Math.max(0, Math.min(100, Math.round(Number(rawValue) || 0)))
    : kind === 'fixed' ? toCents(rawValue) : 0;

  const eventSlug = String(f.get('event_slug') ?? '').trim();
  const eventId = eventSlug
    ? (await db.prepare(`SELECT id FROM bo_events WHERE slug = ?1`).bind(eventSlug).first<{ id: number }>())?.id ?? null
    : null;

  const maxRaw = String(f.get('max_uses') ?? '').trim();
  const maxUses = maxRaw ? Math.max(1, Math.round(Number(maxRaw) || 0)) : null;

  await db
    .prepare(
      `INSERT INTO bo_promo_codes (code, partner, event_id, kind, value, max_uses)
       VALUES (?1,?2,?3,?4,?5,?6)
       ON CONFLICT(code) DO UPDATE SET
         partner=excluded.partner, event_id=excluded.event_id,
         kind=excluded.kind, value=excluded.value, max_uses=excluded.max_uses`
    )
    .bind(code, partner, eventId, kind, value, maxUses)
    .run();

  return back();
};
