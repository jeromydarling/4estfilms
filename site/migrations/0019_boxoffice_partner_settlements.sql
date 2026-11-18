-- Partner credit: a dollar back to the parish for every seat sold
-- through its code.
--
-- Settlements already record money going out, stop by stop. A partner
-- payment belongs to a code as well as to a night: two parishes can
-- fill the same room, and each is owed for its own seats. The code
-- column ties a 'partner' settlement to the bo_promo_codes row it pays
-- down, so the pay list is owed-less-paid per code, not per room.
-- NULL on every settlement that is not a partner payment.

ALTER TABLE bo_settlements ADD COLUMN code TEXT;
