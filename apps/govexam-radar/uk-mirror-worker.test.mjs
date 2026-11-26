import test from "node:test";
import assert from "node:assert/strict";
import worker,{mirrorUkSnapshot} from "./uk-mirror-worker.mjs";
import {
 UK_MIRROR_CRON,UK_MIRROR_COLUMNS,UK_SOURCE_ID,assertUkRow,
 validateNativeSourceStatus,validateMirroringCron,
 makeMirrorUpsertSql
} from "./uk-mirror-core.mjs";
const EVENT=Date.parse("2026-11-16T18:55:00.000Z");
const NOW=EVENT+3000;
const controller={cron:UK_MIRROR_CRON,scheduledTime:EVENT};
const mkRow=(id,seen=NOW-2000000)=>Object.fromEntries(UK_MIRROR_COLUMNS.map(k=>[k,
 k==="id"?id:k==="source_id"?UK_SOURCE_ID:k==="country"?"United Kingdom":
 k==="source_page"||k==="source_ref"||k==="apply_url"?
  "https://teaching-vacancies.service.gov.uk/jobs/example":
 k==="last_seen_at"||k==="first_seen_at"?seen:k==="closing_at"?"2026-12-09T20:00:00Z":
 k==="title"?"UK teacher":k==="employer"?"A school":k==="published_at"?"2026-11-16T09:00:00Z":
 k==="stream"?"Non-technical":k==="life_status"?"open":"uk"]));
