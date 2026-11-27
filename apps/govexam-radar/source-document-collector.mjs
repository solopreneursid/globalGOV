// First-party official-document collection and manual evidence intake.
// Originals are stored locally by SHA-256. Every record remains private and pending review.
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { fetchOfficialDocument, extractPdfText } from "./recruitment-document.mjs";
import { extractRecruitmentEvidence } from "./recruitment-evidence.mjs";
import { storePdf, storeManualEvidencePdf } from "./document-store.mjs";
import { SOURCES } from "./worker.js";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const hash = value => createHash("sha256").update(value).digest("hex");

async function persistDocumentAndReview(pool, document, recordType, evidence, now) {
  if (!pool || typeof pool.connect !== "function") throw new Error("postgres_pool_required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stored = await client.query(
      `INSERT INTO source_documents
       (sha256,source_id,source_url,storage_key,content_type,byte_length,first_seen_at,last_seen_at,
        provenance,review_state,text_sha256,evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,'requires_review',$9,$10::jsonb)
       ON CONFLICT (sha256) DO UPDATE SET last_seen_at=GREATEST(source_documents.last_seen_at,EXCLUDED.last_seen_at)
       WHERE source_documents.source_id=EXCLUDED.source_id
         AND source_documents.source_url=EXCLUDED.source_url
         AND source_documents.storage_key=EXCLUDED.storage_key
       RETURNING sha256`,
      [document.sha256, document.sourceId, document.sourceUrl, document.storageKey,
        document.contentType, document.bytes, now, document.provenance,
        document.textSha256 || null, JSON.stringify(evidence)]
    );
    if (stored.rowCount !== 1) throw new Error("document_provenance_conflict");

    const queueId = randomUUID();
    await client.query(
      `INSERT INTO manual_review_queue
       (id,source_id,document_sha256,record_type,evidence,state,submitted_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,'pending',$6)`,
      [queueId, document.sourceId, document.sha256, recordType, JSON.stringify(evidence), now]
    );
    await client.query("COMMIT");
    return { queueId, documentSha256: document.sha256, reviewState: "pending" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function collectOfficialRecruitmentDocument({
  sourceId, sourceUrl, root = process.env.DOCUMENT_STORE_DIR, fetcher = fetch, pool, now = Date.now()
} = {}) {
  if (!root) throw new Error("document_store_directory_required");
  const bytes = await fetchOfficialDocument(sourceId, sourceUrl, fetcher);
  const stored = await storePdf({ root, bytes });
  const text = extractPdfText(bytes);
  const report = extractRecruitmentEvidence({
    sourceId, sourceUrl, documentBytes: bytes, text,
    observedAt: new Date(now).toISOString(), provenance: "official_https_fetch"
  });
  const document = {
    ...stored, sourceId, sourceUrl: report.sourceUrl,
    provenance: "official_https_fetch", textSha256: report.textSha256
  };
  const review = await persistDocumentAndReview(
    pool, document, "recruitment_notice", report, now
  );
  return {
    document: { sha256: stored.sha256, storageKey: stored.storageKey, bytes: stored.bytes },
    review,
    extraction: { fields: Object.keys(report.fields), conflicts: report.conflicts, reviewState: report.reviewState },
    publicationAuthorized: false
  };
}

export async function registerManualRecruitmentDocument({
  source, sourceUrl, filePath, bytes, root = process.env.DOCUMENT_STORE_DIR, pool, now = Date.now()
} = {}) {
  if (!root) throw new Error("document_store_directory_required");
  if (!Buffer.isBuffer(bytes)) {
    if (typeof filePath !== "string" || !filePath) throw new Error("manual_document_file_required");
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
        info.size < 8 || info.size > MAX_PDF_BYTES) {
      throw new Error("manual_document_must_be_private_regular_file");
    }
    bytes = await readFile(filePath);
  }
  const stored = await storeManualEvidencePdf({ root, source, sourceUrl, bytes });
  const document = {
    ...stored,
    provenance: "founder_supplied_local_document",
    textSha256: null
  };
  const evidence = {
    schemaVersion: 1,
    sourceId: source.id,
    sourceUrl: stored.sourceUrl,
    documentSha256: stored.sha256,
    storageKey: stored.storageKey,
    observedAt: new Date(now).toISOString(),
    provenance: "founder_supplied_local_document",
    reviewState: "requires_review",
    limitations: ["Local document origin is founder-supplied and not independently fetched by globalGOV.",
      "No vacancy fields are extracted or published by this intake operation."]
  };
  const review = await persistDocumentAndReview(pool, document, "recruitment_notice", evidence, now);
  return {
    document: { sha256: stored.sha256, storageKey: stored.storageKey, bytes: stored.bytes },
    review,
    publicationAuthorized: false
  };
}

async function main() {
  const [mode, sourceId, sourceUrl, filePath, ...extra] = process.argv.slice(2);
  if (extra.length || !mode || !sourceId || !sourceUrl ||
      !["fetch", "manual"].includes(mode) || mode === "fetch" && filePath ||
      mode === "manual" && !filePath) {
    throw new Error("usage: source-document-collector.mjs fetch SOURCE_ID OFFICIAL_PDF_URL | manual SOURCE_ID OFFICIAL_PDF_URL PRIVATE_LOCAL_PDF");
  }
  const pool = await createPostgresPoolFromEnv();
  try {
    let result;
    if (mode === "fetch") {
      result = await collectOfficialRecruitmentDocument({ sourceId, sourceUrl, pool });
    } else {
      const source = SOURCES.find(item => item.id === sourceId);
      if (!source) throw new Error("unknown_registered_source");
      result = await registerManualRecruitmentDocument({ source, sourceUrl, filePath, pool });
    }
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "document_collection_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
