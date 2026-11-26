-- Internal moderation is a founder action, never an autonomous HQ employee operation.
CREATE TABLE IF NOT EXISTS moderation_actions (
 id TEXT PRIMARY KEY,
 target_type TEXT NOT NULL CHECK(target_type IN ('post','reply')),
 target_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('hide','restore','dismiss')),
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 admin_label TEXT NOT NULL DEFAULT 'founder'
);
CREATE INDEX IF NOT EXISTS moderation_actions_recent ON moderation_actions(created_at DESC);
