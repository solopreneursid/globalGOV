import test from "node:test";
import assert from "node:assert/strict";
import { backupDue, createBackupScheduler, dailyBackupRunId } from "./backup-scheduler.mjs";

test("daily backup schedule uses one UTC slot per calendar day", () => {
  const before = Date.parse("2026-11-27T02:14:00Z");
  const due = Date.parse("2026-11-27T02:15:00Z");
  assert.equal(backupDue(before), false);
  assert.equal(backupDue(due), true);
  assert.equal(dailyBackupRunId(due), "daily:2026-11-27");
});

test("scheduler claims a daily slot once and retries after a failed attempt", async () => {
  let now = Date.parse("2026-11-27T02:15:00Z");
  const calls = [];
  let shouldFail = true;
  const scheduler = createBackupScheduler({
    now: () => now,
    backupFn: async ({ runId }) => {
      calls.push(runId);
      if (shouldFail) { shouldFail = false; throw new Error("synthetic_failure"); }
      return { state: "ok" };
    },
    logger: { info() {}, error() {} }
  });
  await assert.rejects(scheduler.tick(), /synthetic_failure/);
  assert.deepEqual(await scheduler.tick(), { state: "ok" });
  assert.deepEqual(await scheduler.tick(), { state: "already_attempted", runId: "daily:2026-11-27" });
  assert.deepEqual(calls, ["daily:2026-11-27", "daily:2026-11-27"]);
  await scheduler.stop();
});

