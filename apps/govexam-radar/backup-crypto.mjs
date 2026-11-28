import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, chmod, lstat, open, unlink, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const BACKUP_MAGIC = Buffer.from("GLOBALGOV-PG-BACKUP-1\n");
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024 * 1024;
const TAG_BYTES = 16;

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("backup_key_invalid");
}

export function sealBackupBytes(bytes, key) {
  assertKey(key);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_BACKUP_BYTES) {
    throw new Error("backup_payload_invalid");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(BACKUP_MAGIC);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([BACKUP_MAGIC, iv, encrypted, cipher.getAuthTag()]);
}

export function openBackupBytes(envelope, key) {
  assertKey(key);
  if (!Buffer.isBuffer(envelope) || envelope.length <= BACKUP_MAGIC.length + 12 + TAG_BYTES ||
      envelope.length > MAX_BACKUP_BYTES || !envelope.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error("encrypted_backup_envelope_invalid");
  }
  const start = BACKUP_MAGIC.length;
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(start, start + 12));
  decipher.setAAD(BACKUP_MAGIC);
  decipher.setAuthTag(envelope.subarray(envelope.length - TAG_BYTES));
  return Buffer.concat([
    decipher.update(envelope.subarray(start + 12, envelope.length - TAG_BYTES)),
    decipher.final()
  ]);
}

export async function encryptReadableToFile({ readable, key, outputPath } = {}) {
  assertKey(key);
  if (!readable || typeof outputPath !== "string" || !outputPath) {
    throw new Error("backup_stream_inputs_invalid");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(BACKUP_MAGIC);
  const prefix = Buffer.concat([BACKUP_MAGIC, iv]);
  const digest = createHash("sha256");
  digest.update(prefix);
  const output = createWriteStream(outputPath, { flags: "wx", mode: 0o600 });
  output.write(prefix);
  let encryptedBytes = prefix.length;
  const hashing = new Transform({
    transform(chunk, encoding, callback) {
      encryptedBytes += chunk.length;
      if (encryptedBytes > MAX_BACKUP_BYTES - TAG_BYTES) {
        callback(new Error("backup_stream_size_limit_exceeded"));
        return;
      }
      digest.update(chunk);
      callback(null, chunk);
    }
  });
  try {
    await pipeline(readable, cipher, hashing, output);
    const tag = cipher.getAuthTag();
    await appendFile(outputPath, tag, { mode: 0o600 });
    digest.update(tag);
    await chmod(outputPath, 0o600);
    const info = await lstat(outputPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BACKUP_BYTES) {
      throw new Error("backup_output_invalid");
    }
    return { bytes: info.size, sha256: digest.digest("hex") };
  } catch {
    await unlink(outputPath).catch(() => {});
    throw new Error("backup_stream_encryption_failed");
  }
}

async function decryptToTemporaryFile(backupPath, key, directory) {
  assertKey(key);
  const info = await lstat(backupPath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      info.size <= BACKUP_MAGIC.length + 12 + TAG_BYTES || info.size > MAX_BACKUP_BYTES) {
    throw new Error("encrypted_backup_file_invalid");
  }
  const handle = await open(backupPath, "r");
  const prefix = Buffer.alloc(BACKUP_MAGIC.length + 12);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(prefix, 0, prefix.length, 0);
    await handle.read(tag, 0, tag.length, info.size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!prefix.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error("encrypted_backup_header_invalid");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, prefix.subarray(BACKUP_MAGIC.length));
  decipher.setAAD(BACKUP_MAGIC);
  decipher.setAuthTag(tag);
  const dumpPath = join(directory, "restore.dump");
  const input = createReadStream(backupPath, {
    start: prefix.length, end: info.size - TAG_BYTES - 1
  });
  const output = createWriteStream(dumpPath, { flags: "wx", mode: 0o600 });
  try {
    await pipeline(input, decipher, output);
  } catch {
    await unlink(dumpPath).catch(() => {});
    throw new Error("encrypted_backup_authentication_failed");
  }
  return dumpPath;
}

export async function decryptBackupForRestore({ backupPath, key } = {}) {
  assertKey(key);
  const directory = await mkdtemp(join(dirname(resolve(backupPath)), ".globalgov-restore-"));
  try {
    const dumpPath = await decryptToTemporaryFile(backupPath, key, directory);
    return { directory, dumpPath };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
