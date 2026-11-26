import test from "node:test";
import assert from "node:assert/strict";
import {evaluateUkMirrorReleaseEvidence} from "./uk-mirror-release-evidence.mjs";
const now=Date.parse("2026-11-17T00:00:00.000Z");
const slot2=Date.parse("2026-11-16T21:55:55.923Z");
const slot1=Date.parse("2026-11-16T18:55:55.923Z");
const run=slot=>({id:"scheduled-uk-mirror-"+slot,scheduled_at:slot,finished_at:slot+4000,state:"ok"});
const evidence=()=>({
 state:{status:"ok",last_success_at:slot2+4000,last_native_source_at:now-60*60000},
 runs:[run(slot2),run(slot1)],sourceCount:301,mirrorCount:301,foreignCount:0
});
test("UK source-module gate requires genuine consecutive audited Cron runs",()=>{
 const accepted=evaluateUkMirrorReleaseEvidence(evidence(),now);
 assert.equal(accepted.ready,true);
 assert.deepEqual(accepted.blockers,[]);
 assert.equal(accepted.globalGovRadarReady,false);
 assert.equal(accepted.emailNotificationsEnabled,false);
});
test("never-run state, missing second run, stale source and missing rows all fail closed",()=>{
 const failCases=[
  {...evidence(),state:{status:"never_run",last_success_at:0,last_native_source_at:0},runs:[],mirrorCount:250},
  {...evidence(),runs:[run(slot2)]},
  {...evidence(),state:{...evidence().state,last_native_source_at:now-7*3600000}},
  {...evidence(),sourceCount:301,mirrorCount:250},
  {...evidence(),foreignCount:1},
  {...evidence(),runs:[run(slot2),run(slot1-3600000)]},
  {...evidence(),runs:[{...run(slot2),state:"error"},run(slot1)]},
  {...evidence(),state:{...evidence().state,last_success_at:slot1+4000}}
 ];
 for(const data of failCases){
  const result=evaluateUkMirrorReleaseEvidence(data,now);
  assert.equal(result.ready,false,JSON.stringify(data));
  assert.ok(result.blockers.length>0);
  assert.equal(result.globalGovRadarReady,false);
 }
});
test("empty/malformed inputs do not accidentally authorize a release",()=>{
 const result=evaluateUkMirrorReleaseEvidence({state:null,runs:[],sourceCount:null,mirrorCount:0,foreignCount:null},now);
 assert.equal(result.ready,false);
 assert.ok(result.blockers.includes("two_audited_successes_required"));
 assert.ok(result.blockers.includes("source_snapshot_not_fully_mirrored"));
});
