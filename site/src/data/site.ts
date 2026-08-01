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
  directors: ['Joseph Bezenek', 'Ryan H. Reid'],
  writers: ['Wenonah Wilms', 'Jeromy Darling', 'Joseph Bezenek', 'Ryan H. Reid'],
  producers: ['Joseph Bezenek', 'Ryan H. Reid', 'Alexander C. Shields', 'Molly Worre'],
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
  eras: [
    { year: '1867', note: 'Virginia City, Nevada — after the bonanza that made it the most important industrial city between Denver and San Francisco.' },
    { year: '1890', note: 'A schoolroom, a barn, and a presence that should not be there.' },
  ],
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
  // The nine-day shoot, Nov 14–24 2023, from the team's own dispatches.
  diary: [
    { day: 1, title: 'Providence', text: 'We shot only 40% of what we scheduled — but we tackled the most difficult part of the script, technically and emotionally. It is also the opening of the film, so it was vital we did it right.' },
    { day: 2, title: 'All hands', text: 'Every minute of another twelve-hour day. We captured every shot on the schedule.' },
    { day: 3, title: 'Adjustments', text: 'Massive wind. Drilling feet from our location. A piano half a key off pitch. We worked late into the night and captured some of the most magnificent moments yet.' },
    { day: 4, title: 'Beauty and pain', text: 'The most difficult day to date — and the most rewarding. One image, filled with light and blood, says it better than we can.' },
    { day: 5, title: 'A groove', text: 'After four days of intense emotional scenes, a day of adorable ones. A sporadic dance party broke out. One very talented young actor wrapped.' },
    { day: 6, title: 'From children to demons', text: 'We went from precious children spitting verses in a historically kept 1890 classroom to a demonic presence haunting our main characters in a barn. Our director shed tears for the first time on set.' },
    { day: 7, title: 'Twenty children', text: 'It started with prayer and ended full of kids. So much energy and joy and focus. We learned a lot from them.' },
    { day: 8, title: 'Split in two', text: 'One look at the call sheet and it was near impossible to wrap our heads around finishing. We split the team and sent half to another location.' },
    { day: 9, title: 'Wrap', text: 'A skeleton crew and guerrilla-style shooting. Clear skies, sixty degrees, the Missouri River, and a horse named “Hollywood.”' },
  ],
  shootNote: 'Nine days. November 14–24, 2023. Virginia City, Nevada.',
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
    bio: 'Founded 4est Films after working across LA, London, Minnesota and Arizona. Co-directed Strung; directs His Name is Michael. Collaborates with artists met along the way to make new work — and refuses to spend time on anything he is not overwhelmingly passionate about.',
  },
  {
    name: 'Ryan H. Reid',
    roles: 'Co-Director · Producer',
    imdb: 'https://www.imdb.com/name/nm8628776/',
    bio: 'Co-director, co-writer and co-producer of Strung. In the film’s own words, the debut belonged to “Bez and Reid” — a first feature made on determination, love, and care.',
  },
];
