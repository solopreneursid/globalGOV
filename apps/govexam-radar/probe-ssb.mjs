// Read-only source feasibility probe. It does not import or publish notices.
// Fail closed on redirects, access errors or any non-empty robots disallow.
import {parseSsbTable} from './ssb-feed.mjs';
const origin='https://recruitment.ssb.gov.in';
const options={redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'GlobalGovJobsSourceCheck/1.0','Accept':'text/plain,text/html'}};
async function readBounded(response,limit){
 if(Number(response.headers.get('content-length')||0)>limit)throw Error('response_too_large');
 const reader=response.body?.getReader();if(!reader)return '';
 const decoder=new TextDecoder();let bytes=0,text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw Error('response_too_large');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
try{
 const robots=await fetch(origin+'/robots.txt',options);
 const body=await readBounded(robots,8192);
 console.log(JSON.stringify({stage:'robots',status:robots.status,location:robots.headers.get('location'),contentType:robots.headers.get('content-type')}));
 if(robots.status!==404&&robots.status!==200)throw Error('robots_unavailable_stop');
 if(robots.status===200&&(/html/i.test(robots.headers.get('content-type')||'')||/<\s*(?:html|doctype)\b/i.test(body)))throw Error('robots_not_plain_text_stop');
 if(robots.status===200&&body.split(/\r?\n/).some(line=>/^\s*disallow\s*:\s*[^\s#]/i.test(line)))throw Error('robots_rule_needs_review_stop');
 const response=await fetch(origin+'/adv_newsUrl',{...options,signal:AbortSignal.timeout(12000)});
 const html=await readBounded(response,2*1024*1024);
 const table=html.match(/<table\b[\s\S]*?<\/table\s*>/i)?.[0]||'';
 console.log(JSON.stringify({stage:'advertisements',status:response.status,contentType:response.headers.get('content-type'),bytes:Buffer.byteLength(html),tableFound:!!table}));
 if(response.status!==200||!table||!/html/i.test(response.headers.get('content-type')||''))throw Error('advertisement_table_unavailable');
 const parsed=parseSsbTable(html);
 console.log(JSON.stringify({stage:'parser',recognized:parsed.recognized,eligible:parsed.valid.length,rejected:parsed.rejected,note:'Read-only; no records stored or published.'}));
}catch(error){console.log(JSON.stringify({stage:'stopped',reason:String(error.message||error)}));process.exitCode=1;}
