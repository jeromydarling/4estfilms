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
  name: 'KNOWN',
  /** KNOWN's own site. The organisation is larger than this donation flow. */
  site: 'https://iamknown.live',
  /**
   * How the ask behaves.
   *
   *   'give'    — the Stripe checkout. Where we are: the account is live and
   *               taking cards.
   *   'enquiry' — collect supporters and talk to them instead. Built during
   *               the outage when Stripe reset the account recovery code
   *               mid-setup, kept because outages recur and rebuilding a
   *               payment path in a hurry is how validation goes missing.
   *
   * Both render through the same component, so the page, the wording and the
   * styling are identical either way. Flipping this is a one-word deploy.
   */
  mode: 'give' as 'enquiry' | 'give',

  /** Set to false to close giving; the page explains itself either way. */
  open: true,

  /**
   * Offered as bands, not a number. Somebody who is thinking about $10,000
   * should not have to type it into a box that looks like a shop, and
   * "whatever helps" is a real answer that a number field would have thrown
   * away.
   */
  bands: [
    'Under $100',
    '$100 – $500',
    '$500 – $2,500',
    '$2,500 – $10,000',
    'More than $10,000',
    'Whatever helps most',
  ],

  /** The mission, as the company states it. Rendered as a stack, not prose. */
  mission: [
    'To create films that move people.',
    'Films that challenge.',
    'Films that restore hope.',
    'Films that stay with audiences long after the credits roll.',
  ],

  /**
   * What a supporter gets. Kept as data so donor tiers can be added without
   * touching the markup — a third group slots in here and renders itself.
   */
  recognition: {
    every: [
      'Their name listed in the Special Thanks section of our film credits',
      'Recognition as a supporter of independent filmmaking',
      'Updates throughout production on the projects they’re helping bring to life',
    ],
    major: [
      'Invitations to visit the set during production (when applicable)',
      'Behind-the-scenes access',
      'Opportunities to meet cast and crew',
      'Early updates and exclusive production content',
    ],
  },

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
