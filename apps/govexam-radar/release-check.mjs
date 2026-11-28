// Read-only release gate for owner-operated remote deployment. No writes, DNS,
// provider provisioning or public ingress activation. No keys or records logged.
import {pathToFileURL} from "node:url";
import {createPostgresPoolFromEnv} from "./postgres-d1.mjs";
import {NYC_SOURCE} from "./nyc-feed.mjs";
const HOUR=3600000,DAY=24*HOUR,HASH=/^[a-f0-9]{64}$/i;
const fresh=(value,now,max)=>Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=now&&now-Number(value)<=max;
function snapshotOk(row,expected,tableCount){
 if(!HASH.test(expected||"")||row?.state!=="verified"||String(row.source_sha256).toLowerCase()!==expected.toLowerCase())return false;
 const counts=row.table_counts||{},checksums=row.row_checksums||{};
 return Object.keys(counts).length===tableCount&&Object.keys(checksums).length===tableCount&&Object.values(counts).every(x=>Number.isSafeInteger(x)&&x>=0)&&Number(counts.official_job_notices)>0&&Object.values(checksums).every(x=>HASH.test(String(x)));
}
export async function inspectRelease({pool,env=process.env,fetcher=fetch,now=Date.now()}={}){
 if(!pool||typeof pool.query!=="function")throw Error("release_pool_required");
 const checks=[];
 const add=(id,ok)=>checks.push({id,passed:Boolean(ok)});
 const migrations=await pool.query("SELECT version FROM schema_migrations");
 const versions=new Set(migrations.rows.map(r=>r.version));
 add("schema",["001_core","002_first_party_operations","003_uk_archive"].every(v=>versions.has(v)));
 const imports=await pool.query("SELECT DISTINCT ON (source_id) source_id,state,source_sha256,finished_at,table_counts,row_checksums FROM data_migration_runs WHERE source_id IN ('canonical-cloudflare-d1','uk-isolated-cloudflare-d1') ORDER BY source_id,finished_at DESC");
 const primary=imports.rows.find(x=>x.source_id==="canonical-cloudflare-d1"),uk=imports.rows.find(x=>x.source_id==="uk-isolated-cloudflare-d1");
 add("primary_import",snapshotOk(primary,env.GLOBALGOV_EXPECT_PRIMARY_SHA256,12));
 add("uk_archive_import",snapshotOk(uk,env.GLOBALGOV_EXPECT_UK_SHA256,4));
 const migrationCutoff=Math.max(Number(primary?.finished_at)||now,Number(uk?.finished_at)||now);
 const cutoff=Math.max(migrationCutoff,now-12*HOUR);
 const sources=["uk-dfe-teaching-vacancies",...(env.GLOBALGOV_NYC_PUBLICATION==="true"?[NYC_SOURCE.id]:[])];
 for(const source of sources){
  const result=await pool.query("SELECT state,started_at,finished_at,accepted FROM source_ingest_runs WHERE source_id=$1 AND started_at>$2 AND details LIKE '%\"origin\":\"scheduled\"%' ORDER BY started_at DESC,finished_at DESC LIMIT 2",[source,cutoff]);
  const rows=result.rows,latest=rows[0],prior=rows[1];
  add("native_collection:"+source,rows.length===2&&rows.every(r=>r.state==="ok"&&Number(r.accepted)>0&&Number(r.finished_at)>=Number(r.started_at))&&Number(latest.started_at)-Number(prior.started_at)>=2*HOUR&&fresh(latest.finished_at,now,5*HOUR));
 }
 const schedule=await pool.query("SELECT state,finished_at FROM scheduler_runs WHERE task='uk' AND started_at>$1 ORDER BY started_at DESC LIMIT 2",[cutoff]);
 add("owner_scheduler",schedule.rows.length===2&&schedule.rows.every(r=>r.state==="ok")&&fresh(schedule.rows[0]?.finished_at,now,5*HOUR));
 const backup=await pool.query("SELECT state,finished_at,archive_verified_at,document_archive_verified_at,local_sha256,remote_sha256,document_archive_sha256,remote_document_sha256,remote_target FROM backup_runs ORDER BY started_at DESC LIMIT 1");
 const b=backup.rows[0];
 add("fresh_off_host_copy",b?.state==="ok"&&fresh(b.finished_at,now,36*HOUR)&&Number(b.finished_at)>migrationCutoff&&b.remote_target&&HASH.test(String(b.local_sha256))&&b.local_sha256===b.remote_sha256&&HASH.test(String(b.document_archive_sha256))&&b.document_archive_sha256===b.remote_document_sha256&&fresh(b.archive_verified_at,now,36*HOUR)&&fresh(b.document_archive_verified_at,now,36*HOUR));
 const restore=await pool.query("SELECT MAX(restore_verified_at) AS db_restore,MAX(document_restore_verified_at) AS docs_restore FROM backup_runs WHERE state='ok' AND finished_at>$1 AND restore_verified_at IS NOT NULL AND document_restore_verified_at IS NOT NULL",[migrationCutoff]);
 add("isolated_restore",fresh(restore.rows[0]?.db_restore,now,30*DAY)&&fresh(restore.rows[0]?.docs_restore,now,30*DAY));
 const critical=await pool.query("SELECT COUNT(*)::integer AS count FROM system_health_events WHERE severity='critical' AND resolved_at IS NULL");
 add("no_open_critical_incidents",Number(critical.rows[0]?.count)===0);
 // The watchdog only writes incidents; absence is not proof it is running.
 // Verify application readiness separately; independent host/security and remote
 // restore checks must be performed by the release operator.
 const base=env.APP_HEALTH_URL||"http://app:8080";
 try{
  const origin=new URL(base);
  if(!["http:","https:"].includes(origin.protocol)||origin.username||origin.password)throw Error("invalid_health_origin");
  const res=await fetcher(new URL("/internal/ready",origin),{signal:AbortSignal.timeout(5000),redirect:"error"});
  add("application_ready",res.ok&&(await res.json()).status==="ok");
  for(const source of sources){
   const url=new URL("/api/notices",origin);url.searchParams.set("limit","1");url.searchParams.set("source",source);
   const feed=await fetcher(url,{signal:AbortSignal.timeout(5000),redirect:"error"}),data=await feed.json();
   add("public_catalogue:"+source,feed.ok&&Array.isArray(data.notices)&&data.notices.length===1&&Number.isSafeInteger(data.total)&&data.total>0&&data.notices.every(n=>n.sourceId===source));
  }
 }catch{add("application_http",false);}
 return {state:checks.every(c=>c.passed)?"engineering_gates_passed":"blocked",checkedAt:new Date(now).toISOString(),checks,publicLaunchAuthorized:false,remainingIndependentChecks:["host firewall and TLS","restore from remote backup copy","owner production routing approval"]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const pool=await createPostgresPoolFromEnv();
 try{const r=await inspectRelease({pool});console.log(JSON.stringify(r));if(r.state!=="engineering_gates_passed")process.exitCode=1;}
 catch{console.error(JSON.stringify({state:"blocked",errorCode:"release_check_failed"}));process.exitCode=1;}
 finally{await pool.end();}
}
