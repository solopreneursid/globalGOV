-- Apply only to an approved isolated rehearsal or cutover database.
-- Never run simultaneously with the legacy scheduled collector against it.
CREATE TABLE IF NOT EXISTS zero_cost_days (
 day TEXT PRIMARY KEY,
 reserved_reads INTEGER NOT NULL DEFAULT 0 CHECK(reserved_reads>=0),
 reserved_writes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_writes>=0),
 reserved_fetches INTEGER NOT NULL DEFAULT 0 CHECK(reserved_fetches>=0)
);
CREATE TABLE IF NOT EXISTS zero_cost_runs (
 slot TEXT PRIMARY KEY, day TEXT NOT NULL REFERENCES zero_cost_days(day),
 started_at INTEGER NOT NULL, finished_at INTEGER,
 state TEXT NOT NULL CHECK(state IN ('reserved','ok','error','blocked')),
 read_rows INTEGER NOT NULL DEFAULT 0, write_rows INTEGER NOT NULL DEFAULT 0,
 fetches INTEGER NOT NULL DEFAULT 0, error_code TEXT
);
CREATE INDEX IF NOT EXISTS zero_cost_runs_day ON zero_cost_runs(day);
