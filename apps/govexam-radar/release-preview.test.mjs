import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";
import {serveOfficialNotices,DFE_SOURCE} from "./official-feed.mjs";
import {allowedCommercialPreviewSources,assertSourceRightsForCommercialRelease} from "./source-rights.mjs";

const UK=DFE_SOURCE.id;
const MOCK=[{id:"uk-1",sourceId:UK,country:"United Kingdom",title:"Test UK job",sourceUrl:"https://teaching-vacancies.service.gov.uk/jobs/test"},
 {id:"ca-1",sourceId:"manitoba-jobs",country:"Canada",title:"Test Manitoba job",sourceUrl:"https://jobsearch.gov.mb.ca/jow/advancedResult.action?ID=12345"}];
function db(){
 const queries=[];
 return {queries,prepare(sql){
  const q={sql,args:[],
   bind(...values){this.args=values;queries.push(this);return this;},
   async all(){
    const filtered=sql.includes("source_id IN (?)");
    const countryIdx=sql.includes("country=?")?this.args.indexOf("Canada"):-1;
    return{results:MOCK.filter(x=>(!filtered||x.sourceId===UK)&&(countryIdx===-1||x.country==="Canada"))};
   },
   async first(){
    const filtered=sql.includes("source_id IN (?)");
    return{total:MOCK.filter(x=>!filtered||x.sourceId===UK).length};
   }};return q;
 }};
}
test("only the licensed UK source can be selected for a commercial preview",()=>{
 assert.deepEqual(allowedCommercialPreviewSources(),[UK]);
 assert.equal(assertSourceRightsForCommercialRelease([UK]),true);
 assert.throws(()=>assertSourceRightsForCommercialRelease([UK,"manitoba-jobs"]),/commercial_reuse_review_pending/);
});
test("release preview filters the DB query, total count and source metadata, not just the UI",async()=>{
 const storage=db();
 const response=await serveOfficialNotices(storage,new URLSearchParams(),"uk_only_release_preview");
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.releaseProfile,"uk_only_release_preview");
 assert.equal(data.publicLaunchAuthorized,false);
 assert.deepEqual(data.notices.map(x=>x.sourceId),[UK]);
 assert.equal(data.total,1);
 assert.deepEqual(data.sources.map(x=>x.id),[UK]);
 const sql=storage.queries.filter(x=>x.sql.includes("official_job_notices"));
 assert.equal(sql.length,2);
 for(const q of sql){assert.match(q.sql,/source_id IN \(\?\)/);assert.ok(q.args.includes(UK));}
});
test("unapproved sources and attempts to select them are rejected before database reads",async()=>{
 for(const source of ["manitoba-jobs","india-employment-news","UNKNOWN"]){
  const storage=db();
  const r=await serveOfficialNotices(storage,new URLSearchParams({source}),"uk_only_release_preview");
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,"source_not_approved_for_release_preview");
  assert.equal(storage.queries.length,0);
 }
});
test("country and keyword filters cannot bypass the UK scope",async()=>{
 const storage=db();
 const r=await serveOfficialNotices(storage,new URLSearchParams({country:"Canada",q:"Manitoba"}),"uk_only_release_preview");
 const data=await r.json();
 assert.equal(r.status,200);
 assert.deepEqual(data.notices,[]);
 assert.equal(data.sources.length,1);
 assert.ok(storage.queries.some(x=>x.sql.includes("source_id IN (?)")&&x.sql.includes("country=?")));
});
test("research metadata keeps source-specific rights and ISRO attribution separate",async()=>{
 const storage=db();
 const r=await serveOfficialNotices(storage,new URLSearchParams(),"research"),data=await r.json();
 assert.equal(r.status,200);
 assert.equal(data.releaseProfile,"research");
 assert.equal(data.sources.length,5);
 assert.equal(data.sources.find(x=>x.id==='india-ssb-recruitment').commercialReuseApprovedForCurrentFields,true);
 assert.equal(data.sources.find(x=>x.id==="manitoba-jobs").commercialReuseApprovedForCurrentFields,false);
 assert.equal(data.sources.find(x=>x.id==="india-isro-opportunities").commercialReuseApprovedForCurrentFields,true);
 assert.equal(data.notices.length,2);
});
test("unknown server mode fails closed and cannot be enabled through a query string",async()=>{
 const storage=db();
 const bad=await serveOfficialNotices(storage,new URLSearchParams(),"unknown_profile");
 assert.equal(bad.status,503);
 assert.equal(storage.queries.length,0);
 const self=await worker.fetch(new Request("https://example.test/api/release-preview/notices?scope=research"));
 assert.equal(self.status,503,"missing D1 is never replaced with invented preview records");
});