function fixture({rows=[mkRow("uk-1"),mkRow("uk-2")],sourceState="ok",
 sourceAt=NOW-60*60*1000,stateCursor={seenAt:0,id:""},mirrorRows=[]}={}){
 const events=[],existing=new Map(mirrorRows.map(x=>[x.id,x]));
 const state={last_cursor_seen:stateCursor.seenAt,last_cursor_id:stateCursor.id,last_success_at:0,
  status:"never_run",last_attempt_at:0,error_code:""};
 const runs=new Map();
 const latest={state:sourceState,finished_at:sourceAt,details:'{"origin":"scheduled"}'};
 const source={
  prepare(sql){
   if(!/^SELECT /i.test(sql))throw Error("source_mutation_attempt");
   return {bind(...args){
    return {async first(){
     if(sql.includes("source_ingest_runs"))return latest;
     if(sql.includes("MAX(last_seen_at)")){
      const allowed=rows.filter(x=>x.source_id===UK_SOURCE_ID);
      return{highwater:allowed.length?Math.max(...allowed.map(x=>x.last_seen_at)):null,count:allowed.length};
     }
     throw Error("unexpected_source_first");
    },async all(){
     if(!sql.includes("official_job_notices"))throw Error("unexpected_source_all");
     const [id,high,seen,_,cursorId,limit]=args;
     const filtered=rows.filter(r=>r.source_id===id&&r.last_seen_at<=high&&
      (r.last_seen_at>seen||(r.last_seen_at===seen&&r.id>cursorId)))
      .sort((a,b)=>a.last_seen_at-b.last_seen_at||a.id.localeCompare(b.id)).slice(0,limit);
     return{results:filtered};
    }};
   }};
  }
 };
 const target={
  prepare(sql){
   return{
    async first(){
     if(sql.startsWith("SELECT last_cursor_seen"))return{...state};
     throw Error("unexpected_target_first");
    },
    bind(...args){return{
    sql,args,
    async run(){
     events.push({sql,args,method:"run"});
     if(sql.startsWith("INSERT OR IGNORE INTO uk_mirror_runs")){
      if(runs.has(args[0]))return{meta:{changes:0}};
      runs.set(args[0],{id:args[0],state:"running"});return{meta:{changes:1}};
     }
     if(sql.startsWith("UPDATE official_job_notices SET life_status='expired'"))
      return{meta:{changes:0}};
     throw Error("unexpected_target_run");
    },
    async all(){
     if(sql.includes("LEFT JOIN uk_withdrawal_checks"))return{results:[]};
     throw Error("unexpected_target_all");
    },
    async first(){
     if(sql.startsWith("SELECT last_cursor_seen"))return{...state};
     throw Error("unexpected_target_first");
    }};
   }
   };
  },
  async batch(statements){
   for(const statement of statements){
    const {sql,args}=statement;
    events.push({sql,args,method:"batch"});
    if(sql.startsWith("INSERT INTO official_job_notices")){
     const record=Object.fromEntries(UK_MIRROR_COLUMNS.map((k,i)=>[k,args[i]]));
     existing.set(record.id,record);
    }else if(sql.startsWith("UPDATE uk_mirror_state SET last_cursor_seen")){
     Object.assign(state,{last_cursor_seen:args[0],last_cursor_id:args[1],
      last_success_at:args[2],last_attempt_at:args[3],status:args[5],error_code:""});
    }else if(sql.startsWith("UPDATE uk_mirror_runs SET finished_at")){
     Object.assign(runs.get(args[3]),{state:sql.includes("state='error'")?"error":args[1]});
    }else if(sql.startsWith("UPDATE uk_mirror_state SET last_attempt_at")){
     Object.assign(state,{last_attempt_at:args[0],status:"error",error_code:args[1]});
    }else throw Error("unexpected_target_batch_sql:"+sql.slice(0,60));
   }
   return statements.map(()=>({meta:{changes:1}}));
  }
 };
 return{env:{SOURCE_DB:source,MIRROR_DB:target},state,runs,events,existing,source,latest,rows};
}
test("private Worker has a scheduled handler but NO public fetch entrypoint",()=>{
 assert.equal(typeof worker.scheduled,"function");
 assert.equal(typeof worker.fetch,"undefined");
 assert.equal(UK_MIRROR_CRON,"55 */3 * * *");
 assert.equal(UK_MIRROR_COLUMNS.length,21);
 assert.match(makeMirrorUpsertSql(),/ON CONFLICT\(id\) DO UPDATE SET/);
 assert.match(makeMirrorUpsertSql(),/withdrawn_confirmed/);
 assert.match(makeMirrorUpsertSql(),/excluded\.last_seen_at<=official_job_notices\.last_seen_at/);
});
test("real Cloudflare scheduled delivery at 18:55:55 UTC remains within the approved 18:55 cron slot",async()=>{
 const delayed={cron:UK_MIRROR_CRON,scheduledTime:EVENT+55923};
 assert.equal(validateMirroringCron(delayed),EVENT+55923);
 const f=fixture();
 const result=await mirrorUkSnapshot(f.env,delayed,()=>NOW);
 assert.equal(result.status,"ok");
 assert.equal(f.runs.size,1);
 assert.ok([...f.runs.keys()][0].includes(String(EVENT+55923)));
 for(const invalid of [EVENT-60000,EVENT+60000,EVENT+5*60000]){
  assert.throws(()=>validateMirroringCron({cron:UK_MIRROR_CRON,scheduledTime:invalid}),/unapproved_uk_mirror_schedule/);
 }
});
test("Cron handler refuses untrusted trigger, timestamp and extra bindings",async()=>{
 for(const wrong of [
  {cron:"* * * * *",scheduledTime:EVENT},
  {cron:UK_MIRROR_CRON,scheduledTime:EVENT-60000},
  {cron:UK_MIRROR_CRON,scheduledTime:NaN}
 ])assert.throws(()=>validateMirroringCron(wrong),/unapproved_uk_mirror_schedule/);
 const f=fixture();
 await assert.rejects(()=>mirrorUkSnapshot({...f.env,SECRET:"unauthorized"},controller,()=>NOW),
  /uk_mirror_binding_inventory_invalid/);
 assert.equal(f.events.length,0);
});
test("successful UK-only mirror advances cursor and audits exactly once",async()=>{
 const f=fixture();
 const res=await mirrorUkSnapshot(f.env,controller,()=>NOW);
 assert.deepEqual({status:res.status,count:res.rowsUpserted},{status:"ok",count:2});
 assert.equal(f.existing.size,2);
 assert.equal(f.state.status,"ok");
 assert.equal(f.state.last_cursor_id,"uk-2");
 assert.equal(f.runs.size,1);
 assert.equal(f.events.filter(x=>x.method==="batch"&&x.sql.startsWith("INSERT INTO official_job_notices")).length,2);
 assert.ok(f.events.every(x=>!/^DELETE|^DROP|^ALTER|^CREATE/.test(x.sql)));
 const again=await mirrorUkSnapshot(f.env,controller,()=>NOW+1000);
 assert.equal(again.status,"duplicate_cron_ignored");
 assert.equal(f.runs.size,1);
});
test("source mistakes and expired or failed native imports fail closed with error evidence",async()=>{
 for(const opts of [
  {sourceAt:NOW-7*3600000},
  {sourceState:"error"},
  {rows:[{...mkRow("wrong"),source_id:"manitoba-jobs"}]},
  {rows:[{...mkRow("bad"),source_page:"https://evil.example/jobs/bad"}]}
 ]){
  const f=fixture(opts);
  await assert.rejects(()=>mirrorUkSnapshot(f.env,controller,()=>NOW),
   /uk_native_source_not_fresh|source_row_not_approved|uk_mirror_source_snapshot_invalid/);
  assert.equal(f.state.status,"error");
  assert.equal(f.existing.size,0);
  assert.equal([...f.runs.values()][0].state,"error");
 }
});
test("cursor can resume after a previous successful batch without rewriting older rows",async()=>{
 const old=mkRow("uk-0",NOW-3000000),last=mkRow("uk-1",NOW-2000000),next=mkRow("uk-2",NOW-1000000);
 const f=fixture({rows:[old,last,next],mirrorRows:[old,last],
  stateCursor:{seenAt:last.last_seen_at,id:last.id}});
 const res=await mirrorUkSnapshot(f.env,controller,()=>NOW);
 assert.equal(res.rowsUpserted,1);
 assert.equal(f.existing.size,3);
 assert.equal(f.state.last_cursor_id,"uk-2");
});
test("strict source domain checks reject foreign and spoofed URLs",()=>{
 for(const url of ["https://teaching-vacancies.service.gov.uk.evil.test/jobs/1",
  "http://teaching-vacancies.service.gov.uk/jobs/1",
  "https://teaching-vacancies.service.gov.uk/about",
  "https://teaching-vacancies.service.gov.uk/jobs/1?track=x"]){
  assert.throws(()=>assertUkRow({...mkRow("x"),source_page:url}),/source_row_not_approved/);
 }
 assert.equal(assertUkRow(mkRow("yes")),true);
});
test("native fresh status requires an actual scheduled import, not a signed collector",()=>{
 assert.equal(validateNativeSourceStatus({state:"ok",finished_at:NOW-10000,details:'{"origin":"scheduled"}'},NOW),NOW-10000);
 assert.throws(()=>validateNativeSourceStatus({state:"ok",finished_at:NOW-10000,details:'{"origin":"signed_portable_collector"}'},NOW),/uk_native_source_not_fresh/);
});

test("first audit INSERT failure is recorded without copying source or hiding error",async()=>{
 const f=fixture();
 const original=f.env.MIRROR_DB.prepare.bind(f.env.MIRROR_DB);
 f.env.MIRROR_DB.prepare=sql=>{
  if(sql.startsWith("INSERT OR IGNORE INTO uk_mirror_runs")){
   return {bind(){return{async run(){throw Error("initial_d1_insert_failed")}}}};
  }
  if(sql.startsWith("UPDATE uk_mirror_state SET last_attempt_at")){
   return {bind(now,code){return{async run(){
    f.state.last_attempt_at=now;f.state.status="error";f.state.error_code=code;
    return{meta:{changes:1}};
   }}}};
  }
  return original(sql);
 };
 await assert.rejects(()=>mirrorUkSnapshot(f.env,controller,()=>NOW),/initial_d1_insert_failed/);
 assert.equal(f.state.status,"error");
 assert.equal(f.state.last_attempt_at,NOW);
 assert.match(f.state.error_code,/initial_d1_insert_failed/);
 assert.equal(f.existing.size,0);
 assert.equal(f.runs.size,0);
});
