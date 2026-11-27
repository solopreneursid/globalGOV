import test from "node:test";
import assert from "node:assert/strict";
import { fetchOfficialDocument } from "./recruitment-document.mjs";

test("direct PDF fetch refuses to make a request without an explicit reviewed source policy", async () => {
  let requests = 0;
  await assert.rejects(fetchOfficialDocument(
    "india-sdsc-shar",
    "https://apps.shar.gov.in/sdscshar/advt_1_2026/notice.pdf",
    async () => { requests += 1; return new Response("%PDF-"); }
  ), /reviewed_source_policy_required/);
  assert.equal(requests, 0);
});
