-- NisToD v0.1.7 : suppression contrôlée et formulaires sans saisie de NM/date/heure.
-- Le nom du salon des journaux (#log) est un paramètre Worker, pas une table D1.
ALTER TABLE tod_events ADD COLUMN invalidated_by_discord_id TEXT;
ALTER TABLE tod_events ADD COLUMN invalidated_by_display_name TEXT;
ALTER TABLE tod_events ADD COLUMN invalidation_reason TEXT;

CREATE TABLE IF NOT EXISTS tod_drafts (
  id TEXT PRIMARY KEY,
  reporter_discord_id TEXT NOT NULL,
  nm_slug TEXT NOT NULL REFERENCES nm_catalog(slug),
  occurred_at_utc TEXT NOT NULL,
  timezone_iana TEXT NOT NULL,
  local_input TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  expires_at_utc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','used','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_tod_drafts_expiry ON tod_drafts(status,expires_at_utc);

-- Patch CatsEyeXI (23 juillet 2026) : les placeholders des trois rois
-- reviennent en 8–9 h, fenêtres de 10 minutes. Les ROIS ne sont pas
-- automatiquement prédits depuis un simple ToD de placeholder.
INSERT OR IGNORE INTO nm_catalog
  (slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date)
VALUES
('yagudo-avatar','Yagudo Avatar','','[]',480,540,'https://server.catseyexi.com/patch-notes','2026-07-23'),
('orcish-overlord','Orcish Overlord','','[]',480,540,'https://server.catseyexi.com/patch-notes','2026-07-23'),
('diamond-quadav','Diamond Quadav','','[]',480,540,'https://server.catseyexi.com/patch-notes','2026-07-23');
