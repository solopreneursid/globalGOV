// Isolated zero-cost collector candidate. No browser-facing database API.
import {DFE_SOURCE,ingestDfE} from "./official-feed.mjs";
import {fetchOfficialSource,sourceAutomationPolicy} from "./source-connectors.mjs";
export const BUDGET=Object.freeze({reads:200000,writes:12000,fetches:32,perRunReads:25000,perRunWrites:1500,perRunFetches:4});
const HOUR=3600000;
export function collectionSlot(time){
 if(!Number.isSafeInteger(time)||time<=0)return null;
 const d=new Date(time);
 if(d.getUTCHours()%3!==0||d.getUTCMinutes()!==0)return null;
 const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours());
 return {day:d.toISOString().slice(0,10),slot:new Date(start).toISOString(),start};
}
const BUDGET_SOURCE="globalgov-zero-cost-budget";
export async function reserveCollection(db,slot,now=Date.now()){
 const expected=slot?collectionSlot(slot.start):null;
 if(!expected||slot.slot!==expected.slot||slot.day!==expected.day||!db||now<slot.start||now-slot.start>15*60000)return false;
 const start=Date.parse(slot.day+"T00:00:00Z"),end=start+24*HOUR,id=BUDGET_SOURCE+":"+slot.slot;
 // A single SQLite write statement atomically claims the slot. The existing
 // audit table avoids introducing another database or altering export schemas.
 const r=await db.prepare("INSERT INTO source_ingest_runs(id,source_id,started_at,finished_at,state,http_status,received,accepted,discarded,error_code,details) SELECT ?,?,?,?,'error',NULL,0,0,0,'zero_cost_reserved',? WHERE (SELECT COUNT(*) FROM source_ingest_runs WHERE source_id=? AND started_at>=? AND started_at<?)<8 ON CONFLICT(id) DO NOTHING")
 .bind(id,BUDGET_SOURCE,now,now,JSON.stringify({reservedReads:BUDGET.perRunReads,reservedWrites:BUDGET.perRunWrites,reservedFetches:BUDGET.perRunFetches}),BUDGET_SOURCE,start,end).run();
 return r?.meta?.changes===1;
}
function boundedDb(db,counters){
 const available=()=>{if(counters.reads>=BUDGET.perRunReads||counters.writes>=BUDGET.perRunWrites)throw Error("collection_row_budget");};
 const record=r=>{
  const m=r?.meta;
  if(!Number.isSafeInteger(m?.rows_read)||!Number.isSafeInteger(m?.rows_written))throw Error("collection_usage_unconfirmed");
  counters.reads+=m.rows_read;counters.writes+=m.rows_written;
  if(counters.reads>BUDGET.perRunReads||counters.writes>BUDGET.perRunWrites)throw Error("collection_row_budget_exceeded");
  return r;
 };
 const wrap=statement=>({raw:statement,bind(...args){return wrap(statement.bind(...args));},async run(){available();return record(await statement.run());},async all(){available();return record(await statement.all());},async first(){available();return record(await statement.all()).results?.[0]??null;}});
 return {prepare(sql){return wrap(db.prepare(sql));},async batch(statements){available();if(statements.length>100)throw Error("collection_batch_limit");const result=await db.batch(statements.map(s=>s.raw));for(const r of result)record(r);return result;}};
}
export async function runZeroCostCollection({db,scheduledTime,now=Date.now(),fetcher=fetch,ingest=ingestDfE}={}){
 const slot=collectionSlot(scheduledTime);
 if(!await reserveCollection(db,slot,now))return {state:"blocked",reason:"slot_or_daily_budget"};
 const counters={reads:0,writes:0,fetches:0};let result={state:"error",errorCode:"collection_failed"};
 const transport=async(input,options)=>{
  if(counters.fetches>=BUDGET.perRunFetches)throw Error("collection_fetch_budget");
  counters.fetches++;return fetcher(input,options);
 };
 const source={id:DFE_SOURCE.id,url:DFE_SOURCE.api};
 const policy=sourceAutomationPolicy(source);
 try{
  if(!policy.commercialReuseApproved||!policy.automatedCollectionEnabled)throw Error("source_policy_not_permitted");
  const guarded=async url=>{
   const r=await fetchOfficialSource({source,url:String(url),policyOverride:policy,fetcher:transport,maxBytes:2*1024*1024,minIntervalMs:5000});
   return new Response(r.bytes,{status:r.status,headers:{"content-type":r.contentType}});
  };
  result=await ingest(boundedDb(db,counters),guarded,now,{origin:"scheduled"});
  if(result?.state!=="ok")throw Error(result?.errorCode||"collection_not_successful");
 }catch(e){result={state:"error",errorCode:String(e?.message||"collection_failed").replace(/[^a-zA-Z0-9_]/g,"_").slice(0,100)};}
 await db.prepare("UPDATE source_ingest_runs SET finished_at=?,state=?,error_code=?,details=? WHERE id=? AND source_id=? AND error_code='zero_cost_reserved'").bind(Date.now(),result.state==="ok"?"ok":"error",result.errorCode||null,JSON.stringify({reservedReads:BUDGET.perRunReads,reservedWrites:BUDGET.perRunWrites,reservedFetches:BUDGET.perRunFetches,...counters}),BUDGET_SOURCE+":"+slot.slot,BUDGET_SOURCE).run();
 return {state:result.state,errorCode:result.errorCode||null,accepted:result.accepted||0,...counters};
}
export default{
 async fetch(request){return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});},
 async scheduled(controller,env,ctx){
  if(env.GLOBALGOV_ZERO_COST_COLLECTOR!=="true"||controller.cron!=="0 */3 * * *")return;
  ctx.waitUntil(runZeroCostCollection({db:env.DB,scheduledTime:controller.scheduledTime}).then(r=>console.log(JSON.stringify({event:"zero_cost_collection",...r}))));
 }
};
