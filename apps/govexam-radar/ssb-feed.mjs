// First-party SSB recruitment advertisement metadata, with attribution.
// No POST, form submission, external link following or third-party materials.
import {clean,ingestIndianSnapshot,indianSnapshotGate} from './isro-feed.mjs';
export const SSB_SOURCE=Object.freeze({
 id:'india-ssb-recruitment',name:'Sashastra Seema Bal (SSB)',country:'India',
 url:'https://recruitment.ssb.gov.in/adv_newsUrl',robots:'https://recruitment.ssb.gov.in/robots.txt',
 termsUrl:'https://recruitment.ssb.gov.in/websitepolicyUrl',maxHtml:2*1024*1024
});
function day(input){
 const m=/^(\d{2})\/(\d{2})\/(20\d{2})$/.exec(clean(input));
 if(!m)return null;
 const [d,month,y]=m.slice(1).map(Number),date=new Date(Date.UTC(y,month-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===month-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):null;
}
const headings=['sr. no.','advertisement number','advertisement for the post of','opening date','closing date','view advertisement','apply'];
export function parseSsbTable(html,now=Date.now()){
 if(typeof html!=='string'||new TextEncoder().encode(html).length>SSB_SOURCE.maxHtml)throw Error('invalid_ssb_source_size');
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
 const candidates=tables.filter(x=>{
  const first=[...x[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)][0]?.[1]||'';
  const columns=[...first.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]\s*>/gi)].map(c=>clean(c[1]).toLowerCase());
  return columns.length===headings.length&&columns.every((c,i)=>c===headings[i]);
 });
 if(candidates.length!==1)throw Error('unsupported_ssb_table_schema');
 const rows=[...candidates[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].slice(1);
 if(!rows.length||rows.length>500)throw Error('ssb_row_count_unconfirmed');
 const valid=[],rejected={},seen=new Set();
 const reject=k=>{rejected[k]=(rejected[k]||0)+1;};
 for(const row of rows){
  const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(x=>x[1]);
  if(cells.length!==7||!/^\d+$/.test(clean(cells[0])))throw Error('ssb_row_schema_changed');
  const number=clean(cells[1]),title=clean(cells[2]),opening=day(cells[3]),closing=day(cells[4]);
  if(!number||number.length>180||!title||title.length>500||!opening||!closing){reject('missing_or_invalid_fields');continue;}
  // Require the authority's own advertisement number, not a third-party item.
  if(!/\/SSB\//i.test(number)){reject('unknown_owner');continue;}
  const opens=Date.parse(opening+'T00:00:00+05:30'),closes=Date.parse(closing+'T23:59:59+05:30');
  if(opens>now||closes<=now||closes<opens||closes>now+2*365*86400000){reject('not_current');continue;}
  if(seen.has(number))throw Error('ambiguous_ssb_advertisement_number');
  seen.add(number);
  valid.push({sourceId:SSB_SOURCE.id,sourceRef:number,title,employer:SSB_SOURCE.name,country:'India',region:'India',stream:'Unclassified',sourcePage:SSB_SOURCE.url,applyUrl:SSB_SOURCE.url,publishedAt:new Date(opens).toISOString(),closingAt:new Date(closes).toISOString(),jurisdictionCode:'IN',jurisdictionName:'India',governmentTier:'national',employerType:'government_agency'});
 }
 if(valid.length>200)throw Error('ssb_open_row_limit');
 return {valid,recognized:rows.length,received:rows.length,rejected};
}
export async function ingestSsb(db,fetcher=fetch,now=Date.now(),options={}) {
 const policy=options.sourcePolicy||SSB_SOURCE;
 if(policy.automatedAccessStatus!=='approved'||options.automatedAccessApproved!==true){
  if(!db)throw Error('database_binding_required');
  const id=crypto.randomUUID(),details=JSON.stringify({
   origin:'scheduled',snapshot:'blocked',policyStatus:policy.automatedAccessStatus||'not_assessed',
   reason:'Automated access is not approved; no HTTP request was made.'
  });
  const result={id,sourceId:SSB_SOURCE.id,startedAt:now,finishedAt:Date.now(),state:'error',
   httpStatus:null,received:0,accepted:0,discarded:0,errorCode:'automated_access_not_approved'};
  try{
   await db.prepare('INSERT INTO source_ingest_runs(id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,SSB_SOURCE.id,result.startedAt,result.finishedAt,'error',null,0,0,0,result.errorCode,details).run();
  }catch(error){
   result.errorCode='audit_write_failed';
   console.error(JSON.stringify({event:'ssb_policy_block_audit_failed',reason:String(error?.message||error)}));
  }
  return result;
 }
 return ingestIndianSnapshot(policy,parseSsbTable,db,fetcher,now);
}
export async function ssbPublicationGate(db,now=Date.now(),policy=SSB_SOURCE) {
 if(policy.automatedAccessStatus!=='approved')return {ready:false,reason:'automated_access_unconfirmed'};
 return indianSnapshotGate(SSB_SOURCE.id,db,now);
}
