-- Sponsor a Family: the order's side.
--
-- One sponsorship per order: a tier, how many of it, the seats that comes to,
-- and the stop it is bound to — which is the stop being bought by default and
-- any upcoming stop if the buyer chose "a different city". The same fields go
-- on the Stripe payment's metadata, so the two records can be matched without
-- us.

ALTER TABLE bo_orders ADD COLUMN sponsor_tier TEXT;
ALTER TABLE bo_orders ADD COLUMN sponsor_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bo_orders ADD COLUMN sponsor_seats INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bo_orders ADD COLUMN sponsor_stop_id INTEGER;
