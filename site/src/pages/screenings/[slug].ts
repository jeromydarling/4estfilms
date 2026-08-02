import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { screenings, progress } from '../../lib/screenings';
import { placeLabel } from '../../lib/place';
import { hnim } from '../../data/site';
import { page as notice } from '../../lib/mailpage';

export const prerender = false;

// Takes unknown, not string: half the values interpolated below are counts,
// and a signature that rejects them just invites `String(...)` noise at
// every call site — or worse, an unescaped one.
const esc = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SITE = 'https://4estfilms.studio';

/**
 * A city's own page.
 *
 * This is the thing that gets shared, so it is rendered per request with
 * live numbers rather than built ahead — a counter that is hours stale is
 * worse than no counter. It carries its own share card metadata for the
 * same reason: the number in the preview is the recruiting pitch.
 */
export const GET: APIRoute = async ({ params }) => {
  const db = env.DB;
  const slug = (params.slug ?? '').toLowerCase();

  if (!db) return notice({ heading: 'Unavailable.', body: 'Try again in a moment.', status: 503 });
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) {
    return notice({
      heading: 'No such city.',
      body: 'Check the link, or add your city from the screenings page.',
      cta: { href: '/screenings/', label: 'Screenings' },
      status: 404,
    });
  }

  const city = await db
    .prepare(
      `SELECT id, slug, city, region, country, status FROM screening_cities WHERE slug = ?1`
    )
    .bind(slug)
    .first<{ id: number; slug: string; city: string; region: string | null; country: string; status: string }>();

  if (!city) {
    return notice({
      heading: 'No one has asked here yet.',
      body: 'This city has no requests on it. You can be the first from the screenings page.',
      cta: { href: '/screenings/', label: 'Ask for a screening' },
      status: 404,
    });
  }

  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS requests, COALESCE(SUM(willing_to_host), 0) AS hosts
         FROM screening_requests WHERE city_id = ?1`
    )
    .bind(city.id)
    .first<{ requests: number; hosts: number }>();

  const venues = await db
    .prepare(
      `SELECT name, address, website, note, source_url
         FROM venue_leads WHERE city_id = ?1 ORDER BY id LIMIT 6`
    )
    .bind(city.id)
    .all<{ name: string; address: string | null; website: string | null; note: string | null; source_url: string | null }>();

  const label = placeLabel(city);
  const requests = counts?.requests ?? 0;
  const hosts = counts?.hosts ?? 0;
  const pct = Math.round(progress(requests) * 100);
  const url = `${SITE}/screenings/${city.slug}/`;
  const leads = venues.results ?? [];

  // The letter. Pre-written because "email a cinema" is a much bigger ask
  // than it sounds — most people stall on the first sentence — and because
  // the number in it is the argument.
  //
  // Until the number is an argument, it is left out. A letter that opens
  // "3 people have asked" makes the case against itself, and a seeded city
  // sitting at zero would otherwise generate one saying nobody has.
  const DEMAND_WORTH_STATING = 10;
  const demand =
    requests >= DEMAND_WORTH_STATING
      ? `${requests} people in ${label} have asked for a screening here through the film's website, and I've offered to help organise it.`
      : `I've offered to help organise it locally, and there's a page collecting names in ${label}: ${url}`;

  const letter = `Subject: One-night screening enquiry — His Name is Michael (2026)

Hello,

I'm writing to ask whether you would consider a one-night screening of an independent feature called His Name is Michael — a supernatural Western musical from 4est Films, set in Virginia City, Nevada and filmed entirely in South Dakota.

${demand}

The company's previous film, Strung, won twelve awards across eight festivals, and its premiere raised funds for addiction recovery.

Would you be open to a conversation about a four-wall rental or a community screening slot? I'm happy to work around your calendar, and 4est Films can supply a DCP, press materials and artwork.

Film and press kit: ${SITE}/press/
Our city's page: ${url}

Thank you for your time,
`;

  const statusLine =
    city.status === 'scheduled' ? 'A screening is being scheduled.'
    : city.status === 'screened' ? 'This city has had its screening.'
    : city.status === 'venue_found' ? 'A venue has been found. Details soon.'
    : hosts > 0 ? `${hosts} ${hosts === 1 ? 'person has' : 'people have'} offered to organise it.`
    : 'No one has offered to organise it yet.';

  const html = `<!doctype html>
