import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { parsePlace, placeLabel } from '../../../lib/place';
import { screenings } from '../../../lib/screenings';
import { confirmEmail, layout, newToken, send, SITE } from '../../../lib/email';

export const prerender = false;

const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@.]{2,}$/;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * "I want to see this in my city."
 *
 * Also puts them on the mailing list, because the two are the same promise
 * — somebody asking for a screening plainly wants to hear when there is
 * one — and a request we cannot follow up on is worth nothing.
 */
export const POST: APIRoute = async ({ request }) => {
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'unavailable' }, 503);

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  // Same honeypot name as the newsletter form.
  if (String(b.hp_url ?? '').trim() !== '') return json({ ok: true, counted: false });

  const place = parsePlace(String(b.city ?? ''));
  if (!place) {
    return json({ ok: false, error: 'Which city? A name like “Sioux Falls, SD” works.' }, 422);
  }

  const email = String(b.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    return json({ ok: false, error: 'Please check that address.' }, 422);
  }

  const firstName = String(b.first_name ?? '').trim().slice(0, 80) || null;
  const host = b.willing_to_host === true || b.willing_to_host === 'on';
  const message = String(b.message ?? '').trim().slice(0, 1000) || null;
  const tag = (k: string, max = 80) => {
    const v = b[k];
    return typeof v === 'string' && v ? v.slice(0, max) : null;
  };

  // Most people type "Sioux Falls", not "Sioux Falls, SD". If exactly one
  // city already on the map matches that name, they mean that one — join
  // it rather than starting a second bucket beside it. Two matches
  // (Portland OR and Portland ME) means we genuinely cannot tell, so the
  // bare name keeps its own bucket rather than being guessed into one.
  if (!place.region && place.country === 'US') {
    try {
      const siblings = await db
        .prepare(
          `SELECT slug, city, region, country FROM screening_cities
            WHERE country = 'US' AND region IS NOT NULL AND city = ?1 LIMIT 3`
        )
        .bind(place.city)
        .all<{ slug: string; city: string; region: string | null; country: string }>();
      const only = siblings.results ?? [];
      if (only.length === 1) {
        place.slug = only[0].slug;
        place.region = only[0].region;
      }
    } catch (err) {
      console.error('sibling city lookup failed', err);
    }
  }

  try {
    await db
      .prepare(
        `INSERT INTO screening_cities (slug, city, region, country, film)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(slug) DO UPDATE SET updated_at = datetime('now')`
      )
      .bind(place.slug, place.city, place.region, place.country, screenings.film)
      .run();

    const city = await db
      .prepare(`SELECT id, city, region, country FROM screening_cities WHERE slug = ?1`)
      .bind(place.slug)
      .first<{ id: number; city: string; region: string | null; country: string }>();
    if (!city) return json({ ok: false, error: 'Something broke on our end.' }, 500);

    // One row per person per city. Coming back later to tick "I'll organise
    // it" upgrades the existing row rather than adding a second.
    await db
      .prepare(
        `INSERT INTO screening_requests
           (city_id, email, first_name, willing_to_host, message,
            ip_country, utm_source, utm_campaign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(city_id, email) DO UPDATE SET
           willing_to_host = MAX(screening_requests.willing_to_host, excluded.willing_to_host),
           first_name = COALESCE(excluded.first_name, screening_requests.first_name),
           message = COALESCE(excluded.message, screening_requests.message)`
      )
      .bind(
        city.id,
        email,
        firstName,
        host ? 1 : 0,
        message,
        request.headers.get('cf-ipcountry'),
        tag('utm_source'),
        tag('utm_campaign')
      )
      .run();

    const counts = await db
      .prepare(
        `SELECT COUNT(*) AS requests,
                SUM(willing_to_host) AS hosts
           FROM screening_requests WHERE city_id = ?1`
      )
      .bind(city.id)
      .first<{ requests: number; hosts: number }>();

    // Subscribe them too, and reuse the newsletter's own double opt-in
    // rather than inventing a second, weaker consent path.
    let token: string | null = null;
    let needsConfirm = false;
    try {
      await db
        .prepare(
          `INSERT INTO subscribers (email, first_name, source, film, token, ip_country, utm_source, utm_campaign)
           VALUES (?1, ?2, 'screening', ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(email) DO NOTHING`
        )
        .bind(
          email,
          firstName,
          screenings.film,
          newToken(),
          request.headers.get('cf-ipcountry'),
          tag('utm_source'),
          tag('utm_campaign')
        )
        .run();

      const sub = await db
        .prepare(
          `SELECT token, confirmed_at, unsubscribed_at, confirm_sent_at
             FROM subscribers WHERE email = ?1`
        )
        .bind(email)
        .first<{
          token: string | null;
          confirmed_at: string | null;
          unsubscribed_at: string | null;
          confirm_sent_at: string | null;
        }>();

      token = sub?.token ?? null;
      const recent =
        sub?.confirm_sent_at &&
        Date.now() - Date.parse(sub.confirm_sent_at.replace(' ', 'T') + 'Z') < 3600_000;
      needsConfirm = Boolean(sub && !sub.confirmed_at && !sub.unsubscribed_at && token && !recent);
    } catch (err) {
      console.error('screening subscribe failed', err);
    }

    const label = placeLabel(city);
    const requests = counts?.requests ?? 1;

    try {
      if (needsConfirm && token) {
        // Not yet on the list: one email that both confirms and acknowledges,
        // rather than two arriving together.
        const mail = confirmEmail(token, firstName);
        await send({ to: email, token, campaign: 'screening-confirm', ...mail });
        await db
          .prepare(`UPDATE subscribers SET confirm_sent_at = datetime('now') WHERE email = ?1`)
          .bind(email)
          .run();
      } else if (token) {
        await send({
          to: email,
          token,
          campaign: 'screening-request',
          ...receipt(label, requests, host, place.slug, firstName, token),
        });
      }
    } catch (err) {
      console.error('screening email failed', err);
    }

    return json({
      ok: true,
      counted: true,
      slug: place.slug,
      label,
      requests,
      hosts: counts?.hosts ?? 0,
      threshold: screenings.threshold,
      needs_confirm: needsConfirm,
    });
  } catch (err) {
    console.error('screening request failed', err);
    return json({ ok: false, error: 'Something broke on our end.' }, 500);
  }
};

