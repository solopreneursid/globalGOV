import test from "node:test";
import assert from "node:assert/strict";
import {calculateCollectorSignature,verifyCollectorSignature,serveCollectorPlan,handleCollectorIngest} from "./collector-bridge.mjs";
import {DFE_SOURCE} from "./official-feed.mjs";
import {MANITOBA} from "./manitoba-feed.mjs";
const NOW=Date.parse("2026-11-16T10:00:00Z"),KEY="GOVRADAR_TEST_SHARED_SECRET_FOR_HMAC_SIGNATURE_2026";
const job={ "@type":"JobPosting", title:"ICT Support Technician",datePosted:"2026-11-02",
 validThrough:"2026-12-12T12:00:00Z",
 url:"https://teaching-vacancies.service.gov.uk/jobs/ict-support-technician-school",
 hiringOrganization:{name:"Test Public School"}};
const rss='<rss version="2.0"><channel><title>Official jobs</title><item><title>Crown Counsel</title><link>https://jobsearch.gov.mb.ca/jow/advancedResult.action?ID=130448</link><description>&lt;strong&gt;Department&lt;/strong&gt;: Manitoba Justice&lt;br /&gt;&lt;strong&gt;Closing Date&lt;/strong&gt;: 2026-12-09&lt;br /&gt;&lt;strong&gt;Posted Date&lt;/strong&gt;: 2026-11-09&lt;br /&gt;&lt;strong&gt;Posting Type&lt;/strong&gt;: Open&lt;br /&gt;</description></item></channel></rss>';
function mockDb({auditFailure=false}={}){
 const audits=new Set(),batches=[],cursors=[];
 return{audits,batches,cursors,
  prepare(sql){let args=[];return{
   bind(...a){args=a;return this;},
   async first(){
    if(sql.includes("SELECT id FROM source_ingest_runs"))return audits.has(args[0])?{id:args[0]}:null;
    if(sql.includes("source_feed_cursors"))return{next_page:2,last_total_pages:40,last_success_at:NOW-86400000};
    if(sql.includes("COUNT("))return{total:0};
    return null;},
   async run(){
    if(sql.includes("INSERT INTO source_ingest_runs")){
     if(sql.includes("ON CONFLICT(id) DO NOTHING")){
      if(audits.has(args[0]))return{success:true,meta:{changes:0}};
      audits.add(args[0]);
     }else{
      if(auditFailure&&sql.includes("ON CONFLICT(id) DO UPDATE SET"))
       throw Error("simulated_audit_write_failure");
      audits.add(args[0]);
     }
    }
    if(sql.includes("source_feed_cursors"))cursors.push(args);
    return{success:true,meta:{changes:1}};}
  };},
  async batch(statements){batches.push(statements);return Promise.all(statements.map(s=>s.run()));}
 };
}
const payload=(sourceId,extra={})=>({requestId:"db6bdfbe-75f3-4f75-9916-f4903c5c2e52",sourceId,observedAt:NOW,
 ...(sourceId===DFE_SOURCE.id?{page:2,upstreamBody:JSON.stringify({data:[job],meta:{totalPages:40}})}:{upstreamBody:rss}),
 ...extra});
