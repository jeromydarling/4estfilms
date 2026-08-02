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
  /** Set to false to close giving; the page explains itself either way. */
  open: true,

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
