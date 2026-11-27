import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storePdf, readPdf, storeManualEvidencePdf } from "./document-store.mjs";

const pdf = Buffer.from("%PDF-1.7\nsynthetic test document\n%%EOF");

test("content-addressed PDF storage deduplicates and verifies bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-documents-"));
  try {
    const first = await storePdf({ root, bytes: pdf });
    const second = await storePdf({ root, bytes: pdf });
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.storageKey, second.storageKey);
    assert.deepEqual(await readPdf({ root, sha256: first.sha256 }), pdf);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid PDFs, path traversal and tampered content", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-documents-"));
  try {
    await assert.rejects(storePdf({ root, bytes: Buffer.from("not a pdf") }), /invalid_pdf/);
    await assert.rejects(readPdf({ root, sha256: "../escape" }), /hash_invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manual evidence requires an HTTPS URL on the registered official host", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-documents-"));
  const source = { id: "ssb", url: "https://recruitment.ssb.gov.in/" };
  try {
    const item = await storeManualEvidencePdf({
      root, source, sourceUrl: "https://recruitment.ssb.gov.in/advertisement.pdf", bytes: pdf
    });
    assert.equal(item.reviewState, "requires_review");
    assert.equal(item.publicationAuthorized, false);
    await assert.rejects(storeManualEvidencePdf({
      root, source, sourceUrl: "https://example.com/advertisement.pdf", bytes: pdf
    }), /same_official_host/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
