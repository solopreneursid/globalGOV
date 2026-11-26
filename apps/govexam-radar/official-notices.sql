-- GovRadar v2.2: opt-in, additive official-source recruitment notices
-- Compatible with SQLite 3. This table is distinct from imported prototype sample leads.
CREATE TABLE IF NOT EXISTS official_job_notices (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 source_ref TEXT NOT NULL,
 title TEXT NOT NULL,
 employer TEXT NOT NULL,
 country TEXT NOT NULL,
 region TEXT NOT NULL DEFAULT '',
 stream TEXT NOT NULL DEFAULT 'Unclassified',
 apply_url TEXT NOT NULL,
 source_page TEXT NOT NULL,
 published_at TEXT,
 closing_at TEXT NOT NULL,
 first_seen_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL,
 evidence_sha256 TEXT NOT NULL,
 review_state TEXT NOT NULL DEFAULT 'official_feed_unreviewed' CHECK(review_state IN ('official_feed_unreviewed','founder_reviewed','rejected')),
 life_status TEXT NOT NULL DEFAULT 'open' CHECK(life_status IN ('open','expired','withdrawn')),
 UNIQUE(source_id,source_ref)
);
CREATE INDEX IF NOT EXISTS notices_recent ON official_job_notices(life_status,closing_at,first_seen_at DESC);
CREATE INDEX IF NOT EXISTS notices_source ON official_job_notices(source_id,last_seen_at DESC);
CREATE TABLE IF NOT EXISTS source_ingest_runs(
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 finished_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('ok','rejected','error')),
 http_status INTEGER,
 received INTEGER NOT NULL DEFAULT 0,
 accepted INTEGER NOT NULL DEFAULT 0,
 discarded INTEGER NOT NULL DEFAULT 0,
 error_code TEXT,
 details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ingest_runs_source ON source_ingest_runs(source_id,finished_at DESC);
CREATE TABLE IF NOT EXISTS source_feed_cursors (
 source_id TEXT PRIMARY KEY,
 next_page INTEGER NOT NULL DEFAULT 1,
 last_total_pages INTEGER NOT NULL DEFAULT 1,
 last_success_at INTEGER
);
