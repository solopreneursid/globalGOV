import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSourcePolicySources, seedSourcePolicyRegistry, getApprovedSourcePolicy, getScheduledSourcePolicy, recordSourcePolicyReview, sourcePolicyAllowsUrl
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
  assert.equal(calls[0].values[6], null);
  assert.equal(calls[0].values[7], "repository-policy-seed");
});

test("approved policy requires a reviewed, unexpired GET path on the registered official host", async () => {
  const pool = { async query() {
    return { rows: [{
      automated_access_status: "approved", reuse_status: "conditional",
      permitted_methods: [{ method: "GET", path: "/advertisements/", contentType: "application/pdf" }],
      allowed_hosts: ["recruitment.ssb.gov.in"], policy_url: "https://recruitment.ssb.gov.in/websitepolicyUrl",
      reviewed_at: 1000, expires_at: 5000, reviewer_label: "founder",
      notes: "Reviewed the official policy and source access requirements."
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
  await assert.rejects(recordSourcePolicyReview(pool, { ...base, allowedHosts: ["recruitment.ssb.gov.in", "example.com"] }), /host_mismatch/);
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

test("repository policy seeds never satisfy the explicit approval gate", async () => {
  const pool = { async query() {
    return { rows: [{
      automated_access_status: "approved", reuse_status: "conditional",
      permitted_methods: [{ method: "GET", path: "/advertisements/", contentType: "application/pdf" }],
      allowed_hosts: ["recruitment.ssb.gov.in"], policy_url: "https://recruitment.ssb.gov.in/websitepolicyUrl",
      reviewed_at: null, expires_at: null, reviewer_label: "repository-policy-seed",
      notes: "This seed is not independent legal approval."
    }] };
  } };
  assert.equal(await getApprovedSourcePolicy(pool, source, Date.now()), null);
});

test("approved policy paths are exact, host-bound HTTPS GET targets", () => {
  const policy = {
    host: "teaching-vacancies.service.gov.uk",
    automatedCollectionEnabled: true,
    allowedPaths: ["/api/v1/jobs.json"]
  };
  assert.equal(sourcePolicyAllowsUrl(policy, "https://teaching-vacancies.service.gov.uk/api/v1/jobs.json?page=2"), true);
  assert.equal(sourcePolicyAllowsUrl(policy, "https://teaching-vacancies.service.gov.uk/api/v1/private.json"), false);
  assert.equal(sourcePolicyAllowsUrl(policy, "https://evil.example/api/v1/jobs.json"), false);
  assert.equal(sourcePolicyAllowsUrl(policy, "http://teaching-vacancies.service.gov.uk/api/v1/jobs.json"), false);
});

test("source policy seed merges directory and connector-specific official endpoints by source ID", () => {
  const merged = mergeSourcePolicySources(
    [{ id: "uk-dfe-teaching-vacancies", name: "DfE", url: "https://teaching-vacancies.service.gov.uk/jobs" }],
    [{ id: "uk-dfe-teaching-vacancies", api: "https://teaching-vacancies.service.gov.uk/api/v1/jobs.json" }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].url, "https://teaching-vacancies.service.gov.uk/api/v1/jobs.json");
});

test("policy seeding retains every permitted content type for a reviewed RSS endpoint", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    return { rowCount: 1, rows: [] };
  } };
  const result = await seedSourcePolicyRegistry(pool, [{
    id: "manitoba-jobs", name: "Manitoba", country: "Canada",
    url: "https://jobsearch.gov.mb.ca/rss/newJobPostingsFeed.rss"
  }], 1000);
  const methods = JSON.parse(calls[0].values[3]);
  assert.equal(result.inserted, 1);
  assert.deepEqual(methods.map(item => item.contentType).sort(),
    ["application/rss+xml", "application/xml", "text/xml"]);
  assert.ok(methods.every(item => item.path === "/rss/newJobPostingsFeed.rss"));
});

test("only exact documented adapters may use a repository public-policy seed", async () => {
 const dfe={id:"uk-dfe-teaching-vacancies",url:"https://teaching-vacancies.service.gov.uk/api/v1/jobs.json"};
 const isro={id:"india-isro-opportunities",url:"https://www.isro.gov.in/ViewAllOpportunities.html"};
 const seed={automated_access_status:"approved",reuse_status:"conditional",reviewer_label:"repository-policy-seed",reviewed_at:null,expires_at:null};
 const pool=row=>({query:async()=>({rows:row?[row]:[]})});
 assert.equal((await getScheduledSourcePolicy(pool(seed),dfe)).policyBasis,"versioned_source_specific_terms_and_runtime_robots");
 assert.equal((await getScheduledSourcePolicy(pool({...seed,automated_access_status:"not_assessed"}),isro)).host,"www.isro.gov.in");
 for(const row of [null,{...seed,automated_access_status:"denied"},{...seed,reuse_status:"not_approved"},{...seed,reviewer_label:"founder",expires_at:1}])
   assert.equal(await getScheduledSourcePolicy(pool(row),dfe),null);
 assert.equal(await getScheduledSourcePolicy(pool(seed),{...dfe,url:"https://teaching-vacancies.service.gov.uk/private"}),null);
 assert.equal(await getScheduledSourcePolicy(pool(seed),source),null);
});
