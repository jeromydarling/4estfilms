/**
 * The small standalone pages a mail link lands on.
 *
 * Not an Astro page: confirm and unsubscribe are dynamic routes that run per
 * request, and rendering a full layout — nav, footer, fonts, the intro sting
 * — for a sentence of text would be slower and louder than the moment needs.
 * Styles are inline for the same reason: one response, no second request.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function page(opts: {
  heading: string;
  body: string;
  cta?: { href: string; label: string };
  status?: number;
}): Response {
  const { heading, body, cta, status = 200 } = opts;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)} — 4est Films</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh; display: grid; place-content: center;
    gap: 1.5rem; padding: clamp(1.5rem, 6vw, 5rem); text-align: center;
    background: #08080a; color: #f2ede3; line-height: 1.6;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  }
  img { width: min(180px, 46vw); height: auto; margin: 0 auto 1rem; }
  h1 {
    font-family: 'Iowan Old Style', Georgia, serif; font-weight: 400;
    font-size: clamp(2rem, 6vw, 3.2rem); line-height: 1.05;
    letter-spacing: -.02em; margin: 0; text-wrap: balance;
  }
  p { margin: 0 auto; max-width: 46ch; color: #b9b2a5; }
  a.cta {
    justify-self: center; margin-top: .5rem; padding: .9rem 1.7rem;
    border: 1px solid #23262b; color: #f2ede3; text-decoration: none;
    font-size: .74rem; font-weight: 500; letter-spacing: .2em; text-transform: uppercase;
    transition: border-color .4s, color .4s;
  }
  a.cta:hover, a.cta:focus-visible { border-color: #c4082e; color: #c4082e; }
  .vignette {
    position: fixed; inset: 0; pointer-events: none;
    background: radial-gradient(120% 90% at 50% 45%, transparent 40%, rgba(0,0,0,.55) 100%);
  }
</style>
</head><body>
  <div class="vignette" aria-hidden="true"></div>
  <img src="/brand/4est-logo-bone.webp" width="1600" height="1316" alt="4est Films">
  <h1>${esc(heading)}</h1>
  <p>${esc(body)}</p>
  ${cta ? `<a class="cta" href="${esc(cta.href)}">${esc(cta.label)}</a>` : ''}
</body></html>`;

  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
