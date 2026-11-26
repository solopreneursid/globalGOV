import test from "node:test";
import assert from "node:assert/strict";
import {INDIA_EMPLOYMENT_NEWS,parseEmploymentNews,ingestEmploymentNews} from "./india-employment-news.mjs";
const NOW=Date.parse("2026-11-16T09:00:00Z");
const row=(published="11/02/2026",employer="SAINIK SCHOOL NAGROTA",title="TGT (COMPUTER SCIENCE)",method="Recruitment",closing="21/11/2026")=>
 "<tr><td>"+published+"</td><td>"+employer+"</td><td>"+title+"</td><td>"+method+"</td><td>"+closing+"</td></tr>";
const html=(...rows)=>"<html><body><h2>All JOBS</h2><table><tr><th>ISSUED DATE (MM/DD/YYYY)</th><th>ORGANISATION</th><th>POST</th><th>METHOD OF APPOINTMENT</th><th>LAST DATE (DD/MM/YYYY)</th></tr>"+rows.join("")+"</table></body></html>";
test("only authentic table rows become accurately labelled India recruitment summaries",()=>{
 const x=parseEmploymentNews(html(row()),NOW);
 assert.equal(x.valid.length,1);
 assert.equal(x.valid[0].sourceId,"india-employment-news");
 assert.equal(x.valid[0].employer,"SAINIK SCHOOL NAGROTA");
 assert.equal(x.valid[0].closingAt,"2026-11-21T18:29:59.000Z");
 assert.equal(x.valid[0].publishedAt,"2026-11-02T00:00:00.000Z");
 assert.equal(x.valid[0].sourcePage,INDIA_EMPLOYMENT_NEWS.url);
 assert.equal(x.valid[0].employerType,"government_recruitment_digest");
 assert.equal(x.valid[0].governmentTier,"unclassified");
 assert.equal(x.valid[0].reviewState,"official_feed_unreviewed");
});
test("old, impossible, duplicate and fake entries do not invent live jobs",()=>{
 const x=parseEmploymentNews(html(
  row(),row(),
  row("11/02/2026","old employer","closed","Recruitment","10/11/2026"),
  row("11/02/2026","bad date","fake","Recruitment","31/02/2027"),
  row("11/19/2026","future","fake","Recruitment","21/11/2026"),
  row("11/02/2026","unknown","noise","Private sale","21/11/2026")
 ),NOW);
 assert.equal(x.valid.length,1);
 assert.equal(x.rejected.duplicate,1);
 assert.equal(x.rejected.invalid,1);
 assert.equal(x.rejected.closed,1);
 assert.equal(x.rejected.future,1);
 assert.throws(()=>parseEmploymentNews("<html>Other page</html>",NOW),/unsupported_india_source_schema/);
});
function mockDb(){
 const batches=[],audits=[];
 return{batches,audits,prepare(sql){const q={params:[],bind(...a){this.params=a;return this;},async run(){if(sql.includes("source_ingest_runs"))audits.push(this.params);return{success:true};}};return q;},
 async batch(x){batches.push(x);return Promise.all(x.map(q=>q.run()));}};
}
test("scheduled India digest import persists at most genuine open summaries and audits",async()=>{
 const db=mockDb(),f=async()=>new Response(html(row()),{status:200,headers:{"content-type":"text/html"}});
 const result=await ingestEmploymentNews(db,f,NOW);
 assert.equal(result.state,"ok");
 assert.equal(result.accepted,1);
 assert.equal(db.batches[0].length,1);
 assert.equal(db.audits.length,1);
});
test("a valid but expired-only bulletin records zero new jobs",async()=>{
 const db=mockDb(),f=async()=>new Response(html(row("11/02/2026","Employer","Old role","Recruitment","14/11/2026")),{headers:{"content-type":"text/html"}});
 const result=await ingestEmploymentNews(db,f,NOW);
 assert.equal(result.state,"ok");assert.equal(result.accepted,0);
 assert.equal(db.batches.length,0);assert.equal(db.audits.length,1);
});
test("403, invalid schema and redirect cannot publish anything",async()=>{
 for(const response of [new Response("denied",{status:403}),new Response("<html>blocked</html>",{headers:{"content-type":"text/html"}}),new Response("",{status:302,headers:{"Location":"https://elsewhere.invalid"}})]){
  const db=mockDb(),result=await ingestEmploymentNews(db,async()=>response,NOW);
  assert.equal(result.state,"error");
  assert.equal(result.accepted,0);assert.equal(db.batches.length,0);
  assert.equal(db.audits.length,1);
 }
});
