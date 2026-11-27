// Run on a controlled local host or CI, never on the public Worker.
// pdftotext must be installed; no OCR, embedded scripts, or PDF link execution.
import {execFileSync} from 'node:child_process';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {DOCUMENT_SOURCES,officialDocumentUrl,extractRecruitmentEvidence} from './recruitment-evidence.mjs';
const MAX=10*1024*1024;
export async function bounded(response,max){
 if(Number(response.headers.get('content-length')||0)>max)throw Error('response_too_large');
 const reader=response.body?.getReader();if(!reader)throw Error('empty_response');
 const parts=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('response_too_large');}parts.push(Buffer.from(value));}return Buffer.concat(parts);}finally{reader.releaseLock();}
}
export async function checkDocumentRobots(host,fetcher=fetch){
 if(host!=='apps.shar.gov.in')throw Error('unknown_document_host');
 const options={redirect:'manual',headers:{'User-Agent':'globalGOVSourceReview/1.0','Accept':'text/plain,application/pdf'}};
 const robots=await fetcher('https://'+host+'/robots.txt',{...options,signal:AbortSignal.timeout(12000)});
 if(![200,404].includes(robots.status))throw Error('robots_access_unconfirmed_'+robots.status);
 if(robots.status===200){
  const body=(await bounded(robots,8192)).toString('utf8');
  if(!/^text\/plain\b/i.test(robots.headers.get('content-type')||'')||/<\s*(?:html|doctype)\b/i.test(body)||/^\s*disallow\s*:\s*[^\s#]/im.test(body))throw Error('robots_review_required');
 }else await robots.body?.cancel();
}
export async function fetchOfficialDocument(sourceId,raw,fetcher=fetch){
 const url=officialDocumentUrl(sourceId,raw),host=DOCUMENT_SOURCES[sourceId].host;
 await checkDocumentRobots(host,fetcher);
 const options={redirect:'manual',headers:{'User-Agent':'globalGOVSourceReview/1.0','Accept':'application/pdf'}};
 const response=await fetcher(url,{...options,signal:AbortSignal.timeout(20000)});
 if(response.status!==200||!/^application\/pdf\b/i.test(response.headers.get('content-type')||''))throw Error('official_pdf_unavailable_'+response.status);
 return bounded(response,MAX);
}
export function extractPdfText(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>MAX||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('invalid_pdf');
 try{const info=execFileSync('pdfinfo',['-'],{input:bytes,encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['pipe','pipe','pipe']});const pages=Number(/^Pages:\s+(\d+)\s*$/m.exec(info)?.[1]);if(!Number.isSafeInteger(pages)||pages<1||pages>100)throw Error('pdf_page_limit');return execFileSync('pdftotext',['-layout','-enc','UTF-8','-f','1','-l','100','-','-'],{input:bytes,encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});}
 catch{throw Error('pdf_text_extraction_failed_or_unsupported');}
}
async function main(){
 const [sourceId,sourceUrl,mode,file,output,...extra]=process.argv.slice(2);
 if(extra.length||!output||!['--local','--fetch'].includes(mode)||mode==='--fetch'&&file!=='-')throw Error('usage: node recruitment-document.mjs SOURCE_ID OFFICIAL_PDF_URL --local FILE OUTPUT.json OR --fetch - OUTPUT.json');
 officialDocumentUrl(sourceId,sourceUrl);
 let bytes;
 if(mode==='--local'){const s=await stat(file);if(!s.isFile()||s.size>MAX)throw Error('invalid_local_file');bytes=await readFile(file);}else bytes=await fetchOfficialDocument(sourceId,sourceUrl);
 const report=extractRecruitmentEvidence({sourceId,sourceUrl,documentBytes:bytes,text:extractPdfText(bytes),provenance:mode==='--local'?'local_unverified':'official_https_fetch'});
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({reviewState:report.reviewState,sourceId,documentSha256:report.documentSha256,fields:Object.keys(report.fields),conflicts:report.conflicts,events:report.events.length,publicLaunchAuthorized:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
