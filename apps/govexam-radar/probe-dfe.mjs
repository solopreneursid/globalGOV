import { parseOfficialFeed } from "./official-feed.mjs";
// One-shot, read-only official UK DfE API compatibility probe.
// Diagnostic only: does not publish, cache or store vacancies.
const target="https://teaching-vacancies.service.gov.uk/api/v1/jobs.json?page=1";
const abort=new AbortController();
const timer=setTimeout(()=>abort.abort(),12000);
try{
 const r=await fetch(target,{signal:abort.signal,redirect:"error",headers:{
  "Accept":"application/json",
  "Referer":"https://hqventures-govexam-parity-preview.solopreneursid-proy.workers.dev/",
  "User-Agent":"HQventuresGovRadar/2.2 (independent GOV.UK OGL jobs directory; contact via YorpHives.com)"
 }});
 console.log("UK DfE Teaching Vacancies API:",JSON.stringify({status:r.status,type:r.headers.get("content-type"),length:r.headers.get("content-length"),retryAfter:r.headers.get("retry-after")}));
 if(!r.ok){console.log("FEED_NOT_READY: upstream unavailable/restricted. No data imported.");process.exit(0);}
 const text=await r.text();
 if(text.length>2500000){console.log("FEED_TOO_LARGE",text.length);process.exit(0);}
 let data;try{data=JSON.parse(text);}catch{console.log("FEED_NOT_JSON. No data imported.");process.exit(0);}
 const type=Array.isArray(data)?"array":typeof data;
 const keys=data&&typeof data==="object"&&!Array.isArray(data)?Object.keys(data):[];
 const array=Array.isArray(data)?data:[data?.data,data?.jobs,data?.results,data?.vacancies].find(Array.isArray)||[];
 const sample=array.find(x=>x&&typeof x==="object");
 const attrs=sample?.attributes&&typeof sample.attributes==="object"?sample.attributes:sample;
 const meta={rootType:type,rootKeys:keys,items:array.length,firstItemKeys:sample?Object.keys(sample):[],firstAttributesKeys:attrs?Object.keys(attrs):[],meta:data?.meta?Object.keys(data.meta):[],pagination:data?.pagination?Object.keys(data.pagination):[],sampleTypes:attrs?Object.fromEntries(Object.entries(attrs).slice(0,25).map(([k,v])=>[k,Array.isArray(v)?"array":v===null?"null":typeof v])):{}};
 console.log("OFFICIAL_API_SHAPE "+JSON.stringify(meta));
 try{
  const normalized=parseOfficialFeed(data);
  console.log("REAL_OFFICIAL_RECORD_VALIDATION "+JSON.stringify({received:normalized.received,accepted:normalized.valid.length,rejected:normalized.rejected,totalPages:normalized.totalPages,firstValidFields:normalized.valid[0]?Object.keys(normalized.valid[0]):[]}));
  if(normalized.received && normalized.valid.length===0)process.exitCode=1;

 }catch(e){console.log("FEED_SCHEMA_ERROR",String(e?.message||e));process.exitCode=1;}
}catch(e){console.log("FEED_PROBE_ERROR",String(e?.message||e).slice(0,300));}finally{clearTimeout(timer);}
