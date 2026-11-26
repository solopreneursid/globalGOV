// Official Manitoba provincial civil-service RSS reader. No HTML scraping or external service.
// Feed is intentionally published by the Government of Manitoba for syndication.
// https://jobsearch.gov.mb.ca/rssFeeds.action
export const MANITOBA = Object.freeze({
 id:"manitoba-jobs",name:"Government of Manitoba Job Opportunities",
 url:"https://jobsearch.gov.mb.ca/rss/newJobPostingsFeed.rss",country:"Canada",
 jurisdictionCode:"CA-MB",jurisdiction:"Manitoba",level:"province",
 attribution:"Government of Manitoba — Civil Service Commission"
});
const MAX_BYTES=240000,MAX_ITEMS=120,PER_RUN=15;
const decoded=s=>String(s||"").replace(/&#(x[0-9a-f]+|\d+);/gi,(m,n)=>{const x=n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):parseInt(n,10);return Number.isFinite(x)&&x>0&&x<0x110000?String.fromCodePoint(x):"";}).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi,m=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&nbsp;":" "}[m])).trim();
const text=(s,max=190)=>decoded(s).replace(/[\u0000-\u001f<>]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const getTag=(item,tag)=>{const r=item.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"));return r?decoded(r[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/,"$1")):"";};
function details(input){
 const s=decoded(input);
 const re=/<strong>\s*([^<]+)\s*<\/strong>\s*:\s*([\s\S]*?)(?=<br\b[^>]*\/?>|$)/gi;
 const kv={};for(const m of s.matchAll(re))kv[m[1].trim().toLowerCase()]=text(m[2],280);
 return kv;
}
const isoDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"))?v:null;
function safeJobUrl(raw){
 try{
  const original=new URL(decoded(raw));
  if(!["http:","https:"].includes(original.protocol)||original.hostname!=="jobsearch.gov.mb.ca"||original.pathname!=="/jow/advancedResult.action")return null;
  const id=original.searchParams.get("ID");
  if(!/^\d{3,12}$/.test(id||""))return null;
  // Published RSS sometimes uses http://. Upgrade to HTTPS and limit the query.
  return "https://jobsearch.gov.mb.ca/jow/advancedResult.action?ID="+encodeURIComponent(id)+"#position";
 }catch{return null;}
}
export function normalizeManitobaItem(item,now=Date.now()){
 if(typeof item!=="string"||item.length>14000)return {error:"malformed_item"};
 const title=text(getTag(item,"title")),fields=details(getTag(item,"description"));
 const link=safeJobUrl(getTag(item,"link"));
 const closingDay=isoDay(fields["closing date"]||""),postedDay=isoDay(fields["posted date"]||"");
 if(!link)return {error:"non_official_url"};
 if(title.length<4||!fields["department"]||!closingDay)return{error:"missing_required_fields"};
 // The government RSS uses a date without local time. Display it as a DATE (not a claimed exact deadline).
 // End-of-day UTC is a conservative expiry boundary relative to Manitoba's local time.
 const closingAt=closingDay+"T23:59:59.000Z";
 if(Date.parse(closingAt)<=now)return{error:"expired"};
 if(postedDay&&Date.parse(postedDay+"T00:00:00Z")>now+86400000)return{error:"future_published"};
 if(fields["posting type"] && !/^open$/i.test(fields["posting type"]))return{error:"not_open"};
 const region=text(fields["location(s)"]||"Manitoba",120);
 const hint=title+" "+text(fields["job classification(s)"]||"");
 const stream=/\b(ict|it support|network|software|programmer|data analyst|technolog|engineer|technician|cyber|developer|systems analyst)\b/i.test(hint)?"Technical":/\b(manager|counsel|clerk|administrat|health|nurs|assistant|officer|coordinator|adviser|teacher)\b/i.test(hint)?"Non-technical":"Unclassified";
 return{sourceId:MANITOBA.id,sourceRef:link,title,employer:text(fields["department"],150),
 country:MANITOBA.country,region,stream,applyUrl:link,sourcePage:link,publishedAt:postedDay?postedDay+"T00:00:00.000Z":null,
 closingAt,closingDateLocal:closingDay,reviewState:"official_feed_unreviewed",lifeStatus:"open",
 jurisdictionCode:MANITOBA.jurisdictionCode,jurisdictionName:MANITOBA.jurisdiction,
 governmentTier:"province",employerType:"provincial_government"};
}
export function parseManitobaRss(xml,now=Date.now()){
 if(typeof xml!=="string"||xml.length>MAX_BYTES||!/<rss\b[^>]*>/i.test(xml)||!/<channel>/i.test(xml))
  throw Error("invalid_manitoba_rss");
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error("unsupported_xml_declarations");
 const raw=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
 if(raw.length>MAX_ITEMS)throw Error("too_many_rss_items");
 const valid=[],rejected={},seen=new Set();
 for(const item of raw){
  const record=normalizeManitobaItem(item[1],now);
  if(record.error){rejected[record.error]=(rejected[record.error]||0)+1;continue;}
  if(seen.has(record.sourceRef)){rejected.duplicate=(rejected.duplicate||0)+1;continue;}
  seen.add(record.sourceRef);valid.push(record);
 }
 return {received:raw.length,valid,rejected};
}
const hash=async value=>{
 const result=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(result)].map(v=>v.toString(16).padStart(2,"0")).join("");
};
// One same-origin redirect, one bounded retry. A redirect to another site is
// never silently followed (and never treated as valid government-source evidence).
async function fetchRss(fetcher=fetch){
 let target=MANITOBA.url;
 for(let attempt=0;attempt<2;attempt++){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),11000);
  try{
   for(let hop=0;hop<=1;hop++){
    const response=await fetcher(target,{method:"GET",signal:ctl.signal,redirect:"manual",headers:{"Accept":"application/rss+xml, application/xml, text/xml"}});
    if([301,302,303,307,308].includes(response.status)){
     let next;
     try{next=new URL(response.headers.get("location"),target);}catch{return{error:"invalid_redirect",httpStatus:response.status};}
     if(hop===1||next.protocol!=="https:"||next.hostname!=="jobsearch.gov.mb.ca"||next.pathname!=="/rss/newJobPostingsFeed.rss"||next.search)
      return{error:"unsafe_redirect",httpStatus:response.status};
     target=next.toString();continue;
    }
    if([429,502,503,504].includes(response.status)&&attempt===0)break;
    if(!response.ok)return{error:"http_"+response.status,httpStatus:response.status};
    const ct=response.headers.get("content-type")||"";
    if(!/xml|rss/i.test(ct))return{error:"bad_content_type",httpStatus:response.status};
    if(Number(response.headers.get("content-length")||0)>MAX_BYTES)return{error:"feed_too_big",httpStatus:response.status};
    let xml="",bytes=0;
    const reader=response.body?.getReader();
    if(reader){
     const decoder=new TextDecoder();
     try{
      while(true){
       const {done,value}=await reader.read();if(done)break;
       bytes+=value.byteLength;
       if(bytes>MAX_BYTES){await reader.cancel();return{error:"feed_too_big",httpStatus:response.status};}
       xml+=decoder.decode(value,{stream:true});
      }
      xml+=decoder.decode();
     }finally{reader.releaseLock();}
    }else{xml=await response.text();if(new TextEncoder().encode(xml).byteLength>MAX_BYTES)return{error:"feed_too_big",httpStatus:response.status};}
    return{xml,httpStatus:response.status};
   }
  }catch(e){
   if(attempt===1)return{error:e?.name==="AbortError"?"timeout":"network_error",httpStatus:null};
  }finally{clearTimeout(timer);}
  if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));
  target=MANITOBA.url;
 }
 return{error:"temporary_upstream_failure",httpStatus:null};
}
export async function ingestManitoba(db,fetcher=fetch,now=Date.now(),meta={}){
 if(!db)throw Error("D1 binding required");
 const outcome={id:meta?.auditId||crypto.randomUUID(),sourceId:MANITOBA.id,startedAt:now,finishedAt:now,state:"error",httpStatus:null,received:0,accepted:0,discarded:0,errorCode:null,details:""};
 try{
  const response=await fetchRss(fetcher);outcome.httpStatus=response.httpStatus;
  if(response.error){outcome.errorCode=response.error;return outcome;}
  const parsed=parseManitobaRss(response.xml,now);
  outcome.received=parsed.received;outcome.discarded=parsed.received-parsed.valid.length;
  if(parsed.received===0||parsed.valid.length===0){outcome.state="rejected";outcome.errorCode="no_eligible_records";outcome.details=JSON.stringify(parsed.rejected).slice(0,240);return outcome;}
  const cursor=await db.prepare("SELECT next_page FROM source_feed_cursors WHERE source_id=?").bind(MANITOBA.id).first();
  const offset=Math.max(0,Number(cursor?.next_page||1)-1)%parsed.valid.length;
  const selected=parsed.valid.slice(offset,offset+PER_RUN);
  const entries=[];
  for(const row of selected){
   const id=MANITOBA.id+":"+(await hash(row.sourceRef)).slice(0,32);
   const evidence=await hash(JSON.stringify([row.sourceRef,row.title,row.employer,row.region,row.closingAt,row.publishedAt]));
   entries.push(db.prepare("INSERT INTO official_job_notices(id,source_id,source_ref,title,employer,country,region,stream,apply_url,source_page,published_at,closing_at,first_seen_at,last_seen_at,evidence_sha256,review_state,life_status,jurisdiction_code,jurisdiction_name,government_tier,employer_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,employer=excluded.employer,region=excluded.region,stream=excluded.stream,published_at=excluded.published_at,closing_at=excluded.closing_at,last_seen_at=excluded.last_seen_at,evidence_sha256=excluded.evidence_sha256,life_status='open'")
     .bind(id,row.sourceId,row.sourceRef,row.title,row.employer,row.country,row.region,row.stream,row.applyUrl,row.sourcePage,row.publishedAt,row.closingAt,Date.now(),Date.now(),evidence,row.reviewState,row.lifeStatus,row.jurisdictionCode,row.jurisdictionName,row.governmentTier,row.employerType));
  }
  if(entries.length)await db.batch(entries);
  outcome.accepted=entries.length;
  const next=offset+entries.length>=parsed.valid.length?1:offset+entries.length+1;
  await db.prepare("INSERT INTO source_feed_cursors(source_id,next_page,last_total_pages,last_success_at) VALUES(?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET next_page=excluded.next_page,last_total_pages=excluded.last_total_pages,last_success_at=excluded.last_success_at")
   .bind(MANITOBA.id,next,Math.ceil(parsed.valid.length/PER_RUN),Date.now()).run();
  outcome.state="ok";outcome.details=JSON.stringify({offset,next,eligible:parsed.valid.length,rejected:parsed.rejected,origin:meta?.origin||"scheduled"}).slice(0,400);
  return outcome;
 }catch(e){outcome.errorCode="storage_or_schema_error";outcome.details=String(e?.message||e).slice(0,220);
  console.error(JSON.stringify({event:"manitoba_ingest_error",reason:outcome.details}));return outcome;
 }finally{
  outcome.finishedAt=Date.now();
  const signed=meta?.origin==="signed_portable_collector";
  const base="INSERT INTO source_ingest_runs(id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
  const sql=signed?base+
   " ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at,finished_at=excluded.finished_at,state=excluded.state,http_status=excluded.http_status,received=excluded.received,accepted=excluded.accepted,discarded=excluded.discarded,error_code=excluded.error_code,details=excluded.details WHERE source_ingest_runs.state='error' AND source_ingest_runs.error_code='collector_claim_pending'":base;
  let committed=false;
  try{
   const wrote=await db.prepare(sql)
    .bind(outcome.id,MANITOBA.id,outcome.startedAt,outcome.finishedAt,outcome.state,
     outcome.httpStatus,outcome.received,outcome.accepted,outcome.discarded,
     outcome.errorCode,outcome.details).run();
   committed=wrote?.meta?.changes===1||(!signed&&wrote?.success===true);
  }catch(e){console.error(JSON.stringify({event:"manitoba_audit_write_failed",reason:String(e?.message||e)}));}
  if(!committed && signed){outcome.state="error";outcome.errorCode="audit_write_failed";}

  console.log(JSON.stringify({event:"manitoba_feed",outcome:outcome.state,accepted:outcome.accepted,errorCode:outcome.errorCode}));
 }
}
