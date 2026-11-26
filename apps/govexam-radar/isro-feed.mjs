// ISRO's own recruitment table.  The source permits accurate, attributed reuse
// of ISRO/DOS material; excluded third-party organisations remain excluded.
// No rows are exposed until the separate native-schedule release gate passes.
export const ISRO_SOURCE=Object.freeze({
 id:'india-isro-opportunities',name:'Indian Space Research Organisation (ISRO)',
 url:'https://www.isro.gov.in/ViewAllOpportunities.html',host:'www.isro.gov.in',
 robots:'https://www.isro.gov.in/robots.txt',
 termsUrl:'https://www.isro.gov.in/Website_Policy.html',country:'India'
});
const MAX_HTML=500000,MAX_ROBOTS=8192,MAX_ROWS=500,MAX_OPEN=200;
export const clean=value=>String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')
 .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39|rsquo|lsquo|ldquo|rdquo|ndash|mdash|bull);/gi,s=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&rsquo;':"'",'&lsquo;':"'",'&ldquo;':'"','&rdquo;':'"','&ndash;':'–','&mdash;':'—','&bull;':'•'}[s.toLowerCase()]||' '))
 .replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const p=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return p>0&&p<=0x10ffff?String.fromCodePoint(p):' ';})
 .replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
const monthNames={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
function day(value){
 const m=/^([a-z]+)\s+(\d{1,2}),\s*(20\d\d)$/i.exec(clean(value));if(!m)return null;
 const month=monthNames[m[1].toLowerCase()],date=Number(m[2]),year=Number(m[3]);if(!month||year<2024||year>2045)return null;
 const utc=new Date(Date.UTC(year,month-1,date));
 return utc.getUTCFullYear()===year&&utc.getUTCMonth()===month-1&&utc.getUTCDate()===date?utc.toISOString().slice(0,10):null;
}
// Only ISRO and Department of Space organisations; no autonomous institutions,
// linked employers, logos, or other third-party material are imported.
const owners=[/^department of space\b/i,/^u\s*r\s*rao satellite centre\b/i,/^satish\s*dhawan space centre\b/i,/^human space flight centre\b/i,/^liquid propulsion systems centre\b/i,/^isro propulsion complex\b/i,/^space applications centre\b/i,/^centralised recruitment\b/i,/^national remote sensing centre\b/i,/^isro telemetry,?\s*tracking and command network\b/i,/^vikram sarabhai space centre\b/i,/^isro headquarters\b/i];
const thirdParty=/\b(?:antrix|newspace|nsil|physical research laboratory|prl|iist|indian institute of space science|nesac|north eastern space applications centre|semi-conductor laboratory|national atmospheric research laboratory|narl)\b/i;
function sourceUrl(cell){
 const match=cell.match(/window\.location\.href\s*=\s*['"]([^'"<>]+)['"]/i);if(!match)return null;
 try{const url=new URL(match[1],ISRO_SOURCE.url);if(url.protocol!=='https:'||url.hostname!==ISRO_SOURCE.host||url.username||url.password||url.search||url.hash||!/^\/[A-Za-z0-9_/-]+\.html$/i.test(url.pathname))return null;return url.toString();}catch{return null;}
}
const streamFor=value=>/\b(engineer|scientist|technical|technician|software|developer|programmer|IT|computer|radiographer|nurse)\b/i.test(value)?'Technical':'Unclassified';
export function parseIsroTable(html,now=Date.now()){
 if(typeof html!=='string'||new TextEncoder().encode(html).length>MAX_HTML)throw Error('invalid_isro_source_size');
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
 const table=tables.find(x=>/advertisement\s*number/i.test(clean(x[1]))&&/last\s*date\s*of\s*submission/i.test(clean(x[1]))&&/opening\s*date/i.test(clean(x[1])));
 if(!table)throw Error('unsupported_isro_table_schema');
 const rows=[...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];if(rows.length>MAX_ROWS)throw Error('isro_row_limit');
 const valid=[],rejected={},seen=new Set();let recognized=0;
 const reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;};
 for(const match of rows){
  const cells=[...match[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)];if(!cells.length)continue;
  const get=name=>cells.find(x=>{const c=/\bclass\s*=\s*['"]([^'"]*)['"]/i.exec(x[1]);return c?.[1].split(/\s+/).includes(name);})?.[2];
  const location=get('location'),post=get('post'),advert=get('advNo'),opening=get('openDate'),closing=get('closeDate'),details=get('moreDetails');
  if([location,post,advert,opening,closing,details].some(x=>x===undefined))throw Error('isro_row_schema_changed');
  recognized++;
  const employer=clean(location),title=clean(post),number=clean(advert);
  // Do not shorten source text: truncating a title or reference can remove a
  // qualification or change its meaning. Skip unexpectedly long rows.
  if(employer.length>200||title.length>220||number.length>100){reject('field_too_long');continue;}
  if(!owners.some(re=>re.test(employer))||thirdParty.test(title)){reject('third_party_or_unknown_owner');continue;}
  const openDay=day(opening),closeDay=day(closing),url=sourceUrl(details);
  if(!title||!number||!openDay||!closeDay||!url){reject('missing_or_invalid_fields');continue;}
  const opens=Date.parse(openDay+'T00:00:00+05:30'),closes=Date.parse(closeDay+'T23:59:59+05:30');
  if(opens>now||closes<=now||closes<opens||closes>now+2*365*86400000){reject('not_current');continue;}
  const ref=number+'|'+url;if(seen.has(ref)){reject('duplicate');continue;}seen.add(ref);
  valid.push({sourceId:ISRO_SOURCE.id,sourceRef:ref,title,employer,country:'India',region:employer,
   stream:streamFor(title),sourcePage:url,applyUrl:url,publishedAt:new Date(opens).toISOString(),
   closingAt:new Date(closes).toISOString(),jurisdictionCode:'IN',jurisdictionName:'India',governmentTier:'national',employerType:'government_agency'});
 }
 if(!recognized)throw Error('isro_no_recognized_rows');
 if(valid.length>MAX_OPEN)throw Error('isro_open_row_limit');
 return {valid,recognized,rejected,received:recognized};
}
async function bounded(response,max){
 if(Number(response.headers.get('content-length')||0)>max)throw Error('source_too_large');
 const reader=response.body?.getReader();if(!reader)throw Error('source_empty_body');
 const decoder=new TextDecoder();let bytes=0,text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw Error('source_too_large');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
async function fetchSnapshot(fetcher,source=ISRO_SOURCE){
 const options={method:'GET',redirect:'manual',headers:{'Accept':'text/plain,text/html','User-Agent':'GlobalGovJobsSourceCheck/1.0'}};
 const robots=await fetcher(source.robots,{...options,signal:AbortSignal.timeout(12000)});
 if(robots.status!==404&&robots.status!==200)throw Error('robots_http_'+robots.status);
 if(robots.status===404){try{await robots.body?.cancel();}catch{}}
 if(robots.status===200){const body=await bounded(robots,MAX_ROBOTS);if(!/text\/plain/i.test(robots.headers.get('content-type')||'')||/<\s*(?:html|doctype)\b/i.test(body))throw Error('robots_not_plain_text');if(body.split(/\r?\n/).some(line=>/^\s*disallow\s*:\s*[^\s#]/i.test(line)))throw Error('robots_rule_review_required');}
 const response=await fetcher(source.url,{...options,signal:AbortSignal.timeout(12000)});
 if(response.status!==200)throw Error('source_http_'+response.status);
 if(!/html/i.test(response.headers.get('content-type')||''))throw Error('unexpected_source_type');
 return bounded(response,source.maxHtml||MAX_HTML);
}
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function ingestIsro(db,fetcher=fetch,now=Date.now()){
 return ingestIndianSnapshot(ISRO_SOURCE,parseIsroTable,db,fetcher,now);
}
export async function ingestIndianSnapshot(source,parse,db,fetcher=fetch,now=Date.now()){
 if(!['india-isro-opportunities','india-ssb-recruitment'].includes(source.id))throw Error('unknown_snapshot_source');
 if(!db)throw Error('database_binding_required');
 const result={id:crypto.randomUUID(),sourceId:source.id,startedAt:now,finishedAt:now,state:'error',httpStatus:null,received:0,accepted:0,discarded:0,errorCode:null};
 let info={origin:'scheduled'};
 // A crash or timeout during collection must close the release gate. Record
 // an error-state attempt before touching source rows, then finalize it.
 try{
  const claim=await db.prepare('INSERT INTO source_ingest_runs(id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(result.id,result.sourceId,now,now,'error',null,0,0,0,'isro_collection_pending',JSON.stringify({origin:'scheduled',snapshot:'pending'})).run();
  if(claim?.success!==true&&claim?.meta?.changes!==1)throw Error('audit_claim_failed');
 }catch(error){console.error(JSON.stringify({event:'isro_audit_claim_failed',reason:String(error?.message||error)}));return {...result,errorCode:'audit_claim_failed'};}
 try{
  const html=await fetchSnapshot(fetcher,source),parsed=parse(html,now);result.httpStatus=200;result.received=parsed.received;result.discarded=Object.values(parsed.rejected).reduce((a,b)=>a+b,0);
  for(let i=0;i<parsed.valid.length;i+=20){
   const batch=await Promise.all(parsed.valid.slice(i,i+20).map(async row=>{
    const id=source.id+':'+(await digest(row.sourceRef)).slice(0,32),hash=await digest(JSON.stringify([row.sourceRef,row.title,row.employer,row.closingAt]));
    return db.prepare("INSERT INTO official_job_notices(id,source_id,source_ref,title,employer,country,region,stream,apply_url,source_page,published_at,closing_at,first_seen_at,last_seen_at,evidence_sha256,review_state,life_status,jurisdiction_code,jurisdiction_name,government_tier,employer_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,employer=excluded.employer,region=excluded.region,stream=excluded.stream,published_at=excluded.published_at,closing_at=excluded.closing_at,last_seen_at=excluded.last_seen_at,evidence_sha256=excluded.evidence_sha256,life_status='open' WHERE excluded.last_seen_at>=official_job_notices.last_seen_at")
     .bind(id,row.sourceId,row.sourceRef,row.title,row.employer,row.country,row.region,row.stream,row.applyUrl,row.sourcePage,row.publishedAt,row.closingAt,now,now,hash,'official_feed_unreviewed','open',row.jurisdictionCode,row.jurisdictionName,row.governmentTier,row.employerType);
   }));const writes=await db.batch(batch);if(writes.some(x=>x?.success===false))throw Error('snapshot_write_failed');
  }
  result.accepted=parsed.valid.length;result.state='ok';info={origin:'scheduled',snapshot:'complete',rejected:parsed.rejected};
 }catch(error){result.errorCode=String(error?.message||error).slice(0,100);console.error(JSON.stringify({event:'isro_ingestion_failed',reason:result.errorCode}));}
 finally{
  result.finishedAt=Date.now();
  try{
   const saved=await db.prepare('UPDATE source_ingest_runs SET finished_at=?,state=?,http_status=?,received=?,accepted=?,discarded=?,error_code=?,details=? WHERE id=? AND source_id=? AND error_code=?').bind(result.finishedAt,result.state,result.httpStatus,result.received,result.accepted,result.discarded,result.errorCode,JSON.stringify(info),result.id,result.sourceId,'isro_collection_pending').run();
   if(saved?.meta?.changes!==1)throw Error('audit_finalize_failed');
  }
  catch(error){result.state='error';result.errorCode='audit_write_failed';console.error(JSON.stringify({event:'isro_audit_failed',reason:String(error?.message||error)}));}
  console.log(JSON.stringify({event:'isro_ingestion',state:result.state,received:result.received,accepted:result.accepted,errorCode:result.errorCode}));
 }
 return result;
}

// Two *most recent* native runs must both succeed, be recent, and prove the
// whole source table was parsed. An error immediately closes the gate. This
// gate is not configurable through any public request parameter.
export async function isroPublicationGate(db,now=Date.now()){
 return indianSnapshotGate(ISRO_SOURCE.id,db,now);
}
export async function indianSnapshotGate(sourceId,db,now=Date.now()){
 if(!['india-isro-opportunities','india-ssb-recruitment'].includes(sourceId))return {ready:false,reason:'unknown_source'};
 if(!db)return {ready:false,reason:'database_unavailable'};
 try{
  const r=await db.prepare("SELECT started_at AS startedAt,finished_at AS finishedAt,state,details FROM source_ingest_runs WHERE source_id=? AND started_at>=? AND details LIKE '%\"origin\":\"scheduled\"%' ORDER BY started_at DESC,finished_at DESC LIMIT 2").bind(sourceId,now-8*3600000).all();
  const rows=r.results||[],latest=rows[0];
  // Retries or duplicate delivery of one Cron event cannot count as two
  // independent cycles. Normal runs are three hours apart; allow one hour
  // of scheduling variation while still requiring genuinely separate checks.
  const ready=rows.length===2&&rows.every(x=>x.state==='ok'&&String(x.details).includes('"snapshot":"complete"'))&&Number.isSafeInteger(latest?.startedAt)&&Number.isSafeInteger(rows[1]?.startedAt)&&latest.startedAt-rows[1].startedAt>=2*3600000&&Number.isSafeInteger(latest?.finishedAt)&&latest.startedAt>0&&latest.finishedAt>=latest.startedAt&&now-latest.finishedAt<=5*3600000&&latest.finishedAt<=now+60000;
  return {ready,snapshotAt:ready?latest.startedAt:null,lastCheckAt:latest?.finishedAt||null,successfulCycles:rows.filter(x=>x.state==='ok').length};
 }catch(error){console.error(JSON.stringify({event:'isro_gate_failed',reason:String(error?.message||error).slice(0,120)}));return {ready:false,reason:'gate_unavailable'};}
}
