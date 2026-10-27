-- Sponsor a Family: the stop's side.
--
-- partner_name / partner_confirmed  the local partner (agency, parish or
--                                   foster/adoption ministry) who distributes
--                                   sponsored seats. "The Whole Block" is
--                                   only offered where one is confirmed.
-- sponsor_claimed                   seats the partner has placed with families.
-- sponsor_released                  unclaimed sponsored seats released to the
--                                   general audience at showtime.
--
-- seats_sponsored is not a column: it is the sum of paid orders bound to the
-- stop, so a refund takes its seats back out of the pool by itself.

ALTER TABLE bo_events ADD COLUMN partner_name TEXT;
ALTER TABLE bo_events ADD COLUMN partner_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bo_events ADD COLUMN sponsor_claimed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bo_events ADD COLUMN sponsor_released INTEGER NOT NULL DEFAULT 0;
