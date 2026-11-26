// First-party, runtime-portable approved UK-only mirror logic.
// No Cloudflare SDK, credentials, filesystem, or third-party dependencies.
import {allowedCommercialPreviewSources} from "./source-rights.mjs";
export const UK_SOURCE_ID="uk-dfe-teaching-vacancies";
export const UK_MIRROR_CRON="55 */3 * * *";
export const UK_MIRROR_COLUMNS=Object.freeze([
 "id","source_id","source_ref","title","employer","country","region","stream",
 "apply_url","source_page","published_at","closing_at","first_seen_at","last_seen_at",
 "evidence_sha256","review_state","life_status","jurisdiction_code","jurisdiction_name",
 "government_tier","employer_type"
]);
export const MAX_SOURCE_AGE_MS=6*60*60*1000;
export const MAX_ROWS_PER_RUN=500;
export const SOURCE_BATCH_SIZE=40;
export const WRITE_BATCH_SIZE=20;
const OFFICIAL_PREFIX="/jobs/";
export function assertMirrorPolicy(){
 if(JSON.stringify(allowedCommercialPreviewSources())!==JSON.stringify([UK_SOURCE_ID]))
  throw Error("uk_source_rights_not_approved");
 return true;
}
export function assertUkRow(row){
 if(!row||typeof row!=="object"||Array.isArray(row)||
  row.source_id!==UK_SOURCE_ID||row.country!=="United Kingdom"||
  typeof row.id!=="string"||!row.id||row.id.length>240||
  typeof row.title!=="string"||!row.title||
  typeof row.closing_at!=="string"||!Number.isFinite(Date.parse(row.closing_at))||
  !Number.isSafeInteger(row.last_seen_at)||row.last_seen_at<=0)
  throw Error("source_row_not_approved");
 for(const key of ["source_page","source_ref","apply_url"]){
  let url;
  try{url=new URL(row[key]);}catch{throw Error("source_row_not_approved");}
  if(url.protocol!=="https:"||url.hostname!=="teaching-vacancies.service.gov.uk"||
    !url.pathname.startsWith(OFFICIAL_PREFIX)||url.username||url.password||
    url.search||url.hash)
    throw Error("source_row_not_approved");
 }
 return true;
}
export function makeMirrorUpsertSql(){
 const cols=UK_MIRROR_COLUMNS;
 return "INSERT INTO official_job_notices ("+cols.join(",")+") VALUES ("+cols.map(()=>"?").join(",")+
  ") ON CONFLICT(id) DO UPDATE SET "+cols.filter(x=>x!=="id").map(x=>
   x==="life_status"
    ? "life_status=CASE WHEN official_job_notices.life_status='withdrawn_confirmed' AND excluded.last_seen_at<=official_job_notices.last_seen_at THEN 'withdrawn_confirmed' ELSE excluded.life_status END"
    : x+"=excluded."+x).join(",");
}
export function mirrorRowParams(row){
 assertUkRow(row);
 return UK_MIRROR_COLUMNS.map(c=>row[c]??null);
}
export function validateNativeSourceStatus(row,now){
 if(!row||row.state!=="ok"||!Number.isSafeInteger(Number(row.finished_at))||
  Number(row.finished_at)>now+60000||
  now-Number(row.finished_at)>MAX_SOURCE_AGE_MS||
  typeof row.details!=="string"||!row.details.includes('"origin":"scheduled"'))
  throw Error("uk_native_source_not_fresh");
 return Number(row.finished_at);
}
export function validateMirroringCron(controller){
 if(!controller||controller.cron!==UK_MIRROR_CRON||
    !Number.isSafeInteger(controller.scheduledTime)||controller.scheduledTime<=0)
  throw Error("unapproved_uk_mirror_schedule");
 const time=new Date(controller.scheduledTime);
 // Cloudflare Cron invocations can land seconds after the minute boundary.
 // The trusted cron expression and UTC hour/minute define the approved slot;
 // requiring seconds===0 rejected a real 18:55:55 UTC scheduled event.
 if(time.getUTCHours()%3!==0||time.getUTCMinutes()!==55)
  throw Error("unapproved_uk_mirror_schedule");
 return controller.scheduledTime;
}
export function advanceCursor(row){
 assertUkRow(row);
 return{seenAt:row.last_seen_at,id:row.id};
}
