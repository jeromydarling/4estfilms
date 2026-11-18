-- Countdown reminders for the box office: one row per order per threshold
-- (14 / 7 / 3 / 1 days out) so a buyer is never reminded twice at the same
-- mark. Written by /api/admin/boxoffice/reminders, fired daily by the
-- "Box office reminders" GitHub Actions cron — the same alarm-clock pattern
-- as the morning digest.
CREATE TABLE IF NOT EXISTS bo_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  buyer_email TEXT NOT NULL,
  threshold_days INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, order_id, threshold_days)
);
CREATE INDEX IF NOT EXISTS idx_bo_reminders_event ON bo_reminders (event_id, threshold_days);
