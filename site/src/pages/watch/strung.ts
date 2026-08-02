import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { premiere } from '../../lib/premiere';
import { page } from '../../lib/mailpage';

export const prerender = false;

/**
 * The film itself, behind a ticket.
 *
 * Rendered per request rather than as a static page with a gate bolted on,
 * because the ticket has to be checked before any of this is emitted — and
 * because the page arriving straight from Stripe has to wait for a webhook
 * that may not have landed yet.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ url }) => {
  const db = env.DB;
  const token = (url.searchParams.get('t') ?? '').trim();
  const fromStripe = url.searchParams.has('session');

  if (!db) return page({ heading: 'Unavailable.', body: 'Try again in a moment.', status: 503 });

  // Arriving from checkout with no ticket in the URL: the webhook is
  // probably still in flight. Say so rather than showing a dead end — the
  // email is the real delivery, and it is on its way.
  if (!token && fromStripe) {
    return page({
      heading: 'Thank you.',
      body: 'Your ticket is on its way to your inbox — it usually takes a few seconds. Open the link in that email to watch. Keep it: it is your ticket.',
      cta: { href: '/films/strung/', label: 'About the film' },
    });
  }

  if (!/^[a-f0-9]{32}$/.test(token)) {
    return page({
      heading: 'That link didn’t work.',
      body: 'It may have been broken across two lines by your mail client. Try copying the whole address from the email.',
      status: 404,
    });
  }

  const ticket = await db
    .prepare(
      `SELECT expires_at, revoked_at FROM tickets WHERE token = ?1 AND film = ?2`
    )
    .bind(token, premiere.film)
    .first<{ expires_at: string | null; revoked_at: string | null }>();

  const expired =
    ticket?.expires_at && Date.parse(ticket.expires_at.replace(' ', 'T') + 'Z') < Date.now();

  if (!ticket || ticket.revoked_at) {
    return page({
      heading: 'That link didn’t work.',
      body: 'Check that you copied the whole address from your email. If it still will not open, reply to that email and we will sort it out.',
      status: 404,
    });
  }
  if (expired) {
    return page({
      heading: 'That ticket has expired.',
      body: 'Reply to your ticket email and we will issue a new one — no second payment.',
      status: 410,
    });
  }

  const src = `/api/premiere/play?t=${esc(token)}`;
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Strung — 4est Films</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh; background: #0d1712; color: #f2ede3;
    display: grid; grid-template-rows: auto 1fr auto; gap: 1.5rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  }
  header, footer { padding: 1.5rem clamp(1rem, 4vw, 3rem); }
  header img { width: 92px; height: auto; display: block; }
  main { display: grid; place-items: center; padding-inline: clamp(0rem, 2vw, 3rem); }
  video { width: 100%; max-width: 1400px; aspect-ratio: 16/9; background: #000; display: block; }
  footer { font-size: .82rem; color: #8b857a; display: flex; flex-wrap: wrap; gap: .6rem 2rem; }
  footer a { color: #c4082e; }
  h1 { font: 400 1rem/1 'Iowan Old Style', Georgia, serif; margin: 0; }
</style>
</head><body>
  <header>
    <a href="/"><img src="/brand/4est-logo-bone.webp" width="1600" height="1316" alt="4est Films"></a>
  </header>
  <main>
    <h1 class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Strung</h1>
    <video controls playsinline preload="metadata" src="${src}"
           poster="/stills/strung/2020-12-17_CI4q_yUgNeX_01.jpg"></video>
  </main>
  <footer>
    <span>Strung (2019) · 4est Films. Your ticket is for you — please don’t share the link.</span>
    <span>Struggling? <a href="tel:18006624357">1-800-662-4357</a>, SAMHSA National Helpline.</span>
  </footer>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      // The page carries a ticket in its URL; keep it out of referer headers
      // sent to anywhere else.
      'referrer-policy': 'no-referrer',
    },
  });
};
