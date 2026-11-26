-- HQventures GovRadar isolated SQLite/D1 database.
-- Additive migration: existing community tables are retained.
CREATE TABLE IF NOT EXISTS portal_status (
 source_id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('reachable','restricted','unconfirmed')),
 http_status INTEGER,
 checked_at INTEGER NOT NULL,
 latency_ms INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS portal_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 source_id TEXT NOT NULL,
 status TEXT NOT NULL,
 checked_at INTEGER NOT NULL,
 http_status INTEGER,
 latency_ms INTEGER
);
CREATE INDEX IF NOT EXISTS portal_history_source_time ON portal_history(source_id,checked_at DESC);
-- portal_history is pruned after 30 days by the scheduled Worker.
