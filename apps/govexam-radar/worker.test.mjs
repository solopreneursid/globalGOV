import test from "node:test";
import assert from "node:assert/strict";
import {Script} from "node:vm";
import worker,{govradarScheduledTask,GOVRADAR_SINGLE_CRON} from "./worker.js";
const request=(path,method="GET")=>worker.fetch(new Request("https://app.example"+path,{method}));
test("health responds without PII or fake sync",async()=>{const r=await request("/api/health");assert.equal(r.status,200);const x=await r.json();assert.equal(x.status,"ok");assert.equal(x.service,"hqventures-govradar");});
test("catalog is honest and has source allowlist",async()=>{const r=await request("/api/catalog");assert.equal(r.status,200);const d=await r.json();assert.equal(d.verifiedListings.length,0);assert.ok(d.leads.every(x=>d.sources.some(s=>s.id===x.sourceId)));assert.equal(new Set(d.sources.map(s=>s.country)).size,11);assert.equal(d.sources.length,60);assert.equal(d.newRegionalPortals,43);assert.ok(d.sources.every(s=>new URL(s.url).protocol==="https:"));});
test("full original six-tab experience and separate simple interface",async()=>{
    const r=await request("/");assert.equal(r.status,200);
    const html=await r.text();
    for(const id of ["view-radar","view-alerts","view-feeds","view-saved","view-community","view-guide"])assert.ok(html.includes('id="'+id+'"'),id);
    assert.match(html,/gg-preview-warning/);assert.match(html,/Check the official website before applying/);
    assert.match(r.headers.get("Content-Security-Policy"),/script-src/);
    const lite=await request("/lite");assert.equal(lite.status,200);
    assert.match(lite.headers.get("Content-Security-Policy"),/script-src 'self'/);
  });
test("assets, manifest, PWA and service worker are served",async()=>{for(const path of ["/app.css","/app.js","/icon.svg","/manifest.webmanifest","/sw.js"]){const r=await request(path);assert.equal(r.status,200,path);assert.ok((await r.text()).length>40,path);}});
test("self-hosted full CSS is served",async()=>{const r=await request("/full.css");assert.equal(r.status,200);assert.match(await r.text(),/\.bg-indigo-600/);});
test("browser enhancements are independently served",async()=>{const r=await request("/enhance.js");assert.equal(r.status,200);const js=await r.text();assert.match(js,/runFeedSync/);assert.match(js,/handleCommunityLogin/);});
test("served browser scripts are valid JavaScript after template expansion",async()=>{
 for(const path of ["/lite.js","/official.js","/portable-bookmarks.js"]){
  const response=await request(path);assert.equal(response.status,200,path);
  const script=await response.text();assert.doesNotThrow(()=>new Script(script,{filename:path}),path);
 }
});
test("public OpenAPI contract is machine readable",async()=>{const r=await request("/openapi.json");assert.equal(r.status,200);const spec=await r.json();assert.equal(spec.openapi,"3.1.0");assert.ok(spec.paths["/api/catalog"]);});
test("unsafe paths and methods are rejected",async()=>{assert.equal((await request("/api/check?id=https://evil.invalid")).status,404);assert.equal((await request("/does-not-exist")).status,404);assert.equal((await request("/api/catalog","POST")).status,405);});

test("source status endpoint does not fake checks when binding is missing",async()=>{const r=await request("/api/source-status");assert.equal(r.status,503);const x=await r.json();assert.equal(x.error,"not_configured");});

test("official job endpoints never return invented data without D1",async()=>{
 for(const path of ["/api/notices","/api/ingestion-status"]){
  const r=await request(path);assert.equal(r.status,503,path);const d=await r.json();assert.equal(d.error,"not_configured",path);
 }
 const r=await request("/official.js");assert.equal(r.status,200);assert.match(await r.text(),/official-notice-grid/);
 const s=await request("/");assert.match(await s.text(),/\/official\.js/);
 const api=await request("/openapi.json");const spec=await api.json();assert.ok(spec.paths["/api/notices"]);assert.ok(spec.paths["/api/ingestion-status"]);
});

test("regional portal API supports hierarchical country, government tier and subdivision filters",async()=>{
 const all=await (await request("/api/jurisdictions")).json();
 assert.equal(all.total,60);assert.equal(all.countries.includes("France"),true);
 const ca=await (await request("/api/jurisdictions?country=Canada&level=province")).json();
 assert.ok(ca.total>=4);assert.ok(ca.sources.every(x=>x.country==="Canada"&&x.level==="province"));
 const inBihar=await (await request("/api/jurisdictions?jurisdiction=IN-BR")).json();
 assert.equal(inBihar.total,1);assert.equal(inBihar.sources[0].name,"Bihar Public Service Commission");
 const cities=await (await request("/api/jurisdictions?level=municipal")).json();
 assert.ok(cities.total>=2);
 const noMatch=await (await request("/api/jurisdictions?country=India&jurisdiction=CA-ON")).json();
 assert.equal(noMatch.total,0);assert.ok(noMatch.sources.length===0);
 for(const p of ["/regional.js","/"]){const a=await request(p);assert.equal(a.status,200);assert.match(await a.text(),/regional/);}
});