async function signedRequest(payload,signatureKey=KEY,signatureTimestamp=NOW){
 const raw=JSON.stringify(payload),sig=await calculateCollectorSignature(signatureKey,signatureTimestamp,raw,"https://staging.invalid");
 return new Request("https://staging.invalid/api/collector/ingest",{method:"POST",headers:{
  "content-type":"application/json","X-GovRadar-Timestamp":String(signatureTimestamp),"X-GovRadar-Signature":sig
 },body:raw});
}
test("WebCrypto verifies strict timestamped HMAC and fails for tampering",async()=>{
 const body='{"x":1}',signature=await calculateCollectorSignature(KEY,NOW,body);
 assert.equal(await verifyCollectorSignature(KEY,NOW,body,signature,NOW),true);
 assert.equal(await verifyCollectorSignature(KEY,NOW,body+"!",signature,NOW),false);
 assert.equal(await verifyCollectorSignature(KEY,NOW-400000,body,signature,NOW),false);
 assert.equal(await verifyCollectorSignature("short",NOW,body,signature,NOW),false);
 assert.equal(await verifyCollectorSignature(KEY,NOW,body,"not-hex",NOW),false);
});
test("collector refuses any mutation without secret or D1",async()=>{
 const request=await signedRequest(payload(DFE_SOURCE.id));
 assert.equal((await handleCollectorIngest(request,{},NOW)).status,503);
 const request2=await signedRequest(payload(DFE_SOURCE.id));
 assert.equal((await handleCollectorIngest(request2,{DB:mockDb()},NOW)).status,503);
 const request3=await signedRequest(payload(DFE_SOURCE.id));
 assert.equal((await handleCollectorIngest(request3,{INGEST_HMAC_KEY:KEY},NOW)).status,503);
});
test("collector accepts and audits signed source-specific DfE only once",async()=>{
 const db=mockDb(),env={DB:db,INGEST_HMAC_KEY:KEY};
 const req=await signedRequest(payload(DFE_SOURCE.id));
 const r=await handleCollectorIngest(req,env,NOW);
 assert.equal(r.status,200,await r.clone().text());
 assert.equal((await r.json()).accepted,1);
 assert.equal(db.audits.size,1);assert.equal(db.batches.length,1);
 const replay=await handleCollectorIngest(await signedRequest(payload(DFE_SOURCE.id)),env,NOW);
 assert.equal(replay.status,409);assert.equal(db.batches.length,1);
});
test("signed payload cannot upload arbitrary source, stale snapshot or wrong page",async()=>{
 const env={DB:mockDb(),INGEST_HMAC_KEY:KEY};
 for(const [data,status] of [
  [payload("upsc-unverified"),422],
  [payload(DFE_SOURCE.id,{page:1}),409],
  [payload(DFE_SOURCE.id,{observedAt:NOW-600000}),422],
  [payload(DFE_SOURCE.id,{upstreamBody:JSON.stringify({data:[{...job,url:"https://phishing.invalid/jobs/1"}],meta:{totalPages:2}})}),422]
 ]){
  const r=await handleCollectorIngest(await signedRequest(data),env,NOW);
  assert.equal(r.status,status,JSON.stringify(data).slice(0,90)+" "+await r.clone().text());
 }
});
test("wrong HMAC denies data before any database writes",async()=>{
 const db=mockDb();
 const req=await signedRequest(payload(DFE_SOURCE.id),"WRONG_TEST_SHARED_KEY_XXXXXXXXXXXXXXXXX");
 const result=await handleCollectorIngest(req,{DB:db,INGEST_HMAC_KEY:KEY},NOW);
 assert.equal(result.status,401);assert.equal(db.audits.size,0);
});
test("signed Manitoba RSS uses normal audited provincial adapter",async()=>{
 const db=mockDb(),req=await signedRequest(payload(MANITOBA.id));
 const r=await handleCollectorIngest(req,{DB:db,INGEST_HMAC_KEY:KEY},NOW);
 assert.equal(r.status,200,await r.clone().text());
 assert.equal((await r.json()).accepted,1);
 assert.equal(db.batches.length,1);assert.equal(db.audits.size,1);
});
test("read-only plan exposes cursors without credentials or mutation",async()=>{
 const d=await serveCollectorPlan(mockDb());
 assert.equal(d.status,200);const p=await d.json();
 assert.equal(p.sources[0].nextPage,2);
 assert.ok(p.sources.some(s=>s.sourceId===MANITOBA.id));
 assert.equal((await serveCollectorPlan(null)).status,503);
});

test("signed snapshot cannot be replayed against a different Worker hostname",async()=>{
 const payloadText=JSON.stringify(payload(DFE_SOURCE.id));
 const sig=await calculateCollectorSignature(KEY,NOW,payloadText,"https://staging.invalid");
 assert.equal(await verifyCollectorSignature(KEY,NOW,payloadText,sig,NOW,"https://staging.invalid"),true);
 assert.equal(await verifyCollectorSignature(KEY,NOW,payloadText,sig,NOW,"https://production.invalid"),false);
});

test("concurrent same-ID signed Manitoba requests cannot both cross the atomic claim",async()=>{
 const db=mockDb(),env={DB:db,INGEST_HMAC_KEY:KEY};
 const req=()=>signedRequest(payload(MANITOBA.id));
 const [a,b]=await Promise.all([req(),req()]);
 const responses=await Promise.all([handleCollectorIngest(a,env,NOW),handleCollectorIngest(b,env,NOW)]);
 assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
 assert.equal(db.batches.length,1,"exactly one request should publish a batch");
 assert.equal(db.audits.size,1,"there must be one durable audit ID");
});
test("a failed audit commit never returns successful signed ingestion acknowledgement",async()=>{
 const db=mockDb({auditFailure:true}),env={DB:db,INGEST_HMAC_KEY:KEY};
 const r=await handleCollectorIngest(await signedRequest(payload(MANITOBA.id)),env,NOW);
 assert.equal(r.status,503);
 const info=await r.json();
 assert.equal(info.errorCode,"audit_write_failed");
 assert.equal(db.audits.size,1,"pending atomic receipt remains for investigation");
});
