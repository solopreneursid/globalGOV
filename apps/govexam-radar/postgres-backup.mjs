// Encrypted owner-operated PostgreSQL backups. Remote copies use SSH/rsync to an owner-controlled host.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, lstat, readdir, unlink, rename, open, chmod } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MAGIC = Buffer.from("GLOBALGOV-PG-BACKUP-1\n");
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_BACKUP_BYTES = 8 * 1024 * 1024 * 1024;
const FILE_NAME = /^globalgov-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.dump\.enc$/;

const sha256 = value => createHash("sha256").update(value).digest("hex");

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error("backup_key_invalid");
}

function privateDirectory(path) {
  return mkdir(path, { recursive: true, mode: 0o700 }).then(async () => {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
      throw new Error("backup_directory_must_be_private");
    }
  });
}

function runCommand(command, args, env = process.env, maxBuffer = 1024 * 1024) {
  try {
    return execFileSync(command, args, {
      env, encoding: "utf8", timeout: 30000, maxBuffer,
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    throw new Error(command.replace(/[^a-z0-9_-]/gi, "") + "_verification_failed");
  }
}

export function sealBackupBytes(bytes, key) {
  assertKey(key);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_BACKUP_BYTES) throw new Error("backup_payload_invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, encrypted, cipher.getAuthTag()]);
}

export function openBackupBytes(envelope, key) {
  assertKey(key);
  if (!Buffer.isBuffer(envelope) || envelope.length <= MAGIC.length + 12 + TAG_BYTES ||
      envelope.length > MAX_BACKUP_BYTES || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("encrypted_backup_envelope_invalid");
  }
  const start = MAGIC.length;
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(start, start + 12));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(envelope.subarray(envelope.length - TAG_BYTES));
  return Buffer.concat([decipher.update(envelope.subarray(start + 12, envelope.length - TAG_BYTES)), decipher.final()]);
}

function pgDumpConfiguration(env) {
  const database = env.PGDATABASE || "";
  const user = env.PGUSER || "";
  const password = env.PGPASSWORD || "";
  const host = env.PGHOST || "127.0.0.1";
  const port = Number(env.PGPORT || 5432);
  if (!database || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("postgres_backup_connection_incomplete");
  }
  return { database, user, password, host, port };
}

export function safeRemoteTarget(target) {
  if (typeof target !== "string" ||
      !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:\/[A-Za-z0-9._/-]+$/.test(target) ||
      target.includes("..") || target.includes("//")) {
    throw new Error("backup_remote_target_invalid");
  }
  return target;
}

async function spawnDump(outputPath, key, env) {
  assertKey(key);
  const connection = pgDumpConfiguration(env);
  const version = runCommand("pg_dump", ["--version"], env);
  const versionMatch = /\(PostgreSQL\)\s+(\d+)/.exec(version);
  if (!versionMatch || Number(versionMatch[1]) < 17) throw new Error("pg_dump_17_or_newer_required");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const prefix = Buffer.concat([MAGIC, iv]);
  const digest = createHash("sha256");
  digest.update(prefix);
  const output = createWriteStream(outputPath, { flags: "wx", mode: 0o600 });
  output.write(prefix);

  const childEnv = {
    ...env,
    PGHOST: connection.host,
    PGPORT: String(connection.port),
    PGDATABASE: connection.database,
    PGUSER: connection.user,
    PGPASSWORD: connection.password
  };
  const child = spawn("pg_dump", [
    "--format=custom", "--no-owner", "--no-privileges", "--compress=0",
    "--host", connection.host, "--port", String(connection.port),
    "--username", connection.user, "--dbname", connection.database, "--file", "-"
  ], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => {
    if (stderr.length < 4096) stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length);
  });
  const exit = once(child, "close");
  const hashing = new Transform({
    transform(chunk, encoding, callback) {
      digest.update(chunk);
      callback(null, chunk);
    }
  });

  try {
    await pipeline(child.stdout, cipher, hashing, output);
    const [code] = await exit;
    if (code !== 0) throw new Error("pg_dump_failed");
    const tag = cipher.getAuthTag();
    await appendFile(outputPath, tag, { mode: 0o600 });
    digest.update(tag);
    await chmod(outputPath, 0o600);
    const info = await lstat(outputPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BACKUP_BYTES) {
      throw new Error("backup_output_invalid");
    }
    return { bytes: info.size, sha256: digest.digest("hex"), pgDumpVersion: version };
  } catch (error) {
    child.kill("SIGTERM");
    await unlink(outputPath).catch(() => {});
    if (error?.message === "pg_dump_failed") throw error;
    throw new Error("postgres_backup_stream_failed");
  }
}

