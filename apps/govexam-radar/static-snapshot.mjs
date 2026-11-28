// Read-only snapshot acquisition from the existing canonical D1. No public
// export endpoint; token must have D1 read permission only. One SQL statement
// gives a consistent source gate and catalogue snapshot, bounded by asset budget.
import {LIMITS} from "./static-publisher.mjs";
const ACCOUNT="69234e51e08d8013980a7ff869746609";
const DATABASE="b1f499a6-283b-47e8-8cd7-ef2b5f7245bc";
const SOURCE="uk-dfe-teaching-vacancies",HOUR=3600000;
export const SNAPSHOT_SQL="WITH recent AS (SELECT started_at,finished_at,state,details FROM source_ingest_runs WHERE source_id=? AND started_at>=? AND id NOT LIKE 'bootstrap-%' AND (error_code IS NULL OR error_code!='collector_claim_pending') AND (details IS NULL OR details NOT LIKE '%\"origin\":\"signed_portable_collector\"%') ORDER BY started_at DESC,finished_at DESC LIMIT 2), gate AS (SELECT COUNT(*)=2 AND SUM(CASE WHEN state='ok' AND details LIKE '%\"origin\":\"scheduled\"%' AND finished_at>=started_at THEN 1 ELSE 0 END)=2 AND MAX(started_at)-MIN(started_at)>=? AND MAX(finished_at)>=? AND MAX(finished_at)<=? AS healthy FROM recent) SELECT n.source_id,n.title,n.employer,n.region,n.source_page,n.closing_at,n.last_seen_at,n.review_state,n.life_status FROM official_job_notices n CROSS JOIN gate WHERE gate.healthy=1 AND n.source_id=? AND n.life_status='open' AND n.closing_at>? AND n.last_seen_at>=? AND n.review_state IN ('official_feed_unreviewed','founder_reviewed') ORDER BY n.id LIMIT ?";
export async function acquireSnapshot({account,token,fetcher=fetch,now=Date.now()}={}){
 if(account!==ACCOUNT||typeof token!=="string"||token.length<20)throw Error("private_d1_read_credentials_required");
 if(!Number.isSafeInteger(now)||now<=0)throw Error("invalid_snapshot_clock");
 const params=[SOURCE,now-8*HOUR,2*HOUR,now-5*HOUR,now+60000,SOURCE,new Date(now).toISOString(),now-5*24*HOUR,LIMITS.jobs+1];
 const response=await fetcher("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/d1/database/"+DATABASE+"/query",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({sql:SNAPSHOT_SQL,params}),redirect:"error",signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error("d1_snapshot_http_"+response.status);
 const reader=response.body?.getReader();if(!reader)throw Error("d1_empty_response");
 const chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>8*1024*1024){await reader.cancel();throw Error("d1_snapshot_response_budget");}chunks.push(value);}}finally{reader.releaseLock();}
 const envelope=JSON.parse(Buffer.concat(chunks).toString("utf8"));
 const result=envelope.result?.[0];
 if(envelope.success!==true||result?.success!==true||!Array.isArray(result.results)||result.results.length===0||result.results.length>LIMITS.jobs)throw Error("d1_snapshot_gate_closed_or_oversized");
 const read=Number(result.meta?.rows_read),written=Number(result.meta?.rows_written);
 if(!Number.isSafeInteger(read)||read<0||read>100000||written!==0)throw Error("d1_snapshot_usage_unconfirmed_or_exceeded");
 return {rows:result.results,generatedAt:now,sourceHealthy:true,usage:{rowsRead:read,rowsWritten:written}};
}
