// The press kit's own data: what a programmer, journalist or distributor
// asks for, in the order they ask for it.

import { company, strung, hnim, people } from './site';

export const pressContact = {
  email: 'press@4estfilms.studio',
  instagram: company.instagram,
};

export const pressStills = [
  { src: '/press/hnim/hnim-day7_DSC04556.webp', alt: 'A period schoolroom of children reciting verse' },
  { src: '/press/hnim/hnim-day7_DSC04453.webp', alt: 'A man kneeling at a bedside in backlit smoke' },
  { src: '/press/hnim/hnim-day8_DSC04866.webp', alt: 'A figure at a candlelit piano in red light' },
  { src: '/press/hnim/hnim-day4_DSC03681-Enhanced-NR.webp', alt: 'The King of Virginia City in a doorway' },
  { src: '/press/hnim/hnim-day4_DSC03636.webp', alt: 'The King of Virginia City and a man in a saloon' },
  { src: '/press/hnim/hnim-day5_DSC03790.webp', alt: 'Sister Maria in her coif' },
  { src: '/press/hnim/hnim-day6_DSC04141.webp', alt: 'The groundskeeper at the orphanage piano' },
  { src: '/press/hnim/hnim-day3_BAT06105.webp', alt: 'The church altar, dressed and lit' },
  { src: '/press/hnim/hnim-day1_DSC02978.webp', alt: 'The interior of the church' },
  { src: '/press/hnim/hnim-day1_DSC03021.webp', alt: 'Candlelight in the church pews' },
  { src: '/press/hnim/hnim-day2_DSC03144.webp', alt: 'Two figures through a window, seen from outside' },
  { src: '/press/hnim/hnim-day2_DSC03167.webp', alt: 'An oil lamp, a bible and lace' },
  { src: '/press/hnim/hnim-day9_DSC05013.webp', alt: 'Two figures on a rock in the river' },
  { src: '/press/hnim/hnim-day9_DSC05088.webp', alt: 'A horse in profile at dusk' },
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
