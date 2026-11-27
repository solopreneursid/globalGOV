// First-party source access/reuse policy registry. No policy approval is inferred from directory membership.
import { sourceAutomationPolicy } from "./source-connectors.mjs";

const AUTOMATION = new Set(["approved", "research_only", "clarification_required", "denied", "not_assessed"]);
const REUSE = new Set(["approved", "conditional", "review_required", "not_approved", "not_assessed"]);
const HOST = /^[a-z0-9.-]+$/;
const CONTENT_TYPES = new Set([
  "application/pdf", "application/json", "application/rss+xml", "application/xml",
  "text/xml", "text/html", "text/plain"
]);

function jsonValue(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : fallback; }
    catch { return fallback; }
  }
  return fallback;
}

function automationSeed(policy) {
  if (policy.automationStatus === "clarification_required") return "clarification_required";
  if (policy.automationStatus === "research_only") return "research_only";
  if (policy.automationStatus === "approved_public_feed" && policy.automatedCollectionEnabled) return "approved";
  return "not_assessed";
}

function reuseSeed(policy) {
  if (policy.commercialReuseApproved) return "approved";
  if (String(policy.reuseStatus).includes("conditional")) return "conditional";
  if (String(policy.reuseStatus).includes("review") || String(policy.reuseStatus).includes("policy")) {
    return "review_required";
  }
  return "not_assessed";
}

export async function seedSourcePolicyRegistry(pool, sources, now = Date.now()) {
  if (!pool || typeof pool.query !== "function" || !Array.isArray(sources) || !Number.isSafeInteger(now)) {
    throw new Error("source_policy_seed_inputs_invalid");
  }
  let inserted = 0;
  for (const source of sources) {
    const policy = sourceAutomationPolicy(source);
    const methods = policy.allowedPaths.map(path => ({
      method: "GET",
      path,
      contentType: policy.allowedContentTypes[0] || "text/html"
    }));
    const result = await pool.query(
      `INSERT INTO source_policy_reviews
       (source_id,automated_access_status,reuse_status,permitted_methods,allowed_hosts,
        policy_url,reviewed_at,expires_at,reviewer_label,notes,updated_at)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,NULL,$8,$9,$10)
       ON CONFLICT(source_id) DO NOTHING`,
      [source.id, automationSeed(policy), reuseSeed(policy), JSON.stringify(methods),
        [policy.host], policy.policyUrl || source.url,
        automationSeed(policy) === "approved" ? now : null,
        "repository-policy-seed",
        "Seeded from the version-controlled first-party connector registry. This seed is not independent legal approval; review before expanding collection or reuse.",
        now]
    );
    inserted += result.rowCount || 0;
  }
  return { total: sources.length, inserted, preservedExistingReviews: sources.length - inserted };
}

export async function getApprovedSourcePolicy(pool, source, now = Date.now()) {
  if (!pool || typeof pool.query !== "function" || !source?.id || !source?.url) {
    throw new Error("source_policy_lookup_inputs_invalid");
  }
  const result = await pool.query(
    `SELECT automated_access_status,reuse_status,permitted_methods,allowed_hosts,
      policy_url,reviewed_at,expires_at,reviewer_label
     FROM source_policy_reviews WHERE source_id=$1`,
    [source.id]
  );
  const row = result.rows[0];
  if (!row || row.automated_access_status !== "approved" ||
      !row.reviewed_at || !row.reviewer_label ||
      (row.expires_at !== null && row.expires_at !== undefined && Number(row.expires_at) <= now)) {
    return null;
  }
  const registered = new URL(source.url);
  const allowedHosts = Array.isArray(row.allowed_hosts) ? row.allowed_hosts : [];
  if (registered.protocol !== "https:" || !allowedHosts.includes(registered.hostname.toLowerCase())) {
    return null;
  }
  const methods = jsonValue(row.permitted_methods, []);
  const getMethods = methods.filter(item => item && item.method === "GET" &&
    typeof item.path === "string" && item.path.startsWith("/") && !item.path.includes("..") &&
    typeof item.contentType === "string" && CONTENT_TYPES.has(item.contentType.toLowerCase()));
  if (!getMethods.length) return null;
  return Object.freeze({
    sourceId: source.id,
    host: registered.hostname.toLowerCase(),
    connector: "approved_database_policy",
    automationStatus: "approved",
    automatedCollectionEnabled: true,
    reuseStatus: row.reuse_status,
    commercialReuseApproved: row.reuse_status === "approved",
    allowedPaths: Object.freeze([...new Set(getMethods.map(item => item.path))]),
    allowedContentTypes: Object.freeze([...new Set(getMethods.map(item => item.contentType.toLowerCase()))]),
    policyUrl: row.policy_url,
    reviewerLabel: row.reviewer_label,
    reviewedAt: Number(row.reviewed_at),
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : Number(row.expires_at),
    minIntervalMs: 5000,
    maxBytes: 10 * 1024 * 1024
  });
}

