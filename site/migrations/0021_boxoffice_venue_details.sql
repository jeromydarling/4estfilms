-- Venue details for the public event page: street address, box office
-- phone and the venue's own website, so the page can carry a map and
-- contact block. Filled per stop; the page renders the block only when
-- an address is present.
ALTER TABLE bo_events ADD COLUMN venue_address TEXT;
ALTER TABLE bo_events ADD COLUMN venue_phone TEXT;
ALTER TABLE bo_events ADD COLUMN venue_url TEXT;
