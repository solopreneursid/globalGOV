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
  assert.ok(response.bytes instanceof Uint8Array);
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

test("database-reviewed automation overrides still cannot bypass a robots redirect", async () => {
  const source = { id: "ssb", url: "https://recruitment.ssb.gov.in/" };
  const approved = {
    sourceId: "ssb", host: "recruitment.ssb.gov.in",
    automationStatus: "approved", automatedCollectionEnabled: true,
    allowedPaths: ["/advertisements/"],
    allowedContentTypes: ["application/pdf"],
    minIntervalMs: 0, maxBytes: 1024
  };
  let targetRequested = false;
  await assert.rejects(fetchOfficialSource({
    source,
    url: "https://recruitment.ssb.gov.in/advertisements/notice.pdf",
    policyOverride: approved,
    minIntervalMs: 0,
    fetcher: async input => {
      if (String(input).endsWith("/robots.txt")) {
        return new Response("", { status: 302, headers: { location: "/login" } });
      }
      targetRequested = true;
      return new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } });
    }
  }), /robots_access_unconfirmed_302/);
  assert.equal(targetRequested, false);
});

test("robots parser fails closed on malformed rule syntax",()=>{
  for(const rules of [
    "User-agent: *\nDisallow: /private$bad",
    "User-agent: *\nDisallow: /bad%ZZ",
    "User-agent: *\nDisallow: private",
    "User-agent: \nDisallow: /"
  ]) assert.throws(()=>parseRobotsRules(rules,"globalGOV"),/robots_(?:rule|user_agent)_syntax_unconfirmed/);
});

test("robots disallow rules are decoded as text and prevent target requests",async()=>{
  resetSourceConnectorRateLimitsForTests();
  const source={id:"isro-india-careers",url:"https://www.isro.gov.in/ViewAllOpportunities.html"};
  let targetRequested=false;
  await assert.rejects(fetchOfficialSource({
    source,minIntervalMs:0,
    fetcher:async input=>{
      if(String(input).endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /",{headers:{"content-type":"text/plain"}});
      }
      targetRequested=true;
      return new Response("<html>not allowed</html>",{headers:{"content-type":"text/html"}});
    }
  }),/robots_disallow/);
  assert.equal(targetRequested,false);
});

test("robots wildcard, anchors, encodings, precedence and crawl delays preserve restrictions",()=>{
 const rules="User-agent: *\nDisallow: /private/*\nAllow: /private/public$\nDisallow: /job%2Fsecret\nDisallow: /%70rotected\nCrawl-delay: 12";
 assert.equal(parseRobotsRules(rules,"globalGOV","/private/x").allowed,false);
 assert.equal(parseRobotsRules(rules,"globalGOV","/private/public").allowed,true);
 assert.equal(parseRobotsRules(rules,"globalGOV","/private/public?x=1").allowed,false);
 assert.equal(parseRobotsRules(rules,"globalGOV","/job%2fsecret").allowed,false);
 assert.equal(parseRobotsRules(rules,"globalGOV","/protected").allowed,false);
 assert.equal(parseRobotsRules(rules,"globalGOV","/job/secret").allowed,true);
 assert.equal(parseRobotsRules(rules,"globalGOV","/resource/jobs.json").delayMs,12000);
 const grouped="User-agent: globalGOV\nDisallow: /secret\nUser-agent: otherxxxx\nUser-agent: *\nDisallow: /";
 assert.equal(parseRobotsRules(grouped,"globalGOV","/secret").allowed,false);
 assert.equal(parseRobotsRules(grouped,"globalGOV","/public").allowed,true);
});
