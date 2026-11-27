// Private owner-side signing helper. Never generates, stores or enrolls a key.
// Signing is an explicit human review action, not an automated collection step.
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readReviewedCatalog} from './reviewed-catalog.mjs';
const MAX=256*1024;
async function readPrivate(path,max){
 const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.size>max)throw Error('private_input_required');
 return readFile(path);
}
export async function signReviewedPayload({payload,keyId,privateKey,sources,now=Date.now()}){
 if(typeof payload!=='string'||Buffer.byteLength(payload)>MAX||typeof keyId!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(keyId)||!Array.isArray(sources)||sources.length!==1||sources[0]!=='india-sdsc-shar')throw Error('invalid_signing_scope');
 const k=privateKey?.type==='private'?privateKey:createPrivateKey(privateKey);
 if(k.asymmetricKeyType!=='ed25519')throw Error('ed25519_required');
 const pub=createPublicKey(k).export({format:'jwk'}).x;
 const bundle={keyId,payload,signature:sign(null,Buffer.from(payload,'utf8'),k).toString('base64url')};
 const configuration={keys:{[keyId]:pub},sources:[...sources],bundle};
 const result=await readReviewedCatalog(configuration,now);
 if(result.state!=='reviewed_staging'||result.publicLaunchAuthorized!==false)throw Error('review_payload_failed_validation');
 return {configuration,visiblePosts:result.posts.length,visibleEvents:result.events.length};
}
async function main(){
 const [keyId,keyPath,payloadPath,out,...extra]=process.argv.slice(2);
 if(!keyId||!keyPath||!payloadPath||!out||extra.length||process.env.GLOBALGOV_REVIEW_APPROVED!=='YES')throw Error('explicit_review_approval_required');
 const dest=await lstat(dirname(out));
 if(!dest.isDirectory()||dest.isSymbolicLink()||(dest.mode&0o077)!==0)throw Error('private_output_directory_required');
 const key=await readPrivate(keyPath,16384);
 try{
  const payload=(await readPrivate(payloadPath,MAX)).toString('utf8');
  const result=await signReviewedPayload({payload,keyId,privateKey:key,sources:['india-sdsc-shar']});
  await writeFile(out,JSON.stringify(result.configuration,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({keyId,visiblePosts:result.visiblePosts,visibleEvents:result.visibleEvents,publicLaunchAuthorized:false,requiresSeparateEnrollment:true}));
 }finally{key.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
