import test from "node:test";
import assert from "node:assert/strict";
import {getUkMirrorPublicStatus} from "./uk-mirror-status.mjs";
const NOW=Date.parse("2026-11-16T18:58:00Z");
function db({status="ok",lastSuccess=NOW-120000,nativeAt=NOW-3*3600000}={}){
 return{prepare(sql){
  assert.equal(sql,"SELECT status,last_success_at,last_attempt_at,last_native_source_at,last_rows_upserted FROM uk_mirror_state WHERE id=1");
  return{async first(){return{status,last_success_at:lastSuccess,last_native_source_at:nativeAt,
   last_attempt_at:NOW-100000,error_code:"private details must never appear",last_rows_upserted:50};}};
 }};
}
test("public freshness reports genuine successful mirror, never internal error text",async()=>{
 const value=await getUkMirrorPublicStatus(db(),NOW);
 assert.equal(value.status,"current");
 assert.equal(value.fresh,true);
 assert.equal(value.publicLaunchAuthorized,false);
 assert.equal(JSON.stringify(value).includes("private"),false);
 assert.ok(value.lastSuccessfulMirrorAt.endsWith("Z"));
});
test("stale native sources, failed mirror, and missing first execution never claim freshness",async()=>{
 for(const options of [
  {status:"error"},{status:"partial"},{lastSuccess:NOW-8*3600000},{nativeAt:NOW-8*3600000}
 ]){
  const result=await getUkMirrorPublicStatus(db(options),NOW);
  assert.equal(result.status,"delayed");
  assert.equal(result.fresh,false);
 }
 const pending=await getUkMirrorPublicStatus(db({status:"never_run",lastSuccess:0,nativeAt:0}),NOW);
 assert.equal(pending.status,"pending");
 assert.equal(pending.fresh,false);
 const unavailable=await getUkMirrorPublicStatus(null,NOW);
 assert.equal(unavailable.status,"unavailable");
 assert.equal(unavailable.publicLaunchAuthorized,false);
});
test("database query failures remain safely unavailable, without leaking SQL errors",async()=>{
 const r=await getUkMirrorPublicStatus({prepare(){throw Error("sensitive_db_path");}},NOW);
 assert.deepEqual(r,{status:"unavailable",fresh:false,publicLaunchAuthorized:false});
});
