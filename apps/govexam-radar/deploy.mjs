// Node.js 22+ staging deployment: never drops the protected ingestion secret.
// Any attempt to target another Worker or to upload without an encrypted
// existing INGEST_HMAC_KEY fails before source or bindings are changed.
import {readFile} from "node:fs/promises";
import {deploymentPlan,verifyDeployment,STAGING_WORKER} from "./deploy-guard.mjs";
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const name=process.env.GOVRADAR_WORKER_NAME||STAGING_WORKER;
const EXPECTED_ACCOUNT="69234e51e08d8013980a7ff869746609";
const MODULES=["worker.js","full-ui.mjs","full-css.mjs","enhance.mjs","community-api.mjs",
 "source-monitor.mjs","official-feed.mjs","source-rights.mjs","official-ui.mjs","release-preview-ui.mjs","regional-sources.mjs",
 "regional-ui.mjs","manitoba-feed.mjs","india-employment-news.mjs",
 "collector-bridge.mjs","notice-lifecycle.mjs","moderation-api.mjs",
 "moderation-ui.mjs","portable-bookmarks.mjs","lite-ui.mjs","isro-feed.mjs","ssb-feed.mjs","reviewed-catalog.mjs","reviewed-ui.mjs"];
if(!account||!token)throw Error("Cloudflare account ID and API token must be set privately.");
if(account!==EXPECTED_ACCOUNT)throw Error("refuse_unknown_cloudflare_account");
// Fail closed before any API call when deployment target is not isolated staging.
if(name!==STAGING_WORKER)throw Error("refuse_non_staging_deploy");
const root="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/"+name;
const headers={Authorization:"Bearer "+token};
async function getJson(url){
 const response=await fetch(url,{method:"GET",headers:{...headers,Accept:"application/json"}});
 const value=await response.json();
 if(!response.ok||value?.success!==true)throw Error("cloudflare_preflight_failed_"+response.status);
 return value.result;
}
async function inspect(){
 const [settings,secrets]=await Promise.all([getJson(root+"/settings"),getJson(root+"/secrets")]);
 return {bindings:settings?.bindings,secrets};
}
const before=await inspect();
const metadata=deploymentPlan(name,before.bindings,before.secrets);
const form=new FormData();
form.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}));
for(const file of MODULES){
 const code=await readFile(new URL("./"+file,import.meta.url),"utf8");
 form.append(file,new Blob([code],{type:"application/javascript+module"}),file);
}
// The strict option prevents Cloudflare from silently omitting an unresolvable
// inherited secret binding during this multipart update.
const response=await fetch(root+"?bindings_inherit=strict",{
 method:"PUT",headers,body:form
});
const result=await response.json();
if(!response.ok||result?.success!==true)
 throw Error("cloudflare_staging_deploy_rejected_"+response.status+"_"+
  (result?.errors?.[0]?.code||"unknown"));
const after=await inspect();
verifyDeployment(name,after.bindings,after.secrets);
console.log("GovRadar staging deployed and encrypted INGEST_HMAC_KEY inheritance verified; D1 preserved.");
