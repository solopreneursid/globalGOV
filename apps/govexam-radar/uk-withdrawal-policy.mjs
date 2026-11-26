// Conservative lifecycle policy for the private UK DfE mirror.
// A missing item from a paginated feed is NEVER evidence of withdrawal.
// A direct HTTP 404 is inconclusive and prompts review after two checks.
// Only TWO independent 410 Gone responses, separated by >=3 hours, with
// unchanged source evidence may set withdrawn_confirmed. No hard deletes.
import {assertUkRow,UK_SOURCE_ID} from "./uk-mirror-core.mjs";
export const CHECK_INTERVAL_MS=3*3600000;
export const STALE_CANDIDATE_AGE_MS=48*3600000;
export const MAX_UK_CHECKS=4;
export const PROBE_TIMEOUT_MS=8000;
export const VERIFIED_WITHDRAWAL_STATUS="withdrawn_confirmed";
export function reconcileExpiredSql(){
 return "UPDATE official_job_notices SET life_status='expired' WHERE source_id=? AND life_status='open' AND closing_at<=?";
}
export function nextWithdrawalEvidence(previous,httpStatus,sourceSeenAt,now){
 if(!Number.isSafeInteger(sourceSeenAt)||sourceSeenAt<=0||
    !Number.isSafeInteger(now)||now<=sourceSeenAt)throw Error("invalid_official_observation");
 if(![200,404,410].includes(httpStatus))throw Error("inconclusive_official_response");
 const prior=previous||{};
 const sameSource=Number(prior.source_seen_at)===sourceSeenAt;
 const elapsed=now-Number(prior.last_checked_at||0);
 const separate=sameSource&&Number.isFinite(elapsed)&&elapsed>=CHECK_INTERVAL_MS;
 if(httpStatus===200){
  return{source_seen_at:sourceSeenAt,last_checked_at:now,http_status:200,
   gone_count:0,missing_count:0,review_required:0,confirmed:false};
 }
 if(httpStatus===404){
  const checks=separate&&Number(prior.http_status)===404?Number(prior.missing_count||0)+1:1;
  return{source_seen_at:sourceSeenAt,last_checked_at:now,http_status:404,
   gone_count:0,missing_count:Math.min(checks,2),review_required:checks>=2?1:0,confirmed:false};
 }
 const gone=separate&&Number(prior.http_status)===410?Number(prior.gone_count||0)+1:1;
 return{source_seen_at:sourceSeenAt,last_checked_at:now,http_status:410,
  gone_count:Math.min(gone,2),missing_count:0,review_required:0,confirmed:gone>=2};
}
export async function checkOfficialUkListing(link,fetcher=fetch){
 assertUkRow({id:"link_check",source_id:UK_SOURCE_ID,country:"United Kingdom",
  title:"Source verification",closing_at:"2040-01-01T00:00:00Z",
  last_seen_at:1,source_page:link,source_ref:link,apply_url:link});
 try{
  const response=await fetcher(link,{method:"GET",redirect:"manual",
   cache:"no-store",signal:AbortSignal.timeout(PROBE_TIMEOUT_MS),
   headers:{Accept:"text/html"}});
  if(!response||!Number.isInteger(response.status))return null;
  try{if(response.body)await response.body.cancel();}catch{/* cancellation only */}
  return [200,404,410].includes(response.status)?response.status:null;
 }catch{return null;}
}
export function validWithdrawalCandidate(row,now){
 if(!row||row.source_id!==UK_SOURCE_ID||row.life_status!=="open"||
  !Number.isSafeInteger(row.last_seen_at)||row.last_seen_at>=now-STALE_CANDIDATE_AGE_MS||
  !Number.isFinite(Date.parse(row.closing_at))||Date.parse(row.closing_at)<=now)return false;
 return assertUkRow({...row,title:row.title||"Listed vacancy"});
}