export async function recordSourcePolicyReview(pool, {
  source, automatedAccessStatus, reuseStatus, permittedMethods, allowedHosts,
  policyUrl = null, reviewedAt = Date.now(), expiresAt = null,
  reviewerLabel, notes = ""
} = {}) {
  if (!pool || typeof pool.query !== "function" || !source?.id || !source?.url ||
      !AUTOMATION.has(automatedAccessStatus) || !REUSE.has(reuseStatus) ||
      !Array.isArray(permittedMethods) || permittedMethods.length > 32 ||
      !Array.isArray(allowedHosts) || !allowedHosts.length || allowedHosts.length > 8 ||
      !Number.isSafeInteger(reviewedAt) || (expiresAt !== null && !Number.isSafeInteger(expiresAt)) ||
      typeof reviewerLabel !== "string" || !reviewerLabel.trim() || reviewerLabel.length > 120 ||
      typeof notes !== "string" || notes.length > 4000) {
    throw new Error("source_policy_review_invalid");
  }
  const registered = new URL(source.url);
  const hosts = [...new Set(allowedHosts.map(host => String(host).toLowerCase()))];
  if (registered.protocol !== "https:" || !hosts.includes(registered.hostname.toLowerCase()) ||
      hosts.some(host => !HOST.test(host))) throw new Error("source_policy_host_mismatch");
  const methods = permittedMethods.map(item => {
    if (!item || item.method !== "GET" || typeof item.path !== "string" ||
        !item.path.startsWith("/") || item.path.includes("..") ||
        typeof item.contentType !== "string" || !CONTENT_TYPES.has(item.contentType.toLowerCase())) {
      throw new Error("source_policy_method_invalid");
    }
    return { method: "GET", path: item.path, contentType: item.contentType.toLowerCase() };
  });
  if (automatedAccessStatus === "approved" &&
      (methods.length === 0 || !policyUrl || !notes.trim() || expiresAt === null || expiresAt <= reviewedAt)) {
    throw new Error("approved_source_policy_requires_evidence_expiry_and_get_method");
  }
  if (policyUrl !== null) {
    const url = new URL(policyUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("source_policy_url_invalid");
  }
  const result = await pool.query(
    `INSERT INTO source_policy_reviews
     (source_id,automated_access_status,reuse_status,permitted_methods,allowed_hosts,
      policy_url,reviewed_at,expires_at,reviewer_label,notes,updated_at)
     VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(source_id) DO UPDATE SET
       automated_access_status=EXCLUDED.automated_access_status,
       reuse_status=EXCLUDED.reuse_status,
       permitted_methods=EXCLUDED.permitted_methods,
       allowed_hosts=EXCLUDED.allowed_hosts,
       policy_url=EXCLUDED.policy_url,
       reviewed_at=EXCLUDED.reviewed_at,
       expires_at=EXCLUDED.expires_at,
       reviewer_label=EXCLUDED.reviewer_label,
       notes=EXCLUDED.notes,
       updated_at=EXCLUDED.updated_at`,
    [source.id, automatedAccessStatus, reuseStatus, JSON.stringify(methods), hosts,
      policyUrl, reviewedAt, expiresAt, reviewerLabel.trim(), notes, Date.now()]
  );
  return { sourceId: source.id, updated: result.rowCount === 1, automatedAccessStatus, reuseStatus };
}
