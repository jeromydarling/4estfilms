-- Where a subscriber came from, and what people do with the trailer.
--
-- The launch pushes the same site from three Instagram accounts and a
-- YouTube upload. Without this, "the list grew by 400" is the only fact
-- available afterwards, and it does not say which of those to do again.

ALTER TABLE subscribers ADD COLUMN utm_source TEXT;
ALTER TABLE subscribers ADD COLUMN utm_medium TEXT;
ALTER TABLE subscribers ADD COLUMN utm_campaign TEXT;
ALTER TABLE subscribers ADD COLUMN utm_content TEXT;
ALTER TABLE subscribers ADD COLUMN referrer TEXT;
ALTER TABLE subscribers ADD COLUMN landing_path TEXT;

CREATE INDEX IF NOT EXISTS idx_subscribers_source ON subscribers(utm_source);

-- Playback and other one-off signals. Deliberately not a page-view table:
-- this is here to answer "did people finish the trailer", and counting
-- page views is what Cloudflare's own analytics already does for free.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,               -- trailer_start | trailer_25 | ... | trailer_complete
  film TEXT,                        -- his-name-is-michael | strung
  path TEXT,
  -- Per-page-load random id, generated in the browser and never stored
  -- anywhere else. Enough to collapse one viewer's five progress marks into
  -- one watch; useless for following anyone between pages or visits.
  session TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  ip_country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session);
