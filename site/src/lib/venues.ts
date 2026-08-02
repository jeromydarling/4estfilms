/**
 * Venue research, via Perplexity.
 *
 * The question a would-be host actually has is not "what cinemas are near
 * me" — a map answers that. It is "which of these would even consider
 * showing an independent feature, and who do I ask." That is a research
 * question over the open web, which is what this is for.
 *
 * Three things this is careful about:
 *
 *  1. The output is generated text about the real world. Phone numbers
 *     hallucinate and cinemas close. Everything it returns is a lead, is
 *     labelled as one in the UI, keeps its source link, and is never
 *     contacted automatically on anyone's behalf.
 *  2. It is cached per city in D1 and refreshed monthly. A call takes five
 *     to fifteen seconds and costs money; running one per page view would
 *     be both slow and a way to spend somebody's budget from a browser.
 *  3. With no API key configured it returns nothing and says so. The
 *     screening feature works without it — you can still register demand
 *     and volunteer to host — because the venue list is a convenience and
 *     the demand map is the product.
 */

import { env } from 'cloudflare:workers';

export interface VenueLead {
  name: string;
  address?: string;
  website?: string;
  note?: string;
  source_url?: string;
}

const MODEL = 'sonar';
const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

export const hasVenueResearch = () =>
  Boolean((env as unknown as { PERPLEXITY_API_KEY?: string }).PERPLEXITY_API_KEY);

const PROMPT = (place: string) => `List up to 6 real cinemas or screening venues in or near ${place} that an independent filmmaker could realistically approach about a one-night screening of a feature film.

Prefer, in this order: independent and arthouse cinemas, historic or restored theatres, cinemas with a community or private-hire programme, and university or museum screening rooms. Include a large chain only if there is a specific reason, such as a documented community screening programme.

For each venue give:
- name
- street address
- official website
- one sentence on whether they host four-wall rentals, private hires or community screenings, and who to contact if that is publicly stated

Only include venues you can find current evidence for. If you are not confident a venue is still operating, leave it out. Do not invent phone numbers or email addresses.

Reply with JSON only, in this exact shape:
{"venues":[{"name":"","address":"","website":"","note":""}]}`;

/** Pull the first JSON object out of a reply that may be wrapped in prose. */
function extractJson(text: string): { venues?: unknown } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

/**
 * Researches venues for a place. Returns [] rather than throwing on every
 * failure path — a missing venue list must never stop somebody registering
 * their interest.
 */
export async function researchVenues(place: string): Promise<VenueLead[]> {
  const key = (env as unknown as { PERPLEXITY_API_KEY?: string }).PERPLEXITY_API_KEY;
  if (!key) return [];

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You research real venues and reply with JSON only. You never invent contact details. If unsure whether a venue still operates, you omit it.',
          },
          { role: 'user', content: PROMPT(place) },
        ],
        temperature: 0.1,
        max_tokens: 1200,
      }),
      // A host is waiting on this; better to give up and show the rest of
      // the page than to hold the request open indefinitely.
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    console.error('perplexity unreachable', err);
    return [];
  }

  if (!res.ok) {
    console.error('perplexity error', res.status, (await res.text()).slice(0, 300));
    return [];
  }

  let payload: {
    choices?: { message?: { content?: string } }[];
    citations?: string[];
    search_results?: { url?: string }[];
  };
  try {
    payload = await res.json();
  } catch {
    return [];
  }

  const content = payload.choices?.[0]?.message?.content ?? '';
  const parsed = extractJson(content);
  if (!parsed || !Array.isArray(parsed.venues)) return [];

  // Citations are the whole reason to prefer this over a bare model: they
  // let a host check the claim before they act on it.
  const sources = payload.citations ?? payload.search_results?.map((s) => s.url ?? '') ?? [];

  const out: VenueLead[] = [];
  for (const raw of parsed.venues.slice(0, 6)) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    const name = str(v.name, 120);
    if (!name) continue;

    let website = str(v.website, 300);
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

    out.push({
      name,
      address: str(v.address, 200),
      website,
      note: str(v.note, 400),
      // Best-effort: the model does not map citations to individual venues,
      // so the first source stands for the search rather than the venue.
      source_url: sources[0] ? String(sources[0]).slice(0, 300) : undefined,
    });
  }
  return out;
}
