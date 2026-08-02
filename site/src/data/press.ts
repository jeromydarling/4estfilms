// The press kit's own data: what a programmer, journalist or distributor
// asks for, in the order they ask for it.

import { company, strung, hnim, people } from './site';

export const pressContact = {
  email: 'press@4estfilms.studio',
  instagram: company.instagram,
};

/**
 * Stills cleared for publication, grouped.
 *
 * Weighted to Jeromy Darling as Father Manogue, who is the lead and had two
 * frames out of fourteen in the first cut of this page — which is not a
 * press kit for this film, it is a press kit for its production design.
 * Every frame here was checked at full size for crew, monitors and slates;
 * the shoot's BTS folder mixes unit photography in with in-world frames and
 * the difference is not visible in a contact sheet.
 */
export type StillGroup = 'manogue' | 'light' | 'film';

export const stillGroups: { key: StillGroup; label: string; note: string }[] = [
  {
    key: 'manogue',
    label: 'Father Manogue',
    note: 'Jeromy Darling as Patrick Manogue — the only priest in the state of Nevada.',
  },
  {
    key: 'light',
    label: 'Lantern and candle',
    note: 'The film is lit by what the characters carry. These are the practicals.',
  },
  { key: 'film', label: 'The picture', note: 'The company around him.' },
];

export const pressStills: { src: string; group: StillGroup; alt: string }[] = [
  { src: '/press/hnim/hnim-d4_DSC03554.webp', group: 'manogue', alt: 'Father Manogue holding a wounded boy before the altar' },
  { src: '/press/hnim/hnim-d4_DSC03555.webp', group: 'manogue', alt: 'Father Manogue at the altar, the boy behind him' },
  { src: '/press/hnim/hnim-d4_DSC03663.webp', group: 'manogue', alt: 'Father Manogue kneeling to hold the boy at the altar rail' },
  { src: '/press/hnim/hnim-d4_DSC03626.webp', group: 'manogue', alt: 'The boy, bloodied, holding Father Manogue as he falls' },
  { src: '/press/hnim/hnim-d4_DSC03629.webp', group: 'manogue', alt: 'Father Manogue on the church floor in the boy’s arms' },
  { src: '/press/hnim/hnim-d3_BAT06157.webp', group: 'manogue', alt: 'Father Manogue kneeling to tend the boy’s leg by candlelight' },
  { src: '/press/hnim/hnim-d3_BAT06161.webp', group: 'manogue', alt: 'Father Manogue and the boy in the candlelit church' },
  { src: '/press/hnim/hnim-d3_DSC03280.webp', group: 'manogue', alt: 'Father Manogue on the stairs, looking back toward a lit door' },
  { src: '/press/hnim/hnim-d3_DSC03293.webp', group: 'manogue', alt: 'Father Manogue in a doorway above a figure on the ground' },
  { src: '/press/hnim/hnim-d3_DSC03297.webp', group: 'manogue', alt: 'Father Manogue kneeling to cover the boy with a blanket' },
  { src: '/press/hnim/hnim-d3_DSC03312.webp', group: 'manogue', alt: 'Jeromy Darling as Manogue, out of the cassock, against a lit doorway' },
  { src: '/press/hnim/hnim-d3_DSC03325.webp', group: 'manogue', alt: 'Manogue carrying bedding past an oil lamp' },
  { src: '/press/hnim/hnim-d3_DSC03330.webp', group: 'manogue', alt: 'Manogue at a doorway, lamplight below' },
  { src: '/press/hnim/hnim-d3_DSC03304.webp', group: 'light', alt: 'An oil lantern hanging in the barn' },
  { src: '/press/hnim/hnim-d6_DSC04234.webp', group: 'light', alt: 'A lantern beside a wedding portrait on a log wall' },
  { src: '/press/hnim/hnim-d8_DSC04908.webp', group: 'light', alt: 'Candles, a bottle and a playbill on a table' },
  { src: '/press/hnim/hnim-d8_DSC04913.webp', group: 'light', alt: 'A cut apple and candles along a piano top' },
  { src: '/press/hnim/hnim-d7_DSC04453.webp', group: 'film', alt: 'A man kneeling at a bedside in backlit smoke' },
  { src: '/press/hnim/hnim-d8_DSC04866.webp', group: 'film', alt: 'The King of Virginia City at a candlelit piano' },
  { src: '/press/hnim/hnim-d4_DSC03681-Enhanced-NR.webp', group: 'film', alt: 'The King of Virginia City levelling a pistol' },
  { src: '/press/hnim/hnim-d5_DSC03790.webp', group: 'film', alt: 'Sister Maria in her coif' },
  { src: '/press/hnim/hnim-d6_DSC04141.webp', group: 'film', alt: 'The groundskeeper at the orphanage piano' },
  { src: '/press/hnim/hnim-d7_DSC04556.webp', group: 'film', alt: 'A period schoolroom of children reciting verse' },
  { src: '/press/hnim/hnim-d9_DSC05088.webp', group: 'film', alt: 'A horse in profile at dusk' },
];

/** Plain text, so the archive is legible without opening a browser. */
export function pressCredits(): string {
  const rule = '─'.repeat(60);
  const list = (label: string, names: string[]) =>
    `${label}\n${names.map((n) => `  ${n}`).join('\n')}\n`;

  return `${company.name.toUpperCase()} — PRESS KIT
${company.line}
${rule}

${hnim.title.toUpperCase()} (${hnim.release})
${rule}
${hnim.description}

LOGLINE
  ${hnim.logline}

STRUCTURE
  ${hnim.narrative.frame.year} — ${hnim.narrative.frame.place}. ${hnim.narrative.frame.text}
  ${hnim.narrative.tale.year} — ${hnim.narrative.tale.place}. The story she tells.

PREMISE
  ${hnim.premise}

CREDITS
${hnim.key.map(([role, who]) => `  ${role}: ${who}`).join('\n')}


${strung.title.toUpperCase()} (${strung.year}) — ${strung.runtimeNote}
${rule}
LOGLINE
  ${strung.logline}

AWARDS — ${strung.totalWins} across ${strung.festivalCount} festivals
${strung.featuredAwards.map(([prize, fest]) => `  ${prize} — ${fest}`).join('\n')}
  Full list: ${strung.imdbAwards}

CREDITS
${list('Directed by', strung.directors)}${list('Co-directed by', strung.coDirectors)}${list('Written by', strung.writers)}${list('Produced by', strung.producers)}Cast
${strung.cast.map(([who, role]) => `  ${who} — ${role}`).join('\n')}
Crew
${strung.crew.map(([role, who]) => `  ${role}: ${who}`).join('\n')}


THE COMPANY
${rule}
${people.map((p) => `${p.name} — ${p.roles}\n  ${p.bio}\n  ${p.imdb}`).join('\n\n')}


CONTACT
${rule}
  ${pressContact.email}
  ${pressContact.instagram}

IMAGE CREDIT
  Behind-the-scenes photography by Ryan McBoyle.
  Stills in this kit are 2160px web resolution. Print resolution is
  available on request.
`;
}
