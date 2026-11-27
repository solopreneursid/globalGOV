// Independent owner-operated watchdog for application, PostgreSQL, scheduler, backups and storage.
import { statfs } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";

const DEFAULT_INTERVAL_MS = 60_000;
const HEALTH_TIMEOUT_MS = 5000;
const STALE_SCHEDULER_MS = 4 * 60 * 60 * 1000;
const STALE_BACKUP_MS = 36 * 60 * 60 * 1000;
const ACTIVE_FEED_STALE_MS = 8 * 60 * 60 * 1000;

function issue(component, severity, eventCode, details = {}) {
  return { component, severity, eventCode, details };
}

async function checkDisk(path, component, statfsFn, checks) {
  try {
    const fs = await statfsFn(path);
    const availableBytes = Number(fs.bavail) * Number(fs.bsize);
    const totalBytes = Number(fs.blocks) * Number(fs.bsize);
    const ratio = totalBytes > 0 ? availableBytes / totalBytes : 0;
    if (!Number.isFinite(availableBytes) || availableBytes < 0 || totalBytes <= 0) {
      checks.push(issue(component, "critical", "storage_metrics_invalid"));
    } else if (availableBytes < 2 * 1024 ** 3 || ratio < 0.05) {
      checks.push(issue(component, "critical", "storage_space_critical", {
        availableBytes, totalBytes, availableRatio: ratio
      }));
    } else if (availableBytes < 10 * 1024 ** 3 || ratio < 0.15) {
      checks.push(issue(component, "warning", "storage_space_low", {
        availableBytes, totalBytes, availableRatio: ratio
      }));
    }
  } catch {
    checks.push(issue(component, "warning", "storage_path_unavailable"));
  }
}

export async function inspectSelfHostedHealth({
  pool,
  env = process.env,
  fetcher = fetch,
  statfsFn = statfs,
  now = Date.now
} = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("monitor_database_pool_required");
  const timestamp = now();
  const checks = [];

  try {
    await pool.query("SELECT 1 AS ready");
  } catch {
    checks.push(issue("postgres", "critical", "postgres_unavailable"));
    return { checkedAt: timestamp, checks };
  }

  try {
    const migrations = await pool.query(
      "SELECT version FROM schema_migrations WHERE version IN ($1,$2)",
      ["001_core", "002_first_party_operations"]
    );
    const versions = new Set(migrations.rows.map(row => row.version));
    if (!versions.has("001_core") || !versions.has("002_first_party_operations")) {
      checks.push(issue("postgres", "critical", "schema_migrations_incomplete", {
        applied: [...versions]
      }));
    }
  } catch {
    checks.push(issue("postgres", "critical", "schema_migrations_unavailable"));
  }

  const appUrl = env.APP_HEALTH_URL || "http://app:8080/api/health";
  try {
    const response = await fetcher(appUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      headers: { Accept: "application/json" }
    });
    const payload = response.ok ? await response.json() : null;
    if (!response.ok || payload?.status !== "ok") {
      checks.push(issue("application", "critical", "application_health_failed", {
        httpStatus: response.status
      }));
    }
  } catch {
    checks.push(issue("application", "critical", "application_unreachable"));
  }

  try {
    const result = await pool.query(
      "SELECT task,state,started_at,finished_at,error_code FROM scheduler_runs ORDER BY started_at DESC LIMIT 1"
    );
    const latest = result.rows[0];
    if (!latest) {
      checks.push(issue("scheduler", "warning", "scheduler_not_yet_observed"));
    } else if (latest.state === "error") {
      checks.push(issue("scheduler", "critical", "latest_scheduler_run_failed", {
        task: latest.task, errorCode: latest.error_code || null
      }));
    } else if (timestamp - Number(latest.finished_at || latest.started_at) > STALE_SCHEDULER_MS) {
      checks.push(issue("scheduler", "warning", "scheduler_run_stale", {
        task: latest.task, lastRunAt: Number(latest.finished_at || latest.started_at)
      }));
    }
  } catch {
    checks.push(issue("scheduler", "warning", "scheduler_ledger_unavailable"));
  }

  try {
    const result = await pool.query(
      "SELECT finished_at,state,archive_verified_at,restore_verified_at,error_code FROM backup_runs WHERE state='ok' ORDER BY finished_at DESC LIMIT 1"
    );
    const latest = result.rows[0];
    if (!latest) {
      checks.push(issue("backup", "critical", "no_successful_backup"));
    } else if (!latest.archive_verified_at) {
      checks.push(issue("backup", "critical", "backup_archive_verification_missing", {
        lastBackupAt: Number(latest.finished_at)
      }));
    } else if (!latest.restore_verified_at || timestamp - Number(latest.restore_verified_at) > 30 * 86400000) {
      checks.push(issue("backup", "warning", "full_restore_test_missing_or_stale", {
        lastBackupAt: Number(latest.finished_at),
        lastRestoreTestAt: latest.restore_verified_at ? Number(latest.restore_verified_at) : null
      }));
    } else if (timestamp - Number(latest.finished_at) > STALE_BACKUP_MS) {
      checks.push(issue("backup", "critical", "backup_stale", {
        lastBackupAt: Number(latest.finished_at)
      }));
    }
  } catch {
    checks.push(issue("backup", "critical", "backup_ledger_unavailable"));
  }

  try {
    const result = await pool.query(
      "SELECT source_id,state,started_at,error_code FROM source_ingest_runs " +
      "WHERE source_id IN ('uk-dfe-teaching-vacancies','manitoba-jobs') " +
      "ORDER BY started_at DESC LIMIT 20"
    );
    const bySource = new Map();
    for (const row of result.rows) if (!bySource.has(row.source_id)) bySource.set(row.source_id, row);
    for (const sourceId of ["uk-dfe-teaching-vacancies", "manitoba-jobs"]) {
      const latest = bySource.get(sourceId);
      if (!latest) {
        checks.push(issue("source:" + sourceId, "warning", "source_ingestion_not_yet_observed"));
      } else if (latest.state !== "ok") {
        checks.push(issue("source:" + sourceId, "warning", "latest_source_ingestion_not_successful", {
          state: latest.state, errorCode: latest.error_code || null
        }));
      } else if (timestamp - Number(latest.started_at) > ACTIVE_FEED_STALE_MS) {
        checks.push(issue("source:" + sourceId, "warning", "source_ingestion_stale", {
          lastRunAt: Number(latest.started_at)
        }));
      }
    }
  } catch {
    checks.push(issue("sources", "warning", "source_ingestion_ledger_unavailable"));
  }

  await checkDisk(env.DOCUMENT_STORE_DIR || "/var/lib/globalgov/documents", "document_storage", statfsFn, checks);
  await checkDisk(env.BACKUP_DIR || "/var/lib/globalgov/backups", "backup_storage", statfsFn, checks);
  return { checkedAt: timestamp, checks };
}

