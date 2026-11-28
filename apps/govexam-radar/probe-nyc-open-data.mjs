// Research-only compatibility probe for the City of New York's official
// DCAS dataset. No credentials, third-party aggregator, personal fields,
// storage or publication. Data access and reuse conditions are distinct.
import {fetchNycSnapshot} from "./nyc-feed.mjs";
import {fetchOfficialSource} from "./source-connectors.mjs";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
const SOURCE=Object.freeze({id:"us-nyc-dcas-open-jobs",url:"https://data.cityofnewyork.us/resource/kpav-sd4t.json"});
const POLICY=Object.freeze({sourceId:SOURCE.id,host:"data.cityofnewyork.us",automatedCollectionEnabled:true,automationStatus:"documented_public_dataset_probe",reuseStatus:"conditional_open_data",allowedPaths:["/resource/kpav-sd4t.json"],allowedContentTypes:["application/json"]});
export function assessNycRows(rows){
 if(!Array.isArray(rows)||rows.length>100)throw Error("nyc_schema_mismatch");
 const ids=new Set(),conflicts=new Set();let external=0,valid=0,missingDeadline=0;
 for(const row of rows){
  if(!row||typeof row!=="object"||typeof row.job_id!=="string"||typeof row.posting_type!=="string"||typeof row.agency!=="string"||typeof row.business_title!=="string")throw Error("nyc_schema_mismatch");
  if(row.posting_type!=="External")continue;
  external++;
  if(!/^[0-9]{1,12}$/.test(row.job_id)||!row.agency.trim()||!row.business_title.trim())continue;
  if(ids.has(row.job_id)){conflicts.add(row.job_id);continue;}
  ids.add(row.job_id);valid++;
  if(typeof row.post_until!=="string"||!row.post_until.trim())missingDeadline++;
 }
 return {received:rows.length,external,valid,duplicateIds:conflicts.size,missingDeadline,publicationAuthorized:false};
}
export async function probeNycSource({fetcher=fetch}={}){
 const url=new URL(SOURCE.url);
 url.searchParams.set("$select","job_id,agency,business_title,posting_type,post_until,posting_date,process_date");
 url.searchParams.set("$where","posting_type='External'");
 url.searchParams.set("$limit","100");
 url.searchParams.set("$order","job_id");
 const result=await fetchOfficialSource({source:SOURCE,url:url.href,policyOverride:POLICY,fetcher,maxBytes:256*1024,minIntervalMs:5000});
 const rows=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(result.bytes));
 const assessment=assessNycRows(rows);
 return {...assessment,sourceId:SOURCE.id,httpStatus:result.status,sha256:createHash("sha256").update(result.bytes).digest("hex"),retrievedAt:result.retrievedAt};
}
export async function probeNycFullSnapshot(){const r=await fetchNycSnapshot({policy:POLICY});return {received:r.received,eligible:r.rows.length,rejected:r.rejected,latestProcessAt:r.latestProcessAt,httpStatus:r.httpStatus,sha256:r.sha256,publicationAuthorized:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)(process.argv[2]==="--full"?probeNycFullSnapshot():probeNycSource()).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(JSON.stringify({state:"blocked_or_unavailable",errorCode:String(e?.message||"probe_failed").replace(/[^a-z0-9_]/gi,"_").slice(0,80)}));process.exitCode=1;});
