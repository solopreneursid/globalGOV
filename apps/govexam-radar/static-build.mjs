// Build in a private temporary sibling directory and publish a complete local
// release via rename. No in-place mutation of an existing published directory.
import {compileCatalogue} from "./static-publisher.mjs";
import {acquireSnapshot} from "./static-snapshot.mjs";
import {mkdir,mkdtemp,writeFile,rename,rm,lstat,readFile,copyFile,realpath} from "node:fs/promises";
import {createHash} from "node:crypto";
import {dirname,resolve,join,sep} from "node:path";
import {pathToFileURL} from "node:url";
export async function buildRelease({snapshot,output,origin=null,indexable=false,previous=null}={}){
 if(!output||typeof output!=="string")throw Error("output_required");
 const target=resolve(output),parent=dirname(target);
 await mkdir(parent,{recursive:true});
 try{await lstat(target);throw Error("release_output_exists");}catch(e){if(e.code!=="ENOENT")throw e;}
 const {files,manifest}=compileCatalogue({...snapshot,origin,indexable});
 const prior=previous?await realpath(join(resolve(previous),"public")):null;
 let reused=0,changed=0;
 const work=await mkdtemp(join(parent,".globalgov-build-"));
 try{
  const assets=join(work,"public");await mkdir(assets);
  for(const [name,value] of files){
   if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split("/").includes("..")||name.startsWith("/"))throw Error("unsafe_asset_name");
   const file=join(assets,name);await mkdir(dirname(file),{recursive:true});let same=false;
   if(prior){
    const candidate=join(prior,name);
    try{
     const info=await lstat(candidate);
     if(info.isFile()&&!info.isSymbolicLink()&&info.size===Buffer.byteLength(value)){
      const resolved=await realpath(candidate);
      if(resolved.startsWith(prior+sep)){
       const bytes=await readFile(resolved);
       if(createHash("sha256").update(bytes).digest("hex")===createHash("sha256").update(value).digest("hex")){
        await copyFile(resolved,file,1);same=true;reused++;
       }
      }
     }
    }catch(e){if(e.code!=="ENOENT"&&e.code!=="ENOTDIR")throw e;}
   }
   if(!same){await writeFile(file,value,{flag:"wx",mode:0o644});changed++;}
  }
  Object.assign(manifest,{reusedAssets:reused,changedAssets:changed});
  await writeFile(join(work,"manifest.json"),JSON.stringify({...manifest,usage:snapshot.usage||null},null,2)+"\n",{mode:0o600,flag:"wx"});
  await rename(work,target);
  return manifest;
 }catch(e){await rm(work,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [mode,output,input,...extra]=process.argv.slice(2);
  if(extra.length||!output||!["fixture","d1"].includes(mode)||mode==="fixture"&&!input||mode==="d1"&&input)throw Error("usage: node static-build.mjs fixture OUTPUT INPUT_JSON | d1 OUTPUT");
  // Production indexing requires separate release approval; preview is always noindex.
  const snapshot=mode==="fixture"?JSON.parse(await readFile(input,"utf8")):await acquireSnapshot({account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.GLOBALGOV_D1_READ_TOKEN});
  const manifest=await buildRelease({snapshot,output,previous:process.env.GLOBALGOV_PREVIOUS_RELEASE||null});
  console.log(JSON.stringify(manifest));
 }catch(e){console.error(JSON.stringify({state:"blocked",errorCode:String(e?.message||"build_failed").replace(/[^a-zA-Z0-9_]/g,"_").slice(0,100)}));process.exitCode=1;}
}
