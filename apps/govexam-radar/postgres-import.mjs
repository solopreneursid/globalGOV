// One-time, explicit D1 SQL export -> PostgreSQL importer.
// Default mode is plan-only. It never contacts Cloudflare and never mutates source exports.
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { openD1Export, verifySqlExport } from "./d1-export-backup.mjs";
import { decodeBackupKey } from "./encrypted-backup.mjs";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";

export const REQUIRED_IMPORT_TABLES = Object.freeze([
  "members",
  "official_job_notices",
  "source_ingest_runs",
  "source_feed_cursors",
  "portal_status",
  "portal_history",
  "notice_revisions",
  "posts",
  "replies",
  "votes",
  "reports",
  "moderation_actions"
]);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const hash = value => createHash("sha256").update(value).digest("hex");

async function privateBackup(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      info.size < 64 || info.size > MAX_EXPORT_BYTES + 64) {
    throw new Error("encrypted_d1_backup_must_be_private_regular_file");
  }
  return readFile(path);
}

function restoreVerifiedSqlite(sql) {
  const directoryPromise = mkdtemp(join(tmpdir(), "globalgov-import-"));
  return directoryPromise.then(async directory => {
    const path = join(directory, "source.sqlite");
    try {
      execFileSync("sqlite3", ["-safe", "-batch", "-bail", "-init", "/dev/null", path], {
        input: sql,
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
        env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: directory, LANG: "C" },
        cwd: directory
      });
      return { directory, path, db: new DatabaseSync(path, { readOnly: true }) };
    } catch {
      await rm(directory, { recursive: true, force: true });
      throw new Error("verified_sqlite_restore_failed");
    }
  });
}

function canonical(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return "base64:" + Buffer.from(value).toString("base64");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_migration_value");
    return String(value);
  }
  return String(value);
}

function rowDigest(rows, columns) {
  const digest = createHash("sha256");
  for (const row of rows) {
    digest.update(JSON.stringify(columns.map(column => canonical(row[column]))));
    digest.update("\n");
  }
  return digest.digest("hex");
}

function compatibleType(sqliteType, postgresType) {
  const source = String(sqliteType || "").toUpperCase();
  const target = String(postgresType || "").toLowerCase();
  if (/INT/.test(source)) return ["smallint", "integer", "bigint"].includes(target);
  if (/CHAR|CLOB|TEXT/.test(source)) return ["text", "character varying", "character"].includes(target);
  if (/BLOB/.test(source)) return target === "bytea";
  if (/REAL|FLOA|DOUB/.test(source)) return ["real", "double precision", "numeric"].includes(target);
  if (/NUM|DEC/.test(source)) return ["numeric", "real", "double precision", "integer", "bigint"].includes(target);
  return false;
}

function quoteIdentifier(value) {
  if (!IDENTIFIER.test(value)) throw new Error("migration_identifier_invalid");
  return '"' + value + '"';
}

async function inspectTable(sourceDb, client, table) {
  const sourceColumns = sourceDb.prepare("PRAGMA table_info(" + quoteIdentifier(table) + ")").all();
  if (!sourceColumns.length) throw new Error("source_table_missing:" + table);
  const targetResult = await client.query(
    "SELECT column_name,data_type,udt_name,ordinal_position FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [table]
  );
  const targetColumns = targetResult.rows;
  if (!targetColumns.length) throw new Error("target_table_missing:" + table);
  const sourceNames = sourceColumns.map(column => column.name);
  const targetNames = targetColumns.map(column => column.column_name);
  if (JSON.stringify(sourceNames) !== JSON.stringify(targetNames)) {
    throw new Error("schema_column_mismatch:" + table);
  }
  for (let index = 0; index < sourceColumns.length; index += 1) {
    if (!compatibleType(sourceColumns[index].type, targetColumns[index].data_type)) {
      throw new Error("schema_type_mismatch:" + table + "." + sourceColumns[index].name);
    }
  }
  const primary = sourceColumns.filter(column => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk)).map(column => column.name);
  if (!primary.length) throw new Error("source_primary_key_missing:" + table);
  return { sourceColumns, targetColumns, columns: sourceNames, primary };
}

async function countTarget(client, table) {
  const result = await client.query("SELECT COUNT(*)::bigint AS count FROM " + quoteIdentifier(table));
  return Number(result.rows[0].count);
}

async function loadSourceRows(sourceDb, table, primary) {
  const order = primary.map(quoteIdentifier).join(",");
  return sourceDb.prepare("SELECT * FROM " + quoteIdentifier(table) + " ORDER BY " + order).all();
}

function toPgValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

async function insertRows(client, table, columns, rows) {
  const names = columns.map(quoteIdentifier).join(",");
  const batchSize = Math.max(1, Math.min(500, Math.floor(60000 / columns.length)));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map(row => {
      const placeholders = columns.map(column => {
        values.push(toPgValue(row[column]));
        return "$" + values.length;
      });
      return "(" + placeholders.join(",") + ")";
    });
    await client.query(
      "INSERT INTO " + quoteIdentifier(table) + " (" + names + ") VALUES " + tuples.join(","),
      values
    );
  }
}

async function targetRows(client, table, columns, primary) {
  const select = columns.map(quoteIdentifier).join(",");
  const order = primary.map(quoteIdentifier).join(",");
  const result = await client.query(
    "SELECT " + select + " FROM " + quoteIdentifier(table) + " ORDER BY " + order
  );
  return result.rows;
}

