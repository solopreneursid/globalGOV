BEGIN;

DO $$
DECLARE
  expected TEXT[] := ARRAY[
    'members','posts','replies','votes','reports','moderation_actions',
    'portal_status','portal_history','official_job_notices','source_ingest_runs',
    'source_feed_cursors','notice_revisions','scheduler_runs'
  ];
  actual_count INTEGER;
  revision_count INTEGER;
BEGIN
  SELECT count(*) INTO actual_count
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = ANY(expected);
  IF actual_count <> cardinality(expected) THEN
    RAISE EXCEPTION 'missing expected tables: % of %', actual_count, cardinality(expected);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001_core') THEN
    RAISE EXCEPTION 'schema migration marker missing';
  END IF;

  INSERT INTO official_job_notices (
    id,source_id,source_ref,title,employer,country,apply_url,source_page,
    closing_at,first_seen_at,last_seen_at,evidence_sha256
  ) VALUES (
    'schema-trigger-test','schema-test','ref-1','Test notice','Test authority','India',
    'https://example.gov/apply','https://example.gov/notice','2099-01-01T00:00:00Z',
    1,1,repeat('a',64)
  );

  UPDATE official_job_notices
     SET evidence_sha256 = repeat('b',64)
   WHERE id = 'schema-trigger-test';

  SELECT count(*) INTO revision_count
    FROM notice_revisions WHERE notice_id = 'schema-trigger-test';
  IF revision_count <> 1 THEN
    RAISE EXCEPTION 'notice revision trigger failed: %', revision_count;
  END IF;
END $$;

ROLLBACK;
