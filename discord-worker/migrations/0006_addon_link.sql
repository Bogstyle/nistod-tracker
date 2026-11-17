-- NisToD v0.3.0: optional companion pairing, server-side token hashes only.
-- Additive: does not modify old ToDs, subscriptions or panel.
CREATE TABLE IF NOT EXISTS addon_pair_codes (
  code_hash TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  reporter_display_name TEXT NOT NULL,
  expires_at_utc TEXT NOT NULL,
  used_at_utc TEXT,
  created_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_addon_pairs_expires ON addon_pair_codes(expires_at_utc);
CREATE TABLE IF NOT EXISTS addon_tokens (
  token_hash TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  reporter_display_name TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  revoked_at_utc TEXT,
  last_used_at_utc TEXT
);
CREATE INDEX IF NOT EXISTS idx_addon_tokens_user ON addon_tokens(discord_user_id,revoked_at_utc);
-- The UNIQUE constraint on tod_events.discord_interaction_id provides
-- deduplication for addon event IDs across retries and reconnects.
