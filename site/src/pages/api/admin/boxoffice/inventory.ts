import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';

export const prerender = false;

/**
 * Set stock counts by hand.
 *
 * Absolute values, not adjustments: this screen gets used after somebody has
 * physically counted a box in a lobby, and "what I can see is forty" is the
 * thing they know.
 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const db = env.DB;
  const stmts: D1PreparedStatement[] = [];

  for (const [key, raw] of f.entries()) {
    const m = key.match(/^on_hand\[(.+?)\|(.*)\]$/);
    if (!m) continue;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) continue;
    stmts.push(
      db.prepare(`UPDATE bo_inventory SET on_hand = ?1 WHERE sku = ?2 AND size = ?3`)
        .bind(n, m[1], m[2])
    );
    const low = f.get(`low_at[${m[1]}|${m[2]}]`);
    if (low !== null) {
      const l = Math.max(0, Math.round(Number(low) || 0));
      stmts.push(
        db.prepare(`UPDATE bo_inventory SET low_at = ?1 WHERE sku = ?2 AND size = ?3`)
          .bind(l, m[1], m[2])
      );
    }
  }

  if (stmts.length) await db.batch(stmts);
  return new Response(null, { status: 303, headers: { location: '/admin/boxoffice/inventory/' } });
};
