-- A stop's door PIN, its host link, and the seats it holds back.
--
-- door_pin   four digits that open /boxoffice/door/<stop>/ and nothing else,
--            so a volunteer in a town we have never been to never holds the
--            admin password.
-- host_token opens a read-only page for the parish coordinator: seats sold,
--            what their own codes brought in, what they are owed.
-- holds      seats kept off the web (clergy, press, the family who fed the
--            crew). The door can still sell them; the shop cannot.
--
-- SQLite has no ADD COLUMN IF NOT EXISTS: a re-run fails on the first line and
-- the workflow carries on, which is the expected no-op.

ALTER TABLE bo_events ADD COLUMN door_pin TEXT;
ALTER TABLE bo_events ADD COLUMN host_token TEXT;
ALTER TABLE bo_events ADD COLUMN holds INTEGER NOT NULL DEFAULT 0;

-- Stops that exist already get a PIN and a host link now rather than the
-- first time somebody opens the report.
UPDATE bo_events SET door_pin = CAST(abs(random()) % 9000 + 1000 AS TEXT) WHERE door_pin IS NULL;
UPDATE bo_events SET host_token = lower(hex(randomblob(16))) WHERE host_token IS NULL;
