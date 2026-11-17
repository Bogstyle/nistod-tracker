PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS nm_catalog (
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, zone TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  respawn_min_minutes INTEGER NOT NULL CHECK(respawn_min_minutes > 0),
  respawn_max_minutes INTEGER NOT NULL CHECK(respawn_max_minutes >= respawn_min_minutes),
  source_url TEXT NOT NULL, verified_date TEXT, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS user_preferences (
  discord_user_id TEXT PRIMARY KEY,
  timezone_iana TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tod_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_interaction_id TEXT UNIQUE NOT NULL,
  nm_slug TEXT NOT NULL REFERENCES nm_catalog(slug),
  event_type TEXT NOT NULL CHECK(event_type IN ('KILL_CONFIRMED','SIGHTING_ALIVE')),
  occurred_at_utc TEXT NOT NULL,
  source_timezone TEXT NOT NULL,
  local_input TEXT NOT NULL,
  reporter_discord_id TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'accepted' CHECK(state IN ('accepted','conflict','invalidated'))
);
CREATE INDEX IF NOT EXISTS idx_tod_events_nm ON tod_events(nm_slug, id DESC);
CREATE TABLE IF NOT EXISTS current_tods (
  nm_slug TEXT PRIMARY KEY REFERENCES nm_catalog(slug),
  event_id INTEGER NOT NULL REFERENCES tod_events(id),
  occurred_at_utc TEXT NOT NULL,
  window_start_utc TEXT NOT NULL,
  window_end_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alert_deliveries (
  nm_slug TEXT NOT NULL, event_id INTEGER NOT NULL, alert_kind TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'claimed', attempted_at_utc TEXT NOT NULL,
  delivered_at_utc TEXT,
  PRIMARY KEY(nm_slug,event_id,alert_kind)
);

INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date)
VALUES
('simurgh','Simurgh','Rolanberry Fields','["simu"]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('argus','Argus','','[]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('behemoth','Behemoth','','["behe"]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('fafnir','Fafnir','','[]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('adamantoise','Adamantoise','','[]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('king-arthro','King Arthro','','["ka"]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('shikigami-weapon','Shikigami Weapon','','["shiki"]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('serket','Serket','','[]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('roc','Roc','','[]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('lord-of-onzozo','Lord of Onzozo','','["loo"]',1260,1290,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('khimaira','Khimaira','','[]',3420,3480,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('cerberus','Cerberus','','[]',3420,3480,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('hydra','Hydra','','[]',3420,3480,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('medusa','Medusa','','[]',4860,4920,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('gurfurlur-the-menacing','Gurfurlur the Menacing','','["gurfurlur"]',4860,4920,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16'),
('gulool-ja-ja','Gulool Ja Ja','','["gulool"]',4860,4920,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs','2026-11-16');
