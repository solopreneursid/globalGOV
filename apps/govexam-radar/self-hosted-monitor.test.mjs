import test from "node:test";
import assert from "node:assert/strict";
import { inspectSelfHostedHealth, persistHealthChecks } from "./self-hosted-monitor.mjs";

function healthyPool() {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "SELECT 1 AS ready") return { rows: [{ ready: 1 }] };
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [{ version: "001_core" }, { version: "002_first_party_operations" }] };
      }
      if (sql.startsWith("SELECT task,state")) {
        return { rows: [{ task: "portals", state: "ok", started_at: 1000, finished_at: 2000 }] };
      }
      if (sql.startsWith("SELECT finished_at")) {
        return { rows: [{ finished_at: 3000, state: "ok", restore_verified_at: 3000 }] };
      }
      if (sql.startsWith("SELECT source_id,state")) {
        return { rows: [
          { source_id: "uk-dfe-teaching-vacancies", state: "ok", started_at: 4000 },
          { source_id: "manitoba-jobs", state: "ok", started_at: 4000 }
        ] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
}

test("watchdog reports healthy application, database, scheduler, backups and sources", async () => {
  const pool = healthyPool();
  const now = 5000;
  const report = await inspectSelfHostedHealth({
    pool,
    now: () => now,
    env: { APP_HEALTH_URL: "http://app/health", DOCUMENT_STORE_DIR: "/docs", BACKUP_DIR: "/backups" },
    fetcher: async () => Response.json({ status: "ok" }),
    statfsFn: async () => ({ bavail: 100000, bsize: 1024 * 1024, blocks: 120000 })
  });
  assert.equal(report.checkedAt, now);
  assert.deepEqual(report.checks, []);
});

test("watchdog detects app, scheduler, backup and disk failures without hiding them", async () => {
  const pool = {
    async query(sql) {
      if (sql === "SELECT 1 AS ready") return { rows: [{ ready: 1 }] };
      if (sql.startsWith("SELECT version")) return { rows: [] };
      if (sql.startsWith("SELECT task,state")) return { rows: [{ task: "uk", state: "error", error_code: "timeout" }] };
      if (sql.startsWith("SELECT finished_at")) return { rows: [] };
      if (sql.startsWith("SELECT source_id,state")) return { rows: [] };
      return { rowCount: 1, rows: [] };
    }
  };
  const report = await inspectSelfHostedHealth({
    pool, now: () => 10_000_000,
    fetcher: async () => new Response("down", { status: 503 }),
    statfsFn: async () => ({ bavail: 10, bsize: 1024, blocks: 1000 })
  });
  const codes = report.checks.map(x => x.eventCode);
  assert.ok(codes.includes("schema_migrations_incomplete"));
  assert.ok(codes.includes("application_health_failed"));
  assert.ok(codes.includes("latest_scheduler_run_failed"));
  assert.ok(codes.includes("no_successful_backup"));
  assert.ok(codes.includes("storage_space_critical"));
});

test("health event persistence deduplicates open incidents", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT id,component,event_code")) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  } };
  const result = await persistHealthChecks(pool, {
    checkedAt: 123,
    checks: [{ component: "application", severity: "critical", eventCode: "application_unreachable", details: {} }]
  });
  assert.equal(result[0].state, "already_open");
  assert.match(calls[1].sql, /NOT EXISTS/);
});
