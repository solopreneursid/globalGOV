-- GovRadar UK-only staging mirror metadata.
-- Apply ONLY to D1 govradar-uk-candidate-preview
-- (c5e0b548-528c-4698-a172-a527abf68e27).
-- Never run this on shared community/HQ D1 databases.
-- The separate official_job_notices table is created by the UK candidate schema.
CREATE TABLE IF NOT EXISTS uk_mirror_state(
 id INTEGER PRIMARY KEY CHECK(id=1),
 last_cursor_seen INTEGER NOT NULL DEFAULT 0 CHECK(last_cursor_seen>=0),
 last_cursor_id TEXT NOT NULL DEFAULT '',
 last_success_at INTEGER NOT NULL DEFAULT 0,
 last_attempt_at INTEGER NOT NULL DEFAULT 0,
 last_native_source_at INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'never_run' CHECK(status IN ('never_run','ok','partial','error')),
 error_code TEXT NOT NULL DEFAULT '',
 last_rows_upserted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS uk_mirror_runs(
 id TEXT PRIMARY KEY,
 scheduled_at INTEGER NOT NULL,
 started_at INTEGER NOT NULL,
 finished_at INTEGER,
 state TEXT NOT NULL CHECK(state IN ('running','ok','partial','error')),
 rows_upserted INTEGER NOT NULL DEFAULT 0,
 error_code TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO uk_mirror_state(id) VALUES(1);

-- No false withdrawals: only repeated independent direct HTTP 410 responses
-- can mark an official listing as withdrawn_confirmed. 404 is review-only.
-- This table remains PRIVATE; not exposed by the public UK Worker.
CREATE TABLE IF NOT EXISTS uk_withdrawal_checks(
 notice_id TEXT PRIMARY KEY,
 source_seen_at INTEGER NOT NULL,
 last_checked_at INTEGER NOT NULL,
 http_status INTEGER NOT NULL CHECK(http_status IN (200,404,410)),
 gone_count INTEGER NOT NULL DEFAULT 0 CHECK(gone_count BETWEEN 0 AND 2),
 missing_count INTEGER NOT NULL DEFAULT 0 CHECK(missing_count BETWEEN 0 AND 2),
 review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN (0,1))
);
CREATE INDEX IF NOT EXISTS uk_withdrawal_review
 ON uk_withdrawal_checks(review_required,last_checked_at);
