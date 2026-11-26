import test from "node:test";
import assert from "node:assert/strict";
import {serveIngestionStatus,DFE_SOURCE} from "./official-feed.mjs";
import {MANITOBA} from "./manitoba-feed.mjs";
const recent=Date.now()-45000;
function statusDb(nativeManitoba=false,nativeCount=1,lastNativeFailure=false){
 const observedSql=[];
 return {observedSql,
  prepare(sql){
   return {bind(){return this},
    async first(){return{total:238}},
    async all(){
     if(sql.includes("lastSuccessfulSignedAt")){
      observedSql.push(sql);
      return {results:[
       {sourceId:DFE_SOURCE.id,lastSuccessfulScheduledAt:recent,lastSuccessfulSignedAt:null,lastNativeAttemptAt:lastNativeFailure?recent+1000:recent,recentNativeSuccessCount:nativeCount},
       {sourceId:MANITOBA.id,lastSuccessfulScheduledAt:nativeManitoba?recent:null,lastSuccessfulSignedAt:recent,lastNativeAttemptAt:nativeManitoba?(lastNativeFailure?recent+1000:recent):null,recentNativeSuccessCount:nativeManitoba?nativeCount:0}
      ]};
     }
     return {results:[]};
    }
   };
  }
 };
}
test("an authenticated one-time transfer is not mistaken for native scheduled operation",async()=>{
 const db=statusDb(false),res=await serveIngestionStatus(db),json=await res.json();
 assert.equal(res.status,200);
 assert.equal(json.automation.signedCollectorVerified,true);
 assert.equal(json.automation.observedForAllSources,false);
 assert.equal(json.automation.healthy,false);
 assert.equal(json.automation.twoCycleCronGatePassed,false);
 const can=json.automation.sources.find(x=>x.sourceId===MANITOBA.id);
 assert.equal(can.signedCollectorSuccessObserved,true);
 assert.equal(can.scheduledSuccessObserved,false);
 assert.ok(db.observedSql[0].includes('details LIKE'));
 assert.ok(db.observedSql[0].includes('signed_portable_collector'));
});
test("native Cron is verified only when each official source has its own recent Cron proof",async()=>{
 const r=await serveIngestionStatus(statusDb(true)),json=await r.json();
 assert.equal(json.automation.observedForAllSources,true);
 assert.equal(json.automation.healthy,true);
 assert.equal(json.automation.twoCycleCronGatePassed,false,"one Cron cycle for each source is not a sustained observation");
});
test("two recent native Cron cycles from each source satisfy the dedicated two-cycle gate",async()=>{
 const r=await serveIngestionStatus(statusDb(true,2)),data=await r.json();
 assert.equal(data.automation.twoCycleCronGatePassed,true);
 assert.ok(data.automation.sources.every(x=>x.recentNativeSuccessCount===2&&x.twoCycleNativeProof));
});
test("two historical successes do not hide a newer native fetch failure",async()=>{
 const r=await serveIngestionStatus(statusDb(true,2,true)),data=await r.json();
 assert.equal(data.automation.healthy,true,"display freshness remains a separate metric");
 assert.equal(data.automation.twoCycleCronGatePassed,false,"failed latest native attempt blocks two-cycle gate");
 assert.ok(data.automation.sources.every(x=>!x.twoCycleNativeProof));
});
