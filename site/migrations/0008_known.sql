-- Known: the non-profit arm of 4est Films. Music, original plays, films.
--
-- Deliberately its own table rather than a `kind` column on `orders`.
-- An order is a purchase that entitles somebody to something — a ticket
-- that has to be issued, can expire, can be revoked. A donation entitles
-- them to nothing and is never revoked; it is a line in a different ledger,
-- read by different people for different reasons. Sharing a table would mean
-- every query about fundraising totals had to remember to exclude tickets,
-- and one day one of them would forget.

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Stripe's session id, and the idempotency key for the webhook. Stripe
  -- retries deliveries and can send the same event twice; the UNIQUE is what
  -- stops a retry double-counting the total.
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent TEXT,
  email TEXT,
  name TEXT,
  -- Minor units, as Stripe reports them. Never a float.
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  -- 'known' today. Present so a second fund does not need a migration.
  fund TEXT NOT NULL DEFAULT 'known',
  status TEXT NOT NULL DEFAULT 'paid',   -- paid | refunded
  ip_country TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_donations_created ON donations(created_at);
CREATE INDEX IF NOT EXISTS idx_donations_email ON donations(email);
