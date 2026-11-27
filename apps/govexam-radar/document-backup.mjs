// Encrypted content-addressed PDF volume archive. It is paired with the PostgreSQL backup.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, mkdir, rm, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { decodeBackupKey } from "./encrypted-backup.mjs";
import { decryptBackupForRestore, encryptReadableToFile } from "./postgres-backup.mjs";

const HASH = /^[a-f0-9]{64}$/;
const PREFIX = /^[a-f0-9]{2}$/;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_COUNT = 100_000;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function inspectDocumentStore(root) {
  const base = resolve(root);
  const rootInfo = await lstat(base);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || (rootInfo.mode & 0o077) !== 0) {
    throw new Error("document_store_not_private");
  }
  const directories = await readdir(base, { withFileTypes: true });
  let count = 0;
  let bytes = 0;
  for (const directory of directories) {
    if (!directory.isDirectory() || !PREFIX.test(directory.name)) {
      throw new Error("document_store_entry_invalid");
    }
    const dirPath = join(base, directory.name);
    const dirInfo = await lstat(dirPath);
    if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink() || (dirInfo.mode & 0o077) !== 0) {
      throw new Error("document_store_directory_permissions_invalid");
    }
    const files = await readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const match = /^([a-f0-9]{64})\.pdf$/.exec(file.name);
      if (!file.isFile() || !match || match[1].slice(0, 2) !== directory.name) {
        throw new Error("document_store_file_invalid");
      }
      const filePath = join(dirPath, file.name);
      const info = await lstat(filePath);
      if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
          info.size < 8 || info.size > MAX_DOCUMENT_BYTES) {
        throw new Error("document_store_file_permissions_or_size_invalid");
      }
      const content = await readFile(filePath);
      if (content.subarray(0, 5).toString("ascii") !== "%PDF-" || digest(content) !== match[1]) {
        throw new Error("document_store_file_hash_mismatch");
      }
      count += 1;
      bytes += info.size;
      if (count > MAX_DOCUMENT_COUNT) throw new Error("document_store_document_limit_exceeded");
    }
  }
  return { count, bytes };
}

export async function createDocumentArchive({ root = process.env.DOCUMENT_STORE_DIR, key, outputPath } = {}) {
  if (!root || !outputPath || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("document_archive_inputs_invalid");
  }
  const manifest = await inspectDocumentStore(root);
  const child = spawn("tar", [
    "--create", "--gzip", "--file=-", "--directory", resolve(root),
    "--numeric-owner", "--owner=0", "--group=0", "."
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const exit = once(child, "close");
  try {
    const encrypted = await encryptReadableToFile({ readable: child.stdout, key, outputPath });
    const [code] = await exit;
    if (code !== 0) throw new Error("document_tar_failed");
    return { ...encrypted, documentCount: manifest.count, documentBytes: manifest.bytes };
  } catch (error) {
    child.kill("SIGTERM");
    await unlink(outputPath).catch(() => {});
    throw error;
  }
}

export async function verifyDocumentArchive({ archivePath, key } = {}) {
  const restored = await decryptBackupForRestore({ backupPath: archivePath, key });
  const extractionPath = join(restored.directory, "documents");
  try {
    const listing = execFileSync("tar", ["--list", "--verbose", "--gzip", "--file", restored.dumpPath], {
      encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let expectedFiles = 0;
    for (const line of listing.split("\n").filter(Boolean)) {
      const type = line[0];
      const name = line.trim().split(/\s+/).at(-1);
      if (type === "d" && (name === "./" || /^\.\/[a-f0-9]{2}\/$/.test(name))) continue;
      const match = /^\.\/([a-f0-9]{2})\/([a-f0-9]{64})\.pdf$/.exec(name);
      if (type !== "-" || !match || match[1] !== match[2].slice(0, 2)) {
        throw new Error("document_archive_entry_invalid");
      }
      expectedFiles += 1;
      if (expectedFiles > MAX_DOCUMENT_COUNT) throw new Error("document_archive_document_limit_exceeded");
    }
    await mkdir(extractionPath, { recursive: true, mode: 0o700 });
    execFileSync("tar", [
      "--extract", "--gzip", "--file", restored.dumpPath, "--directory", extractionPath,
      "--no-same-owner", "--no-same-permissions", "--no-overwrite-dir"
    ], { timeout: 120000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const manifest = await inspectDocumentStore(extractionPath);
    if (manifest.count !== expectedFiles) throw new Error("document_archive_count_mismatch");
    return { verified: true, documentCount: manifest.count, documentBytes: manifest.bytes };
  } catch (error) {
    if (String(error?.message || "").startsWith("document_archive_")) throw error;
    throw new Error("document_archive_restore_verification_failed");
  } finally {
    await rm(restored.directory, { recursive: true, force: true });
  }
}

async function main() {
  const key = decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
  const pool = await createPostgresPoolFromEnv();
  try {
    const result = await pool.query(
      "SELECT document_archive_path FROM backup_runs WHERE state='ok' AND document_archive_verified_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1"
    );
    const path = process.argv[2] || result.rows[0]?.document_archive_path;
    if (!path) throw new Error("verified_document_archive_not_found");
    const verification = await verifyDocumentArchive({ archivePath: path, key });
    const update = await pool.query(
      "UPDATE backup_runs SET document_restore_verified_at=$1 WHERE document_archive_path=$2 AND state='ok'",
      [Date.now(), path]
    );
    if (update.rowCount !== 1) throw new Error("document_restore_audit_update_failed");
    console.log(JSON.stringify({ state: "verified", archivePath: path, ...verification }));
  } finally {
    key.fill(0);
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "document_restore_test_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
