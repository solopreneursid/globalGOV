// Portable static-first compiler. Explicit UK DfE and ISRO publication scope.
// No private database rows, arbitrary HTML, external scripts or ads.
import {createHash} from "node:crypto";
const SOURCE="uk-dfe-teaching-vacancies",ISRO="india-isro-opportunities",DAY=86400000,HOUR=3600000;
const COUNTRY=Object.freeze({[SOURCE]:"United Kingdom",[ISRO]:"India"});
const PREFIX=Object.freeze({[SOURCE]:"uk",[ISRO]:"india"});
export const LIMITS=Object.freeze({jobs:10000,files:15000,totalBytes:100*1024*1024,shardRows:250,validHours:6});
const hash=s=>createHash("sha256").update(s).digest("hex");
const esc=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const xml=esc;
const clean=(s,n)=>typeof s==="string"&&s.trim()&&s.length<=n&&!/[\u0000-\u001f\u007f]/.test(s)?s.trim():null;
function timestamp(x){return typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;}
function officialUrl(raw,source){
 try{const u=new URL(raw);if(u.protocol!=="https:"||u.port||u.username||u.password||u.search||u.hash)return null; if(source===SOURCE&&u.hostname==="teaching-vacancies.service.gov.uk"&&/^\/jobs\/[a-z0-9][a-z0-9-]{0,250}\/?$/i.test(u.pathname))return u.href; if(source===ISRO&&u.hostname==="www.isro.gov.in"&&/^\/[A-Za-z0-9_/-]+\.html$/i.test(u.pathname))return u.href; return null;}catch{return null;}
}
function page(title,body,{canonical=null,indexable=false}={}){
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="'+(indexable?"index,follow":"noindex,nofollow")+'"><title>'+esc(title)+' · globalGOV</title>'+(canonical?'<link rel="canonical" href="'+esc(canonical)+'">':'')+'<link rel="stylesheet" href="/style.css"><script defer src="/catalogue.js"></script></head><body><header><a href="/">globalGOV</a><span>Independent government recruitment index</span></header><main>'+body+'</main><footer><p>UK source: Department for Education. Contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>. India source: Indian Space Research Organisation / Department of Space, Government of India (<a href="https://www.isro.gov.in/Website_Policy.html">website policy</a>). No endorsement implied. Always verify on the official website. No fee for access or applying through this index.</p><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></footer></body></html>';
}
const CSS="*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;color:#17242a;background:#f6f8f8;margin:0}header,main,footer{max-width:960px;margin:auto;padding:1rem}header{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;border-bottom:1px solid #cbd5d5}header a{font-weight:800;font-size:1.4rem}a{color:#075c54}article{background:white;border:1px solid #cbd5d5;border-radius:8px;padding:1rem;margin:.75rem 0}h1,h2{line-height:1.25}label{display:block;margin:.5rem 0}input,select,button{font:inherit;max-width:100%;padding:.6rem;border:1px solid #879b9b;border-radius:4px}button{background:#075c54;color:white;cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #e1a31a;outline-offset:3px}[hidden]{display:none!important}.muted{color:#42565d}.warning{background:#fff3cd;padding:.75rem}footer{border-top:1px solid #cbd5d5;font-size:.9rem}ul{padding-left:1.3rem}";
const JS=String.raw`(()=>{"use strict";const $=id=>document.getElementById(id);const valid=e=>Number(e.dataset.until)>Date.now();function expire(){for(const e of document.querySelectorAll("[data-until]")){if(!valid(e)){e.hidden=true;const stale=$("stale");if(stale)stale.hidden=false;}}}expire();setInterval(expire,30000);const job=document.querySelector("[data-job-id]");if(job){let timer;const disable=()=>{job.hidden=true;const stale=$("stale");if(stale)stale.hidden=false;};const check=async()=>{disable();clearTimeout(timer);try{const m=await get("/index/manifest.json");if(!Number.isSafeInteger(m.generatedAt)||Date.now()>=m.validUntil)throw Error("expired");const id=job.dataset.jobId;if(!/^[a-f0-9]{32}$/.test(id))throw Error("invalid id");const s=await get("/index/active/"+id.slice(0,2)+".json");if(s.generatedAt!==m.generatedAt)throw Error("snapshot mismatch");const r=s.jobs[id];if(!r||r.fingerprint!==job.dataset.fingerprint||!Number.isSafeInteger(r.until)||r.until<=Date.now())throw Error("withdrawn or changed");job.dataset.until=String(Math.min(r.until,m.validUntil));$("observed").textContent="Last observed: "+new Date(r.seen).toISOString();job.hidden=false;$("stale").hidden=true;timer=setTimeout(disable,Math.max(0,Number(job.dataset.until)-Date.now()));}catch{disable();}};check();setInterval(check,300000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)check();});return;}const form=$("search");if(!form)return;let seq=0;const status=$("status"),results=$("results");function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e}async function get(path){const r=await fetch(path,{credentials:"omit",redirect:"error",cache:"no-store"});if(!r.ok)throw Error("index unavailable");return r.json()}form.addEventListener("submit",async ev=>{ev.preventDefault();const n=++seq;results.replaceChildren();status.textContent="Loading…";try{const manifest=await get("/index/manifest.json");if(Date.now()>=manifest.validUntil)throw Error("snapshot expired");const q=$("q").value.trim().toLocaleLowerCase().slice(0,100),region=$("region").value;const shards=manifest.shards.filter(x=>!region||x.region===region);if(shards.length>40)throw Error("Choose a region");let count=0,shown=0;for(const s of shards){const rows=await get(s.path);if(n!==seq)return;if(Date.now()>=manifest.validUntil)throw Error("snapshot expired");for(const r of rows){if(r.until<=Date.now()||q&&!(r.title+" "+r.employer+" "+r.region).toLocaleLowerCase().includes(q))continue;count++;if(shown>=100)continue;shown++;const a=document.createElement("a");a.href="/job/"+r.id+"/";a.textContent=r.title;const card=document.createElement("article");card.dataset.until=r.until;const h=document.createElement("h2");h.append(a);card.append(h,text("p",r.employer+" · "+r.region),text("p","Closing: "+r.closingAt));results.append(card)}}status.textContent=count+" matching notices"+(count>100?" (first 100 shown; refine search)":"");}catch{if(n===seq){results.replaceChildren();status.textContent="Catalogue unavailable or expired. Check the official source.";}}});})();`;
export function compileCatalogue({rows,generatedAt,sourceHealthy,origin=null,indexable=false}={}){
 const now=Number(generatedAt);
 if(!Number.isSafeInteger(now)||now<=0||sourceHealthy!==true||!Array.isArray(rows)||rows.length===0||rows.length>LIMITS.jobs)throw Error("snapshot_unhealthy_or_oversized");
 if(indexable&&!origin)throw Error("canonical_origin_required");
 if(origin){const u=new URL(origin);if(u.protocol!=="https:"||u.pathname!=="/"||u.search||u.hash||u.username||u.password||u.port)throw Error("invalid_origin");origin=u.origin;}
 const jobs=[],ids=new Set();
 const validUntil=now+LIMITS.validHours*HOUR;
 for(const r of rows){
  if(!Object.hasOwn(COUNTRY,r.source_id)||r.life_status!=="open"||!["official_feed_unreviewed","founder_reviewed"].includes(r.review_state))throw Error("source_or_review_boundary");
  const title=clean(r.title,220),employer=clean(r.employer,220),region=clean(r.region,120)||(r.source_id===SOURCE?"England":"India"),url=officialUrl(r.source_page,r.source_id);
  const close=timestamp(r.closing_at),seen=Number(r.last_seen_at);
  if(!title||!employer||!url||!Number.isSafeInteger(seen)||seen>now+60000||seen<now-14*DAY||!Number.isFinite(close)||close<=now)throw Error("invalid_or_stale_public_row");
  const identity=r.source_id===ISRO?clean(r.source_ref,300):url.replace(/\/$/,"");
  if(!identity)throw Error("source_reference_required");
  const id=hash(r.source_id+"|"+identity).slice(0,32);
  if(ids.has(id))throw Error("duplicate_public_row");ids.add(id);
  jobs.push({id,title,employer,region:COUNTRY[r.source_id]+" · "+region,source:r.source_id,url,closingAt:r.closing_at,seen,until:Math.min(close,validUntil)});
 }
 jobs.sort((a,b)=>a.id.localeCompare(b.id));
 const files=new Map(),shards=[],byRegion=new Map(),active=new Map();
 const add=(name,value)=>{if(files.has(name))throw Error("duplicate_asset");files.set(name,value);};
 const stale='<p id="stale" class="warning" hidden>These notices are expired or the catalogue has not been refreshed. <a href="https://teaching-vacancies.service.gov.uk/jobs">Check the official source</a>.</p>';
 const snapshot='<p class="muted">Snapshot generated '+esc(new Date(now).toISOString())+'. Valid for browsing until '+esc(new Date(validUntil).toISOString())+' at the latest. Vacancies may change sooner.</p><noscript><p class="warning">JavaScript is disabled. This is a dated snapshot, not live availability. Verify every vacancy directly on the official source.</p></noscript>';
 for(const j of jobs){
  if(!byRegion.has(j.region))byRegion.set(j.region,[]);byRegion.get(j.region).push(j);
  const path="/job/"+j.id+"/";
  const fingerprint=hash(JSON.stringify([j.title,j.employer,j.region,j.url,j.closingAt]));
  const bucket=j.id.slice(0,2);if(!active.has(bucket))active.set(bucket,{});active.get(bucket)[j.id]={fingerprint,until:j.until,seen:j.seen};
  add("job/"+j.id+"/index.html",page(j.title,'<p class="muted">Recruitment metadata is shown only after checking the current static catalogue. Verify all requirements on the official website.</p><noscript><p class="warning">Enable JavaScript to check current availability or visit the <a href="https://teaching-vacancies.service.gov.uk/jobs">official source</a>.</p></noscript>'+stale+'<article hidden data-job-id="'+j.id+'" data-fingerprint="'+fingerprint+'" data-until="'+Date.parse(j.closingAt)+'"><h1>'+esc(j.title)+'</h1><p>'+esc(j.employer)+' · '+esc(j.region)+'</p><p>Closing: '+esc(j.closingAt)+'</p><p id="observed"></p><a rel="noopener noreferrer" href="'+esc(j.url)+'">Read the official recruitment notice / apply</a></article><p><a href="/">Browse other notices</a></p>',{canonical:origin?origin+path:null,indexable}));
 }
 for(const [bucket,entries] of active)add("index/active/"+bucket+".json",JSON.stringify({generatedAt:now,jobs:entries}));
 const regionLinks=[];
 for(const [region,items] of [...byRegion].sort(([a],[b])=>a.localeCompare(b))){
  const key=hash(region).slice(0,16),prefix=PREFIX[items[0].source];regionLinks.push('<option value="'+esc(region)+'">'+esc(region)+'</option>');
  for(let i=0;i<items.length;i+=LIMITS.shardRows){
   const chunk=items.slice(i,i+LIMITS.shardRows),name="index/"+key+"-"+(i/LIMITS.shardRows)+".json";
   add(name,JSON.stringify(chunk.map(({id,title,employer,region,closingAt,until})=>({id,title,employer,region,closingAt,until}))));
   shards.push({region,path:"/"+name,count:chunk.length});
  }
  for(let i=0;i<items.length;i+=LIMITS.shardRows){
   const n=i/LIMITS.shardRows,name="jobs/"+prefix+"/"+key+(n?"/"+(n+1):"")+"/index.html";
   const cards=items.slice(i,i+LIMITS.shardRows).map(j=>'<li data-until="'+j.until+'"><a href="/job/'+j.id+'/">'+esc(j.title)+'</a> — '+esc(j.employer)+'</li>').join("");
   const links=Array.from({length:Math.ceil(items.length/LIMITS.shardRows)},(_,p)=>'<a href="/jobs/'+prefix+'/'+key+(p?"/"+(p+1):"")+'/">'+(p+1)+'</a>').join(" · ");
   add(name,page("Jobs in "+region,snapshot+stale+'<h1>'+esc(region)+'</h1><ul>'+cards+'</ul><nav aria-label="Pages">'+links+'</nav><p><a href="/">Search all notices</a></p>',{indexable,canonical:origin?origin+"/"+name.replace(/index\.html$/,""):null}));
  }
 }
 add("index/manifest.json",JSON.stringify({schema:1,source:SOURCE,sources:[...new Set(jobs.map(j=>j.source))].sort(),generatedAt:now,validUntil,count:jobs.length,shards}));
 const regionNav=[...byRegion.keys()].sort().map(r=>'<li><a href="/jobs/'+PREFIX[byRegion.get(r)[0].source]+'/'+hash(r).slice(0,16)+'/">'+esc(r)+'</a></li>').join("");
 add("index.html",page("Government recruitment notices",snapshot+stale+'<h1>Government recruitment notices</h1><p>United Kingdom public education vacancies and Indian space agency recruitment when verified current. Additional sources require their own publication checks.</p><form id="search" data-until="'+validUntil+'"><label for="q">Job title or employer</label><input id="q" maxlength="100" type="search"><label for="region">Region</label><select id="region"><option value="">All regions</option>'+regionLinks.join("")+'</select><button type="submit">Search</button></form><p id="status" role="status"></p><div id="results"></div><h2>Browse by region</h2><ul>'+regionNav+'</ul><p><a href="https://teaching-vacancies.service.gov.uk/jobs">Official UK teaching vacancies</a></p>',{indexable,canonical:origin?origin+"/":null}));
 add("style.css",CSS);add("catalogue.js",JS);
 add("privacy/index.html",page("Privacy",'<h1>Privacy</h1><p>This static catalogue does not require an account or collect application data. Hosting providers may process standard access logs. Applications take place on official external websites. Contact: connect@yorphives.com.</p>'));
 add("terms/index.html",page("Terms",'<h1>Terms</h1><p>Free informational index of official notices. Confirm eligibility, deadlines and application requirements at the official source. Information may be incomplete or outdated.</p>'));
 add("robots.txt",indexable?"User-agent: *\nAllow: /\nSitemap: "+origin+"/sitemap.xml\n":"User-agent: *\nDisallow: /\n");
 add("sitemap.xml",'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+(indexable?["/",...jobs.map(j=>"/job/"+j.id+"/"),...[...files.keys()].filter(k=>k.startsWith("jobs/")).map(k=>"/"+k.replace(/index\.html$/,""))].map(p=>"<url><loc>"+xml(origin+p)+"</loc></url>").join(""):"")+'</urlset>');
 add("_headers","/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'\n  Cache-Control: public, max-age=300, must-revalidate\n"+(indexable?"":"  X-Robots-Tag: noindex, nofollow\n"));
 const bytes=[...files.values()].reduce((n,x)=>n+Buffer.byteLength(x),0);
 if(files.size>LIMITS.files||bytes>LIMITS.totalBytes)throw Error("asset_budget_exceeded");
 return {files,manifest:{schema:1,generatedAt:now,validUntil,jobs:jobs.length,files:files.size,bytes,source:SOURCE,sources:[...new Set(jobs.map(j=>j.source))].sort(),indexable,digest:hash([...files].sort(([a],[b])=>a.localeCompare(b)).map(([p,v])=>p+":"+hash(v)).join("\n"))}};
}
