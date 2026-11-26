// Private D1-to-D1 scheduled mirror. No public HTTP handler, routes,
// credentials, third-party SDKs or government cross-source imports.
// Source D1 is read via SELECT only. Mirror D1 is the only writable binding.
import {
 UK_SOURCE_ID,UK_MIRROR_CRON,UK_MIRROR_COLUMNS,MAX_ROWS_PER_RUN,
 SOURCE_BATCH_SIZE,WRITE_BATCH_SIZE,assertMirrorPolicy,assertUkRow,
 makeMirrorUpsertSql,mirrorRowParams,validateNativeSourceStatus,
 validateMirroringCron,advanceCursor
} from "./uk-mirror-core.mjs";
import {reconcileUkClosures} from "./uk-mirror-lifecycle.mjs";
const SUCCESS_STATES=new Set(["ok","partial"]);
const truncate=e=>String(e?.message||"uk_mirror_failed").replace(/[^a-zA-Z_0-9]/g,"_").slice(0,72);
export async function mirrorUkSnapshot(env,controller,clock=()=>Date.now()){
 const scheduledTime=validateMirroringCron(controller);
 assertMirrorPolicy();
 if(!env||Object.keys(env).sort().join(",")!=="MIRROR_DB,SOURCE_DB"||
    !env.SOURCE_DB||!env.MIRROR_DB||env.SOURCE_DB===env.MIRROR_DB)
  throw Error("uk_mirror_binding_inventory_invalid");
 const source=env.SOURCE_DB,target=env.MIRROR_DB,now=clock();
 const runId="scheduled-uk-mirror-"+scheduledTime;
 // A failure BEFORE the initial run INSERT previously left the audit database
 // at "never_run". Record a bounded error in mirror state when possible.
 // This does NOT treat a missing scheduled invocation as a successful run.
 console.log(JSON.stringify({event:"uk_mirror_trigger_received",scheduledAt:scheduledTime}));
 let initial;
 try{
  initial=await target.prepare(
   "INSERT OR IGNORE INTO uk_mirror_runs (id,scheduled_at,started_at,finished_at,state,rows_upserted,error_code) VALUES (?,?,?,NULL,'running',0,'')"
  ).bind(runId,scheduledTime,now).run();
 }catch(error){
  const code=truncate(error);
  try{
   await target.prepare(
    "UPDATE uk_mirror_state SET last_attempt_at=?,status='error',error_code=? WHERE id=1"
   ).bind(now,code).run();
  }catch{
   console.error(JSON.stringify({event:"uk_mirror_preflight_audit_unavailable"}));
  }
  console.error(JSON.stringify({event:"uk_mirror_start_failed",code}));
  throw error;
 }
 if(initial?.meta?.changes!==1)return{status:"duplicate_cron_ignored",rowsUpserted:0};
 let moved=0;
 let cursor=null;
 try{
  // Fail closed if the latest *native* UK import failed or is stale.
  // Signed/manual uploads cannot make the source healthy for this mirror.
  const latest=await source.prepare(
   "SELECT state,finished_at,details FROM source_ingest_runs WHERE source_id=? AND (details LIKE ? OR (state='error' AND details NOT LIKE ?)) ORDER BY finished_at DESC LIMIT 1"
  ).bind(UK_SOURCE_ID,'%\"origin\":\"scheduled\"%','%\"origin\":\"signed_portable_collector\"%').first();
  const nativeAt=validateNativeSourceStatus(latest,now);
  const state=await target.prepare(
   "SELECT last_cursor_seen,last_cursor_id FROM uk_mirror_state WHERE id=1"
  ).first();
  if(!state||!Number.isSafeInteger(Number(state.last_cursor_seen))||
     typeof state.last_cursor_id!=="string")throw Error("uk_mirror_state_missing");
  cursor={seenAt:Number(state.last_cursor_seen),id:state.last_cursor_id};
  const snapshot=await source.prepare(
   "SELECT MAX(last_seen_at) AS highwater,COUNT(*) AS count FROM official_job_notices WHERE source_id=?"
  ).bind(UK_SOURCE_ID).first();
  const highwater=Number(snapshot?.highwater),count=Number(snapshot?.count);
  if(!Number.isSafeInteger(highwater)||highwater<=0||
     !Number.isSafeInteger(count)||count<1||count>100000)
    throw Error("uk_mirror_source_snapshot_invalid");
  const upsert=makeMirrorUpsertSql();
  let fullPage=true;
  while(moved<MAX_ROWS_PER_RUN){
   const limit=Math.min(SOURCE_BATCH_SIZE,MAX_ROWS_PER_RUN-moved);
   const query="SELECT "+UK_MIRROR_COLUMNS.join(",")+
    " FROM official_job_notices WHERE source_id=? AND last_seen_at<=? AND "+
    "(last_seen_at>? OR (last_seen_at=? AND id>?)) "+
    "ORDER BY last_seen_at ASC,id ASC LIMIT ?";
   const result=await source.prepare(query).bind(
    UK_SOURCE_ID,highwater,cursor.seenAt,cursor.seenAt,cursor.id,limit
   ).all();
   const items=result?.results;
   if(!Array.isArray(items)||items.length>limit)throw Error("uk_mirror_source_query_invalid");
   if(items.length===0){fullPage=false;break;}
   const batch=[];
   for(const row of items){
    assertUkRow(row);
    batch.push(target.prepare(upsert).bind(...mirrorRowParams(row)));
    if(batch.length===WRITE_BATCH_SIZE){
     const result=await target.batch(batch);
     if(!Array.isArray(result)||result.length!==batch.length)
      throw Error("uk_mirror_batch_commit_invalid");
     batch.length=0;
    }
    cursor=advanceCursor(row);
    moved++;
   }
   if(batch.length){
    const result=await target.batch(batch);
    if(!Array.isArray(result)||result.length!==batch.length)
     throw Error("uk_mirror_batch_commit_invalid");
   }
   if(items.length<limit){fullPage=false;break;}
  }
  // Expiry is deterministic and MUST be evaluated independently of
  // last_seen_at: source-side closing status can change without a refreshed
  // pagination cursor. Official-page withdrawal checks are separately
  // bounded, audited and NEVER infer absence from a partial feed.
  const closure=await reconcileUkClosures(source,target,clock());
  // If the run hit its 500-row safety cap, don't mislabel a partial mirror as
  // fully current. It resumes at this cursor at the next scheduled invocation.
  const status=fullPage&&moved===MAX_ROWS_PER_RUN?"partial":"ok";
  const finished=clock();
  const results=await target.batch([
   target.prepare(
    "UPDATE uk_mirror_state SET last_cursor_seen=?,last_cursor_id=?,last_success_at=?,last_attempt_at=?,last_native_source_at=?,status=?,error_code='',last_rows_upserted=? WHERE id=1"
   ).bind(cursor.seenAt,cursor.id,finished,finished,nativeAt,status,moved),
   target.prepare(
    "UPDATE uk_mirror_runs SET finished_at=?,state=?,rows_upserted=?,error_code='' WHERE id=? AND state='running'"
   ).bind(finished,status,moved,runId)
  ]);
  if(!Array.isArray(results)||results.length!==2||
     results.some(r=>r?.meta?.changes!==1))throw Error("uk_mirror_audit_commit_failed");
  console.log(JSON.stringify({event:"uk_mirror_scheduled",state:status,rowsUpserted:moved,expired:closure.expired,confirmedWithdrawals:closure.verifiedWithdrawals,reviewFlags:closure.flaggedForReview}));
  return{status,rowsUpserted:moved,sourceNativeAt:nativeAt};
 }catch(error){
  const code=truncate(error),ended=clock();
  try{
   await target.batch([
    target.prepare(
     "UPDATE uk_mirror_runs SET finished_at=?,state='error',rows_upserted=?,error_code=? WHERE id=? AND state='running'"
    ).bind(ended,moved,code,runId),
    target.prepare(
     "UPDATE uk_mirror_state SET last_attempt_at=?,status='error',error_code=? WHERE id=1"
    ).bind(ended,code)
   ]);
  }catch{console.error(JSON.stringify({event:"uk_mirror_audit_failure",code}));}
  console.error(JSON.stringify({event:"uk_mirror_scheduled",state:"error",code,rowsUpserted:moved}));
  throw error;
 }
}
export default{
 async scheduled(controller,env,ctx){
  const job=mirrorUkSnapshot(env,controller);
  if(ctx?.waitUntil){ctx.waitUntil(job);return;}
  await job;
 }
};
