// Bounded first-party candidate discovery; never treats a hyperlink as a vacancy.
// Discovery uses existing source permissions, no search API and no recursive crawl.
import { createHash } from "node:crypto";
import { getScheduledSourcePolicy, sourcePolicyAllowsUrl } from "./source-policy.mjs";
import { fetchOfficialSource } from "./source-connectors.mjs";
const MAX_BYTES=512*1024, MAX_LINKS=40, MAX_SEEDS=2;
const hash=x=>createHash("sha256").update(x).digest("hex");
const recruitment=/(?:recruit|career|vacanc|employment|job(?:s|posting)?|advertisement|opportunit|hiring)/i;
function governmentHost(host){
 return /(?:^|\.)(?:gov|gov\.uk|gov\.in|gov\.au|govt\.nz|gc\.ca|gov\.sg|gov\.mb\.ca|europa\.eu)$/.test(host);
}
function candidate(raw,base,label){
 try{
  const u=new URL(raw.replace(/&amp;/gi,"&"),base);
  if(u.protocol!=="https:"||u.port||u.username||u.password||!governmentHost(u.hostname)||u.href.length>1000)return null;
  u.hash="";
  if(u.search||/\b(?:login|sign[-_]?in|logout|register|account|captcha)\b/i.test(u.pathname))return null;
  const text=label.replace(/<[^>]*>/g," ").replace(/\s+/g," ").slice(0,160).trim();
  if(!recruitment.test(u.pathname+" "+text)&&!(/\.pdf$/i.test(u.pathname)&&/recruit|vacanc|advert/i.test(base.pathname)))return null;
  if(u.href===base.href)return null;
  return {url:u.href,kind:/\.pdf$/i.test(u.pathname)?"pdf":/\.(?:xml|rss|atom)$/i.test(u.pathname)?"feed":"page",state:"candidate_only"};
 }catch{return null;}
}
export function discoverRecruitmentLinks(body,baseUrl,contentType){
 if(typeof body!=="string"||Buffer.byteLength(body)>MAX_BYTES)throw Error("discovery_body_limit");
 const base=new URL(baseUrl);
 if(base.protocol!=="https:"||!governmentHost(base.hostname)||base.username||base.password||base.port)throw Error("discovery_seed_invalid");
 const results=new Map();
 const add=(url,label)=>{const item=candidate(url,base,label);if(item&&results.size<MAX_LINKS)results.set(item.url,item);};
 if(contentType==="text/html"){
  // Only conventional quoted href attributes; never execute scripts or interpret forms.
  const clean=body.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,"");
  for(const m of clean.matchAll(/<a\b[^>]*?\s+href\s*=\s*(?:"([^"]{1,1000})"|'([^']{1,1000})')[^>]*>([\s\S]{0,2000}?)<\/a\s*>/gi)){
   add(m[1]||m[2],m[3]);if(results.size>=MAX_LINKS)break;
  }
 }else if(["application/xml","text/xml","application/rss+xml"].includes(contentType)){
  // No XML entity expansion or external entity resolution.
  if(/<!DOCTYPE|<!ENTITY/i.test(body))throw Error("discovery_xml_unsafe");
  for(const m of body.matchAll(/<(?:loc|link)>\s*([^<]{1,1000})\s*<\/(?:loc|link)>/gi)){
   add(m[1].trim(),"");if(results.size>=MAX_LINKS)break;
  }
 }else throw Error("discovery_content_type_unsupported");
 return [...results.values()].sort((a,b)=>a.url.localeCompare(b.url));
}
export async function runRecruitmentDiscovery({pool,sources,slot,fetcher=fetch,now=Date.now}={}){
 if(!pool||!Array.isArray(sources)||typeof slot!=="string")throw Error("discovery_inputs_invalid");
 const seeds=[];
 for(const source of sources){
  if(!source?.id||!source?.url)continue;
  const u=new URL(source.url);
  if(u.protocol!=="https:"||!governmentHost(u.hostname))continue;
  const policy=await getScheduledSourcePolicy(pool,source,now());
  if(!policy||!sourcePolicyAllowsUrl(policy,source.url)||
    !policy.allowedContentTypes.some(t=>["text/html","application/xml","text/xml","application/rss+xml"].includes(t)))continue;
  seeds.push({source,policy});
 }
 const outcomes=[];
 for(const {source,policy} of seeds.slice(0,MAX_SEEDS)){
  const id="discovery:"+hash(slot+"|"+source.id),started=now();
  const claim=await pool.query(
   "INSERT INTO source_connector_runs(id,source_id,started_at,finished_at,state,automation_status,source_url,error_code,details) VALUES($1,$2,$3,$3,'error','candidate_discovery',$4,'discovery_interrupted','{}'::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",
   [id,source.id,started,source.url]);
  if(claim.rowCount!==1)continue;
  let fetched=null,links=[],errorCode=null;
  try{
   fetched=await fetchOfficialSource({source,url:source.url,fetcher,policyOverride:policy,maxBytes:MAX_BYTES,minIntervalMs:5000});
   links=discoverRecruitmentLinks(new TextDecoder("utf-8",{fatal:true}).decode(fetched.bytes),source.url,fetched.contentType);
  }catch(e){errorCode=String(e?.message||"discovery_error").replace(/[^a-zA-Z0-9_]/g,"_").slice(0,80);}
  await pool.query(
   "UPDATE source_connector_runs SET finished_at=$1,state=$2,http_status=$3,fetched_bytes=$4,documents_found=$5,notices_candidate=$6,response_sha256=$7,error_code=$8,details=$9::jsonb WHERE id=$10",
   [now(),errorCode?"error":links.length?"ok":"no_change",fetched?.status||null,fetched?.bytes?.length||0,links.filter(x=>x.kind==="pdf").length,links.length,fetched?hash(fetched.bytes):null,errorCode,JSON.stringify({candidates:links,publicationAuthorized:false,recursiveFetch:false}),id]);
  outcomes.push({sourceId:source.id,candidates:links.length,state:errorCode?"error":"ok",errorCode});
 }
 return outcomes;
}
