import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../../lib/admin';
import { getEvent } from '../../../../lib/boxoffice-db';
import { buyersAt, waitlistAt } from '../../../../lib/boxoffice-report';
import { layout, send, SITE } from '../../../../lib/email';

export const prerender = false;

/**
 * One message to one stop's people.
 *
 *   buyers    everyone with a live seat — the morning-after thank-you, with
 *             the offering link, which is the cheapest marketing the tour
 *             will ever do.
 *   waitlist  everyone who wanted a seat and found none, when a second
 *             showing is added. Marked notified so they are not written to
 *             twice about the same thing.
 *
 * Transactional in nature — these people bought from us or asked us — so no
 * list-unsubscribe header, and no more than one of these per stop per
 * occasion. The cap is a safety rail, not a target.
 */
const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const f = await request.formData();
  const slug = String(f.get('slug') ?? '');
  const to = `/admin/boxoffice/report/?slug=${encodeURIComponent(slug)}`;
  const event = await getEvent(slug);
  if (!event) return back('/admin/boxoffice/');

  const audience = String(f.get('audience')) === 'waitlist' ? 'waitlist' : 'buyers';
  const subject = String(f.get('subject') ?? '').trim().slice(0, 150);
  const message = String(f.get('message') ?? '').trim().slice(0, 5000);
  if (!subject || !message) return back(`${to}&sent=empty`);

  const people =
    audience === 'waitlist'
      ? (await waitlistAt(event.id)).filter((w) => !w.notified_at).map((w) => ({ email: w.email, name: w.name, id: w.id }))
      : (await buyersAt(event.id)).map((b) => ({ ...b, id: 0 }));

  const cta =
    audience === 'buyers'
      ? { href: `${SITE}/boxoffice/give/${event.slug}/`, label: 'Make a free-will offering' }
      : { href: `${SITE}/boxoffice/${event.slug}/`, label: 'Get tickets' };

  const html = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  let sent = 0;
  const notified: number[] = [];
  for (const p of people.slice(0, 2000)) {
    const hello = p.name ? `${p.name.split(' ')[0]} —` : '';
    try {
      await send({
        to: p.email,
        subject,
        html: layout({
          preheader: message.slice(0, 120),
          heading: subject,
          body: (hello ? `<p style="margin:0 0 14px;">${esc(hello)}</p>` : '') + html,
          cta,
          footer: `${esc(event.venue)}, ${esc(event.city)} &middot; 4est Films &middot; Independent Film Production`,
        }),
        text: `${hello ? hello + '\n\n' : ''}${message}\n\n${cta.label}: ${cta.href}`,
        campaign: `boxoffice-${audience}-${event.slug}`,
      });
      sent++;
      if (p.id) notified.push(p.id);
    } catch (err) {
      console.error('notify send failed', { to: p.email, err });
    }
  }

  if (notified.length) {
    await env.DB.batch(
      notified.map((id) =>
        env.DB.prepare(`UPDATE bo_waitlist SET notified_at = datetime('now') WHERE id = ?1`).bind(id)
      )
    );
  }

  return back(`${to}&sent=${sent}&audience=${audience}`);
};
