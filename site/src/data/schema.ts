// schema.org descriptions of the company and the two films.
//
// This is what lets Google understand that "His Name is Michael" is a film
// rather than a page title, and it is what a festival-name search has to
// match against. Everything here is derived from site.ts so the credits
// cannot drift away from what the pages actually show.

import { company, strung, hnim, people } from './site';

const SITE = 'https://4estfilms.studio';
const person = (name: string) => ({ '@type': 'Person', name });

export const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: company.name,
  legalName: company.legal,
  url: SITE,
  logo: `${SITE}/brand/4est-logo-bone.webp`,
  foundingDate: String(company.since),
  slogan: company.tagline,
  description:
    'An independent film production company developing emotionally ambitious films alongside the artists who believe in them.',
  founder: person('Joseph Bezenek'),
  sameAs: [company.instagram, ...people.map((p) => p.imdb)].filter(Boolean),
};

export const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  url: SITE,
  name: company.name,
  publisher: { '@id': `${SITE}/#organization` },
};

export const strungSchema = {
  '@context': 'https://schema.org',
  '@type': 'Movie',
  '@id': `${SITE}/films/strung/#movie`,
  name: strung.title,
  url: `${SITE}/films/${strung.slug}/`,
  sameAs: strung.imdb,
  image: `${SITE}/og/strung.jpg`,
  datePublished: String(strung.year),
  genre: ['Drama', 'Short'],
  inLanguage: 'en',
  description: strung.logline,
  director: [...strung.directors, ...strung.coDirectors].map(person),
  author: strung.writers.map(person),
  producer: strung.producers.map(person),
  actor: strung.cast.map(([who]) => person(who)),
  productionCompany: { '@id': `${SITE}/#organization` },
  // Named awards rather than a count: "Best First-Time Director" is the
  // string somebody actually searches for.
  award: strung.featuredAwards.map(([prize, fest]) => `${prize}, ${fest}`),
};

export const hnimSchema = {
  '@context': 'https://schema.org',
  '@type': 'Movie',
  '@id': `${SITE}/films/his-name-is-michael/#movie`,
  name: hnim.title,
  url: `${SITE}/films/${hnim.slug}/`,
  image: `${SITE}/og/hnim.jpg`,
  genre: ['Western', 'Musical', 'Fantasy'],
  inLanguage: 'en',
  description: hnim.description,
  abstract: hnim.logline,
  countryOfOrigin: { '@type': 'Country', name: 'United States' },
  // The set is Nevada; the shoot was South Dakota. Both are true and the
  // distinction is the director's, so it is stated rather than collapsed.
  contentLocation: { '@type': 'Place', name: hnim.setting },
  locationCreated: { '@type': 'Place', name: 'South Dakota, United States' },
  director: person('Joseph Bezenek'),
  author: person('Jeromy Darling'),
  producer: person('Keely Kemp'),
  actor: [
    { '@type': 'Person', name: 'Jeromy Darling', characterName: 'Father Manogue' },
    { '@type': 'Person', name: 'Wyatt Darling', characterName: 'The Boy' },
    { '@type': 'Person', name: 'Joseph Bezenek', characterName: 'The King of Virginia City' },
  ],
  musicBy: [person('Jeromy Darling'), person('Kurt Larson'), person('Justuce Johnson')],
  productionCompany: { '@id': `${SITE}/#organization` },
};
