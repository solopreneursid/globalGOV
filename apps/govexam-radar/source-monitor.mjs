// GovRadar source health monitor. Reports WEBSITE REACHABILITY only, never vacancies.
const ORIGIN_STATUS = new Set(["reachable","restricted","unconfirmed"]);
const writeResponse = (payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"none"}});
export async function checkPortalUrl(source,fetcher=fetch){
  // Source is selected from the server-owned registry, not from any client-supplied URL.
  const started=Date.now(),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetcher(source.url,{
      method:"GET",redirect:"manual",signal:controller.signal,
      headers:{"Accept":"text/html,application/xhtml+xml"},
    });
    const code=response.status;
    if(response.body)await response.body.cancel().catch(()=>{});
    const status=(code>=200&&code<300)?"reachable":([401,403,429].includes(code)?"restricted":"unconfirmed");
    return {sourceId:source.id,status,httpStatus:code,checkedAt:new Date().toISOString(),latencyMs:Math.max(0,Date.now()-started)};
  }catch{
    return {sourceId:source.id,status:"unconfirmed",httpStatus:null,checkedAt:new Date().toISOString(),latencyMs:Math.max(0,Date.now()-started)};
  }finally{clearTimeout(timer);}
}
export async function storePortalResult(db,result){
  if(!db||!ORIGIN_STATUS.has(result.status))return false;
  const at=Date.parse(result.checkedAt)||Date.now();
  await db.batch([
    db.prepare("INSERT INTO portal_status(source_id,status,http_status,checked_at,latency_ms) VALUES (?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,http_status=excluded.http_status,checked_at=excluded.checked_at,latency_ms=excluded.latency_ms")
      .bind(result.sourceId,result.status,result.httpStatus,at,result.latencyMs||0),
    db.prepare("INSERT INTO portal_history(source_id,status,checked_at,http_status,latency_ms) VALUES (?,?,?,?,?)")
      .bind(result.sourceId,result.status,at,result.httpStatus,result.latencyMs||0)
  ]);
  return true;
}
export async function checkPortalAndStore(source,db){
  const result=await checkPortalUrl(source);
  try{await storePortalResult(db,result);}catch(e){
    console.error(JSON.stringify({event:"portal_status_store_failed",source:source.id,error:String(e?.message||e)}));
  }
  return result;
}
export async function getPortalStatus(db,sources){
  if(!db)return writeResponse({error:"not_configured",message:"Source monitoring storage is not available."},503);
  try{
    const r=await db.prepare("SELECT source_id,status,http_status,checked_at,latency_ms FROM portal_status").all();
    const byId=new Map((r.results||[]).map(x=>[x.source_id,x]));
    const items=sources.map(s=>{
      const row=byId.get(s.id);
      return {id:s.id,name:s.name,country:s.country,category:s.category,url:s.url,jurisdiction:s.jurisdiction||"",jurisdictionCode:s.jurisdictionCode||"",level:s.level||"national",
        status:row?.status||"not_checked",httpStatus:row?.http_status??null,
        checkedAt:row?new Date(row.checked_at).toISOString():null,
        latencyMs:row?.latency_ms??null,
        stale:!row||Date.now()-row.checked_at>2*86400000};
    });
    return writeResponse({sources:items,checkedSources:items.filter(x=>x.checkedAt).length,
      total:sources.length,verifiedVacancies:0,
      monitoring:"Reachability checks only; no live vacancy ingestion, deadlines or eligibility verification.",
      cadence:"Up to six official source URLs per 3-hour run. All currently registered portals normally cycle in about 30 hours at six URLs per three-hour run; blocked sources may need rechecks.",
      generatedAt:new Date().toISOString()});
  }catch(e){
    console.error(JSON.stringify({event:"portal_status_read_failed",error:String(e?.message||e)}));
    return writeResponse({error:"monitoring_unavailable",message:"Portal status history could not be loaded."},503);
  }
}
export async function runScheduledPortalChecks(db,sources,limit=6){
  if(!db)throw Error("D1 binding required for scheduled monitoring");
  const result=await db.prepare("SELECT source_id,checked_at FROM portal_status").all();
  const checked=new Map((result.results||[]).map(x=>[x.source_id,x.checked_at]));
  const batch=sources.slice().sort((a,b)=>(checked.get(a.id)||0)-(checked.get(b.id)||0)).slice(0,limit);
  const outcomes=await Promise.all(batch.map(s=>checkPortalAndStore(s,db)));
  try{await db.prepare("DELETE FROM portal_history WHERE checked_at < ?").bind(Date.now()-30*86400000).run();}
  catch(e){console.error(JSON.stringify({event:"portal_history_cleanup_failed",error:String(e?.message||e)}));}
  console.log(JSON.stringify({event:"portal_monitor_complete",count:outcomes.length,checked:batch.map(s=>s.id),results:outcomes.map(x=>x.status)}));
  return outcomes;
}
