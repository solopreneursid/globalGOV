// Research-only event discovery. Only announcement headings, no result PDFs,
// applicant identities, downloads, cookies or login sessions.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {bounded,checkDocumentRobots} from './recruitment-document.mjs';
export const EVENT_INDEX='https://apps.shar.gov.in/sdscshar/result1.jsp';
const MAX=512*1024;
const sha=b=>createHash('sha256').update(b).digest('hex');
const clean=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const patterns=[
 ['admit_card',/\b(?:download|release of|publication of)\s+(?:the\s+)?admit cards?\b/i],
 ['result',/\b(?:list of candidates (?:empanelled|selected|shortlisted)|results? (?:declared|published)|publication of results)\b/i],
 ['exam_schedule',/\b(?:schedule of (?:the )?(?:written test|examination)|written test through online computer based test|dates for (?:document verification|skill test))\b/i],
 ['answer_key',/\b(?:release of|publication of)\s+(?:the\s+)?answer key\b/i],
 ['corrigendum',/\bcorrigendum\b/i],
 ['cancellation',/\b(?:cancellation|withdrawal) of (?:the )?(?:recruitment|advertisement|examination)\b/i]
];
export function parseEventIndex(html,observedAt=new Date().toISOString()){
 if(typeof html!=='string'||Buffer.byteLength(html)>MAX||!Number.isFinite(Date.parse(observedAt)))throw Error('invalid_event_index');
 if(!/SDSC[\s-]*SHAR/i.test(clean(html))||!/<(?:a|tr|p)\b/i.test(html))throw Error('unsupported_event_index_schema');
 const body=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');
 const blocks=[...body.matchAll(/<(a|p|li|h[1-6]|tr)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
 if(blocks.length>3000)throw Error('event_index_limit');
 const records=new Map();
 for(const block of blocks){
  const heading=clean(block[2]);
  if(heading.length<12||heading.length>350)continue;
  const refs=[...new Set([...heading.matchAll(/\bSDSC\s*SHAR\s*\/\s*RMT\s*\/\s*(\d{2})\s*\/\s*(20\d{2})\b/gi)].map(m=>'SDSC SHAR/RMT/'+m[1]+'/'+m[2]))];
  if(refs.length!==1)continue;
  const types=patterns.filter(([,re])=>re.test(heading)).map(([type])=>type);
  // A corrigendum referenced in a result heading is not itself a corrigendum.
  if(types.length!==1)continue;
  const type=types[0],advertisement=refs[0],evidenceSha256=sha(Buffer.from(heading));
  const id=sha(Buffer.from([advertisement,type,evidenceSha256].join('\0')));
  records.set(id,{id,type,advertisement,evidenceSha256,sourceUrl:EVENT_INDEX,observedAt,state:'candidate_only'});
 }
 return {sourceId:'india-sdsc-shar',sourceUrl:EVENT_INDEX,observedAt,snapshotSha256:sha(Buffer.from(html)),candidates:[...records.values()],reviewState:'requires_review',publicLaunchAuthorized:false};
}
export async function probeEvents(fetcher=fetch){
 await checkDocumentRobots('apps.shar.gov.in',fetcher);
 const response=await fetcher(EVENT_INDEX,{redirect:'manual',headers:{'User-Agent':'globalGOVSourceReview/1.0','Accept':'text/html'},signal:AbortSignal.timeout(20000)});
 if(response.status!==200||!/^text\/html\b/i.test(response.headers.get('content-type')||''))throw Error('event_index_unavailable_'+response.status);
 return parseEventIndex((await bounded(response,MAX)).toString('utf8'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await probeEvents();console.log(JSON.stringify({sourceId:result.sourceId,snapshotSha256:result.snapshotSha256,observedAt:result.observedAt,candidates:result.candidates.length,byType:result.candidates.reduce((a,c)=>{a[c.type]=(a[c.type]||0)+1;return a;},{}),reviewState:result.reviewState}));}
 catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
