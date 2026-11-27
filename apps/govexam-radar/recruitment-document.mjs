// Run on a controlled local host or CI, never on the public Worker.
// pdftotext must be installed; no OCR, embedded scripts, or PDF link execution.
import {execFileSync} from 'node:child_process';
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
export function extractPdfText(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>MAX||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('invalid_pdf');
 try{const info=execFileSync('pdfinfo',['-'],{input:bytes,encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['pipe','pipe','pipe']});const pages=Number(/^Pages:\s+(\d+)\s*$/m.exec(info)?.[1]);if(!Number.isSafeInteger(pages)||pages<1||pages>100)throw Error('pdf_page_limit');return execFileSync('pdftotext',['-layout','-enc','UTF-8','-f','1','-l','100','-','-'],{input:bytes,encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});}
 catch{throw Error('pdf_text_extraction_failed_or_unsupported');}
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
