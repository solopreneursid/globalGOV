// GovRadar government recruitment feed adapter, source-bound and portable SQLite/D1.
import { NYC_SOURCE } from "./nyc-feed.mjs";
import { INDIA_EMPLOYMENT_NEWS } from "./india-employment-news.mjs";
import {OFFICIAL_SOURCE_RIGHTS,allowedCommercialPreviewSources,allowedIsroPreviewSource,allowedSsbPreviewSource} from "./source-rights.mjs";
import {ISRO_SOURCE,isroPublicationGate} from "./isro-feed.mjs";
import {SSB_SOURCE,ssbPublicationGate} from "./ssb-feed.mjs";
// First supported adapter: UK Department for Education Teaching Vacancies (OGL v3).
// Source: https://teaching-vacancies.service.gov.uk/api/v1/jobs.json
// Licence: https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions
// Do not charge candidates/recruiters for contacting, interviewing or hiring in reuse of this data.
export const DFE_SOURCE = Object.freeze({
 id:"uk-dfe-teaching-vacancies",
 name:"Department for Education — Teaching Vacancies",
 api:"https://teaching-vacancies.service.gov.uk/api/v1/jobs.json",
 host:"teaching-vacancies.service.gov.uk",
 licence:"Open Government Licence v3.0",
 licenceUrl:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
 termsUrl:"https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions",
 country:"United Kingdom"
});
const MAX_FEED_BYTES=3200000;
const MAX_ITEMS=100;
const MAX_BATCH=20;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const value=v=>typeof v==="string"?v.trim():"";
const plain=(v,max=240)=>value(v).replace(/[\u0000-\u001f\u007f<>]/g," ").replace(/\s+/g," ").slice(0,max);
function validDate(v){
 if(typeof v!=="string"||!/^20\d\d-\d\d-\d\d(?:T.*)?$/.test(v))return null;
 const ms=Date.parse(v);
 if(!Number.isFinite(ms)||ms<Date.UTC(2024,0,1)||ms>Date.UTC(2045,0,1))return null;
 return new Date(ms).toISOString();
}
function classifyStream(raw){
 const category=value(raw.occupationalCategory)+" "+value(raw.title);
 if(/\b(software|developer|software engineer|IT support|ICT support|information technology|network technician|engineering|data engineer|database administrator|computing|ICT technician|cybersecurity|IT technician)\b/i.test(category))return "Technical";
 if(/\b(teacher|teaching|tutor|catering|administrative|administrator|finance|headteacher|caretaker|assistant|reception|office|cleaning|school business|leadership)\b/i.test(category))return "Non-technical";
 return "Unclassified";
}
export function normalizeOfficialJob(raw,clock=Date.now()){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||raw["@type"]!=="JobPosting")return {error:"not_jobposting"};
 const title=plain(raw.title,180);
 const employer=plain(raw.hiringOrganization?.name,160);
 const datePosted=validDate(raw.datePosted);
 const closingAt=validDate(raw.validThrough);
 let url;
 try{url=new URL(raw.url);}catch{return {error:"bad_url"};}
 if(url.protocol!=="https:"||url.hostname!==DFE_SOURCE.host||!url.pathname.startsWith("/jobs/"))return {error:"non_official_url"};
 // Do not retain tracking IDs, query params, hashes or redirects.
 url.search="";url.hash="";
 const sourceRef=url.toString();
 if(!title||!employer||title.length<3)return {error:"missing_required_fields"};
 if(!closingAt)return {error:"missing_valid_closing_date"};
 if(Date.parse(closingAt)<=clock)return {error:"already_closed"};
 if(datePosted&&Date.parse(datePosted)>clock+86400000)return {error:"invalid_published_date"};
 const loc=Array.isArray(raw.jobLocation)?raw.jobLocation[0]:raw.jobLocation;
 const addr=loc?.address||{};
 const region=plain(addr.addressRegion||addr.addressLocality||"",90);
 return {sourceId:DFE_SOURCE.id,sourceRef,title,employer,country:DFE_SOURCE.country,region,
  stream:classifyStream(raw),applyUrl:sourceRef,sourcePage:sourceRef,
  publishedAt:datePosted,closingAt,reviewState:"official_feed_unreviewed",
  lifeStatus:"open"};
}
export function parseOfficialFeed(payload,clock=Date.now()){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||!Array.isArray(payload.data))
   throw Error("unsupported_feed_schema");
 const items=payload.data;
 if(items.length>MAX_ITEMS)throw Error("feed_page_too_large");
 const pages=Number(payload.meta?.totalPages);
 const totalPages=Number.isSafeInteger(pages)&&pages>=1&&pages<=10000?pages:1;
 const valid=[],rejected={};const seen=new Set();
 for(const raw of items){
  const job=normalizeOfficialJob(raw,clock);
  if(job.error){rejected[job.error]=(rejected[job.error]||0)+1;continue;}
  if(seen.has(job.sourceRef)){rejected.duplicate=(rejected.duplicate||0)+1;continue;}
  seen.add(job.sourceRef);valid.push(job);
 }
 return {valid,rejected,totalPages,received:items.length};
}
async function digest(value){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
// Strict redirect validation: upstream HTTP 30x was previously collapsed into
// 'network_error' because fetch was configured with redirect:'error'.
// Follow at most one same-origin redirect for this fixed official API path.
async function boundedOfficialFetch(page,fetcher=fetch){
 const original=new URL(DFE_SOURCE.api);original.searchParams.set("page",String(page));
 let target=original.toString();
 for(let attempt=0;attempt<2;attempt++){
  const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),14000);
  try{
   for(let hop=0;hop<=1;hop++){
    const res=await fetcher(target,{method:"GET",signal:ctl.signal,redirect:"manual",headers:{"Accept":"application/json"}});
    if([301,302,303,307,308].includes(res.status)){
     const location=res.headers.get("location");
     let next;
     try{next=new URL(location,target);}catch{return {error:"invalid_redirect",status:res.status};}
     if(hop===1||next.protocol!=="https:"||next.hostname!==DFE_SOURCE.host||
       next.pathname!=="/api/v1/jobs.json"||next.searchParams.get("page")!==String(page)||
       [...next.searchParams.keys()].some(k=>k!=="page"))
       return {error:"unsafe_redirect",status:res.status};
     target=next.toString();continue;
    }
    if([429,502,503,504].includes(res.status)&&attempt===0){break;}
    if(!res.ok)return {error:"http_"+res.status,status:res.status};
    if(!(res.headers.get("content-type")||"").toLowerCase().includes("json"))return {error:"unexpected_content_type",status:res.status};
    const length=Number(res.headers.get("content-length")||0);
    if(length>MAX_FEED_BYTES)return {error:"response_too_large",status:res.status};
    const reader=res.body?.getReader();let content="",bytes=0;
    if(reader){
     const decoder=new TextDecoder();
     try{
      while(true){
       const {done,value}=await reader.read();if(done)break;
       bytes+=value.byteLength;
       if(bytes>MAX_FEED_BYTES){await reader.cancel();return {error:"response_too_large",status:res.status};}
       content+=decoder.decode(value,{stream:true});
      }
      content+=decoder.decode();
     }finally{reader.releaseLock();}
    }else{content=await res.text();if(new TextEncoder().encode(content).byteLength>MAX_FEED_BYTES)return {error:"response_too_large",status:res.status};}
    try{return {payload:JSON.parse(content),status:res.status};}
    catch{return {error:"invalid_json",status:res.status};}
   }
  }catch(e){
   if(attempt===1)return {error:e?.name==="AbortError"?"timeout":"network_error",status:null};
  }finally{clearTimeout(timeout);}
  if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));
  target=original.toString();
 }
 return {error:"temporary_upstream_failure",status:null};
}
async function audit(db,outcome,upsertPending=false){
 const base="INSERT INTO source_ingest_runs (id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
 // Only an atomically reserved signed receipt may transition from pending
 // to completed. Unrelated existing audit records can never be overwritten.
 const sql=upsertPending?base+
  " ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at,finished_at=excluded.finished_at,state=excluded.state,http_status=excluded.http_status,received=excluded.received,accepted=excluded.accepted,discarded=excluded.discarded,error_code=excluded.error_code,details=excluded.details WHERE source_ingest_runs.state='error' AND source_ingest_runs.error_code='collector_claim_pending'":base;
 try{
  const result=await db.prepare(sql)
   .bind(outcome.id,DFE_SOURCE.id,outcome.startedAt,outcome.finishedAt,outcome.state,
    outcome.httpStatus??null,outcome.received||0,outcome.accepted||0,outcome.discarded||0,
    outcome.errorCode||null,outcome.details||"").run();
  return result?.meta?.changes===1||(!upsertPending&&result?.success===true);
 }catch(e){
  console.error(JSON.stringify({event:"official_feed_audit_failed",reason:String(e?.message||e)}));
  return false;
 }
}
export async function ingestDfE(db,fetcher=fetch,clock=Date.now(),meta={}){
 if(!db)throw Error("database_binding_required");
 const outcome={id:meta?.auditId||crypto.randomUUID(),startedAt:clock,finishedAt:clock,state:"error",httpStatus:null,received:0,accepted:0,discarded:0,errorCode:null,details:""};
 try{
  const cursor=await db.prepare("SELECT next_page,last_total_pages FROM source_feed_cursors WHERE source_id=?").bind(DFE_SOURCE.id).first();
  const page=Math.max(1,Number(cursor?.next_page)||1);
  const {payload,error,status}=await boundedOfficialFetch(page,fetcher);
  outcome.httpStatus=status;
  if(error){outcome.errorCode=error;outcome.details="Page "+page+" was not imported.";return outcome;}
  const parsed=parseOfficialFeed(payload,clock);
  outcome.received=parsed.received;outcome.discarded=parsed.received-parsed.valid.length;
  // Empty or malformed official response should never silently reset or delete the catalogue.
  if(!parsed.received||!parsed.valid.length){
   outcome.state="rejected";
   outcome.errorCode=parsed.received?"no_eligible_records":"empty_page";
   // A shrinking official feed can make an old cursor page fall out of range.
   // Reset only the cursor, NEVER delete historical records or invent new posts.
   if(!parsed.received && page>parsed.totalPages){
    await db.prepare("INSERT INTO source_feed_cursors(source_id,next_page,last_total_pages,last_success_at) VALUES(?,?,?,NULL) ON CONFLICT(source_id) DO UPDATE SET next_page=excluded.next_page,last_total_pages=excluded.last_total_pages")
     .bind(DFE_SOURCE.id,1,parsed.totalPages).run();
    outcome.errorCode="out_of_range_page_reset";
   }
   outcome.details=JSON.stringify({page,totalPages:parsed.totalPages,rejected:parsed.rejected}).slice(0,800);
   return outcome;
  }
  const now=Date.now();
  for(let i=0;i<parsed.valid.length;i+=MAX_BATCH){
   const batch=await Promise.all(parsed.valid.slice(i,i+MAX_BATCH).map(async row=>{
    const id=DFE_SOURCE.id+":"+(await digest(row.sourceRef)).slice(0,32);
    const hash=await digest(JSON.stringify([row.sourceRef,row.title,row.employer,row.closingAt,row.region,row.publishedAt]));
    return db.prepare("INSERT INTO official_job_notices(id,source_id,source_ref,title,employer,country,region,stream,apply_url,source_page,published_at,closing_at,first_seen_at,last_seen_at,evidence_sha256,review_state,life_status,jurisdiction_code,jurisdiction_name,government_tier,employer_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,employer=excluded.employer,region=excluded.region,stream=excluded.stream,published_at=excluded.published_at,closing_at=excluded.closing_at,last_seen_at=excluded.last_seen_at,evidence_sha256=excluded.evidence_sha256,life_status='open'")
     .bind(id,DFE_SOURCE.id,row.sourceRef,row.title,row.employer,row.country,row.region,row.stream,row.applyUrl,row.sourcePage,row.publishedAt,row.closingAt,now,now,hash,row.reviewState,row.lifeStatus,'GB-ENG','England','national','public_education');
   }));
   await db.batch(batch);
  }
  outcome.accepted=parsed.valid.length;
  const nextPage=page>=parsed.totalPages?1:page+1;
  await db.prepare("INSERT INTO source_feed_cursors(source_id,next_page,last_total_pages,last_success_at) VALUES(?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET next_page=excluded.next_page,last_total_pages=excluded.last_total_pages,last_success_at=excluded.last_success_at")
   .bind(DFE_SOURCE.id,nextPage,parsed.totalPages,now).run();
  await db.prepare("UPDATE official_job_notices SET life_status='expired' WHERE source_id=? AND life_status='open' AND closing_at<=?")
   .bind(DFE_SOURCE.id,new Date(now).toISOString()).run();
  outcome.state="ok";outcome.details=JSON.stringify({page,nextPage,totalPages:parsed.totalPages,rejected:parsed.rejected,origin:meta?.origin||"scheduled"}).slice(0,800);
  return outcome;
 }catch(e){
  outcome.errorCode="storage_or_schema_error";outcome.details=String(e?.message||e).slice(0,250);
  console.error(JSON.stringify({event:"official_feed_ingestion_failed",reason:outcome.details}));
  return outcome;
 }finally{
  outcome.finishedAt=Date.now();
  const committed=await audit(db,outcome,meta?.origin==="signed_portable_collector");
  if(!committed && meta?.origin==="signed_portable_collector"){
   outcome.state="error";outcome.errorCode="audit_write_failed";
  }
  console.log(JSON.stringify({event:"official_feed_ingestion",source:DFE_SOURCE.id,outcome:outcome.state,count:outcome.accepted,rejected:outcome.discarded,reason:outcome.errorCode}));
 }
}
// Multi-source public notice query: government public employment and publicly funded education
// remain distinguishable in both metadata and each individual record.
export async function serveOfficialNotices(db,params,scope="research",publication=null){
 if(!db)return json({error:"not_configured",notices:[]},503);
 // Scope is a server-side Worker argument, never a public request parameter.
 if(!["research","uk_only_release_preview","approved_staging"].includes(scope))
  return json({error:"unknown_release_profile",notices:[]},503);
 let releaseSourceIds=null,isroGate={ready:false},ssbGate={ready:false},nycGate=publication?.nycGate||{ready:false};
 if(scope==="uk_only_release_preview"||scope==="approved_staging"){
  try{
   releaseSourceIds=allowedCommercialPreviewSources();
   if(scope==="approved_staging"){
    const id=allowedIsroPreviewSource();isroGate=await isroPublicationGate(db);
    if(isroGate.ready)releaseSourceIds.push(id);
    const ssbId=allowedSsbPreviewSource();ssbGate=await ssbPublicationGate(db);
    if(ssbGate.ready)releaseSourceIds.push(ssbId);
    if(nycGate.ready)releaseSourceIds.push(NYC_SOURCE.id);
   }
  }
  catch{return json({error:"commercial_release_rights_not_approved",notices:[]},503);}
  if(publication)releaseSourceIds=releaseSourceIds.filter(id=>publication.allowedIds.includes(id));
 }
 try{
  const limit=Math.min(50,Math.max(1,Number(params.get("limit"))||18));
  const page=Math.max(1,Math.min(1000,Number(params.get("page"))||1));
  const keyword=plain(params.get("q"),60);
  const stream=["Technical","Non-technical","Unclassified"].includes(params.get("stream"))?params.get("stream"):"";
  const allowedSources=[DFE_SOURCE.id,"manitoba-jobs",INDIA_EMPLOYMENT_NEWS.id,ISRO_SOURCE.id,SSB_SOURCE.id,NYC_SOURCE.id];
  const requestedSource=params.get("source");
  if(releaseSourceIds && requestedSource && !releaseSourceIds.includes(requestedSource))
   return json({error:"source_not_approved_for_release_preview",notices:[],sources:[]},403);
  const sourceId=allowedSources.includes(requestedSource)?requestedSource:"";
  // Unknown countries must return no matching rows, not silently broaden the
  // search to every country when a place has no imported feed yet.
  const country=plain(params.get("country"),60);
  const jurisdiction=plain(params.get("jurisdiction"),30);
  const levels=["national","province","state","municipal","devolved","public_education"];
  const level=levels.includes(params.get("level"))?params.get("level"):"";
  const where=["life_status='open'","closing_at>?","last_seen_at>=?","review_state IN ('official_feed_unreviewed','founder_reviewed')"];
  const bind=[new Date().toISOString(),Date.now()-14*86400000];
  // Authoritative query-bound source restriction. Client-side filters cannot
  // bypass it (including country, page, keyword and absent source).
  if(releaseSourceIds){
   where.push("source_id IN ("+(releaseSourceIds.map(()=>"?").join(",")||"NULL")+")");
   bind.push(...releaseSourceIds);
  }
  // ISRO serves a complete snapshot. Only rows observed in its latest fully
  // successful run may be displayed; a vanished row is withheld, not called
  // withdrawn. Incomplete/failed runs close the gate before any row is shown.
  if(scope==="approved_staging")for(const [source,gate] of [[ISRO_SOURCE,isroGate],[SSB_SOURCE,ssbGate],[NYC_SOURCE,nycGate]])if(gate.ready&&releaseSourceIds.includes(source.id)){
   where.push("(source_id!=? OR (last_seen_at=? AND NOT EXISTS (SELECT 1 FROM source_ingest_runs g WHERE g.source_id=? AND g.started_at>=? AND (g.started_at>? OR g.state!='ok'))))");
   bind.push(source.id,gate.snapshotAt,source.id,gate.snapshotAt,gate.snapshotAt);
  }
  if(sourceId){where.push("source_id=?");bind.push(sourceId);}
  if(country){where.push("country=?");bind.push(country);}
  if(level){where.push("government_tier=?");bind.push(level);}
  if(jurisdiction){where.push("jurisdiction_code=?");bind.push(jurisdiction);}
  if(stream){where.push("stream=?");bind.push(stream);}
  if(keyword){where.push("(title LIKE ? OR employer LIKE ? OR region LIKE ? OR jurisdiction_name LIKE ?)");bind.push(...Array(4).fill("%"+keyword+"%"));}
  const sqlWhere=where.join(" AND ");
  const rows=await db.prepare("SELECT id,source_id as sourceId,title,employer,country,region,stream,source_page as sourceUrl,"+(nycGate.ready&&releaseSourceIds?.includes(NYC_SOURCE.id)?"source_ref as sourceReference,":"")+"published_at as publishedAt,closing_at as closingAt,first_seen_at as firstSeenAt,last_seen_at as lastSeenAt,review_state as reviewState,jurisdiction_code as jurisdictionCode,jurisdiction_name as jurisdiction,government_tier as level,employer_type as employerType FROM official_job_notices WHERE "+sqlWhere+" ORDER BY last_seen_at DESC,id ASC LIMIT ? OFFSET ?")
   .bind(...bind,limit,(page-1)*limit).all();
  const total=await db.prepare("SELECT COUNT(*) AS total FROM official_job_notices WHERE "+sqlWhere).bind(...bind).first();
  // Rights must be scoped to each source; OGL covers only the UK DfE data.
  // A public RSS endpoint is not evidence of unrestricted commercial reuse.
  const sources=OFFICIAL_SOURCE_RIGHTS.filter(rights=>!releaseSourceIds||releaseSourceIds.includes(rights.id)).map(rights=>{
   if(rights.id===DFE_SOURCE.id)return{...rights,name:DFE_SOURCE.name,country:"United Kingdom",
    jurisdiction:"England",level:"national",employerType:"public_education"};
   if(rights.id==="manitoba-jobs")return{...rights,name:"Government of Manitoba Job Opportunities",
    country:"Canada",jurisdiction:"Manitoba",level:"province",employerType:"provincial_government"};
   if(rights.id===ISRO_SOURCE.id)return{...rights,name:ISRO_SOURCE.name,country:"India",jurisdiction:"India",level:"national",employerType:"government_agency"};
   if(rights.id===NYC_SOURCE.id)return{...rights,name:NYC_SOURCE.name,country:NYC_SOURCE.country,jurisdiction:"New York City",level:"municipal",employerType:"government_agency"};
   if(rights.id===SSB_SOURCE.id)return{...rights,name:SSB_SOURCE.name,country:"India",jurisdiction:"India",level:"national",employerType:"government_agency"};
   return{...rights,name:INDIA_EMPLOYMENT_NEWS.name,country:"India",jurisdiction:"India",
    level:"unclassified",employerType:"government_recruitment_digest"};
  });
  return json({sources,notices:rows.results||[],total:total?.total||0,page,limit,
   releaseProfile:scope,
   publicLaunchAuthorized:false,
   ...(scope==="approved_staging"?{indiaSourceCheck:{ready:isroGate.ready,lastCheckAt:isroGate.lastCheckAt||null,successfulCycles:isroGate.successfulCycles||0},indiaSourceChecks:{[ISRO_SOURCE.id]:isroGate,[SSB_SOURCE.id]:ssbGate}}:{}),
   filters:{source:sourceId,country,jurisdiction,level,stream,keyword},
   disclaimer:"Government employer and public education sector listings are distinguished. Records come from official sources, but every vacancy, eligibility and exact closing time must be confirmed on the original authority's site. Indian date-only closing fields use the end of the Indian calendar day as a visibility boundary, not a verified application deadline. NYC date-only deadlines use a conservative start-of-day visibility boundary in New York; search the official city jobs portal by job ID. An India Employment News research row is a summary index, not an independently verified employer vacancy."});
 }catch(e){console.error(JSON.stringify({event:"official_notices_read_failed",reason:String(e?.message||e)}));return json({error:"temporarily_unavailable",notices:[]},503);}
}
export async function serveIngestionStatus(db){
 if(!db)return json({error:"not_configured"},503);
 try{
  const latest=await db.prepare("SELECT source_id as sourceId,started_at as startedAt,finished_at as finishedAt,state,received,accepted,discarded,error_code as errorCode,details FROM source_ingest_runs ORDER BY finished_at DESC LIMIT 8").all();
  const c=await db.prepare("SELECT COUNT(*) AS total FROM official_job_notices WHERE life_status='open' AND closing_at>?").bind(new Date().toISOString()).first();
  const bySource=await db.prepare("SELECT source_id AS sourceId,country,jurisdiction_name AS jurisdiction,government_tier AS level,employer_type AS employerType,COUNT(*) AS count FROM official_job_notices WHERE life_status='open' AND closing_at>? GROUP BY source_id,country,jurisdiction_name,government_tier,employer_type").bind(new Date().toISOString()).all();
  // An audited signed transfer (including a one-off GitHub test) is not proof
  // of an unattended Cloudflare Cron run. Preserve those independent signals.
  // Bootstrap imports have neither origin marker and are never counted as Cron.
  // This release-specific two-cycle gate is deliberately stricter than UI
  // freshness. A one-off signed test is excluded; two recent successful native
  // Cron imports per source and a successful latest native attempt are required.
  const now=Date.now();
  const recentSince=now-8*3600000;
  const observed=await db.prepare("SELECT source_id AS sourceId,MAX(CASE WHEN state='ok' AND details LIKE '%\"origin\":\"scheduled\"%' THEN finished_at ELSE NULL END) AS lastSuccessfulScheduledAt,MAX(CASE WHEN state='ok' AND details LIKE '%\"origin\":\"signed_portable_collector\"%' THEN finished_at ELSE NULL END) AS lastSuccessfulSignedAt,SUM(CASE WHEN state='ok' AND details LIKE '%\"origin\":\"scheduled\"%' AND finished_at>=? THEN 1 ELSE 0 END) AS recentNativeSuccessCount,MAX(CASE WHEN id NOT LIKE 'bootstrap-%' AND details NOT LIKE '%\"origin\":\"signed_portable_collector\"%' AND (error_code IS NULL OR error_code!='collector_claim_pending') THEN finished_at ELSE NULL END) AS lastNativeAttemptAt FROM source_ingest_runs WHERE source_id IN (?,?) GROUP BY source_id")
   .bind(recentSince,DFE_SOURCE.id,"manitoba-jobs").all();
  const sources=[DFE_SOURCE.id,"manitoba-jobs"].map(sourceId=>{
   const row=(observed.results||[]).find(x=>x.sourceId===sourceId);
   const lastSuccessfulScheduledAt=row?.lastSuccessfulScheduledAt||null;
   const lastSuccessfulSignedAt=row?.lastSuccessfulSignedAt||null;
   const lastNativeAttemptAt=row?.lastNativeAttemptAt||null;
   const recentNativeSuccessCount=Number(row?.recentNativeSuccessCount)||0;
   const twoCycleNativeProof=recentNativeSuccessCount>=2 &&
    !!lastSuccessfulScheduledAt &&
    now-lastSuccessfulScheduledAt<=5*3600000 &&
    lastNativeAttemptAt===lastSuccessfulScheduledAt;
   return {sourceId,scheduledSuccessObserved:!!lastSuccessfulScheduledAt,
    signedCollectorSuccessObserved:!!lastSuccessfulSignedAt,
    freshSuccess:!!lastSuccessfulScheduledAt&&now-lastSuccessfulScheduledAt<86400000,
    recentNativeSuccessCount,twoCycleNativeProof,
    lastSuccessfulScheduledAt,lastSuccessfulSignedAt,lastNativeAttemptAt};
  });
  return json({source:"multiple official sources",openImportedNotices:c?.total||0,bySource:bySource.results||[],latest:latest.results||[],
   automation:{observedForAllSources:sources.every(x=>x.scheduledSuccessObserved),
    healthy:sources.every(x=>x.freshSuccess),
    twoCycleCronGatePassed:sources.every(x=>x.twoCycleNativeProof),
    signedCollectorVerified:sources.some(x=>x.signedCollectorSuccessObserved),sources,
    indiaSource:"index_parser_only_not_scheduled_pending_reuse_review"},
   status:"official_feed_imports_not_independently_verified"});
 }catch(e){console.error(JSON.stringify({event:"ingestion_status_read_failed",reason:String(e?.message||e).slice(0,150)}));return json({error:"status_unavailable"},503);}
}

