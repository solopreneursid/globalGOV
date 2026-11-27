// Conservative document extraction for the private review queue. No publication,
// candidate-data persistence, inferred deadlines, or access-control bypass.
import {createHash} from 'node:crypto';
import {extractPostTableCandidates} from './recruitment-post-tables.mjs';
export const DOCUMENT_SOURCES=Object.freeze({
 'india-sdsc-shar':Object.freeze({authority:'Satish Dhawan Space Centre SHAR / Department of Space',host:'apps.shar.gov.in',policy:'https://apps.shar.gov.in/Recruitment/copyright.jsp',paths:[/^\/sdscshar\/(?:advt_[0-9_]+|apprentice|notice)\/[^/]+\.pdf$/i,/^\/Recruitment[0-9_]*\/css\/images\/[^/]+\.pdf$/i]})
});
export function officialDocumentUrl(sourceId,raw){
 const s=DOCUMENT_SOURCES[sourceId];if(!s||typeof raw!=='string'||raw.length>1500)throw Error('unsupported_document_source');
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.hostname!==s.host||u.port||u.username||u.password||u.search||u.hash||!s.paths.some(p=>p.test(u.pathname))||/%(?:2f|5c|00)/i.test(u.pathname))throw Error('document_url_not_allowlisted');
 return u.href;
}
const sha=b=>createHash('sha256').update(b).digest('hex');
const MAX_TEXT=2*1024*1024;
const labels={
 advertisement:/^(?:advertisement|advt\.?|advertisement reference)\s*(?:no\.?|number|reference)\s*[:.-]?\s+(.+)$/i,
 authority:/^(?:recruitment authority|issuing authority|employer)\s*:\s*(.+)$/i,
 post:/^(?:name of (?:the )?post|post name|post)\s*:\s*(.+)$/i,
 vacancies:/^(?:number of (?:posts|vacancies)|total vacancies|vacancies)\s*:\s*(.+)$/i,
 qualification:/^(?:essential (?:educational )?qualifications?|educational qualifications?|qualification)\s*:\s*(.+)$/i,
 age:/^(?:age limit|age limits|age requirement)\s*:\s*(.+)$/i,
 ageCutoff:/^(?:age as on|age reckoned as on|eligibility cutoff date)\s*:\s*(.+)$/i,
 fee:/^(?:application fee|examination fee|fee)\s*:\s*(.+)$/i,
 salary:/^(?:pay scale|pay level|salary|pay matrix)\s*:\s*(.+)$/i,
 opening:/^(?:application opening date|opening date|registration starts on|starting date for online registration)\s*[:.-]?\s+(.+)$/i,
 closing:/^(?:application closing date|closing date|registration closes on|last date(?: for (?:submission of )?(?:online )?applications?)?)\s*[:.-]?\s+(.+)$/i,
 examDate:/^(?:exam(?:ination)? date|written test date|date of examination)\s*:\s*(.+)$/i
};
const eventPatterns=[
 ['corrigendum',/^(?:corrigendum|addendum)\b/i],
 ['admit_card',/^(?:notice\s*:\s*)?(?:click here to download|download|release of|publication of)\s+(?:the\s+)?admit cards?\b/i],
 ['result',/^(?:notice\s*:\s*)?(?:result(?:s)?\s+(?:declared|published)|publication of results|list of candidates (?:empanelled|selected))\b/i],
 ['exam_schedule',/^(?:notice\s*:\s*)?(?:schedule of (?:the )?(?:written test|examination)|written test through online computer based test)\b/i],
 ['answer_key',/^(?:notice\s*:\s*)?(?:release of|publication of)\s+(?:the\s+)?answer key\b/i],
 ['cancellation',/^(?:notice\s*:\s*)?(?:cancellation of|withdrawal of)\s+(?:the\s+)?(?:recruitment|advertisement|examination)\b/i]
];
export function indiaCalendarDate(raw){
 if(typeof raw!=='string')return null;
 const m=/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?:\s*\((\d{2}):(\d{2})\s*(?:hrs\.?)?\))?$/i.exec(raw.trim());
 if(!m)return null;
 const [d,month,y]=m.slice(1,4).map(Number),dt=new Date(Date.UTC(y,month-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==d)return null;
 const date=dt.toISOString().slice(0,10),hh=m[4],mm=m[5];
 if(hh!==undefined&&(Number(hh)>23||Number(mm)>59))return null;
 return {date,timezone:'Asia/Kolkata',precision:hh===undefined?'date':'minute',instant:hh===undefined?null:new Date(date+'T'+hh+':'+mm+':00+05:30').toISOString()};
}
export function extractRecruitmentEvidence({sourceId,sourceUrl,documentBytes,text,observedAt=new Date().toISOString(),provenance='local_unverified'}){
 const url=officialDocumentUrl(sourceId,sourceUrl);
 if(!(documentBytes instanceof Uint8Array)||!documentBytes.length||documentBytes.length>10*1024*1024)throw Error('invalid_document_bytes');
 if(typeof text!=='string'||Buffer.byteLength(text)>MAX_TEXT||!text.trim())throw Error('empty_or_oversize_document_text');
 if(!['local_unverified','official_https_fetch'].includes(provenance)||!Number.isFinite(Date.parse(observedAt)))throw Error('invalid_provenance');
 const pages=text.split('\f');if(pages.length>101)throw Error('document_page_limit');
 const candidates={},events=[];
 for(const [pi,page] of pages.entries()){
  const lines=page.split(/\r?\n/);
  for(const [li,original] of lines.entries()){
   const line=original.trim().replace(/[ \t]+/g,' ');
   if(!line||line.length>1000)continue;
   for(const [key,regex] of Object.entries(labels)){
    const match=regex.exec(line)||(key==='advertisement'?/^(?:No\.\s*)?(SDSC SHAR\/RMT\/\d{2}\/20\d{2})\s*$/i.exec(line):null);if(!match)continue;
    const raw=match[1].trim();if(!raw||raw.length>500)continue;
    const value=['opening','closing','examDate','ageCutoff'].includes(key)?indiaCalendarDate(raw):key==='vacancies'?(/^[1-9]\d{0,5}$/.test(raw)?Number(raw):null):raw;
    (candidates[key]??=[]).push({value,raw,page:pi+1,line:li+1});
   }
   // SDSC SHAR official reopening notice: an explicitly stated replacement
   // application window is not the original window or eligibility cutoff.
   // Join up to three adjacent extracted lines within the same page only.
   const combined=lines.slice(li,li+3).map(s=>s.trim().replace(/[ \t]+/g,' ')).join(' ');
   const range=/^(?:It is hereby informed that the )?online application portal is hereby reopened from\s+(\d{1,2}\.\d{1,2}\.20\d{2})\s+(\d{2}:\d{2})\s*hrs\.?\s+to\s+(\d{1,2}\.\d{1,2}\.20\d{2})\s+(\d{2}:\d{2})\s*hrs\.?/i.exec(combined);
   if(range){
    const start=indiaCalendarDate(range[1]+' ('+range[2]+' hrs)'),end=indiaCalendarDate(range[3]+' ('+range[4]+' hrs)');
    if(start&&end&&start.instant<=end.instant){
     (candidates.reopenedWindow??=[]).push({value:{start,end},raw:range[0],page:pi+1,line:li+1,lineEnd:Math.min(lines.length,li+3)});
     events.push({type:'application_reopened',page:pi+1,line:li+1});
    }else (candidates.reopenedWindow??=[]).push({value:null,raw:range[0],page:pi+1,line:li+1});
   }
   const cutoff=/^(?:All other terms and conditions of the said advertisement remain unchanged\.\s*)?The eligibility criteria \(Essential Qualifications, Age etc\.\) for the advertised posts will continue to be reckoned as on\s+(\d{1,2}\.\d{1,2}\.20\d{2})/i.exec(combined);
   if(cutoff)(candidates.ageCutoff??=[]).push({value:indiaCalendarDate(cutoff[1]),raw:cutoff[0],page:pi+1,line:li+1,lineEnd:Math.min(lines.length,li+3)});
   // Only short status headings, never names, registration numbers or result lists.
   for(const [type,regex] of eventPatterns)if(regex.test(line)&&line.length<=180)events.push({type,page:pi+1,line:li+1});
  }
 }
 const fields={},conflicts=[];
 for(const [key,items] of Object.entries(candidates)){
  const unique=new Set(items.map(x=>JSON.stringify(x.value??x.raw)));
  if(unique.size===1&&items[0].value!==null)fields[key]=items[0];
  else conflicts.push(key);
 }
 const opening=fields.opening?.value,closing=fields.closing?.value;
 if(opening&&closing&&opening.date>closing.date)conflicts.push('application_date_order');
 const postTables=extractPostTableCandidates(text);
 // Do not attach document-level qualification, age or fee to every post.
 // Rows are scoped by their own explicit code, and remain review candidates.
 const stageEvents=fields.advertisement&&!conflicts.includes('advertisement')?events.map(e=>({...e,advertisement:fields.advertisement.value,state:'candidate_only'})):[];
 return {schemaVersion:1,sourceId,authority:DOCUMENT_SOURCES[sourceId].authority,sourceUrl:url,policyUrl:DOCUMENT_SOURCES[sourceId].policy,documentSha256:sha(documentBytes),textSha256:sha(Buffer.from(text)),observedAt,provenance,fields,candidates,postTables,conflicts:[...new Set(conflicts)],events:stageEvents,reviewState:'requires_review',publicLaunchAuthorized:false,limitations:['Label and limited fixed-column extraction only; complex tables, prose, translations and per-post requirements may require review.','No inferred dates, eligibility or stage transitions.','No document or candidate data is published.']};
}
