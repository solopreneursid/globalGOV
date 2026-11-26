// Reproducible, first-party, noindex UK release candidate deployer.
// NEVER deploys to yorphives.com, the main GovRadar Worker, or HQ.
// Default: read-only preflight. Requires an explicit local env approval to PUT.
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {assertSourceRightsForCommercialRelease} from "./source-rights.mjs";
export const UK_ISOLATED_STAGING=Object.freeze({
 account:"69234e51e08d8013980a7ff869746609",
 worker:"hqventures-govradar-uk-isolated-preview",
 database:"c5e0b548-528c-4698-a172-a527abf68e27",
 databaseName:"govradar-uk-candidate-preview",
 source:"uk-dfe-teaching-vacancies"
});
export const UK_WORKER_MODULES=Object.freeze([
 "uk-release-worker.mjs","uk-release-db.mjs","official-feed.mjs",
 "source-rights.mjs","india-employment-news.mjs","release-preview-ui.mjs","uk-mirror-status.mjs","isro-feed.mjs"
]);
export function validateIsolatedStagingState({bindings,secrets,crons,tableNames,sourceRows,unapprovedRows,workerSubdomain}){
 const x=UK_ISOLATED_STAGING;
 assertSourceRightsForCommercialRelease([x.source]);
 if(!Array.isArray(bindings)||bindings.length!==1||
    bindings[0].name!=="DB"||bindings[0].type!=="d1"||
    (bindings[0].database_id||bindings[0].id)!==x.database)throw Error("unexpected_uk_staging_binding");
 if(!Array.isArray(secrets)||secrets.length!==0)throw Error("unexpected_uk_staging_secret");
 if(!Array.isArray(crons)||crons.length!==0)throw Error("unexpected_uk_staging_cron");
 if(JSON.stringify(tableNames)!=='["official_job_notices","uk_mirror_runs","uk_mirror_state","uk_withdrawal_checks"]')throw Error("unexpected_uk_staging_table");
 if(!Number.isSafeInteger(sourceRows)||sourceRows<1||sourceRows>10000||
    unapprovedRows!==0)throw Error("uk_snapshot_isolation_failed");
 if(!workerSubdomain||workerSubdomain.enabled!==true||
    workerSubdomain.previews_enabled!==false)throw Error("uk_staging_subdomain_not_controlled");
 return true;
}
export function parseUkDeploymentArgs(args){
 if(!Array.isArray(args)||args.some(x=>x!=="--deploy"&&x!=="--dry-run")||
    (args.includes("--deploy")&&args.includes("--dry-run"))||
    args.filter(x=>x==="--deploy").length>1)
  throw Error("unknown_or_conflicting_uk_deploy_option");
 return{deploy:args.includes("--deploy")};
}
export async function prepareUkStagingDeployment({
 account=process.env.CLOUDFLARE_ACCOUNT_ID,
 token=process.env.CLOUDFLARE_API_TOKEN,
 approval=process.env.GOVRADAR_UK_STAGING_DEPLOY_APPROVED,
 deploy=false,
 fetcher=fetch
}={}){
 const x=UK_ISOLATED_STAGING;
 if(account!==x.account)throw Error("refuse_unknown_cloudflare_account");
 if(deploy&&approval!=="YES")throw Error("uk_staging_deployment_not_approved");
 if(!token||token.length<10)throw Error("cloudflare_private_token_required");
 const root="https://api.cloudflare.com/client/v4";
 const api=async(method,path,body)=>{
  const r=await fetcher(root+path,{method,headers:{"Authorization":"Bearer "+token,
   "Accept":"application/json",...(body&&!(body instanceof FormData)?{"Content-Type":"application/json"}:{})},
   ...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error("cloudflare_uk_staging_api_error_"+r.status);
  const data=await r.json();
  if(data?.success!==true)throw Error("cloudflare_uk_staging_api_failure");
  return data.result;
 };
 const prefix="/accounts/"+x.account,sp=prefix+"/workers/scripts/"+x.worker;
 const [db,settings,secrets,schedules,subdomain,tables,sourceCount,rejections]=await Promise.all([
  api("GET",prefix+"/d1/database/"+x.database),
  api("GET",sp+"/settings"),api("GET",sp+"/secrets"),
  api("GET",sp+"/schedules"),api("GET",sp+"/subdomain"),
  api("POST",prefix+"/d1/database/"+x.database+"/query",{sql:"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"}),
  api("POST",prefix+"/d1/database/"+x.database+"/query",{sql:"SELECT COUNT(*) AS n FROM official_job_notices"}),
  api("POST",prefix+"/d1/database/"+x.database+"/query",{sql:"SELECT COUNT(*) AS n FROM official_job_notices WHERE source_id!=? OR country!='United Kingdom' OR source_page NOT LIKE 'https://teaching-vacancies.service.gov.uk/jobs/%'",params:[x.source]})
 ]);
 if(db?.uuid!==x.database||db?.name!==x.databaseName)
  throw Error("uk_staging_database_identity_mismatch");
 const summary={bindings:settings?.bindings,secrets,crons:schedules?.schedules,
  tableNames:tables?.[0]?.results?.map(y=>y.name),
  sourceRows:sourceCount?.[0]?.results?.[0]?.n,
  unapprovedRows:rejections?.[0]?.results?.[0]?.n,
  workerSubdomain:subdomain};
 validateIsolatedStagingState(summary);
 if(!deploy)return{mode:"read_only_preflight",sourceRows:summary.sourceRows,worker:x.worker,approvedForPublicLaunch:false};
 const form=new FormData();
 form.append("metadata",new Blob([JSON.stringify({
  main_module:"uk-release-worker.mjs",compatibility_date:"2026-11-16",
  bindings:[{type:"d1",name:"DB",database_id:x.database}],
  observability:{enabled:true,traces:{enabled:true}}
 })],{type:"application/json"}));
 for(const name of UK_WORKER_MODULES){
  const js=await readFile(new URL("./"+name,import.meta.url),"utf8");
  form.append(name,new Blob([js],{type:"application/javascript+module"}),name);
 }
 await api("PUT",sp+"?bindings_inherit=strict",form);
 // Cloudflare may take a brief moment to expose the just-created version.
 for(let retry=0;retry<4;retry++){
  const [b,s,c,sub]=await Promise.all([
   api("GET",sp+"/settings"),api("GET",sp+"/secrets"),
   api("GET",sp+"/schedules"),api("GET",sp+"/subdomain")
  ]);
  try{
   validateIsolatedStagingState({...summary,bindings:b?.bindings,secrets:s,
    crons:c?.schedules,workerSubdomain:sub});
   return{mode:"staging_only_deployed",sourceRows:summary.sourceRows,
    modules:UK_WORKER_MODULES.length,noSecret:true,noCron:true,approvedForPublicLaunch:false};
  }catch(e){if(retry===3)throw e;await new Promise(resolve=>setTimeout(resolve,700));}
 }
}
async function main(){
 const {deploy}=parseUkDeploymentArgs(process.argv.slice(2));
 const state=await prepareUkStagingDeployment({deploy});
 console.log(JSON.stringify(state));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error(String(e?.message||e).slice(0,150));process.exitCode=1;});
