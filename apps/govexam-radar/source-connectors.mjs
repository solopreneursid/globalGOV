// First-party, policy-gated connector framework for official government sources.
// Directory membership never implies permission to automate collection or republish content.
import { sourceRights } from "./source-rights.mjs";

const HOST_POLICIES = Object.freeze({
  "teaching-vacancies.service.gov.uk": Object.freeze({
    connector: "official_json_feed",
    automationStatus: "approved_public_feed",
    automatedCollectionEnabled: true,
    reuseStatus: "conditional_open_licence",
    allowedPaths: Object.freeze(["/api/v1/jobs.json"]),
    allowedContentTypes: Object.freeze(["application/json"])
  }),
  "jobsearch.gov.mb.ca": Object.freeze({
    connector: "official_rss_feed",
    automationStatus: "research_only",
    automatedCollectionEnabled: true,
    reuseStatus: "commercial_reuse_review_required",
    allowedPaths: Object.freeze(["/rssFeeds.action"]),
    allowedContentTypes: Object.freeze(["application/rss+xml", "application/xml", "text/xml"])
  }),
  "www.isro.gov.in": Object.freeze({
    connector: "official_html_table",
    automationStatus: "policy_and_robots_gated",
    automatedCollectionEnabled: true,
    reuseStatus: "conditional_attributed_reuse",
    allowedPaths: Object.freeze(["/ViewAllOpportunities.html"]),
    allowedContentTypes: Object.freeze(["text/html"])
  }),
  "recruitment.ssb.gov.in": Object.freeze({
    connector: "manual_until_access_clarified",
    automationStatus: "clarification_required",
    automatedCollectionEnabled: false,
    reuseStatus: "conditional_attributed_reuse",
    allowedPaths: Object.freeze(["/adv_newsUrl", "/notificationUrl", "/websitepolicyUrl"]),
    allowedContentTypes: Object.freeze(["text/html"])
  }),
  "apps.shar.gov.in": Object.freeze({
    connector: "official_pdf_evidence",
    automationStatus: "policy_and_robots_gated",
    automatedCollectionEnabled: true,
    reuseStatus: "source_specific_policy",
    allowedPaths: Object.freeze(["/sdscshar/", "/Recruitment"]),
    allowedContentTypes: Object.freeze(["application/pdf"])
  }),
  "www.usajobs.gov": Object.freeze({
    connector: "official_api_existing",
    automationStatus: "official_api_configuration_required",
    automatedCollectionEnabled: false,
    reuseStatus: "official_api_terms_review",
    allowedPaths: Object.freeze(["/api/"]),
    allowedContentTypes: Object.freeze(["application/json"])
  })
});

const DEFAULT_POLICY = Object.freeze({
  connector: "directory_only",
  automationStatus: "not_assessed",
  automatedCollectionEnabled: false,
  reuseStatus: "not_assessed",
  allowedPaths: Object.freeze([]),
  allowedContentTypes: Object.freeze([])
});

const hostQueues = new Map();
const lastRequestAt = new Map();

function normalizedHost(source) {
  if (!source || typeof source.url !== "string") throw new Error("source_url_required");
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("source_url_not_public_https");
  }
  return url.hostname.toLowerCase();
}

export function sourceAutomationPolicy(source) {
  const host = normalizedHost(source);
  const configured = HOST_POLICIES[host] || DEFAULT_POLICY;
  const rights = sourceRights(source.id);
  return Object.freeze({
    sourceId: source.id,
    host,
    connector: configured.connector,
    automationStatus: configured.automationStatus,
    automatedCollectionEnabled: configured.automatedCollectionEnabled,
    reuseStatus: rights?.reuseStatus || configured.reuseStatus,
    commercialReuseApproved: rights?.commercialReuseApprovedForCurrentFields === true,
    allowedPaths: configured.allowedPaths,
    allowedContentTypes: configured.allowedContentTypes,
    policyUrl: rights?.termsUrl || null,
    sourceUrl: source.url
  });
}

export function buildSourceConnectorInventory(sources) {
  if (!Array.isArray(sources)) throw new Error("source_registry_required");
  const ids = new Set();
  return sources.map(source => {
    if (!source || typeof source.id !== "string" || !source.id || ids.has(source.id)) {
      throw new Error("source_registry_invalid_or_duplicate");
    }
    ids.add(source.id);
    const policy = sourceAutomationPolicy(source);
    return {
      id: source.id,
      name: source.name,
      country: source.country,
      url: source.url,
      connector: policy.connector,
      automationStatus: policy.automationStatus,
      automatedCollectionEnabled: policy.automatedCollectionEnabled,
      reuseStatus: policy.reuseStatus,
      commercialReuseApproved: policy.commercialReuseApproved,
      policyUrl: policy.policyUrl
    };
  });
}

