// India pilot: public, factual recruitment digest from the Government of India's
// Ministry of Information & Broadcasting Employment News website.
// Source: https://employmentnews.gov.in/newemp/AllJobs.aspx?k=All
// This is a SUMMARY DIRECTORY, not an official application form or proof that
// an individual employer's vacancy remains open. Never infer eligibility.
export const INDIA_EMPLOYMENT_NEWS=Object.freeze({
 id:"india-employment-news",name:"Employment News — Government of India",
 url:"https://employmentnews.gov.in/newemp/AllJobs.aspx?k=All",
 host:"employmentnews.gov.in",country:"India"
});
const MAX_BYTES=400000,MAX_ROWS=150,MAX_STORE=20;
const clean=v=>String(v??"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
 .replace(/<[^>]+>/g," ").replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi,m=>({
  "&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&#39;":"'"
 }[m.toLowerCase()]||" ")).replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{
 const cp=n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):parseInt(n,10);
 return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):" ";
 }).replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim();
const short=(v,max=200)=>clean(v).slice(0,max);
const date=(input,kind)=>{
 const match=/^(\d{1,2})\/(\d{1,2})\/(20\d\d)$/.exec(input.trim());
 if(!match)return null;
 // The publisher states ISSUED DATE is MM/DD/YYYY; LAST DATE is DD/MM/YYYY.
 const month=Number(kind==="issued"?match[1]:match[2]);
 const day=Number(kind==="issued"?match[2]:match[1]),year=Number(match[3]);
 const d=new Date(Date.UTC(year,month-1,day));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
 return d.toISOString().slice(0,10);
};
const streamFor=title=>/\b(engineer|software|scientist|technical|developer|programmer|data analyst|research engineer|IT officer|technician|cybersecurity)\b/i.test(title)?"Technical":"Unclassified";
export function parseEmploymentNews(html,now=Date.now()){
 if(typeof html!=="string"||html.length>MAX_BYTES)throw Error("invalid_india_source_size");
 const headline=clean(html).slice(0,24000);
 if(!/ALL\s+JOBS/i.test(headline)||!/ISSUED\s+DATE/i.test(headline)||!/LAST\s+DATE/i.test(headline)||!/ORGANISATION/i.test(headline))
  throw Error("unsupported_india_source_schema");
 const all=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
 if(all.length>MAX_ROWS)throw Error("india_source_exceeds_row_budget");
 const records=[],seen=new Set(),rejected={};
 for(const match of all){
  const cells=[...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>short(c[1],210));
  if(cells.length!==5)continue;
  const [issued,employer,title,method,closes]=cells;
  if(!/\b(recruitment|deputation|contract|promotion|absorption|transfer)\b/i.test(method))continue;
  const publishedDay=date(issued,"issued"),closingDay=date(closes,"closing");
  if(!publishedDay||!closingDay||!employer||!title){rejected.invalid=(rejected.invalid||0)+1;continue;}
  // Date-only government summaries cannot establish a precise closing hour.
  // End of the published calendar day in India (UTC+05:30) is a display/expiry boundary only.
  const closingAt=closingDay+"T18:29:59.000Z";
  if(Date.parse(closingAt)<=now){rejected.closed=(rejected.closed||0)+1;continue;}
  if(Date.parse(publishedDay+"T00:00:00.000Z")>now+86400000){rejected.future=(rejected.future||0)+1;continue;}
  const key=[publishedDay,employer.toLowerCase(),title.toLowerCase(),method.toLowerCase(),closingDay].join("|");
  if(seen.has(key)){rejected.duplicate=(rejected.duplicate||0)+1;continue;}
  seen.add(key);
  records.push({
   sourceId:INDIA_EMPLOYMENT_NEWS.id,sourceRef:key,title,employer,country:"India",
   region:"India",stream:streamFor(title),applyUrl:INDIA_EMPLOYMENT_NEWS.url,
   sourcePage:INDIA_EMPLOYMENT_NEWS.url,publishedAt:publishedDay+"T00:00:00.000Z",
   closingAt,reviewState:"official_feed_unreviewed",lifeStatus:"open",
   jurisdictionCode:"IN",jurisdictionName:"India",governmentTier:"unclassified",
   employerType:"government_recruitment_digest"
  });
 }
 return{valid:records,rejected,received:all.length,disclaimer:"Official Employment News summary only; check employer recruitment notice, eligibility and precise deadline."};
}
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))]
 .map(x=>x.toString(16).padStart(2,"0")).join("");
