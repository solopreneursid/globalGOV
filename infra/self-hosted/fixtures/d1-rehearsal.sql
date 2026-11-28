-- Synthetic fixture: schema metadata only, no production records.
PRAGMA foreign_keys=OFF;
CREATE TABLE members (id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE COLLATE NOCASE, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_post_at INTEGER NOT NULL DEFAULT 0, last_reply_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE moderation_actions (
 id TEXT PRIMARY KEY,
 target_type TEXT NOT NULL CHECK(target_type IN ('post','reply')),
 target_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('hide','restore','dismiss')),
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 admin_label TEXT NOT NULL DEFAULT 'founder'
);
CREATE TABLE notice_revisions (
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
CREATE TABLE official_job_notices (
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
 life_status TEXT NOT NULL DEFAULT 'open' CHECK(life_status IN ('open','expired','withdrawn')), jurisdiction_code TEXT NOT NULL DEFAULT '', jurisdiction_name TEXT NOT NULL DEFAULT '', government_tier TEXT NOT NULL DEFAULT 'unclassified', employer_type TEXT NOT NULL DEFAULT 'unclassified',
 UNIQUE(source_id,source_ref)
);
CREATE TABLE portal_history (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, status TEXT NOT NULL, checked_at INTEGER NOT NULL, http_status INTEGER, latency_ms INTEGER);
CREATE TABLE portal_status (source_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('reachable','restricted','unconfirmed')), http_status INTEGER, checked_at INTEGER NOT NULL, latency_ms INTEGER NOT NULL DEFAULT 0);
CREATE TABLE posts (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, member_id TEXT NOT NULL, tag TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(member_id) REFERENCES members(id));
CREATE TABLE replies (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, member_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(post_id) REFERENCES posts(id), FOREIGN KEY(member_id) REFERENCES members(id));
CREATE TABLE reports (id TEXT PRIMARY KEY, target_type TEXT NOT NULL CHECK(target_type IN ('post','reply')), target_id TEXT NOT NULL, reporter_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(target_type,target_id,reporter_id));
CREATE TABLE source_feed_cursors (
 source_id TEXT PRIMARY KEY,
 next_page INTEGER NOT NULL DEFAULT 1,
 last_total_pages INTEGER NOT NULL DEFAULT 1,
 last_success_at INTEGER
);
CREATE TABLE source_ingest_runs(
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
CREATE TABLE votes (post_id TEXT NOT NULL, member_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(post_id,member_id), FOREIGN KEY(post_id) REFERENCES posts(id), FOREIGN KEY(member_id) REFERENCES members(id));
INSERT INTO members VALUES('rehearsal-member','SyntheticUser','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100,0,0);
INSERT INTO official_job_notices (id,source_id,source_ref,title,employer,country,apply_url,source_page,closing_at,first_seen_at,last_seen_at,evidence_sha256) VALUES ('rehearsal-notice','uk-dfe-teaching-vacancies','synthetic-reference','Synthetic notice','Synthetic authority','United Kingdom','https://example.invalid/apply','https://example.invalid/notice','2099-01-01T00:00:00Z',100,100,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
INSERT INTO posts VALUES('rehearsal-post','synthetic-exam','rehearsal-member','General','Synthetic post',100,0);
INSERT INTO replies VALUES('rehearsal-reply','rehearsal-post','rehearsal-member','Synthetic reply',100,0);
INSERT INTO votes VALUES('rehearsal-post','rehearsal-member',100);
INSERT INTO reports VALUES('rehearsal-report','post','rehearsal-post','rehearsal-member','spam',100);
INSERT INTO moderation_actions VALUES('rehearsal-action','post','rehearsal-post','hide','Synthetic review',100,'founder');
INSERT INTO portal_status VALUES('synthetic-source','reachable',200,100,10);
INSERT INTO portal_history VALUES(42,'synthetic-source','reachable',100,200,10);
INSERT INTO source_feed_cursors VALUES('synthetic-source',1,1,100);
INSERT INTO source_ingest_runs VALUES('rehearsal-ingest','synthetic-source',100,101,'ok',200,1,1,0,NULL,'synthetic');
INSERT INTO notice_revisions VALUES(73,'rehearsal-notice','uk-dfe-teaching-vacancies',100,'Old synthetic title','Synthetic notice','2098-01-01','2099-01-01','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
PRAGMA foreign_keys=ON;
