-- Orders learn about tax, invoices and comps.
--
-- tax_cents        sales tax Stripe collected on the order. Remitted, not
--                  revenue: total_cents excludes it.
-- reserved_admits  seats an unpaid group invoice is holding. Counted against
--                  capacity until the invoice is paid (and tickets minted) or
--                  cancelled.
-- note, reference  why a comp was issued; the cheque number an invoice was
--                  paid with.
--
-- Separate from 0013 so a re-run that fails on one table's first ALTER does
-- not skip the other table's.

ALTER TABLE bo_orders ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bo_orders ADD COLUMN reserved_admits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bo_orders ADD COLUMN note TEXT;
ALTER TABLE bo_orders ADD COLUMN reference TEXT;
