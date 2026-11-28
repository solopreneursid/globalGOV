import test from "node:test";
import assert from "node:assert/strict";
import {NYC_SOURCE,parseNycSnapshot,ingestNyc,nycPublicationGate} from "./nyc-feed.mjs";
const now=Date.parse("2026-11-28T12:00:00Z");
const row={job_id:"123456",agency:"Synthetic city agency",business_title:"Synthetic engineer",posting_type:"External",post_until:"07-DEC-2026",posting_date:"2026-11-20T00:00:00.000",process_date:"2026-11-27T00:00:00.000"};
const policy={sourceId:NYC_SOURCE.id,host:"data.cityofnewyork.us",automationStatus:"approved",reuseStatus:"approved",automatedCollectionEnabled:true,allowedPaths:["/resource/kpav-sd4t.json"],allowedContentTypes:["application/json"]};
test("NYC snapshot excludes internal, invalid, closed and contradictory rows; no invented application link",()=>{
 const result=parseNycSnapshot([row,{...row,job_id:"2",posting_type:"Internal"},{...row,job_id:"3",post_until:null},{...row,job_id:"4",post_until:"2026-11-27"},{...row,job_id:"5"},{...row,job_id:"5",business_title:"Conflicting title"}],now);
 assert.equal(result.rows.length,1);
 const x=result.rows[0];assert.equal(x.closingAt,"2026-12-07T05:00:00.000Z");assert.equal(x.applyUrl,"https://cityjobs.nyc.gov/");assert.equal(new URL(x.sourcePage).searchParams.get("job_id"),row.job_id);
 assert.equal(result.rejected.duplicate_conflict,1);
 assert.throws(()=>parseNycSnapshot([{...row,process_date:"2026-11-01"}],now),/stale/);
 assert.throws(()=>parseNycSnapshot([{...row,post_until:"31-FEB-2027"}],now),/eligible/);
 assert.throws(()=>parseNycSnapshot(Array(5001).fill(row),now),/oversized/);
});
test("date-only boundary uses local midnight on daylight-saving transition date",()=>{
 const t=Date.parse("2027-03-12T12:00:00Z");
 const x=parseNycSnapshot([{...row,posting_date:"2027-03-11",process_date:"2027-03-12",post_until:"2027-03-14"}],t).rows[0];
 assert.equal(x.closingAt,"2027-03-14T05:00:00.000Z");
});
test("snapshot gate requires distinct successful recent scheduled cycles",async()=>{
 const mock=rows=>({prepare(){return{bind(){return{all:async()=>({results:rows})}}}}});
 const first={startedAt:now-1000,finishedAt:now-500,state:"ok",details:'{"snapshot":"complete","origin":"scheduled"}'};
 const previous={...first,startedAt:now-3*3600000,finishedAt:now-3*3600000+500};
 assert.equal((await nycPublicationGate(mock([first]),now)).ready,false);
 assert.equal((await nycPublicationGate(mock([first,previous]),now)).ready,true);
 assert.equal((await nycPublicationGate(mock([{...first,state:"error"},previous]),now)).ready,false);
 assert.equal((await nycPublicationGate(mock([first,first]),now)).ready,false);
});
test("failed or denied collection does not write catalogue rows",async()=>{
 const calls=[];
 const db={prepare(sql){return{bind(...args){return{run:async()=>{calls.push({sql,args});return{meta:{changes:1}}}}}}},batch:async()=>{throw Error("unexpected_write")}};
 const x=await ingestNyc(db,null,{now,fetcher:async()=>{throw Error("unexpected_fetch")}});
 assert.equal(x.state,"error");assert.equal(x.errorCode,"nyc_source_policy_required");assert.equal(calls.length,2);
});
