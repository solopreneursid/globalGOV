-- GovRadar v2.3+ — additive jurisdiction and provenance metadata for both national and regional public sector notices.
ALTER TABLE official_job_notices ADD COLUMN jurisdiction_code TEXT NOT NULL DEFAULT '';
ALTER TABLE official_job_notices ADD COLUMN jurisdiction_name TEXT NOT NULL DEFAULT '';
ALTER TABLE official_job_notices ADD COLUMN government_tier TEXT NOT NULL DEFAULT 'unclassified';
ALTER TABLE official_job_notices ADD COLUMN employer_type TEXT NOT NULL DEFAULT 'unclassified';
UPDATE official_job_notices SET jurisdiction_code='GB-ENG',jurisdiction_name='England',government_tier='national',employer_type='public_education'
 WHERE source_id='uk-dfe-teaching-vacancies' AND jurisdiction_code='';
CREATE INDEX IF NOT EXISTS official_notices_jurisdiction ON official_job_notices(country,jurisdiction_code,government_tier,life_status,closing_at);
