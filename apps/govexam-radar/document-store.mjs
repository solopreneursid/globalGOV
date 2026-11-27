// Owner-controlled content-addressed PDF archive. No cloud object store or remote API.
import { createHash } from "node:crypto";
import { open, mkdir, lstat, readFile, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("document_directory_must_be_private");
  }
}

function validatePdf(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > MAX_DOCUMENT_BYTES ||
      bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("invalid_pdf_document");
  }
}

function documentPath(root, hash) {
  if (!HASH.test(hash)) throw new Error("document_hash_invalid");
  const base = resolve(root);
  const target = resolve(base, hash.slice(0, 2), hash + ".pdf");
  if (!target.startsWith(base + sep)) throw new Error("document_path_escape");
  return target;
}

export async function storePdf({ root, bytes } = {}) {
  if (typeof root !== "string" || !root || !resolve(root)) throw new Error("document_store_root_required");
  validatePdf(bytes);
  const hash = sha256(bytes);
  const target = documentPath(root, hash);
  const directory = join(resolve(root), hash.slice(0, 2));
  await privateDirectory(resolve(root));
  await privateDirectory(directory);

  let handle;
  let deduplicated = false;
  try {
    handle = await open(target, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (error?.code !== "EEXIST") {
      await unlink(target).catch(() => {});
      throw error;
    }
    deduplicated = true;
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size !== bytes.length) {
      throw new Error("existing_document_file_invalid");
    }
    const existing = await readFile(target);
    if (sha256(existing) !== hash) throw new Error("existing_document_hash_mismatch");
  }

  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== bytes.length) {
    throw new Error("stored_document_verification_failed");
  }
  return Object.freeze({
    sha256: hash,
    storageKey: hash.slice(0, 2) + "/" + hash + ".pdf",
    bytes: bytes.length,
    contentType: "application/pdf",
    deduplicated
  });
}

export async function readPdf({ root, sha256: hash } = {}) {
  if (typeof root !== "string" || !root) throw new Error("document_store_root_required");
  const target = documentPath(root, hash);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      info.size < 8 || info.size > MAX_DOCUMENT_BYTES) {
    throw new Error("stored_document_invalid");
  }
  const bytes = await readFile(target);
  validatePdf(bytes);
  if (sha256(bytes) !== hash) throw new Error("stored_document_hash_mismatch");
  return bytes;
}

export async function storeManualEvidencePdf({ root, source, sourceUrl, bytes } = {}) {
  if (!source || typeof source.id !== "string" || typeof source.url !== "string") {
    throw new Error("official_source_required");
  }
  let sourceBase;
  let evidenceUrl;
  try {
    sourceBase = new URL(source.url);
    evidenceUrl = new URL(sourceUrl);
  } catch {
    throw new Error("official_source_url_invalid");
  }
  if (sourceBase.protocol !== "https:" || evidenceUrl.protocol !== "https:" ||
      sourceBase.hostname.toLowerCase() !== evidenceUrl.hostname.toLowerCase() ||
      evidenceUrl.username || evidenceUrl.password || evidenceUrl.port || evidenceUrl.hash) {
    throw new Error("manual_evidence_url_not_same_official_host");
  }
  const stored = await storePdf({ root, bytes });
  return Object.freeze({
    ...stored,
    sourceId: source.id,
    sourceUrl: evidenceUrl.toString(),
    reviewState: "requires_review",
    publicationAuthorized: false,
    provenance: "founder_supplied_local_document"
  });
}
