-- Dedicated test event log. Simulations MUST NOT create tod_events or current_tods.
CREATE TABLE IF NOT EXISTS addon_simulations (
  event_id TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  nm_slug TEXT NOT NULL,
  received_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_addon_simulations_time ON addon_simulations(received_at_utc);
