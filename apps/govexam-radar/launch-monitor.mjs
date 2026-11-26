// Standalone, read-only monitoring for a separately operated server.
// No hosted monitoring account, credentials, analytics, or outgoing messages.
import {pathToFileURL} from 'node:url';

const UK='uk-dfe-teaching-vacancies',ISRO='india-isro-opportunities',SSB='india-ssb-recruitment';
const ALLOWED=new Set([UK,ISRO,SSB]);
export function checkSnapshot(snapshot,now=Date.now()){
 const errors=[];
 if(snapshot.health?.status!=='ok'||snapshot.health?.service!=='hqventures-govradar')errors.push('health_failed');
 const feed=snapshot.notices;
 if(feed?.releaseProfile!=='approved_staging'||feed?.publicLaunchAuthorized!==false)errors.push('release_scope_invalid');
 if(!Array.isArray(feed?.notices)||!Array.isArray(feed?.sources))errors.push('notice_response_invalid');
 if(!feed?.sources?.some(x=>x.id==='uk-dfe-teaching-vacancies'))errors.push('approved_source_missing');
 for(const source of feed?.sources||[])if(!ALLOWED.has(source.id)||source.commercialReuseApprovedForCurrentFields!==true)errors.push('unapproved_source_metadata');
 for(const row of feed?.notices||[]){
  if(!ALLOWED.has(row.sourceId))errors.push('unapproved_notice_source');
  if(!Number.isFinite(Date.parse(row.closingAt))||Date.parse(row.closingAt)<=now)errors.push('expired_or_invalid_notice');
  const maxAge=row.sourceId!==UK?5*3600000:14*86400000;
  if(!Number.isFinite(Number(row.lastSeenAt))||Number(row.lastSeenAt)<now-maxAge)errors.push('stale_notice');
  try{const url=new URL(row.sourceUrl);const uk=row.sourceId===UK&&url.hostname==='teaching-vacancies.service.gov.uk'&&url.pathname.startsWith('/jobs/');const isro=row.sourceId===ISRO&&row.country==='India'&&url.hostname==='www.isro.gov.in'&&/^\/[A-Za-z0-9_/-]+\.html$/i.test(url.pathname)&&!url.search&&!url.hash;const ssb=row.sourceId===SSB&&row.country==='India'&&url.hostname==='recruitment.ssb.gov.in'&&url.pathname==='/adv_newsUrl'&&!url.search&&!url.hash;if(url.protocol!=='https:'||url.username||url.password||(!uk&&!isro&&!ssb))errors.push('unsafe_notice_url');}
  catch{errors.push('unsafe_notice_url');}
 }
 if(snapshot.india?.filters?.country!=='India'||!Array.isArray(snapshot.india?.notices)||(snapshot.india.notices||[]).some(x=>![ISRO,SSB].includes(x.sourceId)||x.country!=='India'))errors.push('india_notices_not_approved');
 if(!Array.isArray(snapshot.changes?.changes)||(snapshot.changes.changes||[]).some(x=>!ALLOWED.has(x.sourceId)))errors.push('change_scope_invalid');
 if(snapshot.ingestion?.automation?.healthy!==true)errors.push('source_ingestion_not_fresh');
 if(!snapshot.privacy||!snapshot.terms)errors.push('policy_page_unavailable');
 return [...new Set(errors)];
}
export async function monitor(origin,fetcher=fetch){
 let url;try{url=new URL(origin);}catch{throw Error('Provide an HTTPS site origin, for example https://example.org');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('A plain HTTPS origin is required');
 const paths={health:'/api/health',notices:'/api/notices?limit=50',india:'/api/notices?country=India',changes:'/api/notice-changes?limit=30',ingestion:'/api/ingestion-status',privacy:'/privacy',terms:'/terms'};
 const snapshot={};const failed=[];
 await Promise.all(Object.entries(paths).map(async([key,path])=>{
  try{
   const response=await fetcher(url.origin+path,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:key==='privacy'||key==='terms'?'text/html':'application/json'}});
   if(!response.ok)throw Error('http_'+response.status);
   snapshot[key]=key==='privacy'||key==='terms'?(await response.text()).includes('connect@yorphives.com'):await response.json();
  }catch{failed.push(key+'_request_failed');}
 }));
 const failures=[...new Set([...failed,...checkSnapshot(snapshot)])];
 return {status:failures.length?'error':'ok',checkedAt:new Date().toISOString(),failures};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const report=await monitor(process.argv[2]);if(report.failures.length)report.status='error';console.log(JSON.stringify(report));if(report.status!=='ok')process.exitCode=1;}
 catch(error){console.error(JSON.stringify({status:'error',error:String(error.message||error)}));process.exitCode=1;}
}
