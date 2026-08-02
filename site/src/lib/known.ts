/**
 * Known — the non-profit arm of 4est Films.
 *
 * Music, original plays, films. The argument the page makes is that beautiful
 * things are commissioned rather than wished for, so the numbers here are
 * gift sizes rather than prices: nothing is being sold and nothing is being
 * unlocked by paying.
 *
 * As with the premiere, the configuration sits in one file because every
 * value in it is somebody's decision, not a technical constant.
 */

export const known = {
  name: 'Known',
  /** Set to false to close giving; the page explains itself either way. */
  open: true,

  /** What the money makes. Ordered as the company says it. */
  disciplines: [
    { name: 'Music', note: 'Records that would not survive a label’s spreadsheet.' },
    { name: 'Original plays', note: 'New work, staged — not another revival of a safe one.' },
    { name: 'Films', note: 'Stories told at length, by people who live where they are set.' },
  ],

  /** Minor units. The floor keeps card fees from eating the gift. */
  minimumCents: 500,
  suggestedCents: [2500, 5000, 10000, 25000],
  defaultCents: 5000,
  /**
   * A ceiling, so a slipped decimal bounces instead of charging somebody
   * five figures. Larger gifts should be a conversation anyway.
   */
  maximumCents: 500_000,
  currency: 'usd',

  /** Where a gift too large for the form should go. */
  contact: 'hello@4estfilms.studio',
} as const;
