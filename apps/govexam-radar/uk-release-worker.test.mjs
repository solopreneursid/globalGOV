import test from "node:test";
import assert from "node:assert/strict";
import worker,{UK_RELEASE_ALLOWED_PATHS} from "./uk-release-worker.mjs";
import {readonlyOfficialNoticesDb} from "./uk-release-db.mjs";
const UK="uk-dfe-teaching-vacancies";
const entries=[
 {id:"uk-1",sourceId:UK,country:"United Kingdom",title:"UK role",
  sourceUrl:"https://teaching-vacancies.service.gov.uk/jobs/test"},
 {id:"mb-1",sourceId:"manitoba-jobs",country:"Canada",title:"Canada role",
  sourceUrl:"https://jobsearch.gov.mb.ca/jow/advancedResult.action?ID=12345"}
];
function mockDb(){
 const seen=[];
 return {seen,prepare(sql){
  if(!/^SELECT/i.test(sql))throw Error("unexpected_write_query");
  let params=[];
  return {bind(...x){params=x;seen.push({sql,params});return this},
   async all(){
    return{results:entries.filter(x=>(!sql.includes("source_id IN (?)")||x.sourceId===UK)&&
     (!params.includes("Canada")||x.country==="Canada"))};
   },
   async first(){
    return{total:entries.filter(x=>!sql.includes("source_id IN (?)")||x.sourceId===UK).length};
   }};
 }};
}
const fetch=(path,opts={},env={DB:mockDb()})=>worker.fetch(new Request("https://uk-preview.example"+path,opts),env);
test("public Worker exposes only explicitly approved paths, not research or write capabilities",async()=>{
 assert.equal(typeof worker.scheduled,"undefined","must not run source ingestion");
 assert.equal(UK_RELEASE_ALLOWED_PATHS.length,10);
 for(const path of ["/api/community/posts","/api/moderation/reports","/api/collector/ingest",
  "/api/collector/plan","/api/notice-changes","/api/source-status",
  "/api/jurisdictions","/api/catalog","/official.js","/full.css",
  "/sw.js","/manifest.webmanifest","/regional.js","/admin","/tools",
  "/api/notices/123","/.well-known/anything"]){
  const r=await fetch(path);
  assert.equal(r.status,404,path);
  assert.equal(r.headers.get("access-control-allow-origin"),null);
 }
 for(const path of ["/api/notices","/api/release-preview/notices","/api/health","/"]){
  for(const method of ["POST","PUT","PATCH","DELETE","OPTIONS"]){
   const r=await fetch(path,{method});assert.equal(r.status,405,method+" "+path);
  }
 }
});
test("read-only D1 facade never exports mutation methods or non-notice queries",()=>{
 const db=mockDb(),facade=readonlyOfficialNoticesDb(db);
 assert.equal(typeof facade.batch,"undefined");
 assert.equal(typeof facade.exec,"undefined");
 assert.equal(typeof facade.run,"undefined");
 const stmt=facade.prepare("SELECT id FROM official_job_notices WHERE source_id=?").bind(UK);
 assert.equal(typeof stmt.run,"undefined");
 assert.equal(typeof stmt.batch,"undefined");
 for(const sql of [
  "DELETE FROM official_job_notices","UPDATE official_job_notices SET life_status='open'",
  "SELECT * FROM source_ingest_runs",
  "SELECT * FROM official_job_notices; DELETE FROM official_job_notices",
  "PRAGMA table_info(official_job_notices)","SELECT * FROM official_job_notices;"]){
  assert.throws(()=>facade.prepare(sql),/uk_public_query_not_allowed/,sql);
 }
 assert.equal(readonlyOfficialNoticesDb(null),null);
});
test("notice API and alias restrict both SQL rows and counts and prevent source override",async()=>{
 for(const path of ["/api/notices","/api/release-preview/notices"]){
  const DB=mockDb();
  const res=await fetch(path+"?scope=research&limit=50",{},{DB});
  assert.equal(res.status,200,path);
  const data=await res.json();
  assert.equal(data.releaseProfile,"uk_only_release_preview");
  assert.equal(data.publicLaunchAuthorized,false);
  assert.deepEqual(data.notices.map(x=>x.sourceId),[UK]);
  assert.deepEqual(data.sources.map(x=>x.id),[UK]);
  assert.equal(data.total,1);
  assert.equal(DB.seen.length,2);
  assert.ok(DB.seen.every(x=>x.sql.includes("source_id IN (?)")&&x.params.includes(UK)));
  assert.ok(DB.seen.every(x=>x.sql.includes("life_status='open'")&&x.sql.includes("closing_at>?")),"SQL must omit expired and withdrawn listings");
  assert.equal(res.headers.get("cache-control"),"no-store");
  assert.match(res.headers.get("x-robots-tag"),/noindex/);
 }
});
test("explicit foreign source request rejected before D1 and broad filters cannot bypass UK",async()=>{
 for(const source of ["manitoba-jobs","india-employment-news","unknown"]){
  const DB=mockDb();
  const res=await fetch("/api/notices?source="+source,{},{DB});
  assert.equal(res.status,403);
  assert.equal(DB.seen.length,0);
 }
 const DB=mockDb();
 const res=await fetch("/api/notices?country=Canada&scope=research",{},{DB});
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).notices,[]);
 assert.ok(DB.seen.every(x=>x.sql.includes("source_id IN (?)")&&x.params.includes(UK)));
});
test("absent D1 or invalid method never fabricates records",async()=>{
 const noDb=await fetch("/api/notices",{},{});
 assert.equal(noDb.status,503);
 const data=await noDb.json();
 assert.deepEqual(data.notices,[]);
 const bad=await fetch("/api/notices",{method:"POST"});
 assert.equal(bad.status,405);
});
test("visitor HTML is noindexed, self-contained and never links to staging research",async()=>{
 const r=await fetch("/");
 assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/RELEASE CANDIDATE · STAGING ONLY/);
 assert.match(html,/id="preview-grid"/);
 assert.ok(!html.includes('href="/">Research HQ'),"Public candidate cannot link into research staging");
 assert.ok(html.includes('href="#about">About'));
 assert.match(r.headers.get("content-security-policy"),/default-src 'none'/);
 assert.match(r.headers.get("x-robots-tag"),/noindex/);
 for(const [path,type] of [["/release-preview.css","text/css"],["/release-preview.js","application/javascript"]]){
  const asset=await fetch(path);assert.equal(asset.status,200);
  assert.ok(asset.headers.get("content-type").includes(type));
  assert.ok((await asset.text()).length>1000);
 }
 const spec=await (await fetch("/openapi.json")).json();
 assert.deepEqual(Object.keys(spec.paths).sort(),["/api/freshness","/api/health","/api/notices"]);
 assert.equal(spec.openapi,"3.1.0");
 const robots=await (await fetch("/robots.txt")).text();
 assert.ok(robots.includes("Disallow: /"));
});

test("UK mirror status exposes only sanitized recency and never internal data",async()=>{
 const db={prepare(sql){
  assert.equal(sql,"SELECT status,last_success_at,last_attempt_at,last_native_source_at,last_rows_upserted FROM uk_mirror_state WHERE id=1");
  return{async first(){return{status:"ok",last_success_at:Date.now()-120000,
   last_native_source_at:Date.now()-190000,last_rows_upserted:25,
   last_attempt_at:Date.now()-120000,error_code:"private_token_must_not_appear"};}};}};
 const response=await worker.fetch(new Request("https://uk-preview.example/api/freshness"),{DB:db});
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.status,"current");
 assert.equal(payload.fresh,true);
 assert.equal(payload.publicLaunchAuthorized,false);
 assert.equal(response.headers.get("cache-control"),"no-store");
 assert.equal(JSON.stringify(payload).includes("private_token"),false);
 assert.equal(JSON.stringify(payload).includes("database_id"),false);
 const absent=await worker.fetch(new Request("https://uk-preview.example/api/freshness"),{});
 assert.equal((await absent.json()).status,"unavailable");
});
