-- Community screenings: demand by city, and the person willing to organise one.
--
-- The whole feature turns on a distinction. Everyone who says "I'd come" is
-- a demand signal, cheap to collect and worth little on its own. The person
-- who says "I'll organise it" is the scarce thing — a theatre needs one
-- accountable human — and the rest of the schema exists to find, equip and
-- keep track of them.

CREATE TABLE IF NOT EXISTS screening_cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Normalised join key: "sioux-falls-sd-us". Everything aggregates on this,
  -- so "Sioux Falls", "sioux falls, SD" and "Sioux Falls, South Dakota"
  -- land in the same bucket. See lib/place.ts — this is the part that
  -- decides whether the counter means anything.
  slug TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,          -- as first typed, for display
  region TEXT,                 -- state / province code where known
  country TEXT NOT NULL DEFAULT 'US',
  film TEXT NOT NULL DEFAULT 'his-name-is-michael',
  -- open | venue_found | scheduled | screened | declined
  status TEXT NOT NULL DEFAULT 'open',
  -- Where the venue research got to, so it is fetched once per city rather
  -- than once per visitor.
  venues_fetched_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_screening_cities_status ON screening_cities(status);

CREATE TABLE IF NOT EXISTS screening_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  -- The signal that matters. A city with 400 requests and no host is worth
  -- less than a city with 30 and someone who will make the calls.
  willing_to_host INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  ip_country TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- One request per person per city. Refreshing the page, or coming back
  -- next week, must not inflate a number we are going to show a theatre.
  UNIQUE (city_id, email)
);
CREATE INDEX IF NOT EXISTS idx_screening_requests_city ON screening_requests(city_id);
CREATE INDEX IF NOT EXISTS idx_screening_requests_host
  ON screening_requests(willing_to_host) WHERE willing_to_host = 1;

-- Venues are leads, not facts.
--
-- They come out of a language model researching the open web, so a phone
-- number can be wrong and a cinema can have closed. Every row keeps the
-- source it came from and when it was fetched, the UI labels them as
-- suggestions, and nothing is ever contacted automatically.
CREATE TABLE IF NOT EXISTS venue_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  website TEXT,
  -- One line on whether this venue does four-walls or community bookings,
  -- which is the actual question a would-be host has.
  note TEXT,
  source_url TEXT,
  provider TEXT NOT NULL DEFAULT 'perplexity',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (city_id, name)
);
CREATE INDEX IF NOT EXISTS idx_venue_leads_city ON venue_leads(city_id);
