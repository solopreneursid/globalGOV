// Dedicated, non-deployed UK release candidate. This Worker has NO community,
// moderation, ingestion, source discovery, alert, scheduled, or admin routes.
// It must have only the D1 DB binding at deployment; never copy staging secrets.
// Do not attach a public domain or deploy to production without founder approval.
import {serveOfficialNotices} from "./official-feed.mjs";
import {readonlyOfficialNoticesDb} from "./uk-release-db.mjs";
import {getUkMirrorPublicStatus} from "./uk-mirror-status.mjs";
import {RELEASE_PREVIEW_HTML,RELEASE_PREVIEW_CSS,RELEASE_PREVIEW_JS} from "./release-preview-ui.mjs";
const SECURITY=Object.freeze({
 "X-Content-Type-Options":"nosniff",
 "X-Frame-Options":"DENY",
 "Referrer-Policy":"strict-origin-when-cross-origin",
 "Cross-Origin-Resource-Policy":"same-origin",
 "Permissions-Policy":"geolocation=(), camera=(), microphone=()",
 "X-Robots-Tag":"noindex, nofollow"
});
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function response(text,status,contentType,cache="no-store",extra={}){
 return new Response(text,{status,headers:{...SECURITY,...extra,"Content-Type":contentType,"Cache-Control":cache}});
}
function error(status,code){return response(JSON.stringify({error:code}),status,"application/json; charset=utf-8");}
const HTML=RELEASE_PREVIEW_HTML
 .replace('href="/" aria-label="globalGOV UK release preview"','href="/" aria-label="globalGOV UK release preview"')
 .replace('href="/">Research HQ','href="#about">About');
const OPENAPI=Object.freeze({
 openapi:"3.1.0",
 info:{title:"globalGOV UK Official Vacancies — Release Candidate",version:"0.1.0",description:"UK DfE only. Source-observed vacancies, not individually verified. Not publicly launched."},
 paths:{
  "/api/notices":{get:{summary:"Source-observed UK DfE listings only",responses:{
   "200":{description:"UK-only source evidence, no independent vacancy verification"},
   "403":{description:"Unapproved source"},
   "503":{description:"Database or source-rights policy unavailable"}
  }}},
  "/api/health":{get:{summary:"UK candidate readiness (does not assert source accuracy)",responses:{"200":{description:"Handler reachable"}}}},
  "/api/freshness":{get:{summary:"Sanitized read-only official-source mirror freshness; not an endorsement",responses:{"200":{description:"May be pending, delayed or current"}}}}
 }
});
export const UK_RELEASE_ALLOWED_PATHS=Object.freeze([
 "/","/release-preview","/release-preview.css","/release-preview.js",
 "/api/notices","/api/release-preview/notices","/api/health","/api/freshness",
 "/openapi.json","/robots.txt"
]);
export default{
 async fetch(request,env){
  if(request.method!=="GET")return error(405,"method_not_allowed");
  const url=new URL(request.url);
  const p=url.pathname;
  if(p==="/"||p==="/release-preview")
   return response(HTML,200,"text/html; charset=utf-8","no-store",{"Content-Security-Policy":CSP});
  if(p==="/release-preview.css")
   return response(RELEASE_PREVIEW_CSS,200,"text/css; charset=utf-8","public, max-age=300");
  if(p==="/release-preview.js")
   return response(RELEASE_PREVIEW_JS,200,"application/javascript; charset=utf-8","public, max-age=300");
  if(p==="/robots.txt")
   return response("User-agent: *\nDisallow: /\n",200,"text/plain; charset=utf-8");
  if(p==="/api/health")
   return response(JSON.stringify({status:"ok",service:"govradar-uk-release-candidate",
    publicLaunchAuthorized:false,serverTime:new Date().toISOString()}),200,"application/json; charset=utf-8");
  if(p==="/api/freshness")
   return response(JSON.stringify(await getUkMirrorPublicStatus(env?.DB)) ,200,"application/json; charset=utf-8");
  if(p==="/openapi.json")
   return response(JSON.stringify(OPENAPI),200,"application/json; charset=utf-8");
  if(p==="/api/notices"||p==="/api/release-preview/notices"){
   // The only database capability reachable from this standalone Worker is
   // SELECT on official_job_notices, with UK-only SQL filtering in handler.
   const res=await serveOfficialNotices(readonlyOfficialNoticesDb(env?.DB),url.searchParams,"uk_only_release_preview");
   const headers=new Headers(res.headers);
   for(const [key,value] of Object.entries(SECURITY))headers.set(key,value);
   headers.set("Cache-Control","no-store");
   return new Response(res.body,{status:res.status,headers});
  }
  return error(404,"not_found");
 }
};
