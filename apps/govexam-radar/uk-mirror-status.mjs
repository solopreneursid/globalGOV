// Public-safe, read-only status of the PRIVATE UK mirror.
// No run IDs, error internals, database identifiers, sensitive data or writes.
const STATUS_SQL="SELECT status,last_success_at,last_attempt_at,last_native_source_at,last_rows_upserted FROM uk_mirror_state WHERE id=1";
const CURRENT_WINDOW_MS=6*60*60*1000;
export async function getUkMirrorPublicStatus(db,clock=Date.now()){
 if(!db||typeof db.prepare!=="function")return {status:"unavailable",fresh:false,publicLaunchAuthorized:false};
 try{
  const row=await db.prepare(STATUS_SQL).first();
  if(!row)return{status:"unavailable",fresh:false,publicLaunchAuthorized:false};
  const last=Number(row.last_success_at),nativeAt=Number(row.last_native_source_at);
  const age=clock-last,nativeAge=clock-nativeAt;
  const valid=Number.isSafeInteger(last)&&last>0&&Number.isSafeInteger(nativeAt)&&nativeAt>0;
  const fresh=valid&&row.status==="ok"&&age>=0&&age<=CURRENT_WINDOW_MS&&nativeAge>=0&&nativeAge<=CURRENT_WINDOW_MS;
  return{status:fresh?"current":!valid&&row.status==="never_run"?"pending":"delayed",
   fresh,
   lastSuccessfulMirrorAt:valid?new Date(last).toISOString():null,
   lastOfficialImportAt:nativeAt>0&&Number.isSafeInteger(nativeAt)?new Date(nativeAt).toISOString():null,
   publicLaunchAuthorized:false,
   disclaimer:"UK source-observed snapshot; always verify jobs and deadlines on the official source."};
 }catch{
  return{status:"unavailable",fresh:false,publicLaunchAuthorized:false};
 }
}
