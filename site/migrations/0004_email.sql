-- Double opt-in and one-click unsubscribe.
--
-- The list already contains people who signed up in good faith and have
-- never been written to. The first send has to be one they can recognise,
-- confirm and leave — Gmail and Yahoo require a working List-Unsubscribe
-- from bulk senders, and a list with no confirmation step earns spam
-- complaints on its very first broadcast.

-- Opaque, per-subscriber, and used for both confirming and leaving. One
-- secret per person rather than one signing key for everyone: rotating a
-- shared key would invalidate every unsubscribe link already in an inbox.
ALTER TABLE subscribers ADD COLUMN token TEXT;

-- Everyone who signed up before this migration has no token, which would
-- leave them unable to unsubscribe and invisible to every broadcast. Give
-- them one. randomblob(16) is SQLite's CSPRNG, same 32 hex characters the
-- Worker generates.
UPDATE subscribers SET token = lower(hex(randomblob(16))) WHERE token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(token);

-- When the confirmation was last sent, so a re-signup can re-send without
-- becoming a way to mailbomb somebody by typing their address repeatedly.
ALTER TABLE subscribers ADD COLUMN confirm_sent_at TEXT;

-- What went out, so a broadcast can resume where it stopped instead of
-- starting again from the top. A Worker cannot sit in a loop for ten
-- thousand sends, and "send them all again" is not an acceptable retry.
CREATE TABLE IF NOT EXISTS sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign TEXT NOT NULL,
  subscriber_id INTEGER NOT NULL,
  message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign, subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_sends_campaign ON sends(campaign);
