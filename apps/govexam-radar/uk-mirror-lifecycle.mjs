// Runs ONLY inside the private scheduled UK mirror (never in public Worker).
// Enforces deterministic deadlines and evidence-based, non-destructive closure.
import {UK_SOURCE_ID} from "./uk-mirror-core.mjs";
import {CHECK_INTERVAL_MS,MAX_UK_CHECKS,STALE_CANDIDATE_AGE_MS,
 reconcileExpiredSql,validWithdrawalCandidate,checkOfficialUkListing,
 nextWithdrawalEvidence,VERIFIED_WITHDRAWAL_STATUS} from "./uk-withdrawal-policy.mjs";
const CANDIDATE_SQL=`SELECT j.id,j.source_id,j.title,j.source_page,j.source_ref,j.apply_url,
 j.last_seen_at,j.closing_at,j.country,j.life_status,
 e.source_seen_at,e.last_checked_at,e.http_status,e.gone_count,
 e.missing_count,e.review_required
 FROM official_job_notices j LEFT JOIN uk_withdrawal_checks e ON e.notice_id=j.id
 WHERE j.source_id=? AND j.life_status='open' AND j.closing_at>?
 AND j.last_seen_at<? AND (e.last_checked_at IS NULL OR e.last_checked_at<=?)
 ORDER BY COALESCE(e.last_checked_at,0),j.last_seen_at,j.id LIMIT ?`;
const UPSERT_EVIDENCE=`INSERT INTO uk_withdrawal_checks
 (notice_id,source_seen_at,last_checked_at,http_status,gone_count,missing_count,review_required)
 VALUES(?,?,?,?,?,?,?)
 ON CONFLICT(notice_id) DO UPDATE SET
 source_seen_at=excluded.source_seen_at,last_checked_at=excluded.last_checked_at,
 http_status=excluded.http_status,gone_count=excluded.gone_count,
 missing_count=excluded.missing_count,review_required=excluded.review_required`;
export async function reconcileUkClosures(source,target,now,fetcher=fetch){
 if(!source||!target||!Number.isSafeInteger(now)||now<0)
  throw Error("uk_closure_bindings_or_clock_invalid");
 const expired=await target.prepare(reconcileExpiredSql())
  .bind(UK_SOURCE_ID,new Date(now).toISOString()).run();
 if(!Number.isSafeInteger(expired?.meta?.changes))
  throw Error("uk_expiry_reconciliation_unverified");
 const candidates=await target.prepare(CANDIDATE_SQL).bind(
  UK_SOURCE_ID,new Date(now).toISOString(),now-STALE_CANDIDATE_AGE_MS,
  now-CHECK_INTERVAL_MS,MAX_UK_CHECKS).all();
 if(!Array.isArray(candidates?.results)||candidates.results.length>MAX_UK_CHECKS)
  throw Error("uk_withdrawal_candidate_query_invalid");
 const result={expired:expired.meta.changes,probed:0,verifiedWithdrawals:0,flaggedForReview:0,inconclusive:0};
 for(const candidate of candidates.results){
  if(!validWithdrawalCandidate(candidate,now))throw Error("uk_withdrawal_candidate_invalid");
  // The research database is the source of record. A newer observation,
  // missing row or changed canonical URL invalidates previous 404/410 evidence.
  const latest=await source.prepare(
   "SELECT last_seen_at,source_page,closing_at,life_status FROM official_job_notices WHERE id=? AND source_id=?"
  ).bind(candidate.id,UK_SOURCE_ID).first();
  if(!latest||latest.last_seen_at!==candidate.last_seen_at||
   latest.source_page!==candidate.source_page||latest.life_status!=="open"||
   Date.parse(latest.closing_at)<=now){result.inconclusive++;continue;}
  const status=await checkOfficialUkListing(candidate.source_page,fetcher);
  result.probed++;
  if(status===null){result.inconclusive++;continue;}
  // Recheck the source AFTER the network probe. A scheduled source refresh
  // can race the HTTP request; never act on a 404/410 for a superseded row.
  const afterProbe=await source.prepare(
   "SELECT last_seen_at,source_page,closing_at,life_status FROM official_job_notices WHERE id=? AND source_id=?"
  ).bind(candidate.id,UK_SOURCE_ID).first();
  if(!afterProbe||afterProbe.last_seen_at!==candidate.last_seen_at||
   afterProbe.source_page!==candidate.source_page||afterProbe.life_status!=="open"||
   !Number.isFinite(Date.parse(afterProbe.closing_at))||
   afterProbe.closing_at!==candidate.closing_at||Date.parse(afterProbe.closing_at)<=now){
   result.inconclusive++;continue;
  }
  const evidence=nextWithdrawalEvidence(candidate,status,candidate.last_seen_at,now);
  const writes=[target.prepare(UPSERT_EVIDENCE).bind(
   candidate.id,evidence.source_seen_at,evidence.last_checked_at,
   evidence.http_status,evidence.gone_count,evidence.missing_count,evidence.review_required)];
  if(evidence.confirmed){
   writes.push(target.prepare(
    "UPDATE official_job_notices SET life_status=? WHERE id=? AND source_id=? AND life_status='open' AND last_seen_at=? AND closing_at>?"
   ).bind(VERIFIED_WITHDRAWAL_STATUS,candidate.id,UK_SOURCE_ID,
    candidate.last_seen_at,new Date(now).toISOString()));
  }
  const committed=await target.batch(writes);
  if(!Array.isArray(committed)||committed.length!==writes.length||
    committed.some(x=>x?.meta?.changes!==1))throw Error("uk_withdrawal_evidence_commit_unverified");
  if(evidence.confirmed)result.verifiedWithdrawals++;
  if(evidence.review_required)result.flaggedForReview++;
 }
 return result;
}
