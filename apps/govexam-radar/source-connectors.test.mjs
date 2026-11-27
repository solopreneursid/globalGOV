import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSourceConnectorInventory,
  fetchOfficialSource,
  parseRobotsRules,
  resetSourceConnectorRateLimitsForTests,
  sourceAutomationPolicy
} from "./source-connectors.mjs";

test("all registered portals receive an explicit first-party or directory-only policy", () => {
  const sources = [
    { id: "ssb", name: "SSB", country: "India", url: "https://recruitment.ssb.gov.in/" },
    { id: "upsc", name: "UPSC", country: "India", url: "https://www.upsc.gov.in/" },
    { id: "dfe", name: "DfE", country: "UK", url: "https://teaching-vacancies.service.gov.uk/jobs" }
  ];
  const inventory = buildSourceConnectorInventory(sources);
  assert.equal(inventory.length, 3);
  assert.equal(inventory.find(x => x.id === "ssb").automationStatus, "clarification_required");
  assert.equal(inventory.find(x => x.id === "ssb").automatedCollectionEnabled, false);
  assert.equal(inventory.find(x => x.id === "upsc").connector, "directory_only");
  assert.equal(inventory.find(x => x.id === "dfe").connector, "official_json_feed");
  assert.throws(() => buildSourceConnectorInventory([sources[0], sources[0]]), /duplicate/);
});

test("robots parser honors the most specific agent group and longest allow/disallow rule", () => {
  const text = [
    "User-agent: *",
    "Disallow: /",
    "Allow: /public/",
    "",
    "User-agent: globalGOV",
    "Disallow: /private/",
    "Allow: /private/notices/"
  ].join("\n");
  assert.equal(parseRobotsRules(text, "globalGOV").allowed, true);
  assert.equal(parseRobotsRules("User-agent: *\nDisallow: /private", "globalGOV").allowed, true);
});

test("SSB automation is blocked before any network request", async () => {
  resetSourceConnectorRateLimitsForTests();
  let calls = 0;
  await assert.rejects(
    fetchOfficialSource({
      source: { id: "ssb", name: "SSB", url: "https://recruitment.ssb.gov.in/adv_newsUrl" },
      fetcher: async () => { calls += 1; return new Response("unexpected"); }
    }),
    /automated_access_not_approved/
  );
  assert.equal(calls, 0);
});

test("official source fetch refuses redirects, robots restrictions and non-allowlisted paths", async () => {
  resetSourceConnectorRateLimitsForTests();
  const source = { id: "isro-india-careers", name: "ISRO", url: "https://www.isro.gov.in/ViewAllOpportunities.html" };
  const response = await fetchOfficialSource({
    source,
    minIntervalMs: 0,
    fetcher: async url => String(url).endsWith("/robots.txt")
      ? new Response("User-agent: *\nDisallow: /private", { headers: { "content-type": "text/plain" } })
      : new Response("<html>ok</html>", { headers: { "content-type": "text/html" } })
  });
  assert.equal(response.status, 200);
  await assert.rejects(
    fetchOfficialSource({
      source,
      url: "https://www.isro.gov.in/private/file.html",
      minIntervalMs: 0,
      fetcher: async () => new Response("not used")
    }),
    /source_url_not_allowlisted/
  );
  await assert.rejects(
    fetchOfficialSource({
      source,
      minIntervalMs: 0,
      fetcher: async url => String(url).endsWith("/robots.txt")
        ? new Response("redirect", { status: 302, headers: { location: "/login" } })
        : new Response("not used")
    }),
    /robots_access_unconfirmed_302/
  );
});