export async function importD1Snapshot({
  sourceDb, pool, mode = "plan", confirmDatabase = "", expectedDatabase = "",
  allowWrite = false, sourceId = "canonical-cloudflare-d1", sourceSha256 = null,
  tables = REQUIRED_IMPORT_TABLES, now = Date.now()
} = {}) {
  if (!sourceDb || !pool || typeof pool.connect !== "function" ||
      !["plan", "apply"].includes(mode) || !Array.isArray(tables) || !tables.length) {
    throw new Error("d1_import_inputs_invalid");
  }
  if (mode === "apply" &&
      (allowWrite !== true || !expectedDatabase || confirmDatabase !== expectedDatabase)) {
    throw new Error("d1_import_write_confirmation_required");
  }
  if (tables.some(table => !REQUIRED_IMPORT_TABLES.includes(table)) ||
      new Set(tables).size !== tables.length) {
    throw new Error("d1_import_table_allowlist_violation");
  }

  const client = await pool.connect();
  const startedAt = now;
  const counts = {};
  const checksums = {};
  const schema = {};
  let transaction = false;
  try {
    for (const table of tables) {
      schema[table] = await inspectTable(sourceDb, client, table);
      const rows = await loadSourceRows(sourceDb, table, schema[table].primary);
      counts[table] = rows.length;
      checksums[table] = rowDigest(rows, schema[table].columns);
      const targetCount = await countTarget(client, table);
      if (targetCount !== 0) throw new Error("target_table_not_empty:" + table);
    }

    if (mode === "plan") {
      return {
        mode,
        state: "planned",
        sourceId,
        sourceSha256,
        tableCount: tables.length,
        totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0),
        counts,
        checksums,
        targetEmpty: true,
        schemaCompatible: true,
        writesPerformed: false
      };
    }

    await client.query("BEGIN");
    transaction = true;
    for (const table of tables) {
      await client.query("LOCK TABLE " + quoteIdentifier(table) + " IN ACCESS EXCLUSIVE MODE");
      if (await countTarget(client, table) !== 0) throw new Error("target_table_not_empty:" + table);
    }

    for (const table of tables) {
      const rows = await loadSourceRows(sourceDb, table, schema[table].primary);
      await insertRows(client, table, schema[table].columns, rows);
      const imported = await targetRows(client, table, schema[table].columns, schema[table].primary);
      if (imported.length !== rows.length || rowDigest(imported, schema[table].columns) !== checksums[table]) {
        throw new Error("row_checksum_mismatch:" + table);
      }
    }

    for (const table of ["portal_history", "notice_revisions"]) {
      const result = await client.query(
        "SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT MAX(id) FROM " +
        quoteIdentifier(table) + "),1),EXISTS(SELECT 1 FROM " + quoteIdentifier(table) + "))",
        ["public." + table]
      );
      if (!result) throw new Error("identity_sequence_sync_failed:" + table);
    }

    const migrationId = "d1-import-" + startedAt + "-" + sourceId;
    await client.query(
      `INSERT INTO data_migration_runs
       (id,source_id,started_at,finished_at,state,source_sha256,table_counts,row_checksums,details)
       VALUES ($1,$2,$3,$4,'verified',$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [migrationId, sourceId, startedAt, Date.now(), sourceSha256,
        JSON.stringify(counts), JSON.stringify(checksums),
        JSON.stringify({ mode: "verified_import", targetDatabase: expectedDatabase })]
    );
    await client.query("COMMIT");
    transaction = false;
    return {
      mode,
      state: "verified",
      sourceId,
      sourceSha256,
      tableCount: tables.length,
      totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
      checksums,
      targetEmpty: true,
      schemaCompatible: true,
      writesPerformed: true
    };
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function importEncryptedD1Backup({
  backupPath, key, pool, mode = "plan", confirmDatabase = "", expectedDatabase = "",
  allowWrite = false, sourceId = "canonical-cloudflare-d1", now = Date.now()
} = {}) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("d1_import_key_invalid");
  const envelope = await privateBackup(backupPath);
  const sourceSha256 = hash(envelope);
  const sql = openD1Export(envelope, key);
  try {
    const verification = await verifySqlExport(sql);
    const restored = await restoreVerifiedSqlite(sql);
    try {
      return {
        ...await importD1Snapshot({
          sourceDb: restored.db, pool, mode, confirmDatabase, expectedDatabase,
          allowWrite, sourceId, sourceSha256, now
        }),
        sourceIntegrity: verification.integrity,
        sourceCounts: verification.counts
      };
    } finally {
      restored.db.close();
      await rm(restored.directory, { recursive: true, force: true });
    }
  } finally {
    sql.fill(0);
    envelope.fill(0);
  }
}

async function main() {
  const [mode, backupPath, ...extra] = process.argv.slice(2);
  if (extra.length || !["plan", "apply"].includes(mode) || !backupPath) {
    throw new Error("usage: postgres-import.mjs plan PRIVATE_D1_BACKUP.enc | apply PRIVATE_D1_BACKUP.enc");
  }
  const expectedDatabase = process.env.PGDATABASE || "";
  const confirmDatabase = process.env.GLOBALGOV_IMPORT_CONFIRM_DATABASE || "";
  const allowWrite = process.env.GLOBALGOV_IMPORT_ALLOW_WRITE === "true";
  const key = decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
  const pool = await createPostgresPoolFromEnv();
  try {
    const result = await importEncryptedD1Backup({
      backupPath, key, pool, mode, confirmDatabase, expectedDatabase, allowWrite
    });
    console.log(JSON.stringify(result));
  } finally {
    key.fill(0);
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "postgres_import_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
