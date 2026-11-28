// One bounded document acquisition per discovery cycle; only registered,
// explicitly permitted PDFs are fetched. No document is published by this job.
import { officialDocumentUrl } from "./recruitment-evidence.mjs";
import { getApprovedSourcePolicy, sourcePolicyAllowsUrl } from "./source-policy.mjs";
import { collectOfficialRecruitmentDocument } from "./source-document-collector.mjs";

export async function processDiscoveredPdf({pool,sources,now=Date.now(),root=process.env.DOCUMENT_STORE_DIR,collect=collectOfficialRecruitmentDocument}={}){
 if(!pool||!Array.isArray(sources)||!root)throw Error("document_scheduler_inputs_invalid");
 const source=sources.find(s=>s.id==="india-sdsc-shar");
 if(!source)return {state:"not_configured",processed:0};
 const policy=await getApprovedSourcePolicy(pool,source,now);
 if(!policy||!["approved","conditional"].includes(policy.reuseStatus)||!policy.allowedContentTypes.includes("application/pdf"))
   return {state:"blocked",processed:0};
 const recent=await pool.query(
   "SELECT details FROM source_connector_runs WHERE automation_status='candidate_discovery' AND state='ok' AND finished_at >= $1 ORDER BY finished_at DESC LIMIT 20",
   [now-7*86400000]);
 const candidates=new Set();
 for(const row of recent.rows){
   const links=Array.isArray(row.details?.candidates)?row.details.candidates:[];
   for(const item of links.slice(0,40)){
     if(item?.kind!=="pdf")continue;
     try{const url=officialDocumentUrl(source.id,item.url);if(sourcePolicyAllowsUrl(policy,url))candidates.add(url);}catch{}
   }
 }
 for(const url of [...candidates].slice(0,10)){
   const attempts=await pool.query(
     "SELECT 1 FROM source_connector_runs WHERE source_id=$1 AND source_url=$2 AND started_at >= $3 LIMIT 1",
     [source.id,url,now-7*86400000]);
   if(attempts.rows.length)continue;
   try{const result=await collect({sourceId:source.id,sourceUrl:url,root,pool,now});
     return {state:"ok",processed:1,publicationAuthorized:result.publicationAuthorized===true};
   }catch{return {state:"error",processed:0,errorCode:"document_collection_failed"};}
 }
 return {state:"no_change",processed:0};
}
