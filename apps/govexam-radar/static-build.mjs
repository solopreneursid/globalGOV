// Build in a private temporary sibling directory and publish a complete local
// release via rename. No in-place mutation of an existing published directory.
import {compileCatalogue} from "./static-publisher.mjs";
import {acquireSnapshot} from "./static-snapshot.mjs";
import {mkdir,mkdtemp,writeFile,rename,rm,lstat,readFile} from "node:fs/promises";
import {dirname,resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
export async function buildRelease({snapshot,output,origin=null,indexable=false}={}){
 if(!output||typeof output!=="string")throw Error("output_required");
 const target=resolve(output),parent=dirname(target);
 await mkdir(parent,{recursive:true});
 try{await lstat(target);throw Error("release_output_exists");}catch(e){if(e.code!=="ENOENT")throw e;}
 const {files,manifest}=compileCatalogue({...snapshot,origin,indexable});
 const work=await mkdtemp(join(parent,".globalgov-build-"));
 try{
  const assets=join(work,"public");await mkdir(assets);
  for(const [name,value] of files){
   if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split("/").includes("..")||name.startsWith("/"))throw Error("unsafe_asset_name");
   const file=join(assets,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,value,{flag:"wx",mode:0o644});
  }
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
  const manifest=await buildRelease({snapshot,output});
  console.log(JSON.stringify(manifest));
 }catch(e){console.error(JSON.stringify({state:"blocked",errorCode:String(e?.message||"build_failed").replace(/[^a-zA-Z0-9_]/g,"_").slice(0,100)}));process.exitCode=1;}
}
