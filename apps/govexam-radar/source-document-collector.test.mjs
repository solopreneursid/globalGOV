import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectOfficialRecruitmentDocument, registerManualRecruitmentDocument } from "./source-document-collector.mjs";

const pdf = Buffer.from("%PDF-1.7\nmanual evidence fixture\n%%EOF");
function mockPool() {
  const calls = [];
  return {
    calls,
    async connect() {
      return {
        async query(sql, values) { calls.push({ sql, values }); return { rowCount: 1, rows: [] }; },
        release() {}
      };
    }
  };
}

test("manual evidence intake archives an official-host PDF and queues human review", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-doc-intake-"));
  const pool = mockPool();
  try {
    const result = await registerManualRecruitmentDocument({
      root,
      source: { id: "ssb-india-recruitment", url: "https://recruitment.ssb.gov.in/" },
      sourceUrl: "https://recruitment.ssb.gov.in/advertisement.pdf",
      bytes: pdf,
      pool,
      now: Date.parse("2026-11-27T00:00:00Z")
    });
    assert.equal(result.publicationAuthorized, false);
    assert.equal(result.review.reviewState, "pending");
    assert.equal(pool.calls.length, 5);
    assert.match(pool.calls[1].sql, /source_documents/);
    assert.match(pool.calls[2].sql, /manual_review_queue/);
    assert.match(pool.calls[3].sql, /source_connector_runs/);
    assert.equal(pool.calls[4].sql, "COMMIT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manual intake rejects a PDF from a non-official host", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-doc-intake-"));
  try {
    await assert.rejects(registerManualRecruitmentDocument({
      root,
      source: { id: "ssb-india-recruitment", url: "https://recruitment.ssb.gov.in/" },
      sourceUrl: "https://example.com/advertisement.pdf",
      bytes: pdf,
      pool: mockPool()
    }), /same_official_host/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automated document collection refuses sources without an approved database policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "globalgov-doc-intake-"));
  let fetchCalls = 0;
  try {
    await assert.rejects(collectOfficialRecruitmentDocument({
      sourceId: "ssb-india-recruitment",
      sourceUrl: "https://recruitment.ssb.gov.in/advertisements/notice.pdf",
      root,
      pool: { async query() { return { rows: [] }; } },
      fetcher: async () => { fetchCalls += 1; return new Response("unexpected"); }
    }), /source_automation_not_approved/);
    assert.equal(fetchCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
