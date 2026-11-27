import test from "node:test";
import assert from "node:assert/strict";
import {
  seedSourcePolicyRegistry, getApprovedSourcePolicy, recordSourcePolicyReview
} from "./source-policy.mjs";

const source = { id: "ssb", url: "https://recruitment.ssb.gov.in/" };

test("policy seed preserves explicit founder reviews and does not infer SSB automation approval", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    return { rowCount: values[0] === "ssb" ? 1 : 0, rows: [] };
  } };
  const result = await seedSourcePolicyRegistry(pool, [source], 1000);
  assert.equal(result.total, 1);
  assert.equal(result.inserted, 1);
  assert.equal(calls[0].values[1], "clarification_required");
  assert.equal(calls[0].values[2], "conditional");
});

test("approved policy requires a reviewed, unexpired GET path on the registered official host", async () => {
  const pool = { async query() {
    return { rows: [{
      automated_access_status: "approved", reuse_status: "conditional",
      permitted_methods: [{ method: "GET", path: "/advertisements/", contentType: "application/pdf" }],
      allowed_hosts: ["recruitment.ssb.gov.in"], policy_url: "https://recruitment.ssb.gov.in/websitepolicyUrl",
      reviewed_at: 1000, expires_at: 5000, reviewer_label: "founder"
    }] };
  } };
  const policy = await getApprovedSourcePolicy(pool, source, 2000);
  assert.equal(policy.automatedCollectionEnabled, true);
  assert.deepEqual(policy.allowedPaths, ["/advertisements/"]);
  assert.equal(await getApprovedSourcePolicy(pool, source, 6000), null);
});

test("founder policy review rejects host expansion and non-GET methods", async () => {
  const pool = { async query() { return { rowCount: 1 }; } };
  const base = {
    source, automatedAccessStatus: "approved", reuseStatus: "conditional",
    permittedMethods: [{ method: "GET", path: "/advertisements/", contentType: "application/pdf" }],
    allowedHosts: ["recruitment.ssb.gov.in"],
    policyUrl: "https://recruitment.ssb.gov.in/websitepolicyUrl",
    reviewerLabel: "founder", reviewedAt: 1000, expiresAt: 5000, notes: "Written approval recorded for test purposes."
  };
  await assert.rejects(recordSourcePolicyReview(pool, { ...base, allowedHosts: ["example.com"] }), /host_mismatch/);
  await assert.rejects(recordSourcePolicyReview(pool, {
    ...base, permittedMethods: [{ method: "POST", path: "/", contentType: "application/pdf" }]
  }), /method_invalid/);
});

test("approved source policy requires a cited policy and expiry", async () => {
  const pool = { async query() { return { rowCount: 1 }; } };
  await assert.rejects(recordSourcePolicyReview(pool, {
    source, automatedAccessStatus: "approved", reuseStatus: "conditional",
    permittedMethods: [{ method: "GET", path: "/advertisements/", contentType: "application/pdf" }],
    allowedHosts: ["recruitment.ssb.gov.in"], reviewerLabel: "founder",
    reviewedAt: 1000, expiresAt: 5000, notes: "Approved by email"
  }), /requires_evidence_expiry/);
});
