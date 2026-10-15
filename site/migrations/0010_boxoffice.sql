-- The box office: ticketing and merch for the 2027 "His Name is Michael" tour.
--
-- Forty-eight stops, most of them four-walled — we rent the house and run our
-- own door. So this has to be a till, a presale store and a check-in system,
-- and it has to be right about money in all three.
--
-- Everything monetary is INTEGER cents. Never a float: 0.1 + 0.2 has no
-- business anywhere near a tithe calculation.

-- ── the stops ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bo_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'His Name is Michael',
  venue TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT,
  -- ISO 8601 with offset, e.g. 2027-03-14T19:30:00-05:00. Stored with the
  -- offset rather than as UTC because a 7pm show is 7pm in the town it is in,
  -- and the person reading the admin is standing in that town.
  starts_at TEXT NOT NULL,
  doors_at TEXT,
  capacity INTEGER NOT NULL,
  blurb TEXT,
  poster TEXT,
  -- What the house costs us. Reporting only; never shown publicly.
  rental_cents INTEGER NOT NULL DEFAULT 0,
  -- Counted after the night, by hand, from the basket.
  offering_cents INTEGER NOT NULL DEFAULT 0,
  -- Which run of the tour this stop belongs to, for leg subtotals.
  leg TEXT,
  -- draft | on_sale | closed | past. Nothing sells unless 'on_sale'.
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bo_events_starts ON bo_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_bo_events_status ON bo_events(status);

-- ── what can be bought ───────────────────────────────────────────────────
-- A catalogue rather than hard-coded prices, because the tour will invent a
-- package halfway through and nobody should need a deploy to sell it.
CREATE TABLE IF NOT EXISTS bo_products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- ticket | package | merch
  kind TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  -- How many admissions this grants. Drives capacity and ticket minting:
  -- the family package is one line item and four people through the door.
  admits INTEGER NOT NULL DEFAULT 0,
  -- Shirts need a size chosen at purchase.
  needs_size INTEGER NOT NULL DEFAULT 0,
  -- Merch units this consumes, as JSON {"sku": qty}, so a package can draw
  -- down the same shirt stock a standalone shirt does.
  consumes TEXT,
  blurb TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Per-stop availability and price overrides. A row here means "offered";
-- price_cents NULL means "use the catalogue price".
CREATE TABLE IF NOT EXISTS bo_event_products (
  event_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  price_cents INTEGER,
  PRIMARY KEY (event_id, sku)
);

-- ── partner attribution ──────────────────────────────────────────────────
-- Issued per parish or organisation so we can tell who actually filled the
-- house. Discount is optional and usually zero — the point is the name.
CREATE TABLE IF NOT EXISTS bo_promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,          -- stored uppercase
  partner TEXT NOT NULL,
  -- NULL means the code works at any stop.
  event_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'none',  -- none | percent | fixed
  value INTEGER NOT NULL DEFAULT 0,   -- percent points, or cents
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── the money ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bo_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  -- Stripe's session id, and the idempotency key for the webhook. Stripe
  -- retries and can deliver the same event twice.
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  -- A door device's own id for a sale made offline. UNIQUE so replaying a
  -- sync queue after a dropped connection cannot sell the same seat twice.
  offline_id TEXT UNIQUE,
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  -- What Stripe actually took, read off the balance transaction rather than
  -- estimated from a rate card. Zero for cash.
  fee_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  promo_code TEXT,
  -- web | door_card | door_cash
  channel TEXT NOT NULL DEFAULT 'web',
  -- paid | refunded | partially_refunded
  status TEXT NOT NULL DEFAULT 'paid',
  operator TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bo_orders_event ON bo_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_bo_orders_promo ON bo_orders(promo_code);
CREATE INDEX IF NOT EXISTS idx_bo_orders_email ON bo_orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_bo_orders_created ON bo_orders(created_at);

CREATE TABLE IF NOT EXISTS bo_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  size TEXT,
  admits INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bo_items_order ON bo_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_bo_items_sku ON bo_order_items(sku);

-- ── admissions ───────────────────────────────────────────────────────────
-- One row per human through the door, not per line item: a family package is
-- four of these. Capacity, check-in and the door count all read this table,
-- so they cannot disagree with each other.
CREATE TABLE IF NOT EXISTS bo_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  label TEXT,
  seq INTEGER NOT NULL DEFAULT 1,
  checked_in_at TEXT,
  checked_in_by TEXT,
  -- Set when an order is refunded. The ticket stays on the books; it just
  -- stops opening the door.
  void_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bo_tickets_event ON bo_tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_bo_tickets_order ON bo_tickets(order_id);

-- ── stock ────────────────────────────────────────────────────────────────
-- Shirts are tracked by size; everything else uses size ''. The composite
-- key is what makes "medium is gone but large is fine" expressible.
CREATE TABLE IF NOT EXISTS bo_inventory (
  sku TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  on_hand INTEGER NOT NULL DEFAULT 0,
  low_at INTEGER NOT NULL DEFAULT 6,
  PRIMARY KEY (sku, size)
);

-- ── the catalogue, as the tour sells it ──────────────────────────────────
INSERT OR IGNORE INTO bo_products (sku, name, kind, price_cents, admits, needs_size, consumes, blurb, sort) VALUES
  ('ticket',   'Single ticket',        'ticket',  1500, 1, 0, NULL,
   'One seat.', 10),
  ('pkg_tee',  'Ticket + t-shirt',     'package', 3000, 1, 1, '{"tee":1}',
   'One seat and a tour shirt.', 20),
  ('pkg_corn', 'Ticket + popcorn bucket','package',3000, 1, 0, '{"bucket":1}',
   'One seat and a branded bucket, refilled all night.', 30),
  ('pkg_fam',  'Family package',       'package', 5000, 4, 0, '{"bucket":1,"poster":1}',
   'Four seats, a popcorn bucket and a poster.', 40),
  ('pkg_patron','Patron package',      'package',10000, 2, 0, '{"poster_signed":1,"soundtrack":1,"prayer_card":1}',
   'Two seats, a signed poster, the soundtrack and a prayer card.', 50),
  ('poster',   'Poster',               'merch',   2000, 0, 0, '{"poster":1}',
   'The key art, 18x24.', 60),
  ('soundtrack','Soundtrack',          'merch',   1500, 0, 0, '{"soundtrack":1}',
   'The score and the songs.', 70),
  ('tee',      'T-shirt',              'merch',   2500, 0, 1, '{"tee":1}',
   'Tour shirt.', 80);

INSERT OR IGNORE INTO bo_inventory (sku, size, on_hand, low_at) VALUES
  ('tee','S',40,6), ('tee','M',80,10), ('tee','L',80,10), ('tee','XL',60,8), ('tee','2XL',30,6),
  ('bucket','',300,30), ('poster','',250,25), ('poster_signed','',100,15),
  ('soundtrack','',200,20), ('prayer_card','',500,50);
