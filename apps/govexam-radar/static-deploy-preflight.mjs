// Read-only Pages deployment preflight. No resource creation, DNS, plan
// changes or paid API calls. Refuse any project other than the dedicated preview.
import {pathToFileURL} from "node:url";
const ACCOUNT="69234e51e08d8013980a7ff869746609",PROJECT="globalgov-static",BRANCH="zero-cost-preview";
export async function verifyStaticTarget({account,token,approved,fetcher=fetch,now=Date.now()}={}){
 if(approved!=="true"||account!==ACCOUNT||typeof token!=="string"||token.length<20)throw Error("zero_cost_owner_approval_required");
 const base="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/pages/projects";
 const read=async path=>{
  const r=await fetcher(base+path,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error("pages_preflight_http_"+r.status);
  const d=await r.json();if(d.success!==true)throw Error("pages_preflight_rejected");return d;
 };
 const p=(await read("/"+PROJECT)).result;
 if(p?.name!==PROJECT||p.production_branch===BRANCH||p.source||!Array.isArray(p.domains)||p.domains.some(d=>d!==PROJECT+".pages.dev"))throw Error("unexpected_static_target");
 const month=new Date(now).toISOString().slice(0,7);
 let count=0,complete=false;
 for(let page=1;page<=4;page++){
  const d=await read("/"+PROJECT+"/deployments?page="+page+"&per_page=100");
  if(!Array.isArray(d.result))throw Error("pages_deployment_history_unconfirmed");
  for(const x of d.result){if(typeof x.created_on!=="string"||!Number.isFinite(Date.parse(x.created_on)))throw Error("pages_deployment_timestamp_invalid");if(x.created_on.slice(0,7)===month)count++;}
  if(count>=250)throw Error("static_monthly_deployment_budget");
  if(d.result.length<100||Number(d.result_info?.total_pages)<=page){complete=true;break;}
 }
 if(!complete)throw Error("pages_deployment_history_incomplete");
 return {project:PROJECT,branch:BRANCH,deploymentsThisMonth:count,publicationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await verifyStaticTarget({account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,approved:process.env.GLOBALGOV_ZERO_COST_APPROVED})));}catch(e){console.error(JSON.stringify({state:"blocked",errorCode:String(e?.message||"preflight_failed").replace(/[^a-zA-Z0-9_]/g,"_").slice(0,100)}));process.exitCode=1;}
}