<html lang="en" data-world="frontier"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(label)} — ${esc(requests)} asking for His Name is Michael</title>
<meta name="description" content="${esc(requests)} ${requests === 1 ? 'person has' : 'people have'} asked for a screening of His Name is Michael in ${esc(label)}. Add your name, or offer to organise it.">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(requests)} ${requests === 1 ? 'person is' : 'people are'} asking for this in ${esc(label)}">
<meta property="og:description" content="His Name is Michael plays where people ask for it. Add your name.">
<meta property="og:image" content="${SITE}/og/hnim.jpg">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og/hnim.jpg">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root{color-scheme:dark;--ink:#08080a;--bone:#f2ede3;--bone-dim:#b9b2a5;--bone-faint:#6c675e;
        --rule:#23262b;--blood:#96001f;--blood-lift:#c4082e;--night:#0b1118;--lantern:#d9a441;
        --ease:cubic-bezier(.22,1,.36,1);--pad:clamp(1.25rem,5vw,5rem)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--night);color:var(--bone);line-height:1.65;
       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
  .wrap{padding-inline:var(--pad);margin-inline:auto;max-width:1100px}
  header{padding:1.6rem 0}
  header img{width:88px;height:auto;display:block}
  h1{font-family:'Iowan Old Style',Georgia,serif;font-weight:400;letter-spacing:-.02em;
     font-size:clamp(2.4rem,7vw,4.5rem);line-height:1;margin:0}
  h2{font-family:'Iowan Old Style',Georgia,serif;font-weight:400;font-size:1.5rem;margin:0 0 1rem}
  .eyebrow{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.68rem;letter-spacing:.22em;
           text-transform:uppercase;color:var(--bone-faint);margin:0 0 1rem}
  .accent{color:var(--blood-lift)}
  .hero{padding:clamp(2rem,6vw,4rem) 0 clamp(2.5rem,6vw,4rem)}
  .count{display:flex;align-items:baseline;gap:.7rem;margin:1.8rem 0 .8rem;flex-wrap:wrap}
  .count b{font-family:'Iowan Old Style',Georgia,serif;font-weight:400;
           font-size:clamp(3rem,10vw,5rem);line-height:1;color:var(--blood-lift)}
  .count span{color:var(--bone-dim)}
  .count__none{font-family:'Iowan Old Style',Georgia,serif;font-size:clamp(1.3rem,3.4vw,1.9rem);
               color:var(--bone)}
  .bar{height:3px;background:var(--rule);margin:1rem 0 .8rem}
  .bar i{display:block;height:100%;background:var(--blood);width:${pct}%}
  .status{font-size:.92rem;color:var(--bone-dim);margin:0}
  section{padding-block:clamp(2rem,5vw,3.5rem);border-top:1px solid var(--rule)}
  .btn{display:inline-block;background:var(--blood);color:#fff;text-decoration:none;
       padding:.95rem 1.6rem;font-size:.74rem;font-weight:600;letter-spacing:.2em;
       text-transform:uppercase;border:0;cursor:pointer;font-family:inherit}
  .btn--ghost{background:transparent;border:1px solid var(--rule);color:var(--bone)}
  .btn--ghost:hover{border-color:var(--blood-lift);color:var(--blood-lift)}
  .actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:1.6rem}
  .venues{list-style:none;margin:1.5rem 0 0;padding:0;display:grid;gap:1px;background:var(--rule);
          border:1px solid var(--rule)}
  .venues li{background:var(--night);padding:1.3rem 1.4rem}
  .venues h3{margin:0 0 .3rem;font-family:'Iowan Old Style',Georgia,serif;font-weight:400;font-size:1.2rem}
  .venues p{margin:.3rem 0 0;font-size:.9rem;color:var(--bone-dim)}
  .venues a{color:var(--blood-lift)}
  .caveat{font-size:.82rem;color:var(--bone-faint);margin-top:1.2rem;max-width:60ch}
  textarea{width:100%;min-height:19rem;background:#0e141b;color:var(--bone-dim);
           border:1px solid var(--rule);padding:1.2rem;font:inherit;font-size:.86rem;
           line-height:1.6;resize:vertical}
  footer{border-top:1px solid var(--rule);padding:2rem 0 3rem;font-size:.82rem;color:var(--bone-faint)}
  footer a{color:var(--bone-dim)}
  .copied{font-size:.8rem;color:var(--blood-lift);margin-left:.8rem}
