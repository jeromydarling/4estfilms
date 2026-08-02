/**
 * Community screenings for His Name is Michael.
 *
 * The numbers here are decisions, not constants, which is why they live
 * together and are commented.
 */

export const screenings = {
  film: 'his-name-is-michael',
  title: 'His Name is Michael',

  /**
   * Requests before 4est actively works a city.
   *
   * A four-wall on a small independent screen is typically 60-150 seats and
   * a few hundred dollars of guarantee. Fifty people who have put their
   * name to it is roughly the point where a host can walk into a booking
   * conversation with something real, without setting a bar so high that
   * every city looks like a failure.
   */
  threshold: 50,

  /** Venue research is redone if the cached answer is older than this. */
  venueMaxAgeDays: 30,

  /** How many cities the leaderboard shows. */
  topCities: 12,
} as const;

/** 0 to 1, capped — the progress bar must not overflow past a full house. */
export const progress = (requests: number) =>
  Math.max(0, Math.min(1, requests / screenings.threshold));
