// Content sourced from docs/research/company-and-films.md and the director's
// revision notes. Credits below are the director's own list and supersede the
// IMDb reading where the two disagree.

export const company = {
  name: '4est Films',
  legal: '4est Films LLC',
  since: 2015,
  tagline: 'Creating and collaborating with love since 2015',
  // Replaces the old city line. The company is not sold on a location.
  line: 'Independent Film Production · Est. 2015',
  seoTitle: '4est Films | Independent Film Production Company',
  instagram: 'https://instagram.com/4estfilms',
};

export const strung = {
  slug: 'strung',
  title: 'Strung',
  year: 2019,
  runtimeNote: 'Short film',
  instagram: 'https://instagram.com/strungfilm',
  imdb: 'https://www.imdb.com/title/tt10458322/',
  imdbAwards: 'https://www.imdb.com/title/tt10458322/awards/',
  // Set once the official upload exists; the page renders the embed only
  // when this is a real ID.
  youtube: null as string | null,
  logline:
    'Lost in the forest of his own mind, Eric must rely on the survival skills of an enigmatic nine-year-old boy to help him battle vicious withdrawals and self-deprivation to catalyze change within his family’s cycle of addiction.',
  // Credits as delivered by the director. Crew who had been sitting in the
  // cast list are back in their own departments.
  directors: ['Joseph Bezenek'],
  coDirectors: ['Ryan H. Reid'],
  writers: ['Wenonah Wilms', 'Jeromy Darling', 'Joseph Bezenek'],
  producers: ['Joseph Bezenek', 'Alexander C. Shields', 'Molly Worre', 'Ryan H. Reid'],
  cast: [
    ['Jeromy Darling', 'Eric'],
    ['Wyatt Darling', 'Wilder'],
  ] as [string, string][],
  crew: [
    ['Director of Photography', 'Geoff George'],
    ['Assistant Director', 'Molly Worre'],
    ['Art Department', 'Rob Walstead'],
    ['Steadicam Operator', 'Travis Higgins'],
    ['Behind-the-Scenes Photography', 'Forrest Wasko'],
  ] as [string, string][],
  // The six the film leads with, by their real titles — the festivals'
  // month-labels ("December Award") say nothing to a reader.
  featuredAwards: [
    ['Best in Fest', 'Minneapolis St. Paul International Film Festival'],
    ['Best First-Time Director', 'Top Shorts Film Festival'],
    ['Best First-Time Director', 'Los Angeles Film Awards'],
    ['Best Healing/Recovery Film', 'Believe Psychology Film Festival'],
    ['Best Child Actor', 'Actors Awards Los Angeles'],
    ['Best Supporting Actor', 'Actors Awards Los Angeles'],
  ] as [string, string][],
  totalWins: 12,
  festivalCount: 8,
  headlines: [
    {
      stat: 'Only acting award',
      of: 'out of 4,000+ submissions',
      body: 'Jeromy Darling took the sole acting prize at the Munich Film Awards.',
    },
    {
      stat: 'Nine years old',
      of: 'first film he had ever acted in',
      body: 'Wyatt Darling won Best Child Actor and Best Supporting Actor at Actors Awards Los Angeles — the second beating adult performances in feature films. Four acting awards in a single month.',
    },
    {
      stat: 'Two nights',
      of: 'at the historic State Theatre',
      body: 'Sioux Falls, tickets free with a donation, every dollar to Emily’s Hope and Tallgrass Recovery for people who cannot afford treatment.',
    },
  ],
  statement:
    'The story of Strung was conceived by Jeromy Darling, drawn from a life of service — working in rehab centers and using music to heal since he was sixteen. More than thirty collaborators brought it to the screen.',
  closing:
    'Never give up on that child within, so we may understand, teach, and raise our own children with the love they deserve.',
  helpline: {
    label: 'SAMHSA National Helpline',
    number: '1-800-662-4357',
    href: 'tel:18006624357',
    note: 'If you or anyone you know is struggling with addiction. You are not alone in your struggle. You are seen, heard, and loved.',
  },
  future: 'A feature-length version of Strung is in development.',
};

