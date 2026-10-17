-- Settling up with a hundred parishes, and the people who missed out.

-- What has actually been paid to whom. The report says what a stop owes;
-- this says what has gone out the door, so "did we send Omaha their cheque?"
-- has an answer that is not a search through a bank statement.
CREATE TABLE IF NOT EXISTS bo_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  -- tithe | offering | rental
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (date('now')),
  -- cheque | transfer | cash
  method TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bo_settlements_event ON bo_settlements (event_id);

-- People who wanted a seat at a stop that had none. Per stop, so a second
-- showing in Omaha is announced to the people who wanted Omaha.
CREATE TABLE IF NOT EXISTS bo_waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  ip_country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notified_at TEXT,
  UNIQUE (event_id, email)
);
