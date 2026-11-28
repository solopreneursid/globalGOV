CREATE TABLE IF NOT EXISTS official_job_notices (
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
 first_seen_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL,
 evidence_sha256 TEXT NOT NULL,
 review_state TEXT NOT NULL,
 life_status TEXT NOT NULL,
 jurisdiction_code TEXT NOT NULL,
 jurisdiction_name TEXT NOT NULL,
 government_tier TEXT NOT NULL,
 employer_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uk_mirror_runs(id TEXT PRIMARY KEY,scheduled_at INTEGER NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,state TEXT NOT NULL CHECK(state IN ('running','ok','partial','error')),rows_upserted INTEGER NOT NULL DEFAULT 0,error_code TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS uk_mirror_state(id INTEGER PRIMARY KEY CHECK(id=1),last_cursor_seen INTEGER NOT NULL DEFAULT 0 CHECK(last_cursor_seen>=0),last_cursor_id TEXT NOT NULL DEFAULT '',last_success_at INTEGER NOT NULL DEFAULT 0,last_attempt_at INTEGER NOT NULL DEFAULT 0,last_native_source_at INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'never_run' CHECK(status IN ('never_run','ok','partial','error')),error_code TEXT NOT NULL DEFAULT '',last_rows_upserted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS uk_withdrawal_checks(notice_id TEXT PRIMARY KEY,source_seen_at INTEGER NOT NULL,last_checked_at INTEGER NOT NULL,http_status INTEGER NOT NULL CHECK(http_status IN (200,404,410)),gone_count INTEGER NOT NULL DEFAULT 0 CHECK(gone_count BETWEEN 0 AND 2),missing_count INTEGER NOT NULL DEFAULT 0 CHECK(missing_count BETWEEN 0 AND 2),review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN (0,1)));
INSERT INTO official_job_notices VALUES('uk-synthetic','uk-dfe-teaching-vacancies','synthetic-ref','Synthetic UK notice','Synthetic school','United Kingdom','','Unclassified','https://teaching-vacancies.service.gov.uk/jobs/synthetic','https://teaching-vacancies.service.gov.uk/jobs/synthetic',NULL,'2099-01-01T00:00:00Z',100,100,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','official_feed_unreviewed','open','GB-ENG','England','national','public_education');
INSERT INTO uk_mirror_runs VALUES('synthetic-run',100,100,101,'ok',1,'');
INSERT INTO uk_mirror_state VALUES(1,100,'uk-synthetic',101,101,100,'ok','',1);
INSERT INTO uk_withdrawal_checks VALUES('uk-synthetic',100,101,200,0,0,0);
