import { pathToFileURL } from "node:url";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { decodeBackupKey } from "./encrypted-backup.mjs";
import { runPostgresRestoreTest } from "./postgres-restore-test.mjs";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const RESTORE_INTERVAL_MS = 30 * 86400000;
const LOCK_CLASS = 718274;
const LOCK_ID = 17;

export function restoreTestIsDue({ dbRestoreAt = null, documentRestoreAt = null, now = Date.now() } = {}) {
  if (!Number.isSafeInteger(now) || now <= 0) return false;
  const dbAt = dbRestoreAt === null ? null : Number(dbRestoreAt);
  const documentAt = documentRestoreAt === null ? null : Number(documentRestoreAt);
  return !dbAt || !documentAt || now - dbAt > RESTORE_INTERVAL_MS || now - documentAt > RESTORE_INTERVAL_MS;
}

export async function runRestoreTestTick({
  pool, env = process.env, key, now = Date.now, restoreFn = runPostgresRestoreTest
} = {}) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function" ||
      !Buffer.isBuffer(key) || key.length !== 32) throw new Error("restore_scheduler_inputs_invalid");
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock($1,$2) AS acquired", [LOCK_CLASS, LOCK_ID]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return { state: "already_running" };
    const latestBackup = await pool.query(
      "SELECT local_path FROM backup_runs WHERE state='ok' AND archive_verified_at IS NOT NULL AND document_archive_verified_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1"
    );
    if (!latestBackup.rows[0]?.local_path) return { state: "waiting_for_verified_backup" };
    const result = await pool.query(
      "SELECT MAX(restore_verified_at) AS db_restore_at,MAX(document_restore_verified_at) AS document_restore_at FROM backup_runs WHERE state='ok'"
    );
    const row = result.rows[0] || {};
    const timestamp = now();
    if (!restoreTestIsDue({
      dbRestoreAt: row.db_restore_at === null || row.db_restore_at === undefined ? null : Number(row.db_restore_at),
      documentRestoreAt: row.document_restore_at === null || row.document_restore_at === undefined
        ? null : Number(row.document_restore_at),
      now: timestamp
    })) return { state: "not_due" };
    return await restoreFn({ pool, env, key, now });
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1,$2)", [LOCK_CLASS, LOCK_ID]).catch(() => {});
    client.release();
  }
}

export function createRestoreScheduler({
  tickFn, intervalMs = DEFAULT_INTERVAL_MS, logger = console
} = {}) {
  if (typeof tickFn !== "function" || !Number.isSafeInteger(intervalMs) ||
      intervalMs < 1000 || intervalMs > 6 * 60 * 60 * 1000) {
    throw new Error("restore_scheduler_configuration_invalid");
  }
  let active = null;
  let timer = null;
  const tick = async () => {
    if (active) return active;
    active = (async () => {
      try {
        const result = await tickFn();
        logger.info?.(JSON.stringify({ event: "globalgov_restore_test_tick", state: result?.state || "unknown" }));
        return result;
      } catch (error) {
        logger.error?.(JSON.stringify({ event: "globalgov_restore_test_failed",
          errorCode: String(error?.message || "restore_test_failed").slice(0, 100) }));
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
      if (timer) clearInterval(timer);
      if (active) await active.catch(() => {});
    },
    tick
  };
}

async function main() {
  const pool = await createPostgresPoolFromEnv();
  const key = decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
  const scheduler = createRestoreScheduler({
    tickFn: () => runRestoreTestTick({ pool, env: process.env, key })
  });
  try {
    await scheduler.start();
    console.info(JSON.stringify({ event: "globalgov_restore_scheduler_started",
      intervalMs: DEFAULT_INTERVAL_MS, restoreIntervalDays: 30 }));
    const shutdown = async signal => {
      console.info(JSON.stringify({ event: "globalgov_restore_scheduler_shutdown", signal }));
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
    console.error(JSON.stringify({ event: "globalgov_restore_scheduler_start_failed",
      error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
