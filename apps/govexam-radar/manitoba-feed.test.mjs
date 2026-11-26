import test from "node:test";
import assert from "node:assert/strict";
import {MANITOBA,normalizeManitobaItem,parseManitobaRss,ingestManitoba} from "./manitoba-feed.mjs";
const DATE=Date.parse("2026-11-16T12:00:00Z");
function item({
 title="Crown Counsel",host="jobsearch.gov.mb.ca",id="130448",
 closing="2026-12-09",posted="2026-11-09",department="Manitoba Justice",type="Open"
}={}){
 const url="http://"+host+"/jow/advancedResult.action?postingType=0&amp;category=0&amp;ID="+id+"#position";
 const description=[
  ["Ad No","45815"],["Job Classification(s)","Legal Counsel 2-3"],
  ["Department",department],["Location(s)","Winnipeg MB"],["Closing Date",closing],
  ["Posted Date",posted],["Posting Type",type],
 ].map(([k,v])=>"&lt;strong&gt;"+k+"&lt;/strong&gt;: "+v+"&lt;br /&gt;").join("");
 return "<item><title>"+title+"&#13;</title><link>"+url+"</link><description>"+description+"</description><guid>"+id+"</guid></item>";
}
const feed=(...items)=>'<?xml version="1.0"?><rss version="2.0"><channel><title>Manitoba Government</title>'+items.join("")+'</channel></rss>';
test("Manitoba RSS is parsed into genuine provincial government records",()=>{
 const r=normalizeManitobaItem(item(),DATE);
 assert.equal(r.sourceId,MANITOBA.id);
 assert.equal(r.title,"Crown Counsel");
 assert.equal(r.employer,"Manitoba Justice");
 assert.equal(r.country,"Canada");
 assert.equal(r.jurisdictionCode,"CA-MB");
 assert.equal(r.governmentTier,"province");
 assert.equal(r.employerType,"provincial_government");
 assert.equal(r.closingAt,"2026-12-09T23:59:59.000Z");
 assert.match(r.sourceRef,/^https:\/\/jobsearch.gov.mb.ca\/jow\/advancedResult\.action\?ID=130448#position$/);
});
test("rejects foreign domains, closed/future notices and duplicate RSS records",()=>{
 assert.equal(normalizeManitobaItem(item({host:"evil.example"}),DATE).error,"non_official_url");
 assert.equal(normalizeManitobaItem(item({closing:"2026-10-30"}),DATE).error,"expired");
 assert.equal(normalizeManitobaItem(item({posted:"2026-12-01"}),DATE).error,"future_published");
 assert.equal(normalizeManitobaItem(item({type:"Closed"}),DATE).error,"not_open");
 const a=parseManitobaRss(feed(item(),item(),item({id:"130449",title:"Office Assistant",closing:"2026-10-01"})),DATE);
 assert.equal(a.received,3);assert.equal(a.valid.length,1);assert.equal(a.rejected.duplicate,1);assert.equal(a.rejected.expired,1);
 assert.throws(()=>parseManitobaRss("<invalid-feed/>"),/invalid_manitoba_rss/);
 assert.throws(()=>parseManitobaRss('<!DOCTYPE foo><rss><channel></channel></rss>'),/unsupported_xml_declarations/);
});
function mockDb(){
 const writes=[],batches=[];let page=1;
 return {
  writes,batches,
  prepare(sql){
   const stmt={params:[],bind(...v){this.params=v;return this;},async first(){return sql.includes("SELECT next_page")?{next_page:page}:null;},async run(){
     writes.push({sql,params:this.params});
     if(sql.includes("source_feed_cursors"))page=Number(this.params[1]);
     return {meta:{changes:1},success:true};
   }};
   return stmt;
  },
  async batch(list){batches.push(list.length);return Promise.all(list.map(s=>s.run()));}
 };
}
test("provincial import batches are bounded, tracked and audited",async()=>{
 const db=mockDb();
 const xml=feed(item(),item({title:"Office Assistant",id:"130449"}));
 const fetcher=async()=>new Response(xml,{status:200,headers:{"content-type":"text/xml;charset=UTF-8"}});
 const result=await ingestManitoba(db,fetcher,DATE);
 assert.equal(result.state,"ok");assert.equal(result.received,2);assert.equal(result.accepted,2);
 assert.deepEqual(db.batches,[2]);
 assert.ok(db.writes.some(x=>x.sql.includes("source_ingest_runs")));
 assert.ok(db.writes.some(x=>x.sql.includes("source_feed_cursors")));
});
test("upstream HTTP 403 cannot publish false jobs or shift cursor",async()=>{
 const db=mockDb(),fetcher=async()=>new Response("Denied",{status:403});
 const result=await ingestManitoba(db,fetcher,DATE);
 assert.equal(result.state,"error");assert.equal(result.errorCode,"http_403");assert.equal(result.accepted,0);
 assert.deepEqual(db.batches,[]);
 assert.equal(db.writes.filter(x=>x.sql.includes("source_ingest_runs")).length,1);
});

test("Manitoba follow only allowlisted HTTPS RSS redirects",async()=>{
 const db=mockDb();let calls=0;
 const fetcher=async()=>{
  calls++;
  if(calls===1)return new Response(null,{status:301,headers:{Location:MANITOBA.url}});
  return new Response(feed(item()),{headers:{"content-type":"text/xml"}});
 };
 const result=await ingestManitoba(db,fetcher,DATE);
 assert.equal(result.state,"ok");assert.equal(result.accepted,1);assert.equal(calls,2);
});
test("Manitoba reject cross-host redirects without persisting jobs",async()=>{
 const db=mockDb();let calls=0;
 const fetcher=async()=>{
  calls++;
  return new Response(null,{status:302,headers:{Location:"https://malicious.invalid/rss/newJobPostingsFeed.rss"}});
 };
 const result=await ingestManitoba(db,fetcher,DATE);
 assert.equal(result.state,"error");assert.equal(result.errorCode,"unsafe_redirect");
 assert.equal(db.batches.length,0);assert.equal(calls,1);
});
test("Manitoba retry is bounded after transient fetch exception",async()=>{
 const db=mockDb();let count=0;
 const fetcher=async()=>{
  if(++count===1)throw new TypeError("connection reset");
  return new Response(feed(item()),{headers:{"content-type":"application/rss+xml"}});
 };
 const result=await ingestManitoba(db,fetcher,DATE);
 assert.equal(result.state,"ok");assert.equal(count,2);
});
