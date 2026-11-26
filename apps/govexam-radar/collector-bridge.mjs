// First-party signed ingestion bridge: portable Node collector -> GovRadar Worker/D1.
// There are NO arbitrary URLs, user-submitted jobs, or admin/site-changing actions.
// Cloudflare INGEST_HMAC_KEY and GitHub Actions secret must match; unset = disabled.
import {DFE_SOURCE,ingestDfE} from "./official-feed.mjs";
import {MANITOBA,ingestManitoba} from "./manitoba-feed.mjs";
export const COLLECTOR_MAX_WIRE_BYTES=4200000;
const enc=new TextEncoder();
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex"
}});
function hexToBytes(hex){
 if(typeof hex!=="string"||!/^[0-9a-f]{64}$/i.test(hex))return null;
 return Uint8Array.from(hex.match(/.{2}/g),x=>parseInt(x,16));
}
export async function calculateCollectorSignature(key,timestamp,raw,audience=""){
 if(typeof key!=="string"||key.length<32)throw Error("collector_secret_not_configured");
 const imported=await crypto.subtle.importKey("raw",enc.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=await crypto.subtle.sign("HMAC",imported,enc.encode(String(timestamp)+"\n"+audience+"\n"+raw));
 return [...new Uint8Array(signature)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export async function verifyCollectorSignature(key,timestamp,raw,hex,now=Date.now(),audience=""){
 if(typeof key!=="string"||key.length<32)return false;
 if(!/^\d{13}$/.test(String(timestamp)))return false;
 const time=Number(timestamp);
 if(!Number.isSafeInteger(time)||Math.abs(now-time)>300000)return false;
 const bytes=hexToBytes(hex);if(!bytes)return false;
 const imported=await crypto.subtle.importKey("raw",enc.encode(key),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 return crypto.subtle.verify("HMAC",imported,bytes,enc.encode(String(timestamp)+"\n"+audience+"\n"+raw));
}
async function boundedRead(request){
 if(Number(request.headers.get("content-length")||0)>COLLECTOR_MAX_WIRE_BYTES)throw Error("oversized_payload");
 if(!request.body)return "";
 const reader=request.body.getReader(),decoder=new TextDecoder();
 let result="",bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>COLLECTOR_MAX_WIRE_BYTES){await reader.cancel();throw Error("oversized_payload");}
   result+=decoder.decode(value,{stream:true});
  }
  return result+decoder.decode();
 }finally{reader.releaseLock();}
}
export async function serveCollectorPlan(db){
 if(!db)return reply({error:"not_configured"},503);
 try{
  const dfe=await db.prepare("SELECT next_page,last_total_pages,last_success_at FROM source_feed_cursors WHERE source_id=?").bind(DFE_SOURCE.id).first();
  const manitoba=await db.prepare("SELECT last_success_at FROM source_feed_cursors WHERE source_id=?").bind(MANITOBA.id).first();
  return reply({sources:[
   {sourceId:DFE_SOURCE.id,nextPage:Math.max(1,Number(dfe?.next_page)||1),lastSuccessAt:dfe?.last_success_at||null},
   {sourceId:MANITOBA.id,lastSuccessAt:manitoba?.last_success_at||null}
  ],disclaimer:"This is only a read-only source collection plan; it does not assert up-to-date jobs."});
 }catch{return reply({error:"plan_unavailable"},503);}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function handleCollectorIngest(request,env,now=Date.now()){
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(!env?.DB)return reply({error:"not_configured"},503);
 if(typeof env.INGEST_HMAC_KEY!=="string"||env.INGEST_HMAC_KEY.length<32)
  return reply({error:"collector_disabled"},503);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")||""))
  return reply({error:"unsupported_content_type"},415);
 const t=request.headers.get("X-GovRadar-Timestamp")||"";
 const sig=request.headers.get("X-GovRadar-Signature")||"";
 let raw;
 try{raw=await boundedRead(request);}
 catch{return reply({error:"payload_too_large"},413);}
 const allowed=await verifyCollectorSignature(env.INGEST_HMAC_KEY,t,raw,sig,now,new URL(request.url).origin);
 if(!allowed)return reply({error:"unauthorized"},401);
 let data;
 try{data=JSON.parse(raw);}catch{return reply({error:"invalid_json"},400);}
 if(!data||typeof data!=="object"||Array.isArray(data)||!uuid.test(data.requestId||"")||
    typeof data.upstreamBody!=="string"||typeof data.sourceId!=="string")
  return reply({error:"invalid_payload"},422);
 const sourceId=data.sourceId;
 if(sourceId!==DFE_SOURCE.id&&sourceId!==MANITOBA.id)return reply({error:"unsupported_source"},422);
 const max=sourceId===DFE_SOURCE.id?3200000:240000;
 if(enc.encode(data.upstreamBody).byteLength>max)return reply({error:"upstream_too_large"},413);
 if(!Number.isSafeInteger(data.observedAt)||Math.abs(now-data.observedAt)>300000)
  return reply({error:"source_snapshot_stale"},422);
 try{
  // Validate the upstream cursor/page before reserving this request ID.
  if(sourceId===DFE_SOURCE.id){
   if(!Number.isSafeInteger(data.page)||data.page<1||data.page>10000)
    return reply({error:"invalid_source_page"},422);
   const cursor=await env.DB.prepare("SELECT next_page FROM source_feed_cursors WHERE source_id=?").bind(sourceId).first();
   if(data.page!==(Number(cursor?.next_page)||1))
    return reply({error:"source_cursor_changed"},409);
  }else if(data.page!==undefined)return reply({error:"unexpected_page"},422);
  // A read-then-insert replay check is race-prone. Reserve the UUID atomically
  // using the existing audit table (its CHECK constraint permits 'error').
  // Crashes leave a visible pending/error receipt, never an untracked success.
  const claim=await env.DB.prepare(
   "INSERT INTO source_ingest_runs(id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING"
  ).bind(data.requestId,sourceId,now,now,"error",null,0,0,0,
   "collector_claim_pending",'{"origin":"signed_portable_collector","reserved":true}').run();
  if(claim?.meta?.changes===0)return reply({error:"duplicate_request"},409);
  if(claim?.meta?.changes!==1)return reply({error:"collector_reservation_failed"},503);
  let result;
  if(sourceId===DFE_SOURCE.id){
   const fetcher=async url=>{
    const target=new URL(url);
    if(target.origin!=="https://"+DFE_SOURCE.host||target.pathname!=="/api/v1/jobs.json"||
       Number(target.searchParams.get("page"))!==data.page)throw Error("page_disagreement");
    return new Response(data.upstreamBody,{status:200,headers:{"content-type":"application/json"}});
   };
   result=await ingestDfE(env.DB,fetcher,now,{auditId:data.requestId,origin:"signed_portable_collector"});
  }else{
   const fetcher=async url=>{
    if(url!==MANITOBA.url)throw Error("source_disagreement");
    return new Response(data.upstreamBody,{status:200,headers:{"content-type":"application/rss+xml"}});
   };
   result=await ingestManitoba(env.DB,fetcher,now,{auditId:data.requestId,origin:"signed_portable_collector"});
  }
  return reply({sourceId,state:result.state,accepted:result.accepted,received:result.received,
   errorCode:result.errorCode||null,requestId:data.requestId},
   result.errorCode==="audit_write_failed"?503:result.state==="ok"?200:422);
 }catch{
  return reply({error:"collector_storage_unavailable"},503);
 }
}
