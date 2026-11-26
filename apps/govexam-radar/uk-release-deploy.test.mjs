import test from "node:test";
import assert from "node:assert/strict";
import {validateIsolatedStagingState,parseUkDeploymentArgs,
 prepareUkStagingDeployment,UK_ISOLATED_STAGING,UK_WORKER_MODULES}
 from "./uk-release-deploy.mjs";
const x=UK_ISOLATED_STAGING;
const state=()=>({bindings:[{type:"d1",name:"DB",database_id:x.database}],
 secrets:[],crons:[],tableNames:["official_job_notices","uk_mirror_runs","uk_mirror_state","uk_withdrawal_checks"],sourceRows:250,
 unapprovedRows:0,workerSubdomain:{enabled:true,previews_enabled:false}});
test("standalone UK Worker accepts exactly one UK data binding and no other capabilities",()=>{
 assert.equal(validateIsolatedStagingState(state()),true);
 assert.deepEqual(UK_WORKER_MODULES,[
  "uk-release-worker.mjs","uk-release-db.mjs","official-feed.mjs",
  "source-rights.mjs","india-employment-news.mjs","release-preview-ui.mjs","uk-mirror-status.mjs"
 ]);
 for(const patch of [
  {bindings:[{type:"d1",name:"DB",database_id:"wrong"}]},
  {bindings:[...state().bindings,{type:"secret_text",name:"INGEST_HMAC_KEY"}]},
  {secrets:[{type:"secret_text",name:"INGEST_HMAC_KEY"}]},
  {crons:[{cron:"*/20 */3 * * *"}]},
  {tableNames:["official_job_notices","community_users"]},
  {sourceRows:0},{unapprovedRows:1},
  {workerSubdomain:{enabled:true,previews_enabled:true}},
  {workerSubdomain:{enabled:false,previews_enabled:false}}
 ]){
  assert.throws(()=>validateIsolatedStagingState({...state(),...patch}),/unexpected_uk_staging_|uk_snapshot_isolation_failed|uk_staging_subdomain_not_controlled/);
 }
});
test("release deployment CLI remains a dry run unless explicitly approved",()=>{
 assert.deepEqual(parseUkDeploymentArgs([]),{deploy:false});
 assert.deepEqual(parseUkDeploymentArgs(["--dry-run"]),{deploy:false});
 assert.deepEqual(parseUkDeploymentArgs(["--deploy"]),{deploy:true});
 for(const args of [["--deploy","--dry-run"],["--production"],["--deploy","--deploy"],["node","--deploy"]]){
  assert.throws(()=>parseUkDeploymentArgs(args),/unknown_or_conflicting_uk_deploy_option/);
 }
});
test("deployment refuses unknown account or implicit permission before calling Cloudflare",async()=>{
 let called=0;
 const fake=async()=>{called++;throw Error("network forbidden");};
 await assert.rejects(()=>prepareUkStagingDeployment({fetcher:fake,account:"wrong",token:"test-token-long",deploy:false}),/refuse_unknown_cloudflare_account/);
 await assert.rejects(()=>prepareUkStagingDeployment({fetcher:fake,account:x.account,token:"test-token-long",deploy:true,approval:"NO"}),/uk_staging_deployment_not_approved/);
 assert.equal(called,0);
});
test("staging dry-run inspects exact DB and Worker without making any edits",async()=>{
 const calls=[];
 const fetcher=async(url,opts)=>{
  const u=new URL(url),path=u.pathname,body=opts.body?JSON.parse(opts.body):null;
  calls.push({method:opts.method,path,body});
  let result;
  if(path.endsWith("/settings"))result={bindings:state().bindings};
  else if(path.endsWith("/secrets"))result=[];
  else if(path.endsWith("/schedules"))result={schedules:[]};
  else if(path.endsWith("/subdomain"))result=state().workerSubdomain;
  else if(path.endsWith("/d1/database/"+x.database))result={uuid:x.database,name:x.databaseName};
  else if(path.endsWith("/query")){
   if(body.sql.includes("sqlite_master"))result=[{results:[{name:"official_job_notices"},{name:"uk_mirror_runs"},{name:"uk_mirror_state"},{name:"uk_withdrawal_checks"}]}];
   else if(body.sql.includes("source_id!=?"))result=[{results:[{n:0}]}];
   else result=[{results:[{n:250}]}];
  }else throw Error("Unexpected endpoint "+path);
  return new Response(JSON.stringify({success:true,result}),{status:200,headers:{"content-type":"application/json"}});
 };
 const result=await prepareUkStagingDeployment({fetcher,account:x.account,token:"test-private-token-1234"});
 assert.equal(result.mode,"read_only_preflight");
 assert.equal(result.sourceRows,250);
 assert.equal(result.approvedForPublicLaunch,false);
 assert.equal(calls.length,8);
 assert.ok(calls.every(c=>c.method==="GET"||c.method==="POST"));
 assert.equal(calls.some(c=>c.method==="PUT"),false);
});
