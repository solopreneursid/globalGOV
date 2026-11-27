// USAJOBS Historic JOA and Announcement Text public-data adapters.
// These two endpoints are documented as unauthenticated. Search Jobs is separate
// and still requires the owner's API key. This module performs one bounded page
// per request; it never crawls the 3m+ record corpus or writes to D1.
const HISTORIC_URL='https://data.usajobs.gov/api/historicjoa';
const TEXT_URL=HISTORIC_URL+'/announcementtext';
const MAX_HISTORY_BYTES=4*1024*1024;
const MAX_TEXT_BYTES=1500*1024;
const MAX_ROWS=1000;
const MAX_RANGE_DAYS=1096;
const SOURCE_DOC='https://developer.usajobs.gov/api-reference/get-api-historicjoa';
const TEXT_DOC='https://developer.usajobs.gov/api-reference/get-api-announcementtext';
const clean=(v,max=240)=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const field=(o,lower,upper)=>o?.[lower]??o?.[upper]??null;
const json=(body,status=200,cache='no-store')=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
class UpstreamError extends Error{constructor(code,status=502,retryAfter=null){super(code);this.code=code;this.status=status;this.retryAfter=retryAfter;}}
function dateOnly(v){
 if(typeof v!=='string')return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(v.trim());if(!m)return null;
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 const t=Date.UTC(y,mo-1,d);const x=new Date(t);
 return x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d&&y>=1901&&y<=2100?m[1]+'-'+m[2]+'-'+m[3]:null;
}
function toUsaDate(iso){const [y,m,d]=iso.split('-');return m+'-'+d+'-'+y;}
function parseInputDate(v,name,today){
 const date=dateOnly(v);if(!date)throw new Error('invalid_'+name);
 if(date>today)throw new Error('future_'+name);
 return date;
}
function parseDateRange(from,to,prefix,today){
 if(Boolean(from)!==Boolean(to))throw new Error('incomplete_'+prefix+'_range');
 if(!from)return null;
 const a=parseInputDate(from,prefix+'_from',today),b=parseInputDate(to,prefix+'_to',today);
 const days=(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;
 if(days<0||days>MAX_RANGE_DAYS)throw new Error('invalid_'+prefix+'_range');
 return {from:a,to:b};
}
function csv(value,name,pattern,max=8){
 if(!value)return null;
 if(value.length>300)throw new Error('invalid_'+name);
 const items=value.split(',').map(x=>x.trim().toUpperCase());
 if(items.length>max||items.some(x=>!pattern.test(x))||new Set(items).size!==items.length)throw new Error('invalid_'+name);
 return items.join(',');
}
function decodeCursor(value){
 if(!value)return null;
 if(value.length>512||/[\u0000-\u0020\u007f]/.test(value))throw new Error('invalid_cursor');
 let decoded;try{decoded=decodeURIComponent(value);}catch{throw new Error('invalid_cursor');}
 if(!/^[A-Za-z0-9_+/=-]{1,384}$/.test(decoded))throw new Error('invalid_cursor');
 return decoded;
}
function normalizeHistoryFilters(params,now=Date.now()){
 const allowed=new Set(['series','agency','department','announcementNumber','controlNumber','closeFrom','closeTo','openFrom','openTo','cursor']);
 for(const key of params.keys())if(!allowed.has(key))throw new Error('unsupported_filter');
 for(const key of allowed)if(params.getAll(key).length>1)throw new Error('duplicate_filter');
 const today=new Date(now).toISOString().slice(0,10);
 const series=csv(params.get('series')||'','series',/^[A-Z0-9]{2,12}$/);
 const agency=csv(params.get('agency')||'','agency',/^[A-Z0-9]{2,12}$/);
 const department=csv(params.get('department')||'','department',/^[A-Z0-9]{2,12}$/);
 const announcementNumber=csv(params.get('announcementNumber')||'','announcementNumber',/^[A-Z0-9][A-Z0-9._/-]{0,79}$/i,5);
 const controlNumber=params.get('controlNumber')||'';
 if(controlNumber&&!/^\d{1,20}$/.test(controlNumber))throw new Error('invalid_control_number');
 if(controlNumber&&announcementNumber)throw new Error('choose_one_exact_identifier');
 const close=parseDateRange(params.get('closeFrom'),params.get('closeTo'),'close',today);
 const open=parseDateRange(params.get('openFrom'),params.get('openTo'),'open',today);
 if(!controlNumber&&!announcementNumber&&!close)throw new Error('closed_date_range_required');
 const cursor=decodeCursor(params.get('cursor')||'');
 return {series,agency,department,announcementNumber,controlNumber,close,open,cursor};
}
function buildHistoricUrl(filters){
 const url=new URL(HISTORIC_URL),p=url.searchParams;
 if(filters.series)p.set('PositionSeries',filters.series);
 if(filters.agency)p.set('HiringAgencyCodes',filters.agency);
 if(filters.department)p.set('HiringDepartmentCodes',filters.department);
 if(filters.announcementNumber)p.set('AnnouncementNumbers',filters.announcementNumber);
 if(filters.controlNumber)p.set('USAJOBSControlNumbers',filters.controlNumber);
 if(filters.close){p.set('StartPositionCloseDate',toUsaDate(filters.close.from));p.set('EndPositionCloseDate',toUsaDate(filters.close.to));}
 if(filters.open){p.set('StartPositionOpenDate',toUsaDate(filters.open.from));p.set('EndPositionOpenDate',toUsaDate(filters.open.to));}
 if(filters.cursor)p.set('continuationtoken',filters.cursor);
 return url;
}
function numberOrNull(v){
 if(v===null||v===undefined||v==='')return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1e12?n:null;
}
function listRows(v,property,max=20){
 if(!Array.isArray(v))return [];
 return v.slice(0,max).map(x=>clean(x?.[property]??'',120)).filter(Boolean);
}
function normalizeHistoryRow(raw,now){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {error:'invalid_record'};
 const id=String(field(raw,'usajobsControlNumber','USAJOBSControlNumber')??'');
 const title=clean(field(raw,'positionTitle','PositionTitle'),240);
 const agency=clean(field(raw,'hiringAgencyName','HiringAgencyName'),200);
 const control=id;
 if(!/^\d{1,20}$/.test(control)||!title||!agency)return {error:'missing_identity'};
 const open=dateOnly(field(raw,'positionOpenDate','PositionOpenDate'));
 const close=dateOnly(field(raw,'positionCloseDate','PositionCloseDate'));
 const expireRaw=field(raw,'positionExpireDate','PositionExpireDate');
 const expire=dateOnly(expireRaw);
 const effectiveClose=expire||close;
 if(!effectiveClose)return {error:'missing_close_date'};
 const today=new Date(now).toISOString().slice(0,10);
 if(effectiveClose>today)return {error:'not_historical_yet'};
 const status=clean(field(raw,'positionOpeningStatus','PositionOpeningStatus'),120);
 if(/\b(accepting applications|currently open|receiving applications)\b/i.test(status))return {error:'status_conflicts_with_closed_date'};
 const locations=raw?.positionLocations??raw?.positionlocations??raw?.PositionLocations??[];
 const hiring=raw?.hiringPaths??raw?.hiringpaths??raw?.HiringPaths??[];
 const categories=raw?.jobCategories??raw?.jobcategories??raw?.JobCategories??[];
 const locs=Array.isArray(locations)?locations.slice(0,20).map(x=>({
  city:clean(field(x,'positionLocationCity','PositionLocationCity'),100),
  state:clean(field(x,'positionLocationState','PositionLocationState'),100),
  country:clean(field(x,'positionLocationCountry','PositionLocationCountry'),100)
 })).filter(x=>x.city||x.state||x.country):[];
 const paths=Array.isArray(hiring)?hiring.slice(0,20).map(x=>clean(field(x,'hiringPath','HiringPath'),140)).filter(Boolean):[];
 const series=Array.isArray(categories)?categories.slice(0,30).map(x=>clean(field(x,'series','Series'),20)).filter(Boolean):[];
 const minSalary=numberOrNull(field(raw,'minimumSalary','MinimumSalary'));
 const maxSalary=numberOrNull(field(raw,'maximumSalary','MaximumSalary'));
 return {controlNumber:control,announcementNumber:clean(field(raw,'announcementNumber','AnnouncementNumber'),100),
  title,agency,agencyCode:clean(field(raw,'hiringAgencyCode','HiringAgencyCode'),24),
  department:clean(field(raw,'hiringDepartmentName','HiringDepartmentName'),200),
  departmentCode:clean(field(raw,'hiringDepartmentCode','HiringDepartmentCode'),24),
  positionOpenDate:open,positionCloseDate:close,positionExpireDate:expire,effectiveCloseDate:effectiveClose,
  status:'historical_closed',sourceStatus:status,appointmentType:clean(field(raw,'appointmentType','AppointmentType'),100),
  workSchedule:clean(field(raw,'workSchedule','WorkSchedule'),100),payScale:clean(field(raw,'payScale','PayScale'),40),
  salaryType:clean(field(raw,'salaryType','SalaryType'),60),minimumSalary:minSalary,maximumSalary:maxSalary,
  minimumGrade:clean(field(raw,'minimumGrade','MinimumGrade'),30),maximumGrade:clean(field(raw,'maximumGrade','MaximumGrade'),30),
  promotionPotential:clean(field(raw,'promotionPotential','PromotionPotential'),30),
  totalOpenings:clean(field(raw,'totalOpenings','TotalOpenings'),40),whoMayApply:clean(field(raw,'whoMayApply','WhoMayApply'),240),
  hiringPaths:paths,series,locations:locs,teleworkEligible:clean(field(raw,'teleworkEligible','TeleworkEligible'),20),
  securityClearance:clean(field(raw,'securityClearance','SecurityClearance'),100),
  announcementClosingType:clean(field(raw,'announcementClosingTypeDescription','AnnouncementClosingTypeDescription'),100)};
}
export function parseUsajobsHistoricPage(body,now=Date.now()){
 const page=body?.paging?.metadata,items=body?.data;
 if(!page||!Array.isArray(items)||items.length>MAX_ROWS)throw new Error('historic_schema_changed');
 const total=Number(page.totalCount),size=Number(page.pageSize);
 if(!Number.isSafeInteger(total)||total<0||total>10000000||!Number.isSafeInteger(size)||size<1||size>MAX_ROWS||items.length>size)throw new Error('historic_paging_invalid');
 const records=[],rejected={},seen=new Set();
 const reject=k=>{rejected[k]=(rejected[k]||0)+1;};
 for(const raw of items){
  const row=normalizeHistoryRow(raw,now);
  if(row.error){reject(row.error);continue;}
  if(seen.has(row.controlNumber)){reject('duplicate_control_number');continue;}
  seen.add(row.controlNumber);records.push(row);
 }
 const token=page.continuationToken;
 if(token!==undefined&&token!==null&&token!=='')decodeCursor(String(token));
 return {records,rejected,totalCount:total,pageSize:size,nextCursor:token?String(token):null};
}
async function boundedJson(url,fetcher,limit){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const init={method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json','User-Agent':'globalGOV/2.8 (+https://github.com/solopreneursid/globalGOV)'}};
  let response=await fetcher(url.toString(),init);
  if(response.status>=300&&response.status<400){
   const location=response.headers.get('location');
   if(!location)throw new UpstreamError('upstream_redirect_rejected',502);
   let target;try{target=new URL(location,url);}catch{throw new UpstreamError('upstream_redirect_rejected',502);}
   if(target.protocol!=='https:'||target.origin!==url.origin||target.pathname!==url.pathname||target.username||target.password||target.hash)
    throw new UpstreamError('upstream_redirect_rejected',502);
   response=await fetcher(target.toString(),init);
   if(response.status>=300&&response.status<400)throw new UpstreamError('upstream_redirect_loop',502);
  }
  if(response.status===429)throw new UpstreamError('upstream_rate_limited',503,response.headers.get('retry-after'));
  if(!response.ok)throw new UpstreamError('upstream_http_'+response.status,502);
  if(!(response.headers.get('content-type')||'').toLowerCase().includes('json'))throw new UpstreamError('upstream_content_type_invalid',502);
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>limit)throw new UpstreamError('upstream_response_too_large',502);
  const reader=response.body?.getReader();
  if(!reader)throw new UpstreamError('upstream_empty_body',502);
  const chunks=[];let bytes=0;
  try{
   for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw new UpstreamError('upstream_response_too_large',502);}chunks.push(value);}
  }finally{reader.releaseLock();}
  const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}
  catch{throw new UpstreamError('upstream_json_invalid',502);}
 }catch(error){
  if(error instanceof UpstreamError)throw error;
  if(error?.name==='AbortError')throw new UpstreamError('upstream_timeout',504);
  throw new UpstreamError('upstream_unavailable',502);
 }finally{clearTimeout(timer);}
}
async function cached(request,ttl,task){
 const cache=globalThis.caches?.default;
 if(cache){
  const key=new Request(request.url,{method:'GET'});
  try{const hit=await cache.match(key);if(hit)return hit;}catch{}
  const response=await task();
  if(response.ok){try{const copy=response.clone();copy.headers.set('Cache-Control','public, max-age='+ttl+', s-maxage='+ttl);await cache.put(key,copy);}catch{}}
  return response;
 }
 return task();
}
function publicErrorCode(error){const code=error?.code||error?.message||'';return typeof code==='string'&&/^[a-z0-9_]{1,80}$/.test(code)?code:'upstream_unavailable';}
export async function handleUsajobsHistory(request,{fetcher=fetch,now=Date.now()}={}){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 let filters;
 try{filters=normalizeHistoryFilters(new URL(request.url).searchParams,now);}
 catch(error){return json({error:error.message},400);}
 return cached(request,300,async()=>{
  try{
   const upstream=buildHistoricUrl(filters);
   const body=await boundedJson(upstream,fetcher,MAX_HISTORY_BYTES);
   const parsed=parseUsajobsHistoricPage(body,now);
   return json({...parsed,retrievedAt:new Date(now).toISOString(),source:'USAJOBS Historic JOAs public data',sourceUrl:SOURCE_DOC,notice:'This page contains only records whose effective closing date has passed. Historical records are not open vacancies.'},200,'public, max-age=300, s-maxage=300');
  }catch(error){return json({error:publicErrorCode(error),retryAfter:error.retryAfter||null},error.status||502);}
 });
}
const TEXT_FIELDS=[
 ['summary','Summary'],['duties','Duties'],['hiringPathExplanation','Hiring path explanation'],
 ['majorDutiesList','Major duties'],['requirementsConditionsOfEmployment','Conditions of employment'],
 ['requirementsQualifications','Qualifications'],['requirementsEducation','Education'],
 ['requiredStandardDocuments','Standard required documents'],['requiredDocuments','Required documents'],
 ['howToApply','Historical application instructions'],['howToApplyNextSteps','Next steps'],
 ['requirements','Requirements'],['evaluations','Evaluations'],['benefits','Benefits'],
 ['otherInformation','Other information'],['appointmentTypeOverride','Appointment type details'],
 ['positionScheduleOverride','Schedule details'],['exclusiveClarificationText','Clarification']
];
function normalizeAnnouncementText(raw,controlNumber){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const id=String(field(raw,'usajobsControlNumber','USAJOBSControlNumber')??'');
 if(id!==controlNumber)return null;
 const fields={};let remaining=120000;const truncated=[];
 for(const [key,label] of TEXT_FIELDS){
  const value=field(raw,key,key[0].toUpperCase()+key.slice(1));
  if(typeof value!=='string'||!value.trim())continue;
  const text=value.replace(/\u0000/g,'').slice(0,Math.min(24000,remaining));
  if(text.length<value.length)truncated.push(key);
  if(text.trim())fields[key]={label,text};
  remaining-=text.length;if(remaining<=0)break;
 }
 return {controlNumber:id,announcementNumber:clean(field(raw,'announcementNumber','AnnouncementNumber'),100),
  positionOpenDate:dateOnly(field(raw,'positionOpenDate','PositionOpenDate')),
  positionCloseDate:dateOnly(field(raw,'positionCloseDate','PositionCloseDate')),fields,truncatedFields:truncated};
}
export function parseUsajobsAnnouncementText(body,controlNumber){
 if(!/^\d{1,20}$/.test(String(controlNumber)))throw new Error('invalid_control_number');
 const source=body?.data;
 const rows=Array.isArray(source)?source:source&&typeof source==='object'?[source]:body&&body.usajobsControlNumber?[body]:[];
 if(rows.length>10)throw new Error('announcement_text_schema_changed');
 const matches=rows.map(x=>normalizeAnnouncementText(x,String(controlNumber))).filter(Boolean);
 if(matches.length>1)throw new Error('duplicate_announcement_text');
 return matches[0]||null;
}
export async function handleUsajobsAnnouncementText(request,{fetcher=fetch,now=Date.now()}={}){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const params=new URL(request.url).searchParams;
 if([...params.keys()].some(k=>k!=='controlNumber')||params.getAll('controlNumber').length!==1)return json({error:'invalid_query'},400);
 const control=params.get('controlNumber')||'';
 if(!/^\d{1,20}$/.test(control))return json({error:'invalid_control_number'},400);
 return cached(request,3600,async()=>{
  try{
   const url=new URL(TEXT_URL);url.searchParams.set('USAJOBSControlNumbers',control);
   const body=await boundedJson(url,fetcher,MAX_TEXT_BYTES);
   const announcement=parseUsajobsAnnouncementText(body,control);
   return json({announcement,retrievedAt:new Date(now).toISOString(),source:'USAJOBS Announcement Text public data',sourceUrl:TEXT_DOC,notice:'Archived announcement text is provided for research. It is not an active application instruction.'},200,'public, max-age=3600, s-maxage=3600');
  }catch(error){return json({error:publicErrorCode(error),retryAfter:error.retryAfter||null},error.status||502);}
 });
}
export const USAJOBS_HISTORY_SOURCE_DOC=SOURCE_DOC;
export const USAJOBS_ANNOUNCEMENT_TEXT_DOC=TEXT_DOC;
