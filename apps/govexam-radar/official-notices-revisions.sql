-- GovRadar notice revisions: auditable changes from official syndicated sources.
CREATE TABLE IF NOT EXISTS notice_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 notice_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 observed_at INTEGER NOT NULL,
 old_title TEXT NOT NULL,
 new_title TEXT NOT NULL,
 old_closing_at TEXT NOT NULL,
 new_closing_at TEXT NOT NULL,
 old_hash TEXT NOT NULL,
 new_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS revision_seen ON notice_revisions(observed_at DESC);
CREATE INDEX IF NOT EXISTS revision_source ON notice_revisions(source_id,observed_at DESC);
CREATE TRIGGER IF NOT EXISTS capture_official_notice_revisions
AFTER UPDATE OF evidence_sha256 ON official_job_notices
WHEN OLD.evidence_sha256 <> NEW.evidence_sha256
BEGIN
 INSERT INTO notice_revisions(notice_id,source_id,observed_at,old_title,new_title,old_closing_at,new_closing_at,old_hash,new_hash)
 VALUES(NEW.id,NEW.source_id,CAST(strftime('%s','now') AS INTEGER)*1000,OLD.title,NEW.title,OLD.closing_at,NEW.closing_at,OLD.evidence_sha256,NEW.evidence_sha256);
END;