// This status endpoint is safe to expose alongside the public-preview feed:
// its SQL reads only explicitly approved sources, including run details and
// counts. It cannot be widened by request parameters or a new adapter.
export async function servePublicIngestionStatus(db,publication=null){
 if(!db)return json({error:"not_configured"},503);
 try{
  const gate=await isroPublicationGate(db),candidate=allowedIsroPreviewSource();
  const ssbGate=await ssbPublicationGate(db),ssbCandidate=allowedSsbPreviewSource();
  const checks=new Map([[candidate,gate],[ssbCandidate,ssbGate]]);
  if(publication?.allowedIds.includes(NYC_SOURCE.id)&&publication.nycGate)checks.set(NYC_SOURCE.id,publication.nycGate);
  const ids=allowedCommercialPreviewSources();for(const [id,g] of checks)if(g.ready)ids.push(id);
  const visibleIds=publication?ids.filter(id=>publication.allowedIds.includes(id)):ids;
  const auditIds=[...allowedCommercialPreviewSources(),...checks.keys()];
  const placeholders=visibleIds.map(()=>"?").join(",")||"NULL",auditPlaceholders=auditIds.map(()=>"?").join(",");
  const now=Date.now(),cutoff=new Date(now).toISOString();
  const latest=await db.prepare("SELECT source_id as sourceId,started_at as startedAt,finished_at as finishedAt,state,received,accepted,discarded,error_code as errorCode FROM source_ingest_runs WHERE source_id IN ("+auditPlaceholders+") ORDER BY finished_at DESC LIMIT 8").bind(...auditIds).all();
  const guards=[...checks].filter(([id,g])=>g.ready&&visibleIds.includes(id));
  const snapshotGuard=guards.map(()=>" AND (source_id!=? OR (last_seen_at=? AND NOT EXISTS (SELECT 1 FROM source_ingest_runs g WHERE g.source_id=? AND g.started_at>=? AND (g.started_at>? OR g.state!='ok'))))").join("");
  const bySource=await db.prepare("SELECT source_id AS sourceId,country,jurisdiction_name AS jurisdiction,government_tier AS level,employer_type AS employerType,COUNT(*) AS count FROM official_job_notices WHERE source_id IN ("+placeholders+") AND life_status='open' AND closing_at>? AND last_seen_at>=? AND review_state IN ('official_feed_unreviewed','founder_reviewed')"+snapshotGuard+" GROUP BY source_id,country,jurisdiction_name,government_tier,employer_type").bind(...visibleIds,cutoff,now-14*86400000,...guards.flatMap(([id,g])=>[id,g.snapshotAt,id,g.snapshotAt,g.snapshotAt])).all();
  const recent=await db.prepare("SELECT source_id AS sourceId,MAX(CASE WHEN state='ok' AND details LIKE '%\"origin\":\"scheduled\"%' THEN finished_at ELSE NULL END) AS lastSuccessfulScheduledAt,SUM(CASE WHEN state='ok' AND details LIKE '%\"origin\":\"scheduled\"%' AND finished_at>=? THEN 1 ELSE 0 END) AS recentNativeSuccessCount,MAX(CASE WHEN id NOT LIKE 'bootstrap-%' AND details NOT LIKE '%\"origin\":\"signed_portable_collector\"%' AND (error_code IS NULL OR error_code!='collector_claim_pending') THEN finished_at ELSE NULL END) AS lastNativeAttemptAt FROM source_ingest_runs WHERE source_id IN ("+auditPlaceholders+") GROUP BY source_id").bind(now-8*3600000,...auditIds).all();
  const sources=auditIds.map(sourceId=>{
   const row=(recent.results||[]).find(x=>x.sourceId===sourceId)||{};
   const last=row.lastSuccessfulScheduledAt||null;
   const count=Number(row.recentNativeSuccessCount)||0;
   return {sourceId,scheduledSuccessObserved:!!last,freshSuccess:checks.has(sourceId)?checks.get(sourceId).ready:!!last&&now-last<86400000,recentNativeSuccessCount:count,twoCycleNativeProof:checks.has(sourceId)?checks.get(sourceId).ready:count>=2&&!!last&&now-last<=5*3600000&&row.lastNativeAttemptAt===last,lastSuccessfulScheduledAt:last,lastNativeAttemptAt:row.lastNativeAttemptAt||null};
  });
  const rows=bySource.results||[];
  return json({source:"approved preview sources",openImportedNotices:rows.reduce((n,x)=>n+(Number(x.count)||0),0),bySource:rows,latest:latest.results||[],automation:{observedForAllSources:sources.every(x=>x.scheduledSuccessObserved),healthy:sources.every(x=>x.freshSuccess),twoCycleCronGatePassed:sources.every(x=>x.twoCycleNativeProof),sources},indiaSourceCheck:{ready:gate.ready,lastCheckAt:gate.lastCheckAt||null,successfulCycles:gate.successfulCycles||0},indiaSourceChecks:Object.fromEntries([...checks].filter(([id])=>id!==NYC_SOURCE.id)),...(publication?.nycGate?{nycSourceCheck:publication.nycGate}:{}),status:"official_feed_imports_not_independently_verified"});
 }catch(e){console.error(JSON.stringify({event:"public_ingestion_status_failed",reason:String(e?.message||e).slice(0,150)}));return json({error:"status_unavailable"},503);}
}