async function decryptToTemporaryFile(backupPath, key, directory) {
  assertKey(key);
  const info = await lstat(backupPath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      info.size <= MAGIC.length + 12 + TAG_BYTES || info.size > MAX_BACKUP_BYTES) {
    throw new Error("encrypted_backup_file_invalid");
  }
  const handle = await open(backupPath, "r");
  const prefix = Buffer.alloc(MAGIC.length + 12);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(prefix, 0, prefix.length, 0);
    await handle.read(tag, 0, tag.length, info.size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("encrypted_backup_header_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, prefix.subarray(MAGIC.length));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const dumpPath = join(directory, "restore.dump");
  const input = createReadStream(backupPath, { start: prefix.length, end: info.size - TAG_BYTES - 1 });
  const output = createWriteStream(dumpPath, { flags: "wx", mode: 0o600 });
  try {
    await pipeline(input, decipher, output);
  } catch {
    await unlink(dumpPath).catch(() => {});
    throw new Error("encrypted_backup_authentication_failed");
  }
  return dumpPath;
}

export async function verifyPostgresBackup({ backupPath, key, pgRestoreCommand = "pg_restore" } = {}) {
  assertKey(key);
  const directory = await mkdtemp(join(dirname(resolve(backupPath)), ".globalgov-restore-"));
  try {
    const dumpPath = await decryptToTemporaryFile(backupPath, key, directory);
    const listing = runCommand(pgRestoreCommand, ["--list", dumpPath]);
    if (!listing.includes("TABLE DATA") && !listing.includes("TABLE")) throw new Error("postgres_archive_empty");
    return { verified: true, archiveEntries: listing.split("\n").filter(Boolean).length };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function copyOffHost(path, rawTarget, env) {
  const target = safeRemoteTarget(rawTarget);
  const rsyncEnv = {
    ...env,
    RSYNC_RSH: "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10"
  };
  try {
    execFileSync("rsync", ["--archive", "--protect-args", "--chmod=F600,D700", path, target], {
      env: rsyncEnv, encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    throw new Error("owner_controlled_remote_backup_failed");
  }
  return target;
}

async function pruneLocalBackups(directory, retentionDays, keepPath) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new Error("backup_retention_days_invalid");
  }
  const cutoff = Date.now() - retentionDays * 86400000;
  const entries = await readdir(directory, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !FILE_NAME.test(entry.name)) continue;
    const path = join(directory, entry.name);
    if (path === keepPath) continue;
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) continue;
    if (info.mtimeMs < cutoff) {
      await unlink(path);
      removed += 1;
    }
  }
  return removed;
}

export async function createPostgresBackup({
  pool, env = process.env, key, backupDir = env.BACKUP_DIR || "/var/lib/globalgov/backups",
  remoteTarget = env.BACKUP_REMOTE_TARGET || "", requireRemote = env.BACKUP_REQUIRE_REMOTE === "true",
  retentionDays = Number(env.BACKUP_RETENTION_DAYS || 14), runId = "manual:" + Date.now() + ":" + randomUUID(),
  now = Date.now
} = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("backup_database_pool_required");
  assertKey(key);
  await privateDirectory(resolve(backupDir));
  const startedAt = now();
  const stamp = new Date(startedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const name = "globalgov-" + stamp + "-" + randomBytes(4).toString("hex") + ".dump.enc";
  const finalPath = join(resolve(backupDir), name);
  const tempPath = finalPath + ".tmp";
  const claim = await pool.query(
    "INSERT INTO backup_runs(id,started_at,state,local_path,remote_target) VALUES($1,$2,'running',$3,$4) " +
    "ON CONFLICT(id) DO UPDATE SET started_at=EXCLUDED.started_at,state='running',finished_at=NULL," +
    "local_path=EXCLUDED.local_path,remote_target=EXCLUDED.remote_target,local_sha256=NULL,remote_sha256=NULL," +
    "byte_length=NULL,restore_verified_at=NULL,error_code=NULL,details='{}'::jsonb " +
    "WHERE (backup_runs.state='error' AND backup_runs.started_at < EXCLUDED.started_at - 900000) " +
    "OR (backup_runs.state='running' AND backup_runs.started_at < EXCLUDED.started_at - 1800000) RETURNING id",
    [runId, startedAt, finalPath, remoteTarget || null]
  );
  if (claim.rowCount !== 1) {
    const existing = await pool.query("SELECT state FROM backup_runs WHERE id=$1", [runId]);
    return { state: existing.rows[0]?.state === "ok" ? "already_completed" : "already_running", runId };
  }

  let archiveVerified = false;
  try {
    if (requireRemote && !remoteTarget) throw new Error("off_host_backup_destination_required");
    const archive = await spawnDump(tempPath, key, env);
    await rename(tempPath, finalPath);
    await chmod(finalPath, 0o600);
    const verification = await verifyPostgresBackup({ backupPath: finalPath, key });
    archiveVerified = true;
    let copiedTo = null;
    if (remoteTarget) copiedTo = await copyOffHost(finalPath, remoteTarget, env);
    const pruned = await pruneLocalBackups(resolve(backupDir), retentionDays, finalPath);
    const finishedAt = now();
    await pool.query(
      `UPDATE backup_runs SET finished_at=$1,state='ok',local_sha256=$2,remote_target=$3,
       byte_length=$4,restore_verified_at=$5,error_code=NULL,details=$6::jsonb WHERE id=$7`,
      [finishedAt, archive.sha256, copiedTo, archive.bytes, finishedAt,
        JSON.stringify({ pgDumpVersion: archive.pgDumpVersion, archiveVerified: verification.verified,
          archiveEntries: verification.archiveEntries, remoteCopyCompleted: Boolean(copiedTo), localBackupsPruned: pruned }), runId]
    );
    return { state: "ok", runId, file: name, bytes: archive.bytes, sha256: archive.sha256,
      archiveVerified: verification.verified, remoteCopyCompleted: Boolean(copiedTo), localBackupsPruned: pruned };
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    if (!archiveVerified) await unlink(finalPath).catch(() => {});
    await pool.query(
      "UPDATE backup_runs SET finished_at=$1,state='error',error_code=$2,details=$3::jsonb WHERE id=$4",
      [now(), String(error?.message || "backup_failed").slice(0, 100),
        JSON.stringify({ phase: "backup_or_verification" }), runId]
    ).catch(() => {});
    throw error;
  }
}

export function createBackupKey() {
  return randomBytes(KEY_BYTES);
}

async function main() {
  const { decodeBackupKey } = await import("./encrypted-backup.mjs");
  const { createPostgresPoolFromEnv } = await import("./postgres-d1.mjs");
  const key = decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
  const pool = await createPostgresPoolFromEnv();
  try {
    const result = await createPostgresBackup({ pool, env: process.env, key });
    console.log(JSON.stringify(result));
  } finally {
    key.fill(0);
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "postgres_backup_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
