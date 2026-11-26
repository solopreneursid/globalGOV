// Founder-controlled D1-to-D1 approved UK source mirror.
// Never invoked by a public Worker. Default = read-only dry run.
// Node 22+, no third-party SDK, Cloudflare API isolated in this adapter;
// source validation and SQL generation can also back a self-hosted SQLite mirror.
import {pathToFileURL} from "node:url";
import {allowedCommercialPreviewSources} from "./source-rights.mjs";
export const UK_SOURCE="uk-dfe-teaching-vacancies";
const ACCOUNT="69234e51e08d8013980a7ff869746609";
const SOURCE_DB="b1f499a6-283b-47e8-8cd7-ef2b5f7245bc";
const UK_DB="c5e0b548-528c-4698-a172-a527abf68e27";
export const UK_MIRROR_COLUMNS=Object.freeze([
 "id","source_id","source_ref","title","employer","country","region","stream",
 "apply_url","source_page","published_at","closing_at","first_seen_at","last_seen_at",
 "evidence_sha256","review_state","life_status","jurisdiction_code","jurisdiction_name",
 "government_tier","employer_type"
]);
const MAX_RECORDS=10000;
const PAGE_SIZE=50;
const INSERT_BATCH=4; // Cloudflare D1 rejects 20 * 21 variables; 4 * 21 = 84 is verified.
export function checkUkMirrorRow(row){
 if(!row||typeof row!=="object"||
  row.source_id!==UK_SOURCE||
  row.country!=="United Kingdom"||
  typeof row.id!=="string"||!row.id||row.id.length>240||
  typeof row.title!=="string"||!row.title||
  typeof row.closing_at!=="string"||
  !Number.isSafeInteger(row.last_seen_at))throw Error("unapproved_or_invalid_uk_mirror_row");
 let url;
 try{url=new URL(row.source_page);}catch{throw Error("unapproved_or_invalid_uk_mirror_row");}
 if(url.protocol!=="https:"||url.hostname!=="teaching-vacancies.service.gov.uk"||
    !url.pathname.startsWith("/jobs/")||url.username||url.password)
  throw Error("unapproved_or_invalid_uk_mirror_row");
 return true;
}
export function makeUkMirrorInsert(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>INSERT_BATCH)
  throw Error("uk_mirror_batch_not_allowed");
 if(!allowedCommercialPreviewSources().includes(UK_SOURCE))
  throw Error("uk_source_rights_not_approved");
 for(const row of rows)checkUkMirrorRow(row);
 const columnNames=UK_MIRROR_COLUMNS.join(",");
 const values=rows.map(()=>"("+UK_MIRROR_COLUMNS.map(()=>"?").join(",")+")").join(",");
 const changed=UK_MIRROR_COLUMNS.filter(x=>x!=="id");
 const sql="INSERT INTO official_job_notices ("+columnNames+") VALUES "+values+
  " ON CONFLICT(id) DO UPDATE SET "+changed.map(c=>
   c==="life_status"
    ? "life_status=CASE WHEN official_job_notices.life_status='withdrawn_confirmed' AND excluded.last_seen_at<=official_job_notices.last_seen_at THEN 'withdrawn_confirmed' ELSE excluded.life_status END"
    : c+"=excluded."+c).join(",");
 return{sql,params:rows.flatMap(row=>UK_MIRROR_COLUMNS.map(col=>row[col]??null))};
}
export function reconcileMirrorIds(source,target){
 if(!Array.isArray(source)||!Array.isArray(target))throw Error("uk_mirror_reconciliation_unavailable");
 const expected=new Set(source.map(x=>x.id)),existing=new Set(target.map(x=>x.id));
 if(expected.size!==source.length||existing.size!==target.length)
  throw Error("uk_mirror_duplicate_record_ids");
 const unknown=[...existing].filter(id=>!expected.has(id));
 if(unknown.length)throw Error("uk_mirror_requires_manual_removal_review");
 return{sourceCount:source.length,existingCount:target.length,rowsToInsert:[...expected].filter(x=>!existing.has(x)).length};
}
function cloudflareClient(fetcher,token){
 if(!token||token.length<10)throw Error("private_cloudflare_api_token_required");
 return async(method,path,body)=>{
  const r=await fetcher("https://api.cloudflare.com/client/v4"+path,{
   method,headers:{"Authorization":"Bearer "+token,"Accept":"application/json",
    ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!r.ok)throw Error("cloudflare_uk_mirror_api_failed_http_"+r.status);
  const x=await r.json();
  if(x?.success!==true)throw Error("cloudflare_uk_mirror_api_result_failed");
  return x.result;
 };
}
export async function syncUkPreview({fetcher=fetch,account=process.env.CLOUDFLARE_ACCOUNT_ID,
 token=process.env.CLOUDFLARE_API_TOKEN,apply=false,
 approval=process.env.GOVRADAR_UK_SYNC_APPROVED}={}){
 if(account!==ACCOUNT)throw Error("refuse_unknown_cloudflare_account");
 if(SOURCE_DB===UK_DB)throw Error("refuse_shared_source_destination");
 if(apply&&approval!=="YES")throw Error("founder_uk_snapshot_approval_required");
 if(!allowedCommercialPreviewSources().includes(UK_SOURCE))throw Error("uk_source_not_commercially_approved");
 const api=cloudflareClient(fetcher,token);
 const root="/accounts/"+account+"/d1/database/";
 const [sourceMeta,targetMeta]=await Promise.all([
  api("GET",root+SOURCE_DB),api("GET",root+UK_DB)
 ]);
 if(sourceMeta?.uuid!==SOURCE_DB||targetMeta?.uuid!==UK_DB||
    targetMeta?.name!=="govradar-uk-candidate-preview")
  throw Error("uk_mirror_database_identity_mismatch");
 const sourceSql="SELECT "+UK_MIRROR_COLUMNS.join(",")+
  " FROM official_job_notices WHERE source_id=? ORDER BY id ASC LIMIT ? OFFSET ?";
 const sourceRows=[];
 for(let offset=0;offset<=MAX_RECORDS;offset+=PAGE_SIZE){
  const result=await api("POST",root+SOURCE_DB+"/query",
   {sql:sourceSql,params:[UK_SOURCE,PAGE_SIZE,offset]});
  const next=result?.[0]?.results;
  if(!Array.isArray(next))throw Error("uk_mirror_source_query_unavailable");
  for(const row of next){checkUkMirrorRow(row);sourceRows.push(row);}
  if(next.length<PAGE_SIZE)break;
  if(offset+PAGE_SIZE>=MAX_RECORDS)throw Error("uk_mirror_source_limit_exceeded");
 }
 if(!sourceRows.length)throw Error("uk_mirror_source_empty");
 // Ensure destination has no community or non-UK tables (Cloudflare's _cf_ internal
 // tables are excluded). This is stricter than route-level UK filtering.
 const tables=await api("POST",root+UK_DB+"/query",
  {sql:"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"});
 if(JSON.stringify(tables?.[0]?.results?.map(x=>x.name))!=='["official_job_notices","uk_mirror_runs","uk_mirror_state","uk_withdrawal_checks"]')
  throw Error("uk_mirror_contains_unexpected_tables");
 const target=await api("POST",root+UK_DB+"/query",
  {sql:"SELECT id FROM official_job_notices WHERE source_id=?" ,params:[UK_SOURCE]});
 const existing=target?.[0]?.results;
 if(!Array.isArray(existing))throw Error("uk_mirror_destination_query_unavailable");
 const plan=reconcileMirrorIds(sourceRows,existing);
 if(!apply)return{mode:"read_only_dry_run",ukRows:plan.sourceCount,
  currentlyMirrored:plan.existingCount,newRowsToMirror:plan.rowsToInsert};
 let writes=0;
 for(let pos=0;pos<sourceRows.length;pos+=INSERT_BATCH){
  const batch=sourceRows.slice(pos,pos+INSERT_BATCH);
  const params=makeUkMirrorInsert(batch);
  await api("POST",root+UK_DB+"/query",params);
  writes++;
 }
 const verified=await api("POST",root+UK_DB+"/query",
  {sql:"SELECT source_id,country,COUNT(*) AS total FROM official_job_notices GROUP BY source_id,country"});
 const rows=verified?.[0]?.results||[];
 if(rows.length!==1||rows[0].source_id!==UK_SOURCE||
    rows[0].country!=="United Kingdom"||rows[0].total!==sourceRows.length)
  throw Error("uk_mirror_post_write_integrity_failed");
 return{mode:"founder_approved_uk_staging_snapshot",ukRows:sourceRows.length,
  newRowsMirrored:plan.rowsToInsert,writes,verified:true};
}
export function parseMirrorArgs(args){
 if(!Array.isArray(args)||args.some(x=>x!=="--apply"&&x!=="--dry-run")||
    (args.includes("--apply")&&args.includes("--dry-run"))||
    args.filter(x=>x==="--apply").length>1)
  throw Error("unknown_or_conflicting_sync_option");
 return {apply:args.includes("--apply")};
}
async function main(){
 // argv[0] is the Node runtime; argv[1] is this script. They are not flags.
 const {apply}=parseMirrorArgs(process.argv.slice(2));
 const result=await syncUkPreview({apply});
 console.log(JSON.stringify(result)); // Never log API token, source fields or personal data.
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error(String(e?.message||e).slice(0,150));process.exitCode=1;});
