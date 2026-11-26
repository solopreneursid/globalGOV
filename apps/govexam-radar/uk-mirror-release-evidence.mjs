// Deterministic, provider-neutral UK source-module release gate.
// This is NOT the global GovRadar launch gate. No writes or credentials.
export const MAX_MIRROR_AGE_MS=6*60*60*1000;
export const EXPECTED_SLOT_MS=3*60*60*1000;
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const fresh=(ms,now)=>validTime(ms)&&ms<=now&&now-ms<=MAX_MIRROR_AGE_MS;
function scheduledRun(row){
 if(!row||row.state!=="ok"||!validTime(row.scheduled_at)||
    !validTime(row.finished_at)||row.finished_at<row.scheduled_at||
    row.id!=="scheduled-uk-mirror-"+row.scheduled_at)return false;
 const time=new Date(row.scheduled_at);
 return time.getUTCHours()%3===0&&time.getUTCMinutes()===55;
}
export function evaluateUkMirrorReleaseEvidence({
 state,runs,sourceCount,mirrorCount,foreignCount
},now=Date.now()){
 const blockers=[];
 if(!state||state.status!=="ok")blockers.push("mirror_status_not_ok");
 if(!fresh(state?.last_success_at,now))blockers.push("mirror_success_missing_or_stale");
 if(!fresh(state?.last_native_source_at,now))blockers.push("official_source_import_missing_or_stale");
 const events=Array.isArray(runs)?[...runs].sort((a,b)=>b.scheduled_at-a.scheduled_at):[];
 const last=events[0],previous=events[1];
 if(!scheduledRun(last)||!scheduledRun(previous))
  blockers.push("two_audited_successes_required");
 else{
  const distance=last.scheduled_at-previous.scheduled_at;
  if(distance<EXPECTED_SLOT_MS-120000||distance>EXPECTED_SLOT_MS+120000)
   blockers.push("successes_not_on_distinct_consecutive_cron_slots");
  if(!fresh(last.finished_at,now)||!validTime(state?.last_success_at)||
     Math.abs(last.finished_at-state.last_success_at)>120000)
   blockers.push("latest_run_and_state_disagree");
 }
 if(!Number.isSafeInteger(sourceCount)||sourceCount<1||
    !Number.isSafeInteger(mirrorCount)||mirrorCount<1||mirrorCount!==sourceCount)
  blockers.push("source_snapshot_not_fully_mirrored");
 if(!Number.isSafeInteger(foreignCount)||foreignCount!==0)
  blockers.push("unapproved_country_in_private_mirror");
 return Object.freeze({
  ready:blockers.length===0,blockers,
  sourceModule:"uk-dfe-teaching-vacancies",
  globalGovRadarReady:false,
  emailNotificationsEnabled:false
 });
}