</style>
</head><body>
<div class="wrap">
  <header><a href="/"><img src="/brand/4est-logo-bone.webp" width="1600" height="1316" alt="4est Films"></a></header>

  <div class="hero">
    <p class="eyebrow accent">Community screening</p>
    <h1>${esc(label)}</h1>
    <div class="count">
      ${
        requests === 0
          ? `<span class="count__none">No one has asked here yet. Be the first.</span>`
          : `<b>${requests}</b>
             <span>${requests === 1 ? 'person has' : 'people have'} asked for
             <em>${esc(hnim.title)}</em> here</span>`
      }
    </div>
    <div class="bar"><i></i></div>
    <p class="status">${esc(screenings.threshold)} is where we start working a city. ${esc(statusLine)}</p>
    <div class="actions">
      <a class="btn" href="/screenings/#sc-city">Add your name</a>
      <button class="btn btn--ghost" data-share data-url="${url}">Share this page</button>
    </div>
  </div>

  <section>
    <h2>Venues worth asking</h2>
    ${
      leads.length
        ? `<ul class="venues">${leads
            .map(
              (v) => `<li>
        <h3>${esc(v.name)}</h3>
        ${v.address ? `<p>${esc(v.address)}</p>` : ''}
        ${v.note ? `<p>${esc(v.note)}</p>` : ''}
        <p>${v.website ? `<a href="${esc(v.website)}" target="_blank" rel="noopener nofollow">Website</a>` : ''}
           ${v.source_url ? ` · <a href="${esc(v.source_url)}" target="_blank" rel="noopener nofollow">Source</a>` : ''}</p>
      </li>`
            )
            .join('')}</ul>
      <p class="caveat">These are research leads, not endorsements — gathered from
      the open web by an AI search and not verified by us. Check the venue is
      open and get the booking contact from their own site before you write.</p>`
        : `<p class="status" data-venues-empty>No shortlist yet for ${esc(label)}.</p>
      <div class="actions"><button class="btn btn--ghost" data-research>Find venues near ${esc(label)}</button></div>
      <p class="caveat">We will search the open web for independent cinemas and
      historic theatres near you that take one-night bookings. Results are
      research leads, not endorsements — always check with the venue.</p>`
    }
  </section>

  <section>
    <h2>The letter</h2>
    <p class="status">Written for you, with this city's numbers in it. Change anything you like.</p>
    <div class="actions" style="margin-bottom:1.2rem">
      <button class="btn btn--ghost" data-copy>Copy the letter</button><span class="copied" hidden>Copied</span>
    </div>
    <textarea readonly data-letter>${esc(letter)}</textarea>
  </section>

  <section>
    <h2>What we bring</h2>
    <p class="status">A DCP or ProRes master, the poster and artwork, the
    <a href="/press/" style="color:var(--blood-lift)">press kit</a>, and someone
    on the other end of an email. Tickets can be sold through the site so the
    booking pays for itself before the night.</p>
  </section>

  <footer class="wrap" style="padding-inline:0">
    <a href="/screenings/">← All cities</a> ·
    <a href="/films/his-name-is-michael/">About the film</a> ·
    4est Films
  </footer>
</div>

<script>
  const btn = document.querySelector('[data-share]');
  btn?.addEventListener('click', async () => {
    const url = btn.getAttribute('data-url');
    const text = '${esc(requests)} of us in ${esc(label)} are asking for His Name is Michael. Add your name:';
    try {
      if (navigator.share) { await navigator.share({ title: 'His Name is Michael', text, url }); return; }
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Link copied';
    } catch { /* dismissed */ }
  });

  const copy = document.querySelector('[data-copy]');
  copy?.addEventListener('click', async () => {
    const ta = document.querySelector('[data-letter]');
    try {
      await navigator.clipboard.writeText(ta.value);
      document.querySelector('.copied').hidden = false;
    } catch {
      ta.select();
    }
  });

  const research = document.querySelector('[data-research]');
  research?.addEventListener('click', async () => {
    research.disabled = true;
    research.textContent = 'Searching…';
    try {
      const res = await fetch('/api/screenings/city?slug=${esc(city.slug)}&research=1');
      const d = await res.json();
      if (d.ok && d.venues?.length) { location.reload(); return; }
      research.textContent = d.venue_research_available
        ? 'Nothing found — try a nearby larger city'
        : 'Venue search is not switched on yet';
    } catch {
      research.textContent = 'Search failed — try again';
    }
  });
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short, not zero: the count is the point, but a shared link can spike.
      'cache-control': 'public, max-age=30',
    },
  });
};
