// Portable, staging-only Cron configuration. Repeatable after new deployments.
// This script NEVER modifies other Workers, D1 records or secret values.
import {pathToFileURL} from "node:url";
import {GOVRADAR_SINGLE_CRON} from "./worker.js";
import {STAGING_WORKER,deploymentPlan} from "./deploy-guard.mjs";
const ACCOUNT="69234e51e08d8013980a7ff869746609";
const OLD=["0 */3 * * *","20 */3 * * *","40 */3 * * *"];
export function planCronConsolidation(crons){
 if(!Array.isArray(crons)||crons.some(x=>typeof x!=="string"))throw Error("bad_schedule_inventory");
 if(crons.length===1&&crons[0]===GOVRADAR_SINGLE_CRON)return "already_consolidated";
 if(crons.length===OLD.length && OLD.every(x=>crons.includes(x)) &&
  new Set(crons).size===OLD.length)return "consolidate_exact_legacy_three";
 throw Error("unexpected_schedule_inventory");
}
async function configure(){
 const account=process.env.CLOUDFLARE_ACCOUNT_ID;
 const token=process.env.CLOUDFLARE_API_TOKEN;
 if(!token||account!==ACCOUNT)throw Error("expected_staging_account_and_api_token_required");
 const root="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/"+STAGING_WORKER;
 const headers={Authorization:"Bearer "+token,Accept:"application/json"};
 async function call(url,method="GET",body){
  const r=await fetch(url,{method,headers:{...headers,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const x=await r.json();
  if(!r.ok||x.success!==true)throw Error("staging_schedule_api_error_"+r.status);
  return x.result;
 }
 const [settings,secrets,schedules]=await Promise.all([
  call(root+"/settings"),call(root+"/secrets"),call(root+"/schedules")
 ]);
 // Guard uses the same exact D1/secret binding checks as the source deployer.
 deploymentPlan(STAGING_WORKER,settings?.bindings,secrets);
 const before=(schedules?.schedules||[]).map(x=>x.cron);
 const step=planCronConsolidation(before);
 if(step==="consolidate_exact_legacy_three")
  await call(root+"/schedules","PUT",[{cron:GOVRADAR_SINGLE_CRON}]);
 const after=(await call(root+"/schedules")).schedules?.map(x=>x.cron)||[];
 if(planCronConsolidation(after)!=="already_consolidated")throw Error("schedule_update_not_confirmed");
 console.log(JSON.stringify({worker:STAGING_WORKER,state:"confirmed",
  cron:GOVRADAR_SINGLE_CRON,previous_state:step,configured_triggers:after.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 configure().catch(e=>{console.error(String(e?.message||e).slice(0,160));process.exitCode=1;});
}
