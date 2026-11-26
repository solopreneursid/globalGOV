// Portable Node.js 22 collector: works on an owner-operated server or GitHub Actions.
// It performs strict read-only official fetches; publishing requires a shared secret
// provisioned OUTSIDE source control. India is intentionally not an ingest source.
import {DFE_SOURCE,parseOfficialFeed} from "./official-feed.mjs";
import {MANITOBA,parseManitobaRss} from "./manitoba-feed.mjs";
import {calculateCollectorSignature} from "./collector-bridge.mjs";
import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
const MAX_BYTES=3200000;
function validTarget(input){
 const url=new URL(input);
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)
  throw Error("collector_target_must_be_https");
 return url.origin;
}
async function boundedFetchOnce(url,fetcher=fetch,maxBytes=MAX_BYTES){
 const expected=new URL(url),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),16000);
 let current=url;
 try{
  for(let i=0;i<2;i++){
   const r=await fetcher(current,{method:"GET",redirect:"manual",signal:controller.signal,headers:{
     "Accept":expected.pathname.endsWith(".rss")?"application/rss+xml, application/xml":"application/json"
   }});
   if([301,302,303,307,308].includes(r.status)){
    let next;
    try{next=new URL(r.headers.get("location"),current);}catch{throw Error("invalid_redirect");}
    if(i!==0||next.protocol!=="https:"||next.hostname!==expected.hostname||
       next.pathname!==expected.pathname||next.search!==expected.search)
     throw Error("unsafe_redirect");
    current=next.toString();continue;
   }
   if(!r.ok)throw Error("upstream_http_"+r.status);
   if(Number(r.headers.get("content-length")||0)>maxBytes)throw Error("upstream_too_large");
   const reader=r.body?.getReader();if(!reader)throw Error("upstream_empty_stream");
   const decoder=new TextDecoder();let content="",length=0;
   try{
    while(true){
     const {done,value}=await reader.read();if(done)break;
     length+=value.byteLength;if(length>maxBytes){await reader.cancel();throw Error("upstream_too_large");}
     content+=decoder.decode(value,{stream:true});
    }
    content+=decoder.decode();
   }finally{reader.releaseLock();}
   return {content,type:r.headers.get("content-type")||""};
  }
  throw Error("too_many_redirects");
 }finally{clearTimeout(timer);}
}
// Briefly retry only transient upstream failures; permanent policy/schema errors fail closed.
async function boundedFetch(url,fetcher=fetch,maxBytes=MAX_BYTES){
 for(let attempt=0;attempt<2;attempt++){
  try{return await boundedFetchOnce(url,fetcher,maxBytes);}
  catch(e){
   const reason=String(e?.message||e);
   if(attempt===1||!(/^(upstream_http_(?:429|502|503|504)|fetch failed|timeout|network_error)$/.test(reason)||e?.name==="AbortError"||e instanceof TypeError))throw e;
   await new Promise(resolve=>setTimeout(resolve,450));
  }
 }
 throw Error("fetch_retry_exhausted");
}
async function getPlan(origin,fetcher=fetch){
 const url=origin+"/api/collector/plan";
 const r=await fetcher(url,{method:"GET",redirect:"error",headers:{"Accept":"application/json"}});
 if(!r.ok)throw Error("collector_plan_http_"+r.status);
 const plan=await r.json();
 if(!Array.isArray(plan.sources))throw Error("invalid_collector_plan");
 return plan.sources;
}
const sourceSpecs={
 dfe:{id:DFE_SOURCE.id},
 manitoba:{id:MANITOBA.id}
};
export async function collectOnce({target,source="both",dryRun=true,key="",fetcher=fetch,log=console.log,now=Date.now()}={}){
 const origin=validTarget(target);
 if(!["both","dfe","manitoba"].includes(source))throw Error("unknown_collector_source");
 if(!dryRun&&(!key||key.length<32))throw Error("collector_key_missing");
 const plan=await getPlan(origin,fetcher),selected=source==="both"?["dfe","manitoba"]:[source];
 const results=[],failures=[];
 for(const name of selected){
  try{
  const spec=sourceSpecs[name],entry=plan.find(x=>x.sourceId===spec.id);
  if(!entry)throw Error("missing_source_plan_"+name);
  if(!dryRun&&entry.lastSuccessAt&&now-entry.lastSuccessAt<2*3600000){
   log(JSON.stringify({sourceId:spec.id,state:"recently_collected_skip"}));
   results.push({sourceId:spec.id,state:"skipped"});continue;
  }
  const page=name==="dfe"?entry.nextPage:undefined;
  if(name==="dfe"&&(!Number.isSafeInteger(page)||page<1||page>10000))throw Error("invalid_source_page");
  const upstream=name==="dfe"?DFE_SOURCE.api+"?page="+page:MANITOBA.url;
  const {content,type}=await boundedFetch(upstream,fetcher,name==="dfe"?MAX_BYTES:240000);
  if(name==="dfe"&&!/json/i.test(type))throw Error("wrong_dfe_content_type");
  if(name==="manitoba"&&!/xml|rss/i.test(type))throw Error("wrong_manitoba_content_type");
  const parsed=name==="dfe"?parseOfficialFeed(JSON.parse(content),now):parseManitobaRss(content,now);
  const eligible=parsed.valid.length;
  log(JSON.stringify({sourceId:spec.id,page:page||null,received:parsed.received,eligible,dryRun}));
  if(dryRun){
   results.push({sourceId:spec.id,state:"dry_run",eligible});continue;
  }
  if(eligible===0)throw Error("empty_or_unverified_source_"+name);
  const observedAt=Date.now();
  const body=JSON.stringify({requestId:randomUUID(),sourceId:spec.id,
   ...(name==="dfe"?{page}:{}),observedAt,upstreamBody:content});
  const signature=await calculateCollectorSignature(key,observedAt,body,origin);
  const upload=await fetcher(origin+"/api/collector/ingest",{method:"POST",redirect:"error",
   headers:{"Content-Type":"application/json","X-GovRadar-Timestamp":String(observedAt),
     "X-GovRadar-Signature":signature},
   body});
  if(!upload.ok)throw Error("signed_ingest_http_"+upload.status);
  const outcome=await upload.json();
  if(outcome.sourceId!==spec.id||outcome.state!=="ok"||outcome.accepted<1)
   throw Error("invalid_ingest_acknowledgement");
  log(JSON.stringify({sourceId:spec.id,state:"published",accepted:outcome.accepted}));
  results.push({sourceId:spec.id,state:"published",accepted:outcome.accepted});
  }catch(e){
   const reason=String(e?.message||e).slice(0,85);
   log(JSON.stringify({sourceId:sourceSpecs[name].id,state:"failed",reason}));
   results.push({sourceId:sourceSpecs[name].id,state:"failed"});
   failures.push(name+":"+reason);
  }
 }
 if(failures.length)throw Error("collector_sources_failed "+failures.join("; "));
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=(flag)=>{const v=process.argv.find(x=>x.startsWith("--"+flag+"="));return v?.split("=").slice(1).join("=");};
 const dryRun=process.argv.includes("--dry-run");
 collectOnce({target:process.env.GOVRADAR_COLLECTOR_TARGET||
   "https://hqventures-govexam-parity-preview.solopreneursid-proy.workers.dev",
   source:arg("source")||"both",dryRun,key:process.env.GOVRADAR_COLLECTOR_KEY||""})
 .then(out=>console.log(JSON.stringify({collector:"complete",sources:out.length,dryRun})))
 .catch(e=>{console.error(JSON.stringify({collector:"error",reason:String(e.message||e).slice(0,130)}));process.exitCode=1;});
}
