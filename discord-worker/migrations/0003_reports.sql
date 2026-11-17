-- NisToD Tracker v0.1.6 : journal public des déclarations dans #reports.
-- L'ajout d'une déclaration et sa mise en file de journal sont atomiques grâce au trigger.
-- Les événements historiques précédant cette migration ne sont pas publiés rétroactivement.
ALTER TABLE tod_events ADD COLUMN reporter_display_name TEXT;

CREATE TABLE IF NOT EXISTS report_log_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES tod_events(id),
  kind TEXT NOT NULL CHECK (kind IN ('submission', 'invalidation')),
  delivery_state TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending', 'claimed', 'failed', 'delivered')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at_utc TEXT,
  delivered_at_utc TEXT,
  discord_message_id TEXT,
  last_error TEXT,
  created_at_utc TEXT NOT NULL,
  UNIQUE (event_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_report_outbox_queue ON report_log_outbox (delivery_state, attempts, id);

CREATE TRIGGER IF NOT EXISTS trg_nistod_report_submitted
AFTER INSERT ON tod_events
BEGIN
  INSERT OR IGNORE INTO report_log_outbox(event_id,kind,created_at_utc)
  VALUES (NEW.id,'submission',NEW.created_at_utc);
END;

-- Les invalidations futures, même exécutées dans D1, seront notées ; l'auteur de
-- l'invalidation n'est pas déductible d'une modification SQL directe.
CREATE TRIGGER IF NOT EXISTS trg_nistod_report_invalidated
AFTER UPDATE OF state ON tod_events
WHEN OLD.state <> 'invalidated' AND NEW.state = 'invalidated'
BEGIN
  INSERT OR IGNORE INTO report_log_outbox(event_id,kind,created_at_utc)
  VALUES (NEW.id,'invalidation',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
