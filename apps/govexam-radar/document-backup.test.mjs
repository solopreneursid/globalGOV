import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDocumentArchive, verifyDocumentArchive } from "./document-backup.mjs";
import { randomBytes } from "node:crypto";

const pdf = Buffer.from("%PDF-1.7\narchive fixture\n%%EOF");

test("content-addressed PDF volume archive is encrypted and fully hash-verified", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-doc-backup-"));
  const backupDir = await mkdtemp(join(tmpdir(), "globalgov-doc-backup-file-"));
  const key = randomBytes(32);
  try {
    await chmod(root, 0o700);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(pdf).digest("hex");
    const subdir = join(root, hash.slice(0, 2));
    await mkdir(subdir, { mode: 0o700 });
    await writeFile(join(subdir, hash + ".pdf"), pdf, { mode: 0o600 });
    const archivePath = join(backupDir, "documents.tar.enc");
    const created = await createDocumentArchive({ root, key, outputPath: archivePath });
    assert.equal(created.documentCount, 1);
    const verified = await verifyDocumentArchive({ archivePath, key });
    assert.equal(verified.verified, true);
    assert.equal(verified.documentCount, 1);
    assert.equal(verified.documentBytes, pdf.length);
  } finally {
    key.fill(0);
    await rm(root, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
  }
});

test("document archive rejects tampered or non-content-addressed files", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-doc-backup-"));
  const backupDir = await mkdtemp(join(tmpdir(), "globalgov-doc-backup-file-"));
  const key = randomBytes(32);
  try {
    await chmod(root, 0o700);
    await writeFile(join(root, "unverified.pdf"), pdf, { mode: 0o600 });
    await assert.rejects(createDocumentArchive({
      root, key, outputPath: join(backupDir, "invalid.tar.enc")
    }), /document_store_entry_invalid/);
  } finally {
    key.fill(0);
    await rm(root, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
  }
});
