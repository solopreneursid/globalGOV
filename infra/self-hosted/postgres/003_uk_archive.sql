-- Isolated, non-public UK mirror history; never used as canonical listings.
BEGIN;
CREATE SCHEMA IF NOT EXISTS uk_archive;
REVOKE ALL ON SCHEMA uk_archive FROM PUBLIC;
CREATE TABLE IF NOT EXISTS uk_archive.official_job_notices (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL CHECK (source_id='uk-dfe-teaching-vacancies'),
 source_ref TEXT NOT NULL,
 title TEXT NOT NULL,
 employer TEXT NOT NULL,
 country TEXT NOT NULL CHECK (country='United Kingdom'),
 region TEXT NOT NULL,
 stream TEXT NOT NULL,
 apply_url TEXT NOT NULL,
 source_page TEXT NOT NULL CHECK (source_page LIKE 'https://teaching-vacancies.service.gov.uk/jobs/%'),
 published_at TEXT,
 closing_at TEXT NOT NULL,
 first_seen_at BIGINT NOT NULL,
 last_seen_at BIGINT NOT NULL,
 evidence_sha256 TEXT NOT NULL,
 review_state TEXT NOT NULL,
 life_status TEXT NOT NULL,
 jurisdiction_code TEXT NOT NULL,
 jurisdiction_name TEXT NOT NULL,
 government_tier TEXT NOT NULL,
 employer_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uk_archive.uk_mirror_runs(id TEXT PRIMARY KEY,scheduled_at BIGINT NOT NULL,started_at BIGINT NOT NULL,finished_at BIGINT,state TEXT NOT NULL CHECK(state IN ('running','ok','partial','error')),rows_upserted BIGINT NOT NULL DEFAULT 0,error_code TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS uk_archive.uk_mirror_state(id BIGINT PRIMARY KEY CHECK(id=1),last_cursor_seen BIGINT NOT NULL DEFAULT 0 CHECK(last_cursor_seen>=0),last_cursor_id TEXT NOT NULL DEFAULT '',last_success_at BIGINT NOT NULL DEFAULT 0,last_attempt_at BIGINT NOT NULL DEFAULT 0,last_native_source_at BIGINT NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'never_run' CHECK(status IN ('never_run','ok','partial','error')),error_code TEXT NOT NULL DEFAULT '',last_rows_upserted BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS uk_archive.uk_withdrawal_checks(notice_id TEXT PRIMARY KEY,source_seen_at BIGINT NOT NULL,last_checked_at BIGINT NOT NULL,http_status BIGINT NOT NULL CHECK(http_status IN (200,404,410)),gone_count BIGINT NOT NULL DEFAULT 0 CHECK(gone_count BETWEEN 0 AND 2),missing_count BIGINT NOT NULL DEFAULT 0 CHECK(missing_count BETWEEN 0 AND 2),review_required BIGINT NOT NULL DEFAULT 0 CHECK(review_required IN (0,1)));
INSERT INTO schema_migrations(version) VALUES ('003_uk_archive') ON CONFLICT (version) DO NOTHING;
COMMIT;