export function parseRobotsRules(text, userAgent = "globalGOV", requestPath = "/") {
  if (typeof text !== "string" || Buffer.byteLength(text) > 8192) {
    throw new Error("robots_document_invalid");
  }
  const groups = [];
  let group = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || group.hasRules) {
        group = { agents: [], rules: [], hasRules: false };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key)) {
      group.hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", path: value });
    }
  }
  const agent = userAgent.toLowerCase();
  const matching = groups.filter(g => g.agents.some(a => a === "*" || (a && agent.includes(a))));
  if (!matching.length) return { allowed: true, matchedRule: null };
  const specificity = Math.max(...matching.flatMap(g => g.agents.map(a => a === "*" ? 0 : a.length)));
  const rules = matching
    .filter(g => g.agents.some(a => (a === "*" ? 0 : a.length) === specificity))
    .flatMap(g => g.rules);
  if (typeof requestPath !== "string" || !requestPath.startsWith("/")) throw new Error("robots_request_path_invalid");
  const path = requestPath;
  let best = null;
  for (const rule of rules) {
    if (!path.startsWith(rule.path)) continue;
    if (!best || rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow && !best.allow)) best = rule;
  }
  return { allowed: best ? best.allow : true, matchedRule: best };
}

async function readBounded(response, maxBytes) {
  const advertised = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(advertised) && advertised > maxBytes) throw new Error("source_response_too_large");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("source_response_too_large");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

async function serializeHostStart(host, minIntervalMs, now, sleep) {
  const previous = hostQueues.get(host) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  hostQueues.set(host, previous.then(() => next));
  await previous;
  try {
    const current = now();
    const wait = Math.max(0, (lastRequestAt.get(host) || 0) + minIntervalMs - current);
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, now());
  } finally {
    release();
  }
}

export async function fetchOfficialSource({
  source,
  url,
  fetcher = fetch,
  maxBytes = 2 * 1024 * 1024,
  minIntervalMs = 5000,
  userAgent = "globalGOV",
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const policy = sourceAutomationPolicy(source);
  if (!policy.automatedCollectionEnabled) throw new Error("automated_access_not_approved");
  if (policy.automationStatus === "research_only") throw new Error("research_only_connector");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10 * 1024 * 1024 ||
      !Number.isSafeInteger(minIntervalMs) || minIntervalMs < 0 || minIntervalMs > 300000) {
    throw new Error("source_fetch_limits_invalid");
  }

  const target = new URL(url || source.url);
  if (target.protocol !== "https:" || target.hostname.toLowerCase() !== policy.host ||
      target.username || target.password || target.port || target.hash ||
      !policy.allowedPaths.some(path => target.pathname === path ||
        (path.endsWith("/") && target.pathname.startsWith(path)))) {
    throw new Error("source_url_not_allowlisted");
  }

  const origin = target.origin;
  const robotsUrl = new URL("/robots.txt", origin);
  await serializeHostStart(policy.host, minIntervalMs, now, sleep);
  const robots = await fetcher(robotsUrl, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": userAgent, "Accept": "text/plain" }
  });
  if (robots.status === 404) {
    await robots.body?.cancel().catch(() => {});
  } else if (robots.status === 200) {
    if (!/^text\/plain\b/i.test(robots.headers.get("content-type") || "")) {
      await robots.body?.cancel().catch(() => {});
      throw new Error("robots_content_type_unconfirmed");
    }
    const robotsBody = (await readBounded(robots, 8192)).toString("utf8");
    const decision = parseRobotsRules(robotsBody, userAgent, target.pathname + target.search);
    if (!decision.allowed) throw new Error("robots_disallow");
  } else {
    await robots.body?.cancel().catch(() => {});
    throw new Error("robots_access_unconfirmed_" + robots.status);
  }

  await serializeHostStart(policy.host, minIntervalMs, now, sleep);
  const response = await fetcher(target, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": userAgent, "Accept": policy.allowedContentTypes.join(", ") }
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw new Error("source_redirect_requires_review");
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw new Error("source_http_" + response.status);
  }
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!policy.allowedContentTypes.includes(contentType)) {
    await response.body?.cancel().catch(() => {});
    throw new Error("source_content_type_unapproved");
  }
  const bytes = await readBounded(response, maxBytes);
  return {
    sourceId: source.id,
    sourceUrl: target.toString(),
    retrievedAt: new Date(now()).toISOString(),
    status: response.status,
    contentType,
    bytes,
    sha256: null
  };
}

export function resetSourceConnectorRateLimitsForTests() {
  hostQueues.clear();
  lastRequestAt.clear();
}
