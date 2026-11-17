-- NisToD v0.2.0: extension prudente du catalogue CatsEyeXI.
-- Extension ADDITIVE : les 19 NM existants, les ToD, les alertes et le journal sont préservés.
-- window : fenêtre bornée après un ToD ; fixed : échéance fixe, suivi persistant ;
-- lottery : retour possible après cooldown, dépend ensuite des PH ;
-- placeholder : cycle du placeholder, et non apparition garantie du roi beastman.
ALTER TABLE nm_catalog ADD COLUMN spawn_mode TEXT NOT NULL DEFAULT 'window'
  CHECK (spawn_mode IN ('window','fixed','lottery','placeholder'));
UPDATE nm_catalog SET spawn_mode='placeholder'
  WHERE slug IN ('yagudo-avatar','orcish-overlord','diamond-quadav');

-- Deux exceptions NON ajoutées en suivi actif :
-- Carmine Dobsonfly : au moins 10 individus homonymes ; Yilbegan : plusieurs zones.
-- Un ToD sans identifiant d'emplacement donnerait une prédiction trompeuse.
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('centurio-xii-i','Centurio XII-I','Eastern Altepa Desert','[]',540,720,'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/Monsters','2026-11-16','window');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('sozu-bliberry','Sozu Bliberry','Den of Rancor','[]',360,360,'https://catseyexi.com/mob/3711','2026-11-16','fixed');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('ancient-goobbue','Ancient Goobbue','The Boyahda Tree','[]',360,360,'https://catseyexi.com/mob/123?zone=153','2026-11-16','fixed');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('oni-carcass','Oni Carcass','Toraimarai Canal','[]',360,360,'https://catseyexi.com/mob/2982?zone=169','2026-11-16','fixed');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('brazen-bones','Brazen Bones','Toraimarai Canal','[]',360,360,'https://catseyexi.com/mob/5757','2026-11-16','fixed');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('mountain-worm-nm','Mountain Worm NM','Uleguerand Range','[]',1260,1260,'https://catseyexi.com/mob/6095','2026-11-16','fixed');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('ocean-sahagin','Ocean Sahagin','Sea Serpent Grotto','[]',1440,1440,'https://catseyexi.com/mob/2938?zone=176','2026-11-16','fixed');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('charybdis','Charybdis','Sea Serpent Grotto','[]',480,720,'https://catseyexi.com/mob/698?zone=176','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('voluptuous-vivian','Voluptuous Vivian','The Boyahda Tree','[]',480,480,'https://catseyexi.com/mob/4253?zone=153','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('bloodtear-baldurf','Bloodtear Baldurf','La Theine Plateau','[]',1080,1080,'https://catseyexi.com/mob/462?zone=102','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('steelfleece-baldarich','Steelfleece Baldarich','Konschtat Highlands','[]',1080,1080,'https://catseyexi.com/mob/3766?zone=108','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('tonberry-kinq','Tonberry Kinq','Temple of Uggalepih','[]',360,360,'https://catseyexi.com/mob/3961','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('amikiri','Amikiri','Gustav Tunnel','[]',420,420,'https://catseyexi.com/mob/109','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('eastern-shadow','Eastern Shadow','Fei''Yin','[]',600,600,'https://catseyexi.com/mob/1164','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('northern-shadow','Northern Shadow','Fei''Yin','[]',960,960,'https://catseyexi.com/mob/2907','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('southern-shadow','Southern Shadow','Fei''Yin','[]',960,960,'https://catseyexi.com/mob/3709','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('fradubio','Fradubio','Jugner Forest','[]',1260,1260,'https://catseyexi.com/mob/1420','2026-11-16','lottery');
INSERT OR IGNORE INTO nm_catalog(slug,name,zone,aliases,respawn_min_minutes,respawn_max_minutes,source_url,verified_date,spawn_mode)
  VALUES('aiatar','Aiatar','Riverne-Site A01','[]',1260,1260,'https://catseyexi.com/mob/68?zone=30','2026-11-16','lottery');