export const hnim = {
  slug: 'his-name-is-michael',
  title: 'His Name is Michael',
  release: 'Coming Late 2026',
  instagram: 'https://instagram.com/hnimfilm',
  genre: 'Western · Musical · Supernatural',
  youtube: null as string | null,
  logline:
    'The only priest in Nevada battles demons and outlaws for the soul of a boy with no name.',
  // Set in Nevada, shot in South Dakota. The distinction is the director's and
  // must hold everywhere the film is described.
  description:
    'A supernatural Western musical set in Virginia City, Nevada, and filmed entirely in South Dakota.',
  setting: 'Virginia City, Nevada',
  shotIn: 'Filmed entirely in South Dakota',
  question: 'What is your name?',
  // A frame narrative: the film opens in 1897 and the bulk of it is the
  // story being told inside that frame. Order matters — 1897 comes first.
  // The year is fixed by Sr. Maria's own narration, which places the frame
  // two years after Manogue's death on 27 February 1895.
  narrative: {
    frame: {
      year: '1897',
      place: 'An orphanage in Virginia City',
      role: 'The telling',
      text: 'Sunday evening. Sister Maria gathers the orphans in her care, and the groundskeeper takes his place at the old piano.',
      quote: 'Today I will tell you the story of a boy, a priest and a demon.',
      quoteBy: 'Sr. Maria',
    },
    tale: {
      year: '1867',
      place: 'Virginia City, Nevada',
      role: 'The story she tells',
      text: 'Thirty years earlier, in the boom town silver had made the most important city between Denver and San Francisco — and in the whole state of Nevada, one priest.',
    },
  },
  premise:
    'Loosely based on Father Patrick Manogue — the only priest in the state of Nevada, who earned a reputation as “Wyatt Earp with a collar.” Feared by disreputable men, loved by everyone he helped.',
  origin:
    'The story began life on stage, and was so well received it had to be turned into a movie. It is part of a trilogy, each story set one hundred years apart.',
  key: [
    ['Written by', 'Jeromy Darling'],
    ['Directed by', 'Joseph Bezenek'],
    ['Produced by', 'Keely Kemp'],
    ['Father Manogue', 'Jeromy Darling'],
    ['The Boy', 'Wyatt Darling'],
    ['The King of Virginia City', 'Joseph Bezenek'],
    ['Director of Photography', 'Aaron Berger'],
    ['Edited by', 'Aaron Berger'],
    ['Sound Mixer', 'Zak Rivers'],
    ['Original Music by', 'Jeromy Darling & Kurt Larson'],
    ['Original Score by', 'Justuce Johnson'],
    ['Behind-the-Scenes Photography', 'Ryan McBoyle'],
  ] as [string, string][],
  // Production notes. `plates` names the three stills shown beside each
  // entry — in-world frames only, no crew, monitors or slates, and nothing
  // that gives away more of the picture than a teaser should.
  production: [
    {
      title: 'The opening',
      plates: ['day1_DSC02978.webp', 'day3_BAT06105.webp', 'day7_DSC04581.webp'],
      text: 'The production opened on the most demanding sequence in the script — the hardest passage in the film technically and emotionally, and the first thing an audience sees. It was shot first, and shot until it was right.',
    },
    {
      title: 'Light and blood',
      plates: ['day7_DSC04453.webp', 'day8_DSC04866.webp', 'day1_DSC03021.webp'],
      text: 'A single frame carries the whole picture: beauty and violence in the same light. It is the image the production returned to whenever a decision needed settling.',
    },
    {
      title: 'The schoolroom',
      plates: ['day7_BAT06197.webp', 'day7_DSC04556.webp', 'day6_DSC04094.webp'],
      text: 'Twenty child actors in a period-accurate schoolroom, reciting verse. The production built the sequence around them, and it became the warmest passage in a film that spends much of its time in the dark.',
    },
    {
      title: 'The barn',
      plates: ['day4_DSC03681-Enhanced-NR.webp', 'day4_DSC03636.webp', 'day7_DSC04476.webp'],
      text: 'From that classroom the picture turns: a presence in a barn that should not be there. The tonal distance between those two sequences is the film in miniature — and the reason it needed a musical to hold it together.',
    },
    {
      title: 'The river',
      plates: ['day9_DSC05013.webp', 'day9_DSC05068.webp', 'day9_DSC05088.webp'],
      text: 'Clear skies, sixty degrees, and a horse named “Hollywood.” The last frames of principal photography, and the widest the film ever breathes.',
    },
  ],
  // One curated closing gallery. Nothing here repeats a production plate,
  // and nothing here spoils a beat.
  gallery: [
    'day2_DSC03144.webp',
    'day2_DSC03167.webp',
    'day5_DSC03752.webp',
    'day5_DSC03790.webp',
    'day5_DSC03871.webp',
    'day5_DSC03906.webp',
    'day6_DSC04141.webp',
    'day6_DSC04165.webp',
    'day6_DSC04202.webp',
    'day8_DSC04791.webp',
  ],
};

export const people = [
  {
    name: 'Jeromy Darling',
    roles: 'Writer · Actor · Songwriter',
    site: 'https://jeromydarling.com/',
    imdb: 'https://www.imdb.com/name/nm7757481/',
    bio: 'Actor, songwriter, poet, playwright — and above all a father of four. Raised in a trailer park in Ames, Iowa, too young to understand poverty but old enough to understand love. Ten albums and EPs. He conceived Strung from his own years of service, and wrote His Name is Michael.',
  },
  {
    name: 'Joseph Bezenek',
    roles: 'Founder · Director',
    imdb: 'https://www.imdb.com/name/nm7417773/',
    bio: 'Joseph Bezenek is an award-winning filmmaker whose work is rooted in collaboration, conviction, and emotionally ambitious storytelling. He founded 4est Films in 2015 and made his directorial debut with Strung, which earned twelve awards across eight festivals, including two Best First-Time Director honors. He later directed the company’s first feature film, His Name Is Michael.',
  },
];
