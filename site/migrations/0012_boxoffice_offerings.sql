-- Free-will offerings taken by card, through a QR at the door.
--
-- bo_events.offering_cents stays what it was: the cash counted by hand after
-- the night. This table is the other half — what came in through Stripe, one
-- row per gift, with the fee Stripe actually took, so the parish can be
-- handed the net and shown the arithmetic.

CREATE TABLE IF NOT EXISTS bo_offerings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- NULL for a gift to the tour as a whole rather than to one stop.
  event_id INTEGER,
  -- Stripe's session id, and the idempotency key for the webhook.
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount_cents INTEGER NOT NULL,
  -- Read off the balance transaction, never estimated. Zero if unreadable.
  fee_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  giver_name TEXT,
  giver_email TEXT,
  -- Opens the gift page: the making-of and the songs. Holding it is the proof.
  gift_token TEXT UNIQUE NOT NULL,
  ip_country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS bo_offerings_event ON bo_offerings (event_id);
