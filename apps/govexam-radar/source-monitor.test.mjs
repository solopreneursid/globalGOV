import test from "node:test";
import assert from "node:assert/strict";
import {runScheduledPortalChecks,getPortalStatus} from "./source-monitor.mjs";
import worker from "./worker.js";
function mockDatabase(){
 const statuses=new Map(),history=[];
 function query(sql,args=[]){
   return {
     async all(){
       if(sql.includes("FROM portal_status"))return {results:[...statuses].map(([source_id,r])=>({source_id,...r}))};
       return {results:[]};
     },
     async run(){
       if(sql.startsWith("INSERT INTO portal_status")){const [source_id,status,http_status,checked_at,latency_ms]=args;statuses.set(source_id,{status,http_status,checked_at,latency_ms});return {success:true,meta:{changes:1}};}
       if(sql.startsWith("INSERT INTO portal_history")){history.push(args);return {success:true,meta:{changes:1}};}
       if(sql.startsWith("DELETE FROM portal_history"))return {success:true,meta:{changes:0}};
       throw Error("Unexpected SQL "+sql);
     },
     bind(...params){return query(sql,params);}
   };
 }
 return {prepare(sql){return query(sql);},async batch(statements){return Promise.all(statements.map(x=>x.run()));},statuses,history};
}
const sources=[{id:"a",name:"A",country:"India",category:"Recruitment",url:"https://a.example"},{id:"b",name:"B",country:"India",category:"Recruitment",url:"https://b.example"},{id:"c",name:"C",country:"UK",category:"Recruitment",url:"https://c.example"},{id:"d",name:"D",country:"Canada",category:"Recruitment",url:"https://d.example"}];
test("monitoring fails transparently when no D1 binding is supplied",async()=>{
 const r=await worker.fetch(new Request("https://test.invalid/api/source-status"));
 assert.equal(r.status,503);assert.equal((await r.json()).error,"not_configured");
});
test("scheduled monitor checks only oldest subset and writes truthful outcomes",async()=>{
 const db=mockDatabase(),original=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return new Response("alive",{status:200});};
 try {
   const one=await runScheduledPortalChecks(db,sources,2);
   assert.equal(one.length,2);assert.equal(db.statuses.size,2);assert.equal(db.history.length,2);
   const two=await runScheduledPortalChecks(db,sources,2);
   assert.equal(two.length,2);assert.equal(db.statuses.size,4);
   assert.equal(count,4);
   const api=await getPortalStatus(db,sources);
   assert.equal(api.status,200);const body=await api.json();assert.equal(body.total,4);assert.equal(body.checkedSources,4);
   assert.ok(body.sources.every(s=>s.status==="reachable"&&!s.stale));
   assert.equal(body.verifiedVacancies,0);
 }finally{globalThis.fetch=original;}
});
