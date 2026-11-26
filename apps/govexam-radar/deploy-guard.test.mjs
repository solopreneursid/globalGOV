import test from "node:test";
import assert from "node:assert/strict";
import {STAGING_WORKER,STAGING_DB,deploymentPlan,verifyDeployment} from "./deploy-guard.mjs";
const settings=()=>[
 {type:"d1",name:"DB",database_id:STAGING_DB},
 {type:"secret_text",name:"INGEST_HMAC_KEY"}
];
const secretList=()=>[{type:"secret_text",name:"INGEST_HMAC_KEY"}];
test("staging deployment inherits encrypted existing HMAC secret with strict upload support",()=>{
 const plan=deploymentPlan(STAGING_WORKER,settings(),secretList());
 assert.deepEqual(plan.bindings,[
  {type:"d1",name:"DB",database_id:STAGING_DB},
  {type:"inherit",name:"INGEST_HMAC_KEY"}
 ]);
 assert.equal(plan.bindings.some(x=>Object.hasOwn(x,"text")),false);
 assert.ok(verifyDeployment(STAGING_WORKER,settings(),secretList()));
});
test("cannot deploy to a different staging, production or named Worker",()=>{
 for(const other of ["hqventures-govexam-radar","yorphives-v1-live","","HQventures"]){
  assert.throws(()=>deploymentPlan(other,settings(),secretList()),/refuse_non_staging_deploy/);
 }
});
test("refuses missing, plain-text or undiscoverable Worker secret",()=>{
 for(const bindings of [
  [{type:"d1",name:"DB",database_id:STAGING_DB}],
  [{type:"d1",name:"DB",database_id:STAGING_DB},{type:"plain_text",name:"INGEST_HMAC_KEY",text:"bad"}],
  [{type:"d1",name:"DB",database_id:STAGING_DB},{type:"secret_text",name:"INGEST_HMAC_KEY",text:"accidental"}]
 ])assert.throws(()=>deploymentPlan(STAGING_WORKER,bindings,secretList()),/secret|inventory/);
 assert.throws(()=>deploymentPlan(STAGING_WORKER,settings(),[]),/secret_registry_mismatch/);
});
test("rejects wrong database, extra bindings or duplicate binding names",()=>{
 const wrong=settings();wrong[0].database_id="unexpected-db";
 assert.throws(()=>deploymentPlan(STAGING_WORKER,wrong,secretList()),/staging_db_binding_mismatch/);
 assert.throws(()=>deploymentPlan(STAGING_WORKER,[...settings(),{type:"plain_text",name:"OTHER"}],secretList()),/unexpected_worker_binding_inventory/);
 assert.throws(()=>deploymentPlan(STAGING_WORKER,[settings()[0],settings()[0]],secretList()),/unexpected_worker_binding_inventory/);
});
