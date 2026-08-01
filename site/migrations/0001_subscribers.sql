-- Mailing list for release/screening announcements.
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'site',
  film TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  ip_country TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(lower(email));
