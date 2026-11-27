import test from "node:test";
import assert from "node:assert/strict";
import { restoreTestIsDue, runRestoreTestTick } from "./restore-scheduler.mjs";

test("restore verification is due when either database or document archive test is stale", () => {
  const now = Date.parse("2026-11-27T00:00:00Z");
  assert.equal(restoreTestIsDue({ now }), true);
  assert.equal(restoreTestIsDue({ dbRestoreAt: now, documentRestoreAt: now, now }), false);
  assert.equal(restoreTestIsDue({ dbRestoreAt: now - 31 * 86400000, documentRestoreAt: now, now }), true);
});

test("restore scheduler uses a PostgreSQL advisory lock and runs only when due", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      return { rows: [{ acquired: true }] };
    },
    release() {}
  };
  const pool = {
    async connect() { return client; },
    async query() { return { rows: [{ db_restore_at: 1000, document_restore_at: 1000 }] }; }
  };
  let restoreCalls = 0;
  const result = await runRestoreTestTick({
    pool, key: Buffer.alloc(32), now: () => 2000,
    restoreFn: async () => { restoreCalls += 1; return { state: "verified" }; }
  });
  assert.equal(result.state, "not_due");
  assert.equal(restoreCalls, 0);
  assert.match(calls[0], /pg_try_advisory_lock/);
  assert.match(calls[1], /pg_advisory_unlock/);
});

test("restore scheduler skips when another process owns the advisory lock", async () => {
  let restoreCalls = 0;
  const pool = {
    async connect() {
      return { async query() { return { rows: [{ acquired: false }] }; }, release() {} };
    },
    async query() { throw new Error("must_not_query_when_locked"); }
  };
  const result = await runRestoreTestTick({
    pool, key: Buffer.alloc(32), restoreFn: async () => { restoreCalls += 1; }
  });
  assert.equal(result.state, "already_running");
  assert.equal(restoreCalls, 0);
});
