// Full isolated PostgreSQL and document-volume restore verification.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { decodeBackupKey } from "./encrypted-backup.mjs";
import { decryptBackupForRestore } from "./postgres-backup.mjs";
import { verifyDocumentArchive } from "./document-backup.mjs";

const REQUIRED_TABLES = Object.freeze([
  "schema_migrations", "members", "official_job_notices", "source_ingest_runs",
  "source_feed_cursors", "portal_status", "portal_history", "notice_revisions",
  "posts", "replies", "votes", "reports", "moderation_actions",
  "source_policy_reviews", "source_connector_runs", "source_documents",
  "manual_review_queue", "backup_runs", "system_health_events", "data_migration_runs"
]);
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

export async function runPostgresRestoreTest({
  pool, env = process.env, key, backupPath = null, now = Date.now
} = {}) {
  if (!pool || typeof pool.query !== "function" || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("restore_test_inputs_invalid");
  }

  const restoreUser = env.RESTORE_TEST_DB_USER || "";
  const restorePassword = env.RESTORE_TEST_DB_PASSWORD || "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(restoreUser) || !restorePassword ||
      restoreUser === env.PGUSER || restoreUser === env.POSTGRES_USER) {
    throw new Error("restore_test_role_credentials_required");
  }

  const backup = backupPath
    ? await pool.query(
      "SELECT local_path,document_archive_path FROM backup_runs WHERE local_path=$1 AND state='ok' " +
      "AND archive_verified_at IS NOT NULL AND document_archive_verified_at IS NOT NULL",
      [backupPath]
    )
    : await pool.query(
      "SELECT local_path,document_archive_path FROM backup_runs WHERE state='ok' " +
      "AND archive_verified_at IS NOT NULL AND document_archive_verified_at IS NOT NULL " +
      "ORDER BY finished_at DESC LIMIT 1"
    );
  const selectedPath = backup.rows[0]?.local_path;
  const documentArchivePath = backup.rows[0]?.document_archive_path;
  if (!selectedPath || !documentArchivePath) throw new Error("verified_backup_pair_not_found");

  const documentVerification = await verifyDocumentArchive({ archivePath: documentArchivePath, key });
  const restored = await decryptBackupForRestore({ backupPath: selectedPath, key });
  const database = "globalgov_restore_" + now().toString(36) + "_" + randomBytes(6).toString("hex");
  if (!IDENTIFIER.test(database)) {
    await rm(restored.directory, { recursive: true, force: true });
    throw new Error("restore_test_database_name_invalid");
  }

  const restoreEnv = { ...env, PGUSER: restoreUser, PGPASSWORD: restorePassword };
  let maintenancePool = null;
  let testPool = null;
  let created = false;
  try {
    maintenancePool = await createPostgresPoolFromEnv({
      ...restoreEnv, PGDATABASE: env.PGMAINTENANCE_DATABASE || "postgres"
    });
    await maintenancePool.query(
      "CREATE DATABASE \"" + database + "\" TEMPLATE template0 ENCODING 'UTF8'"
    );
    created = true;

    try {
      execFileSync("pg_restore", [
        "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges",
        "--dbname", database, restored.dumpPath
      ], {
        env: { ...restoreEnv, PGDATABASE: database },
        timeout: 10 * 60 * 1000,
        maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch {
      throw new Error("full_postgres_restore_failed");
    }

    testPool = await createPostgresPoolFromEnv({ ...restoreEnv, PGDATABASE: database });
    const migrations = await testPool.query(
      "SELECT version FROM schema_migrations WHERE version IN ($1,$2) ORDER BY version",
      ["001_core", "002_first_party_operations"]
    );
    const versions = new Set(migrations.rows.map(row => row.version));
    if (!versions.has("001_core") || !versions.has("002_first_party_operations")) {
      throw new Error("restored_schema_migrations_incomplete");
    }

    const tables = await testPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    const present = new Set(tables.rows.map(row => row.table_name));
    const missing = REQUIRED_TABLES.filter(name => !present.has(name));
    if (missing.length) throw new Error("restored_tables_missing:" + missing.join(","));

    const counts = {};
    for (const table of REQUIRED_TABLES.filter(name => name !== "schema_migrations")) {
      const result = await testPool.query('SELECT COUNT(*)::bigint AS count FROM "' + table + '"');
      counts[table] = Number(result.rows[0].count);
    }
    await testPool.end();
    testPool = null;

    const verifiedAt = now();
    const update = await pool.query(
      "UPDATE backup_runs SET restore_verified_at=$1,document_restore_verified_at=$1 " +
      "WHERE local_path=$2 AND state='ok'",
      [verifiedAt, selectedPath]
    );
    if (update.rowCount !== 1) throw new Error("restore_test_audit_update_failed");

    return {
      state: "verified",
      backupPath: selectedPath,
      restoredTableCount: REQUIRED_TABLES.length,
      counts,
      documentArchiveVerified: documentVerification.verified,
      documentCount: documentVerification.documentCount,
      documentBytes: documentVerification.documentBytes,
      restoreVerifiedAt: verifiedAt,
      temporaryDatabaseDropped: true
    };
  } finally {
    if (testPool) await testPool.end().catch(() => {});
    if (created && maintenancePool) {
      await maintenancePool.query('DROP DATABASE IF EXISTS "' + database + '" WITH (FORCE)').catch(() => {});
    }
    if (maintenancePool) await maintenancePool.end().catch(() => {});
    await rm(restored.directory, { recursive: true, force: true });
  }
}

async function main() {
  const key = decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
  const pool = await createPostgresPoolFromEnv();
  try {
    const result = await runPostgresRestoreTest({
      pool, env: process.env, key, backupPath: process.argv[2] || null
    });
    console.log(JSON.stringify(result));
  } finally {
    key.fill(0);
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "postgres_restore_test_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
