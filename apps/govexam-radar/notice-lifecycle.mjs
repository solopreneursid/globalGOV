// Evidence-based notice lifecycle. A missing notice on a partial page is NOT a withdrawal.
import {allowedCommercialPreviewSources,allowedIsroPreviewSource,allowedSsbPreviewSource} from "./source-rights.mjs";
import {ISRO_SOURCE,isroPublicationGate} from "./isro-feed.mjs";
import {SSB_SOURCE,ssbPublicationGate} from "./ssb-feed.mjs";
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function expireKnownDeadlines(db,now=Date.now()){
 if(!db)return {expired:0,error:"no_database"};
 const cutoff=new Date(now).toISOString();
 try{
  const updated=await db.prepare("UPDATE official_job_notices SET life_status='expired' WHERE life_status='open' AND closing_at<=?").bind(cutoff).run();
  const pruned=await db.prepare("DELETE FROM notice_revisions WHERE observed_at<?").bind(now-90*86400000).run();
  return {expired:updated.meta?.changes||0,prunedRevisions:pruned.meta?.changes||0};
 }catch(e){console.error(JSON.stringify({event:"notice_expiry_failed",error:String(e?.message||e)}));return{error:"database_error",expired:0};}
}
export async function serveNoticeChanges(db,params,scope="research"){
 if(!db)return reply({error:"not_configured",changes:[]},503);
 try{
  if(!["research","uk_only_release_preview","approved_staging"].includes(scope))return reply({error:"unknown_release_profile",changes:[]},503);
  const limit=Math.min(30,Math.max(1,Number(params.get("limit"))||15));
  const sinceValue=Number(params.get("since")||0);
  const since=Number.isSafeInteger(sinceValue)&&sinceValue>=0?Math.max(Date.now()-90*86400000,sinceValue):Date.now()-30*86400000;
  const country=(params.get("country")||"").slice(0,50);
  const where=["r.observed_at>=?"];const args=[since];
  if(scope==="uk_only_release_preview"||scope==="approved_staging"){
   const allowed=allowedCommercialPreviewSources();
   const gate=scope==="approved_staging"?await isroPublicationGate(db):{ready:false};
   const ssbGate=scope==='approved_staging'?await ssbPublicationGate(db):{ready:false};
   if(gate.ready)allowed.push(allowedIsroPreviewSource());if(ssbGate.ready)allowed.push(allowedSsbPreviewSource());
   where.push("r.source_id IN ("+allowed.map(()=>"?").join(",")+")","r.source_id=j.source_id");
   args.push(...allowed);
   for(const [source,g] of [[ISRO_SOURCE,gate],[SSB_SOURCE,ssbGate]])if(g.ready){where.push("(r.source_id!=? OR (j.last_seen_at=? AND NOT EXISTS (SELECT 1 FROM source_ingest_runs g WHERE g.source_id=? AND g.started_at>=? AND (g.started_at>? OR g.state!='ok'))))");args.push(source.id,g.snapshotAt,source.id,g.snapshotAt,g.snapshotAt);}
  }
  if(country){where.push("j.country=?");args.push(country);}
  const result=await db.prepare("SELECT r.notice_id as noticeId,r.source_id as sourceId,r.observed_at as observedAt,r.old_title as previousTitle,r.new_title as title,r.old_closing_at as previousClosingAt,r.new_closing_at as closingAt,j.country,j.jurisdiction_name as jurisdiction,j.source_page as sourceUrl FROM notice_revisions r JOIN official_job_notices j ON j.id=r.notice_id WHERE "+where.join(" AND ")+" ORDER BY r.observed_at DESC LIMIT ?").bind(...args,limit).all();
  return reply({changes:(result.results||[]).map(x=>({...x,deadlineChanged:x.previousClosingAt!==x.closingAt,titleChanged:x.previousTitle!==x.title})),notice:"Changes are observed from successive official feed responses. An unobserved or missing listing is NOT automatically labelled withdrawn."});
 }catch(e){console.error(JSON.stringify({event:"notice_revision_query_failed",error:String(e?.message||e)}));return reply({error:"query_unavailable",changes:[]},503);}
}