function receipt(
  label: string,
  requests: number,
  host: boolean,
  slug: string,
  name: string | null,
  token: string
) {
  const href = `${SITE}/screenings/${slug}/`;
  const ordinal = requests === 1 ? 'the first person' : `number ${requests}`;
  const hello = name ? `Thank you, ${name}.` : 'Thank you.';

  const body = host
    ? `<p style="margin:0 0 14px;">You are ${ordinal} to ask for <em>His Name is Michael</em>
       in ${label} — and you said you would help organise it, which is the part
       that actually makes it happen.</p>
       <p style="margin:0 0 14px;">Your city page has a shortlist of venues worth
       approaching and a letter you can send them, with your city's numbers already
       in it. We will be in touch personally.</p>`
    : `<p style="margin:0 0 14px;">You are ${ordinal} to ask for <em>His Name is Michael</em>
       in ${label}. When enough people have, we go looking for a screen.</p>
       <p style="margin:0 0 14px;">The fastest way to make it happen is to send your
       city's page to someone else who would come.</p>`;

  return {
    subject: `${label} — your screening request`,
    html: layout({
      preheader: `You are ${ordinal} in ${label}.`,
      heading: hello,
      body,
      cta: { href, label: `See ${label}` },
      footer: `You’re receiving this because you asked for a screening at 4estfilms.studio.<br>
               <a href="${SITE}/unsubscribe?t=${token}" style="color:#8b857a;">Unsubscribe</a>
               · 4est Films · Independent Film Production · Est. 2015`,
    }),
    text: `${hello}\n\nYou are ${ordinal} to ask for His Name is Michael in ${label}.\n\n${href}`,
  };
}
