import test from "node:test";
import assert from "node:assert/strict";
import {inspectRelease} from "./release-check.mjs";
const now=Date.parse("2026-11-28T12:00:00Z"),hour=3600000;
const sha="a".repeat(64),uksha="b".repeat(64);
function fixture({missingRemote=false,missingImport=false,staleCollection=false}={}){
 const importRow=(id,hash,n)=>({source_id:id,state:"verified",source_sha256:hash,finished_at:now-6*hour,table_counts:Object.fromEntries([["official_job_notices",100],...Array.from({length:n-1},(_,i)=>["t"+i,1])]),row_checksums:Object.fromEntries([["official_job_notices",sha],...Array.from({length:n-1},(_,i)=>["t"+i,sha])])});
 const rows=[{state:"ok",accepted:100,started_at:now-hour,finished_at:now-hour+50},{state:staleCollection?"error":"ok",accepted:100,started_at:now-4*hour,finished_at:now-4*hour+50}];
 return {query:async sql=>{
  if(sql.startsWith("SELECT version"))return {rows:["001_core","002_first_party_operations","003_uk_archive"].map(version=>({version}))};
  if(sql.startsWith("SELECT DISTINCT ON"))return {rows:missingImport?[]:[importRow("canonical-cloudflare-d1",sha,12),importRow("uk-isolated-cloudflare-d1",uksha,4)]};
  if(sql.includes("FROM source_ingest_runs")||sql.includes("FROM scheduler_runs"))return {rows};
  if(sql.startsWith("SELECT state,finished_at,archive"))return {rows:[{state:"ok",finished_at:now-hour,archive_verified_at:now-hour,document_archive_verified_at:now-hour,local_sha256:sha,remote_sha256:missingRemote?null:sha,document_archive_sha256:uksha,remote_document_sha256:uksha,remote_target:"synthetic"}]};
  if(sql.startsWith("SELECT MAX(restore"))return {rows:[{db_restore:now-hour,docs_restore:now-hour}]};
  if(sql.includes("system_health_events"))return {rows:[{count:0}]};
  throw Error("unexpected_query");
 }};
}
const env={GLOBALGOV_EXPECT_PRIMARY_SHA256:sha,GLOBALGOV_EXPECT_UK_SHA256:uksha};
const fetcher=async url=>url.pathname==="/internal/ready"?Response.json({status:"ok"}):Response.json({total:1,notices:[{sourceId:"uk-dfe-teaching-vacancies"}]});
test("release gate passes complete evidence without authorizing production routing",async()=>{
 const r=await inspectRelease({pool:fixture(),env,fetcher,now});
 assert.equal(r.state,"engineering_gates_passed");assert.equal(r.publicLaunchAuthorized,false);assert.ok(r.checks.every(c=>c.passed));
});
test("missing remote copy, missing import and failed collection block release",async()=>{
 for(const [opts,check] of [[{missingRemote:true},"fresh_off_host_copy"],[{missingImport:true},"primary_import"],[{staleCollection:true},"native_collection:uk-dfe-teaching-vacancies"]]){
  const r=await inspectRelease({pool:fixture(opts),env,fetcher,now});
  assert.equal(r.state,"blocked");assert.ok(r.checks.some(c=>c.id===check&&!c.passed));
 }
});
test("missing expected snapshot fingerprints never count as actual migration evidence",async()=>{
 const r=await inspectRelease({pool:fixture(),env:{},fetcher,now});
 assert.equal(r.state,"blocked");assert.ok(r.checks.some(c=>c.id==="uk_archive_import"&&!c.passed));
});
