import worker from "./worker.js";
import { GOVRADAR_SINGLE_CRON, govradarScheduledTask } from "./worker.js";
import { createPostgresD1Database, createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { pathToFileURL } from "node:url";

const TICK_MS = 15_000;
const STALE_RUN_MS = 30 * 60_000;

export function scheduledSlot(now = Date.now()) {
  if (!Number.isSafeInteger(now) || now <= 0) return null;
  const date = new Date(now);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  if (hour % 3 !== 0 || ![0, 20, 40].includes(minute)) return null;

  const scheduledTime = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0);
  const task = govradarScheduledTask({ cron: GOVRADAR_SINGLE_CRON, scheduledTime });
  if (!task) return null;
  return {
    task,
    scheduledTime,
    slot: new Date(scheduledTime).toISOString() + ":" + task
  };
}

function safeErrorCode(error) {
  const value = String(error?.message || "scheduled_task_failed")
    .toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return value || "scheduled_task_failed";
}

export async function recoverInterruptedRuns(db, now = Date.now()) {
  const result = await db.prepare(
    "UPDATE scheduler_runs SET state='error',finished_at=?,error_code='scheduler_interrupted' WHERE state='running' AND started_at<?"
  ).bind(now, now - STALE_RUN_MS).run();
  return Number(result.meta?.changes || 0);
}

export async function runScheduledSlot({ db, workerImpl = worker, env, slot, now = Date.now(), logger = console }) {
  if (!db || !slot || !env) throw new Error("scheduler_dependencies_required");
  const claim = await db.prepare(
    "INSERT INTO scheduler_runs(slot,task,state,started_at) VALUES(?,?,'running',?) ON CONFLICT(slot) DO NOTHING"
  ).bind(slot.slot, slot.task, now).run();

  if (!Number(claim.meta?.changes || 0)) return { state: "already_claimed", slot: slot.slot };

  try {
    const pending = [];
    await workerImpl.scheduled(
      { cron: GOVRADAR_SINGLE_CRON, scheduledTime: slot.scheduledTime },
      env,
      { waitUntil: promise => pending.push(Promise.resolve(promise)) }
    );
    await Promise.all(pending);
    await db.prepare(
      "UPDATE scheduler_runs SET state='ok',finished_at=?,error_code=NULL,details=? WHERE slot=? AND state='running'"
    ).bind(Date.now(), JSON.stringify({ task: slot.task }), slot.slot).run();
    logger.info?.(JSON.stringify({ event: "scheduled_task_complete", task: slot.task, slot: slot.slot }));
    return { state: "ok", slot: slot.slot };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await db.prepare(
      "UPDATE scheduler_runs SET state='error',finished_at=?,error_code=?,details=? WHERE slot=? AND state='running'"
    ).bind(Date.now(), errorCode, JSON.stringify({ task: slot.task }), slot.slot).run();
    logger.error?.(JSON.stringify({ event: "scheduled_task_failed", task: slot.task, slot: slot.slot, errorCode }));
    throw error;
  }
}

export function createScheduler({ db, workerImpl = worker, env, now = Date.now, logger = console, intervalMs = TICK_MS } = {}) {
  if (!db || !env || !Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60_000) {
    throw new Error("scheduler_configuration_invalid");
  }
  let timer = null;
  let activeTick = null;
  let stopped = false;

  const tick = async () => {
    if (stopped || activeTick) return activeTick;
    activeTick = (async () => {
      const slot = scheduledSlot(now());
      if (!slot) return { state: "not_due" };
      return runScheduledSlot({ db, workerImpl, env, slot, now: now(), logger });
    })().finally(() => {
      activeTick = null;
    });
    return activeTick;
  };

  return {
    async start() {
      await recoverInterruptedRuns(db, now());
      await tick().catch(error => logger.error?.(JSON.stringify({ event: "scheduler_initial_tick_error", errorCode: safeErrorCode(error) })));
      timer = setInterval(() => {
        tick().catch(error => logger.error?.(JSON.stringify({
          event: "scheduler_tick_error",
          errorCode: safeErrorCode(error)
        })));
      }, intervalMs);
      return this;
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (activeTick) await activeTick.catch(() => {});
    },
    tick
  };
}

async function main() {
  const pool = await createPostgresPoolFromEnv();
  const db = createPostgresD1Database(pool);
  try {
    const migration = await db.prepare("SELECT version FROM schema_migrations WHERE version=?")
      .bind("001_core").first();
    if (!migration) throw new Error("database_schema_not_migrated");

    const env = {
      DB: db,
      USAJOBS_FETCH: fetch,
      ...(process.env.INGEST_HMAC_KEY ? { INGEST_HMAC_KEY: process.env.INGEST_HMAC_KEY } : {})
    };
    const scheduler = createScheduler({ db, env });
    await scheduler.start();
    console.info(JSON.stringify({ event: "scheduler_started", cron: GOVRADAR_SINGLE_CRON, tickMs: TICK_MS }));

    const shutdown = async signal => {
      console.info(JSON.stringify({ event: "scheduler_shutdown", signal }));
      await scheduler.stop();
      await db.close();
      process.exit(0);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    await db.close().catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "scheduler_start_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
