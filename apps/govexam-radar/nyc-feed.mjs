// NYC DCAS public open-data snapshot. No account, token, browser or aggregator.
// Only bounded factual metadata is retained; source records are linked by job ID.
import {fetchOfficialSource} from "./source-connectors.mjs";
export const NYC_SOURCE=Object.freeze({id:"us-nyc-dcas-open-jobs",name:"New York City — DCAS",country:"United States",url:"https://data.cityofnewyork.us/resource/kpav-sd4t.json",portal:"https://cityjobs.nyc.gov/"});
const MAX_ROWS=5000,DAY=86400000;
const MONTHS=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const fields="job_id,agency,business_title,posting_type,post_until,posting_date,process_date";
function calendar(raw){
 if(typeof raw!=="string")return null;
 let y,m,d,match;
 if((match=/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0{1,3})?)?$/.exec(raw.trim())))[y,m,d]=match.slice(1).map(Number);
 else if((match=/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim()))){d=Number(match[1]);m=MONTHS.indexOf(match[2].toUpperCase())+1;y=Number(match[3]);}
 else if((match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim())))[m,d,y]=match.slice(1).map(Number);
 else return null;
 if(y<2000||y>2100||m<1||m>12||d<1||d>31)return null;
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):null;
}
function clean(value,max){
 return typeof value==="string"&&value.trim().length>0&&value.trim().length<=max&&!/[\u0000-\u001f\u007f<>]/.test(value)?value.trim():null;
}
function nyStart(day){
 // Conservative visibility boundary: stop showing the listing at the start
 // of its stated closing day in New York. Never claim an exact closing time.
 const utc=Date.parse(day+"T00:00:00Z");
 const noon=new Date(utc+12*3600000);
 const offset=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",timeZoneName:"shortOffset"}).formatToParts(noon).find(p=>p.type==="timeZoneName")?.value;
 const h=/^GMT-(4|5)$/.exec(offset||"");
 if(!h)throw Error("nyc_timezone_unconfirmed");
 return new Date(utc+Number(h[1])*3600000).toISOString();
}
function evidenceLink(id){
 const url=new URL(NYC_SOURCE.url);url.searchParams.set("job_id",id);url.searchParams.set("posting_type","External");return url.href;
}
export function parseNycSnapshot(rows,now=Date.now()){
 if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS)throw Error("nyc_incomplete_or_oversized_snapshot");
 const valid=new Map(),conflicts=new Set(),rejected={};let latestProcess=0;
 const reject=code=>{rejected[code]=(rejected[code]||0)+1;};
 for(const r of rows){
  if(!r||typeof r!=="object"||typeof r.job_id!=="string"||typeof r.posting_type!=="string"||typeof r.agency!=="string"||typeof r.business_title!=="string")throw Error("nyc_schema_changed");
  if(r.posting_type!=="External"){reject("not_external");continue;}
  const process=calendar(r.process_date),posted=calendar(r.posting_date),close=calendar(r.post_until);
  const processAt=process?Date.parse(process):0;
  if(processAt>now+DAY){reject("future_process_date");continue;}
  latestProcess=Math.max(latestProcess,processAt);
  const title=clean(r.business_title,220),employer=clean(r.agency,200),id=r.job_id;
  if(!/^\d{1,12}$/.test(id)||!title||!employer||!posted||!close||!process){reject("missing_or_invalid_fields");continue;}
  const closingAt=nyStart(close),publishedAt=nyStart(posted);
  if(Date.parse(closingAt)<=now||Date.parse(publishedAt)>now||close<posted||Date.parse(closingAt)>now+365*DAY){reject("not_current");continue;}
  if(now-processAt>14*DAY){reject("stale_record");continue;}
  const item={sourceRef:id,title,employer,publishedAt,closingAt,sourcePage:evidenceLink(id),applyUrl:NYC_SOURCE.portal,processDate:process};
  if(conflicts.has(id)){reject("duplicate_conflict");continue;}
  if(valid.has(id)){
   if(JSON.stringify(valid.get(id))!==JSON.stringify(item)){valid.delete(id);conflicts.add(id);reject("duplicate_conflict");}
   else reject("duplicate");
   continue;
  }
  valid.set(id,item);
 }
 if(!latestProcess||now-latestProcess>7*DAY)throw Error("nyc_snapshot_stale");
 if(!valid.size)throw Error("nyc_no_eligible_records");
 return {rows:[...valid.values()],received:rows.length,rejected,latestProcessAt:new Date(latestProcess).toISOString()};
}
export async function fetchNycSnapshot({policy,fetcher=fetch,now=Date.now()}={}){
 if(!policy||policy.sourceId!==NYC_SOURCE.id||!policy.automatedCollectionEnabled||!["approved","conditional_open_data","conditional"].includes(policy.reuseStatus))throw Error("nyc_source_policy_required");
 const url=new URL(NYC_SOURCE.url);
 url.searchParams.set("$select",fields);
 url.searchParams.set("$where","posting_type='External'");
 url.searchParams.set("$limit",String(MAX_ROWS+1));
 url.searchParams.set("$order","job_id");
 const result=await fetchOfficialSource({source:NYC_SOURCE,url:url.href,policyOverride:policy,fetcher,maxBytes:2*1024*1024,minIntervalMs:5000});
 const bytes=result.bytes;
 const parsed=parseNycSnapshot(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),now);
 const sha256=await digest(bytes);
 return {...parsed,sha256,httpStatus:result.status};
}
async function digest(value){
 const bytes=typeof value==="string"?new TextEncoder().encode(value):value;
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function ingestNyc(db,policy,{fetcher=fetch,now=Date.now()}={}){
 if(!db)throw Error("nyc_database_required");
 const id=crypto.randomUUID(),source=NYC_SOURCE.id;
 const outcome={sourceId:source,state:"error",accepted:0,received:0,errorCode:null};
 const claim=await db.prepare("INSERT INTO source_ingest_runs(id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) VALUES(?,?,?,?,'error',NULL,0,0,0,'nyc_collection_pending',?)").bind(id,source,now,now,JSON.stringify({origin:"scheduled",snapshot:"pending"})).run();
 if(claim?.meta?.changes!==1)throw Error("nyc_audit_claim_failed");
 try{
  const data=await fetchNycSnapshot({policy,fetcher,now});
  const statements=[];
  for(const row of data.rows){
   const noticeId=source+":"+(await digest(row.sourceRef)).slice(0,32);
   const hash=await digest(JSON.stringify(row));
   statements.push(db.prepare("INSERT INTO official_job_notices(id,source_id,source_ref,title,employer,country,region,stream,apply_url,source_page,published_at,closing_at,first_seen_at,last_seen_at,evidence_sha256,review_state,life_status,jurisdiction_code,jurisdiction_name,government_tier,employer_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,employer=excluded.employer,published_at=excluded.published_at,closing_at=excluded.closing_at,last_seen_at=excluded.last_seen_at,evidence_sha256=excluded.evidence_sha256,life_status='open' WHERE excluded.last_seen_at>=official_job_notices.last_seen_at")
    .bind(noticeId,source,row.sourceRef,row.title,row.employer,"United States","New York City","Unclassified",row.applyUrl,row.sourcePage,row.publishedAt,row.closingAt,now,now,hash,"official_feed_unreviewed","open","US-NY-NYC","New York City","municipal","government_agency"));
  }
  statements.push(db.prepare("UPDATE source_ingest_runs SET finished_at=?,state='ok',http_status=?,received=?,accepted=?,discarded=?,error_code=NULL,details=? WHERE id=? AND error_code='nyc_collection_pending'")
   .bind(Date.now(),data.httpStatus,data.received,data.rows.length,data.received-data.rows.length,JSON.stringify({origin:"scheduled",snapshot:"complete",sha256:data.sha256,latestProcessAt:data.latestProcessAt,rejected:data.rejected}),id));
  const written=await db.batch(statements);
  if(written.at(-1)?.meta?.changes!==1)throw Error("nyc_audit_finalize_failed");
  return {...outcome,state:"ok",received:data.received,accepted:data.rows.length};
 }catch(e){
  const errorCode=String(e?.message||"nyc_ingest_failed").replace(/[^a-z0-9_]/gi,"_").slice(0,100);
  await db.prepare("UPDATE source_ingest_runs SET finished_at=?,error_code=?,details=? WHERE id=? AND error_code='nyc_collection_pending'")
    .bind(Date.now(),errorCode,JSON.stringify({origin:"scheduled",snapshot:"failed"}),id).run();
  return {...outcome,errorCode};
 }
}
export async function nycPublicationGate(db,now=Date.now()){
 if(!db)return {ready:false,reason:"database_unavailable"};
 try{
  const result=await db.prepare("SELECT started_at AS startedAt,finished_at AS finishedAt,state,details FROM source_ingest_runs WHERE source_id=? AND started_at>=? AND details LIKE '%\"origin\":\"scheduled\"%' ORDER BY started_at DESC,finished_at DESC LIMIT 2").bind(NYC_SOURCE.id,now-48*3600000).all();
  const rows=result.results||[],latest=rows[0];
  const ready=rows.length===2&&rows.every(r=>r.state==="ok"&&String(r.details).includes('"snapshot":"complete"'))&&Number.isSafeInteger(latest.startedAt)&&Number.isSafeInteger(rows[1].startedAt)&&latest.startedAt-rows[1].startedAt>=2*3600000&&Number.isSafeInteger(latest.finishedAt)&&latest.finishedAt>=latest.startedAt&&latest.finishedAt<=now+60000&&now-latest.finishedAt<=8*3600000;
  return {ready,snapshotAt:ready?latest.startedAt:null,lastCheckAt:latest?.finishedAt||null,successfulCycles:rows.filter(r=>r.state==="ok").length};
 }catch{return {ready:false,reason:"gate_unavailable"};}
}
