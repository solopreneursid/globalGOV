// USAJOBS read-only compatibility adapter. Access requires the owner's valid
// registered key. No public feed mutation, automated credential enrollment or
// fetching application forms. Each result is a review candidate, not approval.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const API='https://data.usajobs.gov/api/Search',MAX=2*1024*1024;
const str=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n&&!/[\u0000-\u001f\u007f<>]/.test(x);
const stamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(x)?Date.parse(x):NaN;
function officialUrl(x,id){
 if(!str(x,1000))return null;
 try{const u=new URL(x);return u.protocol==='https:'&&['www.usajobs.gov','usajobs.gov'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&new RegExp('^/(?:job|GetJob/ViewDetails)/'+id+'/?$','i').test(u.pathname)?u.href:null;}catch{return null;}
}
export function parseUsajobsPage(body,now=Date.now()){
 const s=body?.SearchResult;
 if(!s||!Array.isArray(s.SearchResultItems)||!Number.isSafeInteger(s.SearchResultCount)||s.SearchResultCount!==s.SearchResultItems.length||s.SearchResultCount>100||!Number.isSafeInteger(s.SearchResultCountAll)||s.SearchResultCountAll<s.SearchResultCount)throw Error('usajobs_schema_changed');
 const candidates=[],seen=new Set(),rejected={};
 const reject=k=>{rejected[k]=(rejected[k]||0)+1;};
 for(const row of s.SearchResultItems){
  const id=String(row?.MatchedObjectId??''),d=row?.MatchedObjectDescriptor;
  if(!/^\d{1,20}$/.test(id)||!d||!str(d.PositionID,150)||!str(d.PositionTitle,220)||!str(d.OrganizationName,200)){reject('missing_fields');continue;}
  const url=officialUrl(d.PositionURI,id),open=stamp(d.PositionStartDate),close=stamp(d.ApplicationCloseDate);
  if(!url||!Number.isFinite(open)||!Number.isFinite(close)||open>now||close<=now||close<open){reject('invalid_or_closed');continue;}
  if(d.UserArea?.Details?.CopyrightRestriction||d.CopyrightRestriction||row.CopyrightRestriction){reject('restricted_metadata');continue;}
  if(seen.has(id))throw Error('duplicate_usajobs_control_number');seen.add(id);
  // Do not infer citizenship, remote status, or country from the search path.
  const loc=Array.isArray(d.PositionLocation)?d.PositionLocation:[];
  if(!loc.length||loc.some(x=>!['United States','US','USA'].includes(x?.CountryCode))){reject('outside_or_unknown_location');continue;}
  candidates.push({sourceId:'us-usajobs',sourceRef:id,advertisement:d.PositionID,title:d.PositionTitle,employer:d.OrganizationName,country:'United States',sourceUrl:url,opensAt:new Date(open).toISOString(),closesAt:new Date(close).toISOString(),observedAt:new Date(now).toISOString(),state:'candidate_only'});
 }
 return {received:s.SearchResultCount,totalReported:s.SearchResultCountAll,candidates,rejected,publicLaunchAuthorized:false,reviewState:'requires_review'};
}
export async function probeUsajobs({email,key,fetcher=fetch,now=Date.now()}={}){
 if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n]/.test(email)||typeof key!=='string'||key.length<12||key.length>500||/[\s\u0000-\u001f\u007f]/.test(key))throw Error('owner_authorized_usajobs_credentials_required');
 const url=new URL(API);url.search=new URLSearchParams({WhoMayApply:'Public',ResultsPerPage:'50',Page:'1',Fields:'Min'}).toString();
 const r=await fetcher(url.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':email,'Authorization-Key':key,'Accept':'application/json'}});
 if(r.status!==200||!/^application\/json\b/i.test(r.headers.get('content-type')||''))throw Error('usajobs_http_'+r.status);
 if(Number(r.headers.get('content-length')||0)>MAX)throw Error('usajobs_response_limit');
 const reader=r.body?.getReader();if(!reader)throw Error('usajobs_empty_body');
 const parts=[];let n=0;try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>MAX){await reader.cancel();throw Error('usajobs_response_limit');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const bytes=Buffer.concat(parts);return {...parseUsajobsPage(JSON.parse(bytes.toString('utf8')),now),snapshotSha256:createHash('sha256').update(bytes).digest('hex')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const r=await probeUsajobs({email:process.env.USAJOBS_REGISTERED_EMAIL,key:process.env.USAJOBS_API_KEY});console.log(JSON.stringify({received:r.received,totalReported:r.totalReported,eligibleCandidates:r.candidates.length,rejected:r.rejected,snapshotSha256:r.snapshotSha256,reviewState:r.reviewState}));}
 catch(e){console.error(String(e.message||e).replace(/[\r\n]/g,' ').slice(0,120));process.exitCode=1;}
}
