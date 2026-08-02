-- The Midwest, opened.
--
-- These are cities, not requests. Nothing here invents a person: every row
-- lands with a count of zero and reads as "no one yet — be the first."
-- Seeding counts would be seeding a lie, and the number ends up in a letter
-- to a real venue that says how many people asked.
--
-- What this fixes is the empty-map problem. A visitor who arrives to a blank
-- text field has to know what to type and believe anything will come of it;
-- a visitor who sees their own city already listed just clicks it.
--
-- The slugs must match exactly what lib/place.ts produces for the same
-- input, or somebody typing "Minneapolis" opens a second bucket beside the
-- seeded one. Verified against the parser rather than written by hand.

INSERT OR IGNORE INTO screening_cities (slug, city, region, country, film, status) VALUES
  -- South Dakota first: the film was shot here, and Strung premiered at the
  -- State Theatre in Sioux Falls.
  ('sioux-falls-sd-us',    'Sioux Falls',    'SD', 'US', 'his-name-is-michael', 'open'),
  ('rapid-city-sd-us',     'Rapid City',     'SD', 'US', 'his-name-is-michael', 'open'),
  ('brookings-sd-us',      'Brookings',      'SD', 'US', 'his-name-is-michael', 'open'),

  ('minneapolis-mn-us',    'Minneapolis',    'MN', 'US', 'his-name-is-michael', 'open'),
  ('st-paul-mn-us',        'St. Paul',       'MN', 'US', 'his-name-is-michael', 'open'),
  ('duluth-mn-us',         'Duluth',         'MN', 'US', 'his-name-is-michael', 'open'),
  ('rochester-mn-us',      'Rochester',      'MN', 'US', 'his-name-is-michael', 'open'),

  -- Ames is where Jeromy grew up.
  ('ames-ia-us',           'Ames',           'IA', 'US', 'his-name-is-michael', 'open'),
  ('des-moines-ia-us',     'Des Moines',     'IA', 'US', 'his-name-is-michael', 'open'),
  ('iowa-city-ia-us',      'Iowa City',      'IA', 'US', 'his-name-is-michael', 'open'),
  ('cedar-rapids-ia-us',   'Cedar Rapids',   'IA', 'US', 'his-name-is-michael', 'open'),

  ('omaha-ne-us',          'Omaha',          'NE', 'US', 'his-name-is-michael', 'open'),
  ('lincoln-ne-us',        'Lincoln',        'NE', 'US', 'his-name-is-michael', 'open'),

  ('fargo-nd-us',          'Fargo',          'ND', 'US', 'his-name-is-michael', 'open'),
  ('bismarck-nd-us',       'Bismarck',       'ND', 'US', 'his-name-is-michael', 'open'),

  ('milwaukee-wi-us',      'Milwaukee',      'WI', 'US', 'his-name-is-michael', 'open'),
  ('madison-wi-us',        'Madison',        'WI', 'US', 'his-name-is-michael', 'open'),
  ('green-bay-wi-us',      'Green Bay',      'WI', 'US', 'his-name-is-michael', 'open'),

  ('chicago-il-us',        'Chicago',        'IL', 'US', 'his-name-is-michael', 'open'),

  ('indianapolis-in-us',   'Indianapolis',   'IN', 'US', 'his-name-is-michael', 'open'),
  ('bloomington-in-us',    'Bloomington',    'IN', 'US', 'his-name-is-michael', 'open'),

  ('detroit-mi-us',        'Detroit',        'MI', 'US', 'his-name-is-michael', 'open'),
  ('ann-arbor-mi-us',      'Ann Arbor',      'MI', 'US', 'his-name-is-michael', 'open'),
  ('grand-rapids-mi-us',   'Grand Rapids',   'MI', 'US', 'his-name-is-michael', 'open'),

  ('columbus-oh-us',       'Columbus',       'OH', 'US', 'his-name-is-michael', 'open'),
  ('cleveland-oh-us',      'Cleveland',      'OH', 'US', 'his-name-is-michael', 'open'),
  ('cincinnati-oh-us',     'Cincinnati',     'OH', 'US', 'his-name-is-michael', 'open'),

  ('kansas-city-mo-us',    'Kansas City',    'MO', 'US', 'his-name-is-michael', 'open'),
  ('st-louis-mo-us',       'St. Louis',      'MO', 'US', 'his-name-is-michael', 'open'),
  ('springfield-mo-us',    'Springfield',    'MO', 'US', 'his-name-is-michael', 'open'),

  ('wichita-ks-us',        'Wichita',        'KS', 'US', 'his-name-is-michael', 'open'),
  ('lawrence-ks-us',       'Lawrence',       'KS', 'US', 'his-name-is-michael', 'open');
