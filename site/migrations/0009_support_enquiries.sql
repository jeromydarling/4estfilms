-- Supporters who want to give but cannot yet.
--
-- Stripe locked the account mid-setup, so the giving form is a conversation
-- instead of a checkout. These rows are the queue to come back to when the
-- account is live again — which is the whole reason to keep them rather than
-- just firing an email at somebody's inbox and hoping it is still findable.
--
-- Separate from `donations` on purpose: an enquiry is an intention, and an
-- intention counted as money is how a fundraising total becomes a lie.

CREATE TABLE IF NOT EXISTS support_enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT NOT NULL,
  -- Free text, not a number. Somebody who writes "whatever helps" is telling
  -- you something, and a NOT NULL integer would have thrown it away.
  amount_band TEXT,
  message TEXT,
  wants_host INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',   -- new | contacted | given | closed
  ip_country TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enq_created ON support_enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_enq_status ON support_enquiries(status);
