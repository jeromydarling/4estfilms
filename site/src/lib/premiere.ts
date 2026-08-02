/**
 * The Strung online premiere.
 *
 * Pay what you can, watch the film, the money goes to addiction recovery —
 * which is what the original premiere did, twice, at the State Theatre in
 * Sioux Falls.
 *
 * Configuration lives here rather than being scattered through the routes,
 * because every number in it is a decision somebody made rather than a
 * technical constant.
 */

export const premiere = {
  film: 'strung',
  title: 'Strung',

  /** Set to true to open ticketing. The page explains itself either way. */
  open: false,

  /** Minor units. The floor exists to keep card fees from eating the gift. */
  minimumCents: 500,
  suggestedCents: [1000, 2500, 5000, 10000],
  defaultCents: 2500,
  currency: 'usd',

  /**
   * How long a ticket lasts. Generous on purpose: this is a fundraiser, not
   * a rental store, and somebody who paid and then lost a week to life
   * should still get to watch.
   */
  ticketDays: 30,

  /** Where the money goes. Named on the page, because that is the point. */
  beneficiaries: [
    { name: 'Emily’s Hope', href: 'https://emilyshope.charity/' },
    { name: 'Tallgrass Recovery', href: 'https://tallgrassrecovery.org/' },
  ],

  /** R2 key of the feature, streamed through /media/. */
  videoKey: 'video/strung-feature',
} as const;

export const dollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

/** 32 hex characters from the platform CSPRNG. */
export function newTicketToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