export async function persistHealthChecks(pool, report) {
  const results = [];
  const active = new Set(report.checks.map(check => check.component + ":" + check.eventCode));
  const open = await pool.query(
    "SELECT id,component,event_code FROM system_health_events WHERE resolved_at IS NULL"
  );
  for (const row of open.rows) {
    if (active.has(row.component + ":" + row.event_code)) continue;
    const resolved = await pool.query(
      "UPDATE system_health_events SET resolved_at=$1 WHERE id=$2 AND resolved_at IS NULL",
      [report.checkedAt, row.id]
    );
    results.push({ eventCode: row.event_code, state: "resolved", changed: resolved.rowCount });
  }
  for (const check of report.checks) {
    const details = JSON.stringify(check.details || {});
    if (check.severity === "info") {
      const result = await pool.query(
        "UPDATE system_health_events SET resolved_at=$1 WHERE component=$2 AND event_code=$3 AND resolved_at IS NULL",
        [report.checkedAt, check.component, check.eventCode]
      );
      results.push({ eventCode: check.eventCode, state: "resolved", changed: result.rowCount });
      continue;
    }
    const inserted = await pool.query(
      "INSERT INTO system_health_events(component,severity,event_code,occurred_at,details) " +
      "SELECT $1,$2,$3,$4,$5::jsonb WHERE NOT EXISTS " +
      "(SELECT 1 FROM system_health_events WHERE component=$1 AND event_code=$3 AND resolved_at IS NULL)",
      [check.component, check.severity, check.eventCode, report.checkedAt, details]
    );
    results.push({ eventCode: check.eventCode, state: inserted.rowCount ? "opened" : "already_open" });
  }
  return results;
}

export function createSelfHostedMonitor({
  pool, env = process.env, fetcher = fetch, statfsFn = statfs,
  now = Date.now, intervalMs = DEFAULT_INTERVAL_MS, logger = console
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 300000) {
    throw new Error("monitor_interval_invalid");
  }
  let active = null;
  let timer = null;
  let stopped = false;
  const checkOnce = async () => {
    if (active) return active;
    active = (async () => {
      const report = await inspectSelfHostedHealth({ pool, env, fetcher, statfsFn, now });
      const persisted = await persistHealthChecks(pool, report);
      logger.info?.(JSON.stringify({ event: "globalgov_health_check", ...report, persisted }));
      return { ...report, persisted };
    })().finally(() => { active = null; });
    return active;
  };
  return {
    async start() {
      await checkOnce().catch(error => logger.error?.(JSON.stringify({
        event: "globalgov_health_monitor_failed", error: String(error?.message || error)
      })));
      timer = setInterval(() => checkOnce().catch(error => logger.error?.(JSON.stringify({
        event: "globalgov_health_monitor_failed", error: String(error?.message || error)
      }))), intervalMs);
      return this;
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (active) await active.catch(() => {});
      return stopped;
    },
    checkOnce
  };
}

async function main() {
  const pool = await createPostgresPoolFromEnv();
  const monitor = createSelfHostedMonitor({ pool });
  await monitor.start();
  console.info(JSON.stringify({ event: "globalgov_health_monitor_started", intervalMs: DEFAULT_INTERVAL_MS }));
  const shutdown = async signal => {
    console.info(JSON.stringify({ event: "globalgov_health_monitor_shutdown", signal }));
    await monitor.stop();
    await pool.end();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "globalgov_health_monitor_start_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
