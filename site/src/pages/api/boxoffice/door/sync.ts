import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { getEvent, getOffered, getProducts, recordOrder, soldAdmits } from '../../../../lib/boxoffice-db';
import { priceBasket, type BasketLine } from '../../../../lib/boxoffice';

export const prerender = false;

/**
 * Drains a door device's offline queue.
 *
 * Two kinds of thing come back from a night with no signal: people who were
 * checked in, and cash that was taken. Both are replayed until the server
 * confirms them, so every operation here has to be safe to receive twice.
 *
 *   check-ins  — idempotent by nature. First scan wins and keeps its
 *                timestamp; a replay reports "already in" rather than
 *                overwriting the time somebody actually walked through.
 *   cash sales — idempotent on the device's own offline_id, which is a
 *                UNIQUE column. The replay finds the existing order.
 *
 * Each entry is answered individually. One bad row must not strand the queue
 * behind it, or the device retries forever and the night is never reconciled.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

interface CheckinEntry {
  type: 'checkin';
  id: string;
  code: string;
  at: string;
  by?: string;
}
interface SaleEntry {
  type: 'cash';
  id: string;
  basket: BasketLine[];
  codes?: string[];
  buyer_name?: string;
  buyer_email?: string;
  at: string;
  by?: string;
}
type Entry = CheckinEntry | SaleEntry;

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return json({ ok: false }, 404);

  let body: { slug?: string; queue?: Entry[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  const event = await getEvent(String(body.slug ?? ''));
  if (!event) return json({ ok: false, error: 'No such stop.' }, 404);

  const queue = Array.isArray(body.queue) ? body.queue.slice(0, 500) : [];
  const db = env.DB;
  const results: Record<string, { ok: boolean; status: string; detail?: string }> = {};

  const [products, offered] = await Promise.all([getProducts(), getOffered(event.id)]);

  for (const entry of queue) {
    // Captured before the type narrows away inside the branches below.
    const entryId = String((entry as { id?: string })?.id ?? '');
    if (!entryId) continue;
    try {
      if (entry.type === 'checkin') {
        const code = String(entry.code ?? '').toUpperCase();
        const t = await db
          .prepare(
            `SELECT code, checked_in_at, void_at FROM bo_tickets WHERE code = ?1 AND event_id = ?2`
          )
          .bind(code, event.id)
          .first<{ code: string; checked_in_at: string | null; void_at: string | null }>();

        if (!t) { results[entry.id] = { ok: false, status: 'unknown' }; continue; }
        if (t.void_at) { results[entry.id] = { ok: false, status: 'void' }; continue; }
        if (t.checked_in_at) {
          results[entry.id] = { ok: true, status: 'already', detail: t.checked_in_at };
          continue;
        }

        // The device's own timestamp, not the server's: it is when the person
        // actually walked in, which is the thing a door report is about.
        await db
          .prepare(
            `UPDATE bo_tickets SET checked_in_at = ?1, checked_in_by = ?2
              WHERE code = ?3 AND checked_in_at IS NULL`
          )
          .bind(entry.at, entry.by ?? null, code)
          .run();
        results[entry.id] = { ok: true, status: 'in' };
        continue;
      }

      if (entry.type === 'cash') {
        const priced = priceBasket(
          Array.isArray(entry.basket) ? entry.basket : [],
          products,
          offered,
          null
        );
        if (priced.error) {
          results[entry.id] = { ok: false, status: 'unpriceable', detail: priced.error };
          continue;
        }

        // Capacity is checked but never blocks a sale that already happened:
        // the money is in the cash box and the person is in the building.
        // Overselling is reported, not undone.
        const sold = await soldAdmits(event.id);
        const over = sold + priced.admits > event.capacity;

        const rec = await recordOrder({
          event,
          lines: priced.lines,
          subtotal_cents: priced.subtotal_cents,
          discount_cents: 0,
          total_cents: priced.total_cents,
          fee_cents: 0, // cash costs nothing to take
          promo_code: null,
          channel: 'door_cash',
          buyer_name: entry.buyer_name ?? null,
          buyer_email: entry.buyer_email ?? null,
          operator: entry.by ?? null,
          offline_id: entry.id,
          ticket_codes: entry.codes,
        });

        results[entry.id] = {
          ok: true,
          status: rec.duplicate ? 'already' : 'recorded',
          detail: over ? 'over capacity' : undefined,
        };
        continue;
      }

      results[entryId] = { ok: false, status: 'unknown-type' };
    } catch (err) {
      console.error('door sync entry failed', { id: entryId, err });
      // Left un-acknowledged on purpose so the device keeps it and tries again.
      results[entryId] = { ok: false, status: 'retry' };
    }
  }

  const sold = await soldAdmits(event.id);
  const inside = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM bo_tickets
        WHERE event_id = ?1 AND checked_in_at IS NOT NULL AND void_at IS NULL`
    )
    .bind(event.id)
    .first<{ n: number }>();

  return json({ ok: true, results, sold, inside: inside?.n ?? 0, capacity: event.capacity });
};
