/**
 * Turning what somebody types into a key that aggregates.
 *
 * This is the unglamorous part the whole feature rests on. "Sioux Falls",
 * "sioux falls sd", "Sioux Falls, South Dakota" and "SIOUX FALLS, SD, USA"
 * are one place, and if they land in four buckets the counter is a lie and
 * the number shown to a theatre is worthless.
 *
 * Deliberately not a geocoder. A geocoder would be more accurate and would
 * also mean an API key, a network call on every submission, and a failure
 * mode where nobody can register interest because a third party is down.
 * This is string work: it gets the common cases right, and the cases it
 * gets wrong are visible in the admin list and mergeable by hand.
 */

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};
const US_CODES = new Set(Object.values(US_STATES));

const COUNTRIES: Record<string, string> = {
  usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', us: 'US',
  'united states': 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', 'united kingdom': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  canada: 'CA', australia: 'AU', ireland: 'IE', 'new zealand': 'NZ',
  germany: 'DE', france: 'FR', spain: 'ES', netherlands: 'NL', mexico: 'MX',
};

export interface Place {
  slug: string;
  city: string;
  region: string | null;
  country: string;
}

/** Collapse case, accents, punctuation and runs of whitespace. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    // "Saint Paul" and "St. Paul" are one city and have to be one bucket.
    // Both spellings are common enough that leaving them apart would split
    // two of the larger Midwest markets down the middle.
    .replace(/\bsaint\b/g, 'st');

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => {
      // fold() has already turned "Saint" into "st"; put the stop back so
      // it reads as a place name rather than a typo.
      if (w === 'st') return 'St.';
      return w.length <= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1);
    })
    .join(' ');

/**
 * Parses "City", "City, ST", "City, State", "City, ST, Country".
 * Returns null for anything too short or too long to be a place name.
 */
export function parsePlace(input: string): Place | null {
  const raw = (input ?? '').trim();
  if (raw.length < 2 || raw.length > 120) return null;

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  let country = 'US';
  let region: string | null = null;

  // Country, if the last part names one. Only consumed when something is
  // left in front of it — "USA" alone is not a city.
  //
  // The two-letter fallback deliberately excludes US state codes. Without
  // that, "Sioux Falls, SD" reads SD as a country and lands in a different
  // bucket from "Sioux Falls, South Dakota" — which is the exact failure
  // this whole file exists to prevent.
  if (parts.length > 1) {
    const last = fold(parts[parts.length - 1]);
    const named = COUNTRIES[last];
    const iso =
      /^[a-z]{2}$/.test(last) && !US_CODES.has(last.toUpperCase()) ? last.toUpperCase() : null;
    const c = named ?? iso;
    if (c) {
      country = c;
      parts.pop();
    }
  }

  // Region, same rule.
  if (parts.length > 1) {
    const last = fold(parts[parts.length - 1]);
    const code = US_STATES[last] ?? (US_CODES.has(last.toUpperCase()) ? last.toUpperCase() : null);
    if (code) {
      region = code;
      country = 'US';
      parts.pop();
    } else if (parts.length > 1) {
      // Some other subdivision — keep it as typed rather than discarding it.
      region = titleCase(parts.pop()!).slice(0, 40);
    }
  }

  let words = fold(parts.join(' ')).split(' ').filter(Boolean);

  // Nobody types commas. "sioux falls sd" and "sioux falls south dakota"
  // have to reach the same place as "Sioux Falls, SD", so a trailing state
  // is stripped even when there is no punctuation announcing it.
  //
  // Only when something is left over: "washington" is a city, and "new
  // york" must not strip itself down to nothing.
  if (!region && country === 'US' && words.length > 1) {
    const two = words.slice(-2).join(' ');
    const one = words[words.length - 1];
    if (US_STATES[two] && words.length > 2) {
      region = US_STATES[two];
      words = words.slice(0, -2);
    } else if (US_STATES[one]) {
      region = US_STATES[one];
      words = words.slice(0, -1);
    } else if (US_CODES.has(one.toUpperCase())) {
      region = one.toUpperCase();
      words = words.slice(0, -1);
    }
  }

  const cityFolded = words.join(' ');
  if (!cityFolded || cityFolded.length < 2) return null;
  // Digits usually mean somebody pasted an address, not a city.
  if (/\d/.test(cityFolded)) return null;

  const slug = [cityFolded.replace(/\s+/g, '-'), region?.toLowerCase(), country.toLowerCase()]
    .filter(Boolean)
    .join('-')
    .slice(0, 80);

  return {
    slug,
    city: titleCase(cityFolded).slice(0, 60),
    region,
    country,
  };
}

/** How a place reads back to a person: "Sioux Falls, SD". */
export function placeLabel(p: { city: string; region: string | null; country: string }): string {
  const bits = [p.city];
  if (p.region) bits.push(p.region);
  if (p.country && p.country !== 'US') bits.push(p.country);
  return bits.join(', ');
}