test("founder moderation page is private and credentialless API fails closed",async()=>{
 const page=await request("/moderation");assert.equal(page.status,200);assert.match(await page.text(),/Founder moderation/);
 assert.match(page.headers.get("Content-Security-Policy"),/default-src 'none'/);
 const script=await request("/moderation.js");assert.equal(script.status,200);assert.match(await script.text(),/moderation\/reports/);
 const api=await request("/api/moderation/reports");assert.equal(api.status,503);
 assert.equal((await api.json()).error,"community_paused");
});

test("cross-device backup script is first-party and never requests personal identity tokens",async()=>{
 const html=await (await request("/")).text();assert.match(html,/\/portable-bookmarks\.js/);
 const file=await request("/portable-bookmarks.js");assert.equal(file.status,200);
 const script=await file.text();
 assert.match(script,/GovRadarBookmarkTransfer/);
 assert.match(script,/govradar_saved_sources_v1/);
 assert.match(script,/No account, email address/);
});

test("one consolidated UTC Cron preserves portal, UK, Manitoba slots without overlapping tasks",()=>{
 const at=(iso)=>({cron:GOVRADAR_SINGLE_CRON,scheduledTime:Date.parse(iso)});
 assert.equal(govradarScheduledTask(at("2026-11-16T12:00:00Z")),"portals");
 assert.equal(govradarScheduledTask(at("2026-11-16T12:20:00Z")),"uk");
 assert.equal(govradarScheduledTask(at("2026-11-16T12:40:00Z")),"manitoba");
 assert.equal(govradarScheduledTask(at("2026-11-16T15:00:00Z")),"portals");
 assert.equal(govradarScheduledTask(at("2026-11-16T15:20:00Z")),"uk");
 assert.equal(govradarScheduledTask(at("2026-11-16T15:40:00Z")),"manitoba");
});
test("consolidated Cron rejects unexpected hour, minute, missing timestamp and India trigger",()=>{
 for(const iso of ["2026-11-16T13:00:00Z","2026-11-16T13:20:00Z","2026-11-16T12:10:00Z"]){
  assert.equal(govradarScheduledTask({cron:GOVRADAR_SINGLE_CRON,scheduledTime:Date.parse(iso)}),null);
 }
 assert.equal(govradarScheduledTask({cron:GOVRADAR_SINGLE_CRON}),null);
 assert.equal(govradarScheduledTask({cron:GOVRADAR_SINGLE_CRON,scheduledTime:NaN}),null);
 assert.equal(govradarScheduledTask({cron:"10 */6 * * *",scheduledTime:Date.parse("2026-11-16T12:10:00Z")}),null);
 assert.equal(govradarScheduledTask({cron:"* * * * *",scheduledTime:Date.parse("2026-11-16T12:00:00Z")}),null);
});
test("legacy Cron routing stays supported through a non-disruptive scheduler migration",()=>{
 assert.equal(govradarScheduledTask({cron:"0 */3 * * *"}),"portals");
 assert.equal(govradarScheduledTask({cron:"20 */3 * * *"}),"uk");
 assert.equal(govradarScheduledTask({cron:"40 */3 * * *"}),"manitoba");
});

test("UK release candidate is self-hosted, noindexed and remains staging-only",async()=>{
 const html=await worker.fetch(new Request("https://app.example/release-preview"));
 assert.equal(html.status,200);
 const body=await html.text();
 assert.match(body,/RELEASE CANDIDATE · STAGING ONLY/);
 assert.match(body,/GlobalGovJobs · UK Education Release Preview/);
 assert.match(body,/id="preview-grid"/);
 assert.match(body,/UK DfE · OGL v3\.0/);
 assert.match(html.headers.get("X-Robots-Tag"),/noindex/);
 assert.match(html.headers.get("Content-Security-Policy"),/script-src 'self'/);
 for(const [asset,pattern] of [["/release-preview.css",/grid-template-columns/],["/release-preview.js",/\/api\/release-preview\/notices/]]){
  const r=await worker.fetch(new Request("https://app.example"+asset));
  assert.equal(r.status,200,asset);
  assert.match(await r.text(),pattern);
 }
 const notices=await worker.fetch(new Request("https://app.example/api/release-preview/notices?scope=research"));
 assert.equal(notices.status,503,"no D1 means no invented commercial preview notices");
 const spec=await (await worker.fetch(new Request("https://app.example/openapi.json"))).json();
 assert.ok(spec.paths["/api/release-preview/notices"]);
});
