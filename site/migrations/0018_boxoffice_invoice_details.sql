-- Group invoices grow up into documents a parish office can pay from.
--
-- Until now a group sale was a row on the stop's report: a name, a seat
-- count, a total. A school business office cannot cut a cheque against
-- that. It needs an invoice number, a bill-to block with a mailing
-- address, an issue date and a due date, and a record of when the invoice
-- was actually sent and how it was finally paid.
--
-- invoice_number  INV-<year>-<seq>, allocated from bo_invoice_seq at
--                 creation. Orders from before this migration have none;
--                 the document falls back to the order id, which is just
--                 as unique and never reused.
-- org_name        the organisation being billed (the parish, the school).
--                 buyer_name keeps the same value: it is the label the
--                 tickets are minted under and the name will-call knows.
-- contact_name    the person at the organisation who asked for the seats.
-- buyer_address   their mailing address, as typed, newlines and all.
-- issued_on       the day the invoice was created (YYYY-MM-DD).
-- due_on          when payment is due. At creation: the earlier of
--                 fourteen days out or a week before the show, unless
--                 the admin typed a date of their own.
-- sent_at         when the invoice was last emailed to the group.
-- pay_method      cheque | transfer | card | cash, set when it is paid.
--                 The reference column keeps the cheque number.

ALTER TABLE bo_orders ADD COLUMN invoice_number TEXT;
ALTER TABLE bo_orders ADD COLUMN org_name TEXT;
ALTER TABLE bo_orders ADD COLUMN contact_name TEXT;
ALTER TABLE bo_orders ADD COLUMN buyer_address TEXT;
ALTER TABLE bo_orders ADD COLUMN issued_on TEXT;
ALTER TABLE bo_orders ADD COLUMN due_on TEXT;
ALTER TABLE bo_orders ADD COLUMN sent_at TEXT;
ALTER TABLE bo_orders ADD COLUMN pay_method TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bo_orders_invoice_number
  ON bo_orders (invoice_number) WHERE invoice_number IS NOT NULL;

-- One counter per year. The API reads it with an upsert that hands back
-- the number it just allocated, so two invoices created in the same
-- second cannot share one.
CREATE TABLE IF NOT EXISTS bo_invoice_seq (
  year INTEGER PRIMARY KEY,
  next INTEGER NOT NULL
);
