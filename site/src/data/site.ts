// Content sourced from docs/research/company-and-films.md.
// Every award below is verified against IMDb; every quote is the team's own words.

export const company = {
  name: '4est Films',
  legal: '4est Films LLC',
  since: 2015,
  tagline: 'Creating and collaborating with love since 2015',
  base: 'Minneapolis, Minnesota',
  instagram: 'https://instagram.com/4estfilms',
};

export const strung = {
  slug: 'strung',
  title: 'Strung',
  year: 2019,
  runtimeNote: 'Short film',
  instagram: 'https://instagram.com/strungfilm',
  imdb: 'https://www.imdb.com/title/tt10458322/',
  logline:
    'Lost in the forest of his own mind, Eric must rely on the survival skills of an enigmatic nine-year-old boy to help him battle vicious withdrawals and self-deprivation to catalyze change within his family’s cycle of addiction.',
  directors: ['Joseph Bezenek'],
  writers: ['Wenonah Wilms', 'Jeromy Darling', 'Joseph Bezenek'],
  producers: ['Joseph Bezenek', 'Alexander C. Shields', 'Molly Worre'],
  cast: [
    ['Jeromy Darling', 'Eric'],
    ['Wyatt Darling', 'The Boy'],
    ['Seth Pioske', ''],
    ['Geoff George', ''],
    ['Joseph Bezenek', ''],
    ['Jesse Robb', ''],
    ['Rob Walstead', ''],
    ['Abigail Gellrich', ''],
  ] as [string, string][],
  crew: [
    ['Director of Photography', 'Alexander C. Shields'],
    ['Assistant Director', 'Molly Worre'],
    ['Steadicam', 'Travis Higgins'],
    ['Stills', 'Forrest Wasko'],
  ] as [string, string][],
  awards: [
    ['Minneapolis St. Paul International Film Festival', 'Best in Fest', 2021],
    ['Believe Psychology Film Festival', 'Jury Prize', 2021],
    ['Festigious International Film Festival', 'January Award', 2021],
    ['Los Angeles Film Awards', 'LAFA January Award', 2021],
    ['Los Angeles Film Awards', 'Honorable Mention', 2021],
    ['Actors Awards, Los Angeles', 'Actors Award ×4', 2020],
    ['Independent Shorts Awards', 'Gold Award', 2020],
    ['Independent Shorts Awards International', 'Gold Award', 2020],
    ['Top Shorts Film Festival', 'December Award', 2020],
  ] as [string, string, number][],
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
      body: 'Wyatt Darling won Best Child Actor and Best Supporting Actor at Actors Awards LA — the second beating adult performances in feature films. Four acting awards in a single month.',
    },
    {
      stat: '$15,000',
      of: 'raised at the premiere',
      body: 'Two nights at the historic Sioux Falls State Theatre, tickets free with a donation, every dollar to Emily’s Hope and Tallgrass Recovery for people who cannot afford treatment.',
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
  release: 'Winter 2026',
  instagram: 'https://instagram.com/hnimfilm',
  genre: 'Western · Musical · Supernatural',
  logline:
    'The only priest in Nevada battles demons and outlaws for the soul of a boy with no name.',
  question: 'What is your name?',
  // A frame narrative: the film opens in 1890 and the bulk of it is the
  // story being told inside that frame. Order matters — 1890 comes first.
  narrative: {
    frame: {
      year: '1890',
      place: 'An orphanage in Virginia City',
      role: 'The telling',
      text: 'Sunday evening. Sister Maria, newly arrived to the Daughters of Charity, has started a tradition of telling the orphans in her care a story, accompanied on an old piano by the groundskeeper who tends the sisters’ land.',
      quote: 'Today I will tell you the story of a boy, a priest and a demon.',
      quoteBy: 'Sr. Maria',
    },
    tale: {
      year: '1867',
      place: 'Virginia City, Nevada',
      role: 'The story she tells',
      text: 'The boom town the bonanza had made the most important industrial city between Denver and San Francisco — and in the whole state of Nevada, one priest. The film does not cut away and come back; it moves between the schoolroom and the story all the way through.',
    },
  },
  premise:
    'Loosely based on Father Patrick Manogue — the only priest in the state of Nevada, who earned a reputation as “Wyatt Earp with a collar.” Feared by disreputable men, loved by everyone he helped.',
  origin:
    'The story began life on stage, and was so well received it had to be turned into a movie. It is part of a trilogy, each story set one hundred years apart.',
  key: [
    ['Written by', 'Jeromy Darling'],
    ['Directed by', 'Joseph Bezenek'],
    ['Father Manogue', 'Jeromy Darling'],
    ['The Boy', 'Wyatt Darling'],
    ['The King of Virginia City', 'Joseph Bezenek'],
    ['Director of Photography', 'Aaron Berger'],
    ['Original music', 'Jeromy Darling & Kurt Larson'],
    ['Stills', 'Ryan McBoyle'],
  ] as [string, string][],
  // Production notes. `plates` names the stills shown beside each entry —
  // finished-frame imagery only, no crew or monitors.
  production: [
    {
      title: 'The opening',
      plates: ["day1_DSC02978.webp", "day3_BAT06105.webp", "day4_DSC03562.webp"],
      text: 'The production opened on the most demanding sequence in the script — the hardest passage in the film technically and emotionally, and the first thing an audience sees. It was shot first, and shot until it was right.',
    },
    {
      title: 'Light and blood',
      plates: ["day4_DSC03533.webp", "day8_DSC04866.webp", "day7_DSC04453.webp"],
      text: 'A single frame carries the whole picture: beauty and violence in the same light. It is the image the production returned to whenever a decision needed settling.',
    },
    {
      title: 'The schoolroom',
      plates: ["day7_BAT06197.webp", "day7_DSC04509.webp", "day7_DSC04556.webp"],
      text: 'Twenty child actors in a period-accurate 1890 classroom, reciting verse. The production built the sequence around them, and it became the warmest passage in a film that spends much of its time in the dark.',
    },
    {
      title: 'The barn',
      plates: ["day4_DSC03681-Enhanced-NR.webp", "day4_DSC03636.webp", "day1_DSC03021.webp"],
      text: 'From that classroom the picture turns: a presence in a barn that should not be there. The tonal distance between those two sequences is the film in miniature — and the reason it needed a musical to hold it together.',
    },
    {
      title: 'The river',
      plates: ["day9_DSC05013.webp", "day9_DSC05068.webp", "day9_DSC05088.webp"],
      text: 'Clear skies, sixty degrees, the Missouri River, and a horse named “Hollywood.” The last frames of principal photography, and the widest the film ever breathes.',
    },
  ],
};

export const people = [
  {
    name: 'Jeromy Darling',
    roles: 'Writer · Actor · Songwriter',
    site: 'https://jeromydarling.com/',
    imdb: 'https://www.imdb.com/name/nm7757481/',
    bio: 'Actor, songwriter, poet, playwright — and above all a father of four, working out of Minneapolis. Raised in a trailer park in Ames, Iowa, too young to understand poverty but old enough to understand love. Ten albums and EPs. He conceived Strung from his own years of service, and wrote His Name is Michael.',
  },
  {
    name: 'Joseph Bezenek',
    roles: 'Founder · Director',
    imdb: 'https://www.imdb.com/name/nm7417773/',
    bio: 'Founded 4est Films after working across Los Angeles, London, Minnesota and Arizona. Directed Strung to twelve festival awards, and directs His Name is Michael. He builds each production around the artists he wants in the room, and takes on only the work he intends to be known for.',
  },
];
