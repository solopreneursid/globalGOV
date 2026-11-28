// Run on a controlled local host or CI, never on the public Worker.
// pdftotext must be installed; optional bounded OCR for image-only PDFs. No embedded script or link execution.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile,lstat,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {officialDocumentUrl,extractRecruitmentEvidence} from './recruitment-evidence.mjs';
const MAX=10*1024*1024;
export async function fetchOfficialDocument(sourceId,raw,fetcher=fetch,policy=null){
 if(!policy||policy.sourceId!==sourceId||policy.automatedCollectionEnabled!==true||
    policy.automationStatus!=="approved"||!Array.isArray(policy.allowedContentTypes)||
    !policy.allowedContentTypes.includes("application/pdf"))throw Error("reviewed_source_policy_required");
 const url=officialDocumentUrl(sourceId,raw);
 const source={id:sourceId,url};
 const {fetchOfficialSource}=await import("./source-connectors.mjs");
 const result=await fetchOfficialSource({source,url,fetcher,policyOverride:policy,
  maxBytes:Math.min(MAX,policy.maxBytes||MAX),minIntervalMs:policy.minIntervalMs||5000});
 if(result.contentType!=="application/pdf")throw Error("official_pdf_content_type_required");
 return Buffer.from(result.bytes);
}
export function extractPdfText(bytes,{ocr=process.env.GLOBALGOV_ENABLE_OCR==="true",run=execFileSync}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>MAX||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('invalid_pdf');
 let pages,text;
 try{
  const info=run('pdfinfo',['-'],{input:bytes,encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['pipe','pipe','pipe']});
  pages=Number(/^Pages:\s+(\d+)\s*$/m.exec(info)?.[1]);
  if(!Number.isSafeInteger(pages)||pages<1||pages>100)throw Error('pdf_page_limit');
  text=run('pdftotext',['-layout','-enc','UTF-8','-f','1','-l',String(pages),'-','-'],{input:bytes,encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});
 }catch{throw Error('pdf_text_extraction_failed_or_unsupported');}
 if(text.trim())return text;
 if(!ocr)return text;
 // OCR is intentionally limited to wholly textless PDFs of at most five pages.
 // OCR evidence is never sufficient to authorize automatic publication.
 if(pages>5)throw Error('ocr_page_limit');
 const dir=mkdtempSync(join(tmpdir(),'globalgov-ocr-'));
 try{
  const input=join(dir,'input.pdf');
  writeFileSync(input,bytes,{mode:0o600,flag:'wx'});
  const results=[];
  for(let p=1;p<=pages;p++){
   const prefix=join(dir,'page-'+p);
   run('pdftoppm',['-f',String(p),'-l',String(p),'-scale-to','1800','-gray','-png','-singlefile',input,prefix],{timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
   const result=run('tesseract',[prefix+'.png','stdout','-l','eng','--psm','3'],{timeout:15000,maxBuffer:256*1024,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,OMP_THREAD_LIMIT:'1'}});
   results.push(result);
   rmSync(prefix+'.png',{force:true});
  }
  const extracted=results.join('\f');
  if(!extracted.trim())throw Error('ocr_empty');
  return extracted;
 }catch{throw Error('ocr_failed_or_unavailable');}
 finally{rmSync(dir,{recursive:true,force:true});}
}
async function main(){
 const [sourceId,sourceUrl,mode,file,output,...extra]=process.argv.slice(2);
 if(extra.length||!output||mode!=='--local'||!file)throw Error('usage: node recruitment-document.mjs SOURCE_ID OFFICIAL_PDF_URL --local PRIVATE_LOCAL_PDF OUTPUT.json; network collection must use the reviewed source-document-collector workflow');
 officialDocumentUrl(sourceId,sourceUrl);
 let bytes;
 if(mode==='--local'){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.size<8||s.size>MAX)throw Error('invalid_private_local_file');bytes=await readFile(file);}
 const report=extractRecruitmentEvidence({sourceId,sourceUrl,documentBytes:bytes,text:extractPdfText(bytes),provenance:'local_unverified'});
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({reviewState:report.reviewState,sourceId,documentSha256:report.documentSha256,fields:Object.keys(report.fields),conflicts:report.conflicts,events:report.events.length,publicLaunchAuthorized:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
