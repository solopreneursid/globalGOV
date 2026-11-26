import test from "node:test";
import assert from "node:assert/strict";
import {reconcileUkClosures} from "./uk-mirror-lifecycle.mjs";
import {UK_SOURCE_ID} from "./uk-mirror-core.mjs";
import {nextWithdrawalEvidence,checkOfficialUkListing,validWithdrawalCandidate,
 reconcileExpiredSql,CHECK_INTERVAL_MS,MAX_UK_CHECKS} from "./uk-withdrawal-policy.mjs";

const NOW=Date.parse("2026-11-16T16:30:00Z");
const HOUR=3600000;
function listing(id="uk-1",seen=NOW-72*HOUR){
 const link="https://teaching-vacancies.service.gov.uk/jobs/official-"+id;
 return{id,source_id:UK_SOURCE_ID,country:"United Kingdom",title:"Teacher",
  employer:"UK school",source_page:link,source_ref:link,apply_url:link,
  last_seen_at:seen,first_seen_at:seen,closing_at:"2026-12-29T12:00:00Z",
  life_status:"open"};
}
function fakeDB({records=[listing()],sourceNewer=false}={}){
 const rows=new Map(records.map(x=>[x.id,{...x}]));
 const checks=new Map();
 const events=[],sourceReads=[];
 const source={prepare(sql){
  if(!sql.startsWith("SELECT last_seen_at,source_page,closing_at,life_status FROM official_job_notices"))
   throw Error("source_db_must_be_read_only");
  return{bind(id,sourceId){return{async first(){
   sourceReads.push({id,sourceId});
   const value=rows.get(id);
   return value&&value.source_id===sourceId?{last_seen_at:value.last_seen_at+(sourceNewer?1:0),
    source_page:value.source_page,closing_at:value.closing_at,life_status:value.life_status}:null;
  }};}};
 }};
 const target={
  prepare(sql){
   return{bind(...args){return{
    sql,args,
    async run(){
     if(!sql.startsWith("UPDATE official_job_notices SET life_status='expired'"))
      throw Error("unexpected_target_mutation");
     let count=0;for(const value of rows.values()){
      if(value.source_id===args[0]&&value.life_status==="open"&&value.closing_at<=args[1]){
       value.life_status="expired";count++;
      }
     }
     events.push({op:"expire",count});
     return{meta:{changes:count}};
    },
    async all(){
     if(!sql.includes("LEFT JOIN uk_withdrawal_checks"))throw Error("unexpected_target_read");
     const [src,nowIso,stale,checkedBefore,limit]=args;
     const result=[...rows.values()].filter(x=>x.source_id===src&&x.life_status==="open"&&
      x.closing_at>nowIso&&x.last_seen_at<stale&&
      (!checks.has(x.id)||checks.get(x.id).last_checked_at<=checkedBefore))
      .sort((a,b)=>(checks.get(a.id)?.last_checked_at||0)-(checks.get(b.id)?.last_checked_at||0)||
       a.last_seen_at-b.last_seen_at||a.id.localeCompare(b.id)).slice(0,limit)
      .map(x=>({...x,...checks.get(x.id)}));
     return{results:result};
    }};
   }};
  },
  async batch(ops){
   for(const op of ops){
    const {sql,args}=op;
    if(sql.startsWith("INSERT INTO uk_withdrawal_checks")){
     const [id,sourceSeen,lastChecked,http,goneCount,missingCount,review]=args;
     checks.set(id,{source_seen_at:sourceSeen,last_checked_at:lastChecked,
      http_status:http,gone_count:goneCount,missing_count:missingCount,review_required:review});
     events.push({op:"evidence",id,http,review});
    }else if(sql.startsWith("UPDATE official_job_notices SET life_status=?")){
     const [status,id,sourceId,seenAt,notClosedBefore]=args,row=rows.get(id);
     if(!row||row.source_id!==sourceId||row.last_seen_at!==seenAt||
       row.life_status!=="open"||row.closing_at<=notClosedBefore)
      throw Error("withdrawal_precondition_not_met");
     row.life_status=status;events.push({op:"withdraw",id,status});
    }else throw Error("unexpected_mutation_sql");
   }
   return ops.map(()=>({meta:{changes:1}}));
  }
 };
 return {source,target,rows,checks,events,sourceReads};
}
test("one feed-page omission cannot withdraw or delete any vacancy",async()=>{
 const f=fakeDB();
 const r=await reconcileUkClosures(f.source,f.target,NOW,async()=>new Response("",{status:200}));
 assert.equal(r.verifiedWithdrawals,0);
 assert.equal(r.probed,1);
 assert.equal(f.rows.get("uk-1").life_status,"open");
 assert.ok(f.events.every(e=>e.op!=="withdraw"));
});
test("deadline expiry is independent of source last_seen_at and cannot delete a record",async()=>{
 const old={...listing("old",NOW-7*24*HOUR),closing_at:"2026-11-16T12:00:00Z"};
 const f=fakeDB({records:[old,listing("new",NOW-1000)]});
 const out=await reconcileUkClosures(f.source,f.target,NOW,async()=>{throw Error("must not be called");});
 assert.equal(out.expired,1);
 assert.equal(out.probed,0);
 assert.equal(f.rows.get("old").life_status,"expired");
 assert.equal(f.rows.size,2);
 assert.match(reconcileExpiredSql(),/closing_at<=\?/);
});
test("first direct 410 is not sufficient; second independent 410 after 3h is strong evidence",async()=>{
 const f=fakeDB();
 let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:410});};
 const first=await reconcileUkClosures(f.source,f.target,NOW,fetcher);
 assert.equal(first.verifiedWithdrawals,0);
 assert.equal(f.rows.get("uk-1").life_status,"open");
 assert.equal(f.checks.get("uk-1").gone_count,1);
 const tooSoon=await reconcileUkClosures(f.source,f.target,NOW+HOUR,fetcher);
 assert.equal(tooSoon.probed,0);
 assert.equal(f.rows.get("uk-1").life_status,"open");
 const second=await reconcileUkClosures(f.source,f.target,NOW+CHECK_INTERVAL_MS+1000,fetcher);
 assert.equal(second.verifiedWithdrawals,1);
 assert.equal(f.rows.get("uk-1").life_status,"withdrawn_confirmed");
 assert.equal(f.checks.get("uk-1").gone_count,2);
 assert.equal(calls,2);
 assert.equal(f.rows.size,1,"withdrawn records are retained for audit");
});
test("two spaced 404 responses flag review but NEVER automatically withdraw",async()=>{
 const f=fakeDB(),fetcher=async()=>new Response(null,{status:404});
 await reconcileUkClosures(f.source,f.target,NOW,fetcher);
 const outcome=await reconcileUkClosures(f.source,f.target,NOW+CHECK_INTERVAL_MS,fetcher);
 assert.equal(outcome.flaggedForReview,1);
 assert.equal(outcome.verifiedWithdrawals,0);
 assert.equal(f.rows.get("uk-1").life_status,"open");
 assert.equal(f.checks.get("uk-1").review_required,1);
});
test("source refresh during an official 410 probe cannot confirm stale withdrawal",async()=>{
 const f=fakeDB();
 const first=await reconcileUkClosures(f.source,f.target,NOW,async()=>new Response(null,{status:410}));
 assert.equal(first.probed,1);
 const later=NOW+CHECK_INTERVAL_MS+1000;
 const result=await reconcileUkClosures(f.source,f.target,later,async()=>{
  f.rows.get("uk-1").last_seen_at+=1;
  return new Response(null,{status:410});
 });
 assert.equal(result.probed,1);
 assert.equal(result.inconclusive,1);
 assert.equal(result.verifiedWithdrawals,0);
 assert.equal(f.rows.get("uk-1").life_status,"open");
 assert.equal(f.checks.get("uk-1").gone_count,1);
});
test("official deadline changes during probing invalidate pending withdrawal evidence",async()=>{
 const f=fakeDB();
 const result=await reconcileUkClosures(f.source,f.target,NOW,async()=>{
  f.rows.get("uk-1").closing_at="2026-12-30T12:00:00Z";
  return new Response(null,{status:410});
 });
 assert.equal(result.inconclusive,1);
 assert.equal(f.checks.size,0);
 assert.equal(f.rows.get("uk-1").life_status,"open");
});
test("source re-observed after first missing response invalidates old evidence",async()=>{
 const first=nextWithdrawalEvidence(null,410,NOW-3*24*HOUR,NOW);
 const again=nextWithdrawalEvidence(first,410,NOW-2*24*HOUR,NOW+CHECK_INTERVAL_MS);
 assert.equal(again.confirmed,false);
 assert.equal(again.gone_count,1);
 const f=fakeDB({sourceNewer:true});
 const out=await reconcileUkClosures(f.source,f.target,NOW,async()=>{throw Error("must not probe newer observation");});
 assert.equal(out.probed,0);
 assert.equal(out.inconclusive,1);
 assert.equal(f.rows.get("uk-1").life_status,"open");
});
test("official 200 resets both kinds of negative evidence and uncertain errors do not advance it",async()=>{
 const earlier=nextWithdrawalEvidence(null,410,NOW-72*HOUR,NOW-CHECK_INTERVAL_MS);
 const present=nextWithdrawalEvidence(earlier,200,NOW-72*HOUR,NOW);
 assert.equal(present.gone_count,0);
 assert.equal(present.missing_count,0);
 assert.equal(present.confirmed,false);
 const f=fakeDB();
 const out=await reconcileUkClosures(f.source,f.target,NOW,async()=>new Response(null,{status:429}));
 assert.equal(out.inconclusive,1);
 assert.equal(f.checks.size,0);
 assert.equal(f.rows.get("uk-1").life_status,"open");
});
test("bound verification to at most 4 stale approved UK listings per Cron",async()=>{
 const records=Array.from({length:10},(_,i)=>listing("uk-"+i));
 const f=fakeDB({records});let calls=0;
 const out=await reconcileUkClosures(f.source,f.target,NOW,async()=>{calls++;return new Response(null,{status:410});});
 assert.equal(calls,MAX_UK_CHECKS);
 assert.equal(out.probed,MAX_UK_CHECKS);
 assert.equal(f.checks.size,MAX_UK_CHECKS);
 assert.ok([...f.rows.values()].every(x=>x.life_status==="open"));
});
test("URL spoofing, redirects and non-permanent errors cannot be used as withdrawal evidence",async()=>{
 for(const url of ["http://teaching-vacancies.service.gov.uk/jobs/1",
  "https://teaching-vacancies.service.gov.uk.evil.test/jobs/x",
  "https://teaching-vacancies.service.gov.uk/jobs/x?track=1"]){
  await assert.rejects(()=>checkOfficialUkListing(url,async()=>new Response(null,{status:410})),/source_row_not_approved/);
 }
 let options;
 const response=await checkOfficialUkListing(listing().source_page,async(_url,opts)=>{options=opts;return new Response(null,{status:302,headers:{location:"https://attacker.invalid"}});});
 assert.equal(response,null);
 assert.equal(options.redirect,"manual");
 assert.equal(options.cache,"no-store");
 assert.equal(options.method,"GET");
 assert.equal(validWithdrawalCandidate(listing(),NOW),true);
 assert.equal(validWithdrawalCandidate(listing("fresh",NOW-1000),NOW),false);
});
