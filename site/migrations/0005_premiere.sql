-- The Strung online premiere: pay what you can, watch the film, money goes
-- to addiction recovery.
--
-- "Before His Name is Michael, there was Strung."

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Stripe's session id, and the idempotency key for the webhook. Stripe
  -- retries deliveries and can send the same event twice; without this a
  -- retry would double-count the fundraising total.
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent TEXT,
  email TEXT NOT NULL,
  first_name TEXT,
  -- Minor units, as Stripe reports them. Never a float: 0.1 + 0.2 has no
  -- business anywhere near money.
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  film TEXT NOT NULL DEFAULT 'strung',
  status TEXT NOT NULL DEFAULT 'paid',   -- paid | refunded
  ip_country TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- What a ticket actually is: a token that opens the film.
--
-- Separate from `orders` because the two are not the same thing. A ticket
-- can be reissued without a second payment, comped without any payment at
-- all, or revoked while the order stays on the books for the accounts.
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  order_id INTEGER,
  email TEXT NOT NULL,
  film TEXT NOT NULL DEFAULT 'strung',
  -- Generous on purpose. This is a fundraiser, not a rental store, and
  -- somebody who paid and then lost a week to life should still get to
  -- watch. Enforced at redemption so it can be extended by hand.
  expires_at TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(email);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