async function fetchEmploymentPage(fetcher){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const res=await fetcher(INDIA_EMPLOYMENT_NEWS.url,{method:"GET",redirect:"manual",signal:ctl.signal,headers:{"Accept":"text/html"}});
  if(!res.ok)return{error:"http_"+res.status,httpStatus:res.status};
  if(!/html/i.test(res.headers.get("content-type")||""))return{error:"unexpected_content_type",httpStatus:res.status};
  if(Number(res.headers.get("content-length")||0)>MAX_BYTES)return{error:"too_large",httpStatus:res.status};
  // Response.text uses bounded content-length only as advisory; enforce actual bytes.
  const reader=res.body?.getReader();let html="",n=0;
  if(reader){
   const decoder=new TextDecoder();
   try{while(true){
    const {done,value}=await reader.read();if(done)break;
    n+=value.byteLength;if(n>MAX_BYTES){await reader.cancel();return{error:"too_large",httpStatus:res.status};}
    html+=decoder.decode(value,{stream:true});
   }html+=decoder.decode();}finally{reader.releaseLock();}
  }else{html=await res.text();if(new TextEncoder().encode(html).byteLength>MAX_BYTES)return{error:"too_large",httpStatus:res.status};}
  return{html,httpStatus:res.status};
 }catch(e){return{error:e?.name==="AbortError"?"timeout":"network_error",httpStatus:null};}
 finally{clearTimeout(timer);}
}
export async function ingestEmploymentNews(db,fetcher=fetch,now=Date.now()){
 if(!db)throw Error("database_binding_required");
 const outcome={id:crypto.randomUUID(),sourceId:INDIA_EMPLOYMENT_NEWS.id,startedAt:now,
  finishedAt:now,state:"error",httpStatus:null,received:0,accepted:0,discarded:0,errorCode:null,details:""};
 try{
  const response=await fetchEmploymentPage(fetcher);outcome.httpStatus=response.httpStatus;
  if(response.error){outcome.errorCode=response.error;return outcome;}
  const parsed=parseEmploymentNews(response.html,now);
  outcome.received=parsed.received;outcome.discarded=Object.values(parsed.rejected).reduce((a,b)=>a+b,0);
  // Source may be valid but contain zero still-open summaries. Never invent a vacancy.
  const rows=parsed.valid.slice(0,MAX_STORE);
  if(rows.length){
   const stmt=[];
   for(const row of rows){
    const id=INDIA_EMPLOYMENT_NEWS.id+":"+(await sha(row.sourceRef)).slice(0,32);
    const evidence=await sha(JSON.stringify([row.sourceRef,row.title,row.employer,row.closingAt]));
    stmt.push(db.prepare("INSERT INTO official_job_notices(id,source_id,source_ref,title,employer,country,region,stream,apply_url,source_page,published_at,closing_at,first_seen_at,last_seen_at,evidence_sha256,review_state,life_status,jurisdiction_code,jurisdiction_name,government_tier,employer_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,employer=excluded.employer,closing_at=excluded.closing_at,last_seen_at=excluded.last_seen_at,evidence_sha256=excluded.evidence_sha256,life_status='open'")
     .bind(id,row.sourceId,row.sourceRef,row.title,row.employer,row.country,row.region,row.stream,row.applyUrl,row.sourcePage,row.publishedAt,row.closingAt,Date.now(),Date.now(),evidence,row.reviewState,row.lifeStatus,row.jurisdictionCode,row.jurisdictionName,row.governmentTier,row.employerType));
   }
   await db.batch(stmt);
  }
  outcome.accepted=rows.length;outcome.state="ok";
  outcome.details=JSON.stringify({type:"scheduled",source:"official_bulletin_summary",eligible:parsed.valid.length,stored:rows.length,rejected:parsed.rejected}).slice(0,480);
  return outcome;
 }catch(e){outcome.errorCode="schema_or_storage_error";outcome.details=String(e?.message||e).slice(0,200);return outcome;}
 finally{
  outcome.finishedAt=Date.now();
  try{await db.prepare("INSERT INTO source_ingest_runs(id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .bind(outcome.id,outcome.sourceId,outcome.startedAt,outcome.finishedAt,outcome.state,outcome.httpStatus,outcome.received,outcome.accepted,outcome.discarded,outcome.errorCode,outcome.details).run();}
  catch(e){console.error(JSON.stringify({event:"india_audit_failed",reason:String(e?.message||e)}));}
  console.log(JSON.stringify({event:"india_employment_news",state:outcome.state,accepted:outcome.accepted,errorCode:outcome.errorCode}));
 }
}
