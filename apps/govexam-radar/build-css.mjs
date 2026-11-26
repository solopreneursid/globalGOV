// Reproducible offline-runtime CSS build from open-source Tailwind CSS 3.4.17.
// Run after 'npm install --no-save tailwindcss@3.4.17' in this directory.
import {writeFile,mkdir,readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {FULL_HTML} from "./full-ui.mjs";
import {ENHANCE_JS} from "./enhance.mjs";
await mkdir(new URL("./.build/",import.meta.url),{recursive:true});
const dir=new URL("./.build/",import.meta.url);
const html=FULL_HTML.replace(/<script\s+src="https:\/\/cdn\.tailwindcss\.com\/[^"]+"><\/script>/,'');
await writeFile(new URL("full.html",dir),html);
await writeFile(new URL("enhance.js",dir),ENHANCE_JS);
await writeFile(new URL("input.css",dir),"@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
execFileSync("npx",["tailwindcss","-i",".build/input.css","-o",".build/tailwind.css","--minify","--content",".build/**/*.{html,js}"],{cwd:new URL(".",import.meta.url),stdio:"inherit",timeout:120000});
const css=await readFile(new URL("tailwind.css",dir),"utf8");
console.error("Self-hosted CSS compiled: "+css.length+" bytes.");
// Only emit base64 when explicitly enabled for one-time transfer into GitHub.
if(process.env.PRINT_CSS_BASE64==="yes"){
 const base64=Buffer.from(css).toString("base64");
 console.log("BEGIN_GOVRADAR_CSS64");
 for(let i=0;i<base64.length;i+=1000)console.log("GOVRADAR_CSS64:"+base64.slice(i,i+1000));
 console.log("END_GOVRADAR_CSS64");
}
