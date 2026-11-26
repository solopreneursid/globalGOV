import test from "node:test";
import assert from "node:assert/strict";
import {checkUkMirrorRow,makeUkMirrorInsert,reconcileMirrorIds,syncUkPreview,
 UK_MIRROR_COLUMNS,UK_SOURCE,parseMirrorArgs} from "./uk-preview-sync.mjs";
const src="b1f499a6-283b-47e8-8cd7-ef2b5f7245bc";
const dst="c5e0b548-528c-4698-a172-a527abf68e27";
const acct="69234e51e08d8013980a7ff869746609";
function row(id="uk-1"){
 return Object.fromEntries(UK_MIRROR_COLUMNS.map(key=>[key,
  key==="source_id"?UK_SOURCE:key==="country"?"United Kingdom":
  key==="id"?id:key==="source_page"||key==="source_ref"||key==="apply_url"?
    "https://teaching-vacancies.service.gov.uk/jobs/example":
  key==="first_seen_at"||key==="last_seen_at"?Date.now():
  key==="closing_at"?"2026-12-31T23:59:00.000Z":
  key==="title"?"UK teacher":key==="employer"?"Official school":
  key==="published_at"?"2026-11-16T00:00:00.000Z":
  key==="review_state"?"official_feed_unreviewed":
  key==="life_status"?"open":key==="government_tier"?"national":"uk"]));
}
test("UK preview mirror permits only validated official UK DfE records",()=>{
 assert.equal(checkUkMirrorRow(row()),true);
 for(const change of [
  {source_id:"manitoba-jobs"},{country:"Canada"},{source_page:"https://phishing.invalid/jobs/1"},
  {source_page:"https://teaching-vacancies.service.gov.uk.evil.test/jobs/a"},
  {source_page:"http://teaching-vacancies.service.gov.uk/jobs/a"},
  {source_page:"https://teaching-vacancies.service.gov.uk/other/a"},
  {title:""},{last_seen_at:Infinity}
 ])assert.throws(()=>checkUkMirrorRow({...row(),...change}),/unapproved_or_invalid_uk_mirror_row/);
});
test("SQL has <=84 bound variables and only UK fields in each batch",()=>{
 const batch=makeUkMirrorInsert([row("uk-1"),row("uk-2"),row("uk-3"),row("uk-4")]);
 assert.match(batch.sql,/INSERT INTO official_job_notices/);
 assert.match(batch.sql,/ON CONFLICT\(id\) DO UPDATE SET/);
 assert.match(batch.sql,/withdrawn_confirmed/);
 assert.match(batch.sql,/excluded\.last_seen_at<=official_job_notices\.last_seen_at/);
 assert.equal(batch.params.length,4*UK_MIRROR_COLUMNS.length);
 assert.equal(batch.params.length,84);
 assert.ok(batch.sql.includes("source_id"));
 for(const many of [[],Array.from({length:5},(_,i)=>row("uk-"+i))])
  assert.throws(()=>makeUkMirrorInsert(many),/uk_mirror_batch_not_allowed/);
 assert.throws(()=>makeUkMirrorInsert([row(),{...row("ca-1"),source_id:"manitoba-jobs"}]),/unapproved_or_invalid_uk_mirror_row/);
});
test("mirror reconciliation requires explicit review for deletes; never silently removes records",()=>{
 assert.deepEqual(reconcileMirrorIds([row("a"),row("b")],[{id:"a"}]),{
  sourceCount:2,existingCount:1,rowsToInsert:1
 });
 assert.throws(()=>reconcileMirrorIds([row("a")],[{id:"a"},{id:"orphan"}]),/uk_mirror_requires_manual_removal_review/);
 assert.throws(()=>reconcileMirrorIds([row("a"),row("a")],[]),/uk_mirror_duplicate_record_ids/);
});
function transport(calls,sourceRecords=[row("uk-1")],targetIds=[]){
 return async(url,opts)=>{
  const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
  calls.push({method:opts.method,path:u.pathname,body});
  let result;
  if(opts.method==="GET"){
   result={uuid:u.pathname.endsWith(src)?src:dst,
    name:u.pathname.endsWith(src)?"hqventures-govradar-community":"govradar-uk-candidate-preview"};
  }else if(body.sql.includes("sqlite_master")){
   result=[{results:[{name:"official_job_notices"},{name:"uk_mirror_runs"},{name:"uk_mirror_state"},{name:"uk_withdrawal_checks"}]}];
  }else if(u.pathname.endsWith(src+"/query")){
   result=[{results:sourceRecords}];
  }else if(body.sql.startsWith("SELECT id FROM official_job_notices")){
   result=[{results:targetIds}];
  }else if(body.sql.startsWith("SELECT source_id,country,COUNT")){
   result=[{results:[{source_id:UK_SOURCE,country:"United Kingdom",total:sourceRecords.length}]}];
  }else if(body.sql.startsWith("INSERT INTO official_job_notices")){
   result=[{success:true,meta:{changes:1}}];
  }else{throw Error("Unhandled D1 SQL in test");}
  return new Response(JSON.stringify({success:true,result}),{status:200,headers:{"content-type":"application/json"}});
 };
}
test("default dry run cannot write to isolated database",async()=>{
 const calls=[],run=transport(calls);
 const out=await syncUkPreview({fetcher:run,account:acct,token:"test-secret-token-123456"});
 assert.equal(out.mode,"read_only_dry_run");
 assert.equal(out.ukRows,1);
 assert.equal(out.newRowsToMirror,1);
 assert.equal(calls.filter(c=>c.body?.sql?.startsWith("INSERT")).length,0);
});
test("apply refuses absent approval before contacting Cloudflare",async()=>{
 const calls=[];
 await assert.rejects(()=>syncUkPreview({fetcher:transport(calls),account:acct,token:"test-token-long-enough",
  apply:true,approval:"NO"}),/founder_uk_snapshot_approval_required/);
 assert.equal(calls.length,0);
 await assert.rejects(()=>syncUkPreview({fetcher:transport(calls),account:"wrong",token:"test-token-long-enough"}),/refuse_unknown_cloudflare_account/);
 assert.equal(calls.length,0);
});
test("explicit approved snapshot update uses bounded owner-controlled D1 only, without logging data",async()=>{
 const calls=[],sourceRecords=[row("uk-1"),row("uk-2")];
 const out=await syncUkPreview({fetcher:transport(calls,sourceRecords),account:acct,
  token:"test-token-long-enough",apply:true,approval:"YES"});
 assert.equal(out.mode,"founder_approved_uk_staging_snapshot");
 assert.equal(out.writes,1);
 assert.equal(out.verified,true);
 const mutations=calls.filter(c=>c.body?.sql?.startsWith("INSERT"));
 assert.equal(mutations.length,1);
 assert.equal(mutations[0].path.includes(dst),true);
 assert.equal(mutations[0].body.params.length,42);
 assert.ok(calls.every(c=>!c.body?.sql?.includes("DELETE")));
});

test("mirror CLI flags default to read-only and cannot accidentally apply",()=>{
 assert.deepEqual(parseMirrorArgs([]),{apply:false});
 assert.deepEqual(parseMirrorArgs(["--dry-run"]),{apply:false});
 assert.deepEqual(parseMirrorArgs(["--apply"]),{apply:true});
 for(const args of [["--apply","--dry-run"],["--bad"],["node","--apply"],["--apply","--apply"]])
  assert.throws(()=>parseMirrorArgs(args),/unknown_or_conflicting_sync_option/);
});
