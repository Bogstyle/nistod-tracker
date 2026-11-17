-- Notifications Discord privées, opt-in. Les anciens envois publics ne sont plus utilisés.
CREATE TABLE IF NOT EXISTS dm_subscriptions (
  discord_user_id TEXT NOT NULL,
  nm_slug TEXT NOT NULL REFERENCES nm_catalog(slug),
  lead_minutes INTEGER NOT NULL CHECK(lead_minutes IN (10,30,60)),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  PRIMARY KEY(discord_user_id,nm_slug)
);
CREATE INDEX IF NOT EXISTS idx_dm_subscriptions_nm ON dm_subscriptions(nm_slug);
CREATE TABLE IF NOT EXISTS dm_deliveries (
  discord_user_id TEXT NOT NULL,
  nm_slug TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  lead_minutes INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'claimed' CHECK(state IN ('claimed','delivered','failed','blocked')),
  attempts INTEGER NOT NULL DEFAULT 1,
  attempted_at_utc TEXT NOT NULL,
  delivered_at_utc TEXT,
  last_error TEXT,
  PRIMARY KEY(discord_user_id,nm_slug,event_id,lead_minutes)
);
