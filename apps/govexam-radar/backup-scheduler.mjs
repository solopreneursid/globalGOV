import { pathToFileURL } from "node:url";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { decodeBackupKey } from "./encrypted-backup.mjs";
import { createPostgresBackup } from "./postgres-backup.mjs";

const DEFAULT_INTERVAL_MS = 60_000;
const MINIMUM_DAILY_UTC = 2 * 60 + 15;

export function dailyBackupRunId(now = Date.now()) {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("backup_clock_invalid");
  const date = new Date(now).toISOString().slice(0, 10);
  return "daily:" + date;
}

export function backupDue(now = Date.now()) {
  if (!Number.isSafeInteger(now) || now <= 0) return false;
  const date = new Date(now);
  return date.getUTCHours() * 60 + date.getUTCMinutes() >= MINIMUM_DAILY_UTC;
}

export function createBackupScheduler({
  backupFn,
  now = Date.now,
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console
} = {}) {
  if (typeof backupFn !== "function" || typeof now !== "function" ||
      !Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 300000) {
    throw new Error("backup_scheduler_configuration_invalid");
  }
  let timer = null;
  let active = null;
  let stopped = false;
  let lastAttemptedSlot = null;

  const tick = async () => {
    if (stopped || active) return active;
    const timestamp = now();
    if (!backupDue(timestamp)) return { state: "not_due" };
    const runId = dailyBackupRunId(timestamp);
    if (lastAttemptedSlot === runId) return { state: "already_attempted", runId };
    active = (async () => {
      lastAttemptedSlot = runId;
      try {
        const result = await backupFn({ runId });
        if (result?.state === "already_claimed") lastAttemptedSlot = null;
        logger.info?.(JSON.stringify({ event: "daily_backup_complete", runId, state: result?.state || "unknown" }));
        return result;
      } catch (error) {
        lastAttemptedSlot = null;
        logger.error?.(JSON.stringify({ event: "daily_backup_failed", runId,
          errorCode: String(error?.message || "backup_failed").slice(0, 100) }));
        throw error;
      }
    })().finally(() => { active = null; });
    return active;
  };

  return {
    async start() {
      await tick().catch(() => {});
      timer = setInterval(() => tick().catch(() => {}), intervalMs);
      return this;
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (active) await active.catch(() => {});
    },
    tick
  };
}

async function main() {
  const pool = await createPostgresPoolFromEnv();
  const key = decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
  const scheduler = createBackupScheduler({
    backupFn: ({ runId }) => createPostgresBackup({
      pool, env: process.env, key, runId
    })
  });
  try {
    await scheduler.start();
    console.info(JSON.stringify({ event: "backup_scheduler_started", intervalMs: DEFAULT_INTERVAL_MS,
      dailyUtcTarget: "02:15", remoteBackupRequired: process.env.BACKUP_REQUIRE_REMOTE === "true" }));
    const shutdown = async signal => {
      console.info(JSON.stringify({ event: "backup_scheduler_shutdown", signal }));
      await scheduler.stop();
      key.fill(0);
      await pool.end();
      process.exit(0);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    key.fill(0);
    await pool.end();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "backup_scheduler_start_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
