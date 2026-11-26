import test from "node:test";
import assert from "node:assert/strict";
import {collectOnce} from "./collector-client.mjs";
import {DFE_SOURCE} from "./official-feed.mjs";
import {MANITOBA} from "./manitoba-feed.mjs";
import {verifyCollectorSignature} from "./collector-bridge.mjs";
const NOW=Date.parse("2026-11-16T10:00:00Z"),KEY="GOVRADAR_TEST_SHARED_SECRET_FOR_HMAC_SIGNATURE_2026";
const job={"@type":"JobPosting",title:"ICT Technician",datePosted:"2026-11-10",
 validThrough:"2026-12-08T12:00:00Z",url:"https://teaching-vacancies.service.gov.uk/jobs/ict-tech",
 hiringOrganization:{name:"England Public School"}};
const rss='<rss><channel><title>Government Jobs</title><item><title>Justice Clerk</title><link>https://jobsearch.gov.mb.ca/jow/advancedResult.action?ID=130448</link><description>&lt;strong&gt;Department&lt;/strong&gt;: Manitoba Justice&lt;br /&gt;&lt;strong&gt;Closing Date&lt;/strong&gt;: 2026-12-09&lt;br /&gt;&lt;strong&gt;Posted Date&lt;/strong&gt;: 2026-11-09&lt;br /&gt;&lt;strong&gt;Posting Type&lt;/strong&gt;: Open&lt;br /&gt;</description></item></channel></rss>';
function fixture({recent=false,evilRedirect=false}={}){
 const requests=[];
 const fetcher=async (url,options={})=>{
  requests.push({url,options});
  if(url.endsWith("/api/collector/plan"))return new Response(JSON.stringify({sources:[
   {sourceId:DFE_SOURCE.id,nextPage:2,lastSuccessAt:recent?NOW-1000:null},
   {sourceId:MANITOBA.id,lastSuccessAt:null}
  ]}),{headers:{"content-type":"application/json"}});
  if(url.startsWith(DFE_SOURCE.api)){
   if(evilRedirect)return new Response(null,{status:302,headers:{Location:"https://evil.invalid/feed"}});
   return new Response(JSON.stringify({data:[job],meta:{totalPages:20}}),{headers:{"content-type":"application/json"}});
  }
  if(url===MANITOBA.url)return new Response(rss,{headers:{"content-type":"application/rss+xml"}});
  if(url.endsWith("/api/collector/ingest")){
   const body=JSON.parse(options.body);
   return new Response(JSON.stringify({sourceId:body.sourceId,state:"ok",accepted:1}),{
    headers:{"content-type":"application/json"}});
  }
  throw Error("unexpected_fetch_"+url);
 };
 return{fetcher,requests};
}
const TARGET="https://stage.example";
test("GitHub/local dry-run validates upstream feeds but never uploads",async()=>{
 const {fetcher,requests}=fixture();
 const found=await collectOnce({target:TARGET,source:"both",dryRun:true,fetcher,now:NOW,log(){}});
 assert.deepEqual(found.map(x=>x.state),["dry_run","dry_run"]);
 assert.equal(found[0].eligible,1);assert.equal(found[1].eligible,1);
 assert.equal(requests.filter(x=>x.options.method==="POST").length,0);
 assert.ok(requests.some(x=>x.url===DFE_SOURCE.api+"?page=2"));
});
test("publisher sends correct HMAC and exact requested official page",async()=>{
 const {fetcher,requests}=fixture();
 const res=await collectOnce({target:TARGET,source:"dfe",dryRun:false,key:KEY,fetcher,now:NOW,log(){}});
 assert.equal(res[0].state,"published");
 const posted=requests.find(x=>x.options.method==="POST");
 assert.ok(posted);
 const x=JSON.parse(posted.options.body);
 assert.equal(x.sourceId,DFE_SOURCE.id);assert.equal(x.page,2);
 assert.equal(await verifyCollectorSignature(KEY,posted.options.headers["X-GovRadar-Timestamp"],
  posted.options.body,posted.options.headers["X-GovRadar-Signature"],Date.now(),TARGET),true);
 assert.doesNotMatch(posted.options.body,/GOVRADAR_TEST_SHARED_SECRET/);
});
test("a recent successful import is not duplicated by fallback",async()=>{
 const {fetcher,requests}=fixture({recent:true});
 const found=await collectOnce({target:TARGET,source:"dfe",dryRun:false,key:KEY,fetcher,now:NOW,log(){}});
 assert.equal(found[0].state,"skipped");
 assert.equal(requests.length,1);
});
test("refuses missing key, invalid target, and unauthorised source",async()=>{
 const {fetcher}=fixture();
 await assert.rejects(collectOnce({target:TARGET,source:"dfe",dryRun:false,fetcher}),/collector_key_missing/);
 await assert.rejects(collectOnce({target:"http://insecure.example",source:"dfe",fetcher}),/collector_target_must_be_https/);
 await assert.rejects(collectOnce({target:TARGET,source:"india",fetcher}),/unknown_collector_source/);
});
test("redirect to nonofficial host never transfers source content",async()=>{
 const {fetcher,requests}=fixture({evilRedirect:true});
 await assert.rejects(collectOnce({target:TARGET,source:"dfe",dryRun:true,fetcher,now:NOW,log(){}}),/unsafe_redirect/);
 assert.ok(!requests.some(x=>x.options.method==="POST"));
});

test("one source failure does not stop another source being independently collected",async()=>{
 const {fetcher:base,requests}=fixture({evilRedirect:true});
 const events=[];
 const fetcher=async(url,options)=>base(url,options);
 await assert.rejects(collectOnce({target:TARGET,source:"both",dryRun:true,
  fetcher,now:NOW,log:v=>events.push(JSON.parse(v))}),/unsafe_redirect/);
 assert.ok(requests.some(x=>x.url===MANITOBA.url),"Manitoba must still be checked");
 assert.ok(events.some(x=>x.sourceId===MANITOBA.id&&x.eligible===1),"Manitoba must succeed");
 assert.ok(events.some(x=>x.sourceId===DFE_SOURCE.id&&x.state==="failed"),"DfE error must be isolated");
});
test("transient DfE HTTP 503 is retried once without retrying hard failures",async()=>{
 const {fetcher:base}=fixture();let dfeCalls=0;
 const fetcher=async(url,options)=>{
  if(url.startsWith(DFE_SOURCE.api)&&++dfeCalls===1)return new Response("Unavailable",{status:503});
  return base(url,options);
 };
 const res=await collectOnce({target:TARGET,source:"dfe",dryRun:true,fetcher,now:NOW,log(){}});
 assert.equal(res[0].state,"dry_run");assert.equal(dfeCalls,2);
});
