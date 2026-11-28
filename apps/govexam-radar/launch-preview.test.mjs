import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from './worker.js';

// Integration tests use a real in-memory SQLite database with deliberately
// mixed source records. They never contact the upstream agencies.
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE official_job_notices (id TEXT,source_id TEXT,title TEXT,employer TEXT,country TEXT,region TEXT,stream TEXT,source_page TEXT,published_at TEXT,closing_at TEXT,first_seen_at INTEGER,last_seen_at INTEGER,review_state TEXT,jurisdiction_code TEXT,jurisdiction_name TEXT,government_tier TEXT,employer_type TEXT,life_status TEXT);
 CREATE TABLE notice_revisions (notice_id TEXT,source_id TEXT,observed_at INTEGER,old_title TEXT,new_title TEXT,old_closing_at TEXT,new_closing_at TEXT);
 CREATE TABLE source_ingest_runs (id TEXT,source_id TEXT,started_at INTEGER,finished_at INTEGER,state TEXT,received INTEGER,accepted INTEGER,discarded INTEGER,error_code TEXT,details TEXT);`);
 const now=Date.now(),future=new Date(now+86400000).toISOString(),past=new Date(now-86400000).toISOString();
 const insert=sqlite.prepare('INSERT INTO official_job_notices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 for(const [id,source,country,region,code,lastSeen,closing] of [
  ['uk-good','uk-dfe-teaching-vacancies','United Kingdom','England','GB-ENG',now,future],
  ['uk-expired','uk-dfe-teaching-vacancies','United Kingdom','England','GB-ENG',now,past],
  ['uk-old','uk-dfe-teaching-vacancies','United Kingdom','England','GB-ENG',now-16*86400000,future],
  ['mb-secret','manitoba-jobs','Canada','Manitoba','CA-MB',now,future],
  ['india-secret','india-employment-news','India','Bihar','IN-BR',now,future]
 ]) insert.run(id,source,id,'Fixture employer',country,region,'Non-technical','https://example.invalid/'+id,past,closing,now-60000,lastSeen,'official_feed_unreviewed',code,region,'national','test','open');
 const revision=sqlite.prepare('INSERT INTO notice_revisions VALUES (?,?,?,?,?,?,?)');
 for(const [id,source] of [['uk-good','uk-dfe-teaching-vacancies'],['mb-secret','manitoba-jobs'],['india-secret','india-employment-news']])revision.run(id,source,now-1000,id,id+' changed',past,future);
 const run=sqlite.prepare('INSERT INTO source_ingest_runs VALUES (?,?,?,?,?,?,?,?,?,?)');
 for(const [source,offset] of [['uk-dfe-teaching-vacancies',1000],['uk-dfe-teaching-vacancies',3601000],['manitoba-jobs',500],['india-employment-news',100]])run.run(source+offset,source,now-offset,now-offset,'ok',1,1,0,null,'{"origin":"scheduled"}');
 const db={prepare(sql){const statement=sqlite.prepare(sql);let params=[];return {bind(...values){params=values;return this;},async all(){return {results:statement.all(...params)};},async first(){return statement.get(...params)||null;},async run(){return {meta:statement.run(...params)};}};}};
 return {sqlite,db,now,future,past};
}
const get=async(db,path,method='GET')=>worker.fetch(new Request('https://preview.example'+path,{method}),{DB:db});

test('every public listing and change query enforces source rights in the database',async()=>{
 const {sqlite,db}=fixture();try{
  for(const suffix of ['','?scope=research','?country=United%20Kingdom&limit=50']){
   const response=await get(db,'/api/notices'+suffix);assert.equal(response.status,200);
   const body=await response.json();assert.equal(body.releaseProfile,'approved_staging');assert.equal(body.publicLaunchAuthorized,false);
   assert.deepEqual(body.notices.map(x=>x.id),['uk-good']);assert.deepEqual(body.sources.map(x=>x.id),['uk-dfe-teaching-vacancies']);assert.equal(body.total,1);
  }
  for(const query of ['country=Canada','country=India','country=Australia','jurisdiction=IN-BR']){
   const body=await (await get(db,'/api/notices?'+query)).json();assert.equal(body.total,0,query);assert.deepEqual(body.notices,[]);
  }
  assert.equal((await get(db,'/api/notices?source=manitoba-jobs&scope=research')).status,403);
  assert.equal((await get(db,'/api/notices?source=india-isro-opportunities')).status,403,'ISRO is withheld until two completed native checks');
  const changes=await (await get(db,'/api/notice-changes?scope=research')).json();
  assert.deepEqual(changes.changes.map(x=>x.noticeId),['uk-good']);
  assert.deepEqual((await (await get(db,'/api/notice-changes?country=India')).json()).changes,[]);
  const status=await (await get(db,'/api/ingestion-status')).json();
  assert.equal(status.openImportedNotices,1);assert.deepEqual(status.bySource.map(x=>x.sourceId),['uk-dfe-teaching-vacancies']);
  assert.ok(status.latest.every(x=>x.sourceId==='uk-dfe-teaching-vacancies'));
  assert.deepEqual(status.automation.sources.map(x=>x.sourceId),['uk-dfe-teaching-vacancies','india-isro-opportunities','india-ssb-recruitment']);
  assert.equal(status.indiaSourceCheck.ready,false);assert.equal(status.automation.twoCycleCronGatePassed,false);
 }finally{sqlite.close();}
});

test('ISRO notices appear only after two complete checks and only from the latest snapshot',async()=>{
 const {sqlite,db,now,future,past}=fixture();try{
  const snapshot=now-2000,source='india-isro-opportunities';
  const insert=sqlite.prepare('INSERT INTO official_job_notices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const [id,seen] of [['isro-current',snapshot],['isro-missing',snapshot-1]])insert.run(id,source,id,'ISRO test centre','India','India','Technical','https://www.isro.gov.in/TestRecruitment.html',past,future,now-60000,seen,'official_feed_unreviewed','IN','India','national','government_agency','open');
  const addRun=sqlite.prepare('INSERT INTO source_ingest_runs VALUES (?,?,?,?,?,?,?,?,?,?)');
  addRun.run('isro-old',source,now-3*3600000,now-3*3600000+50,'ok',10,0,10,null,'{"origin":"scheduled","snapshot":"complete"}');
  addRun.run('isro-new',source,snapshot,snapshot+50,'ok',10,1,9,null,'{"origin":"scheduled","snapshot":"complete"}');
  let india=await (await get(db,'/api/notices?country=India')).json();
  assert.equal(india.indiaSourceCheck.ready,true);assert.deepEqual(india.notices.map(x=>x.id),['isro-current']);
  assert.equal(india.sources.some(x=>x.id===source&&x.commercialReuseApprovedForCurrentFields),true);
  const restricted=await (await get(db,'/api/release-preview/notices?country=India')).json();assert.deepEqual(restricted.notices,[]);
  assert.equal((await get(db,'/api/release-preview/notices?source='+source)).status,403);
  const addRevision=sqlite.prepare('INSERT INTO notice_revisions VALUES (?,?,?,?,?,?,?)');
  for(const id of ['isro-current','isro-missing'])addRevision.run(id,source,now-100,id,id+' changed',past,future);
  const changes=await (await get(db,'/api/notice-changes?country=India')).json();assert.deepEqual(changes.changes.map(x=>x.noticeId),['isro-current']);
  const status=await (await get(db,'/api/ingestion-status')).json();assert.equal(status.indiaSourceCheck.ready,true);assert.equal(status.openImportedNotices,2);
  addRun.run('isro-pending',source,now-100,now-100,'error',0,0,0,'isro_collection_pending','{"origin":"scheduled","snapshot":"pending"}');
  india=await (await get(db,'/api/notices?country=India')).json();assert.equal(india.indiaSourceCheck.ready,false);assert.deepEqual(india.notices,[]);
  assert.deepEqual((await (await get(db,'/api/notice-changes?country=India')).json()).changes,[]);
 }finally{sqlite.close();}
});

test('a same-timestamp pending ISRO attempt cannot race the public database read',async()=>{
 const {sqlite,db,now,future,past}=fixture();try{
  const snapshot=now-2000,source='india-isro-opportunities';
  sqlite.prepare('INSERT INTO official_job_notices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('isro-current',source,'Test ISRO role','ISRO test centre','India','India','Technical','https://www.isro.gov.in/TestRecruitment.html',past,future,now-60000,snapshot,'official_feed_unreviewed','IN','India','national','government_agency','open');
  const add=sqlite.prepare('INSERT INTO source_ingest_runs VALUES (?,?,?,?,?,?,?,?,?,?)');
  add.run('isro-old',source,now-3*3600000,now-3*3600000+50,'ok',1,0,1,null,'{"origin":"scheduled","snapshot":"complete"}');
  add.run('isro-new',source,snapshot,snapshot+50,'ok',1,1,0,null,'{"origin":"scheduled","snapshot":"complete"}');
  let injected=false;
  const race={prepare(sql){
   if(!injected&&sql.startsWith('SELECT id,source_id as sourceId,title')){
    injected=true;add.run('isro-concurrent',source,snapshot,snapshot,'error',0,0,0,'isro_collection_pending','{"origin":"scheduled","snapshot":"pending"}');
   }
   return db.prepare(sql);
  }};
  const result=await (await get(race,'/api/notices?country=India')).json();
  assert.equal(injected,true);assert.deepEqual(result.notices,[]);assert.equal(result.total,0);
 }finally{sqlite.close();}
});

test('paused community blocks new public interactions while retaining authenticated data controls',async()=>{
 const {sqlite,db}=fixture();try{
  for(const path of ['/api/community/register','/api/community/post','/api/community/reply','/api/community/report','/api/community/vote']){
   const response=await get(db,path,'POST');assert.equal(response.status,503,path);assert.equal((await response.json()).error,'community_paused');
  }
  assert.equal((await get(db,'/api/community/posts')).status,503);
  assert.equal((await get(db,'/api/moderation/reports')).status,503);
  assert.equal((await get(db,'/api/community/export')).status,401);
  assert.equal((await get(db,'/api/community/delete-account','POST')).status,401);
  const catalog=await (await get(db,'/api/catalog')).json();assert.deepEqual(catalog.leads,[]);
  for(const path of ['/','/lite']){const html=await (await get(db,path)).text();assert.match(html,/href="\/privacy"/);assert.match(html,/href="\/terms"/);}
  const lite=await (await get(db,'/lite')).text();assert.match(lite,/id="jobs"/);assert.match(lite,/src="\/lite\.js\?v=2\.7\.2"/);assert.doesNotMatch(lite,/Explore leads from the prototype/);
  for(const path of ['/privacy','/terms']){const r=await get(db,path);assert.equal(r.status,200);assert.match(await r.text(),/connect@yorphives\.com/);}
 }finally{sqlite.close();}
});

test('SSB snapshot gate is independent of ISRO and cannot broaden the UK-only endpoint',async()=>{
 const {sqlite,db,now,future,past}=fixture();try{
  const source='india-ssb-recruitment',snapshot=now-2000;
  const insert=sqlite.prepare('INSERT INTO official_job_notices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const [id,seen] of [['ssb-current',snapshot],['ssb-missing',snapshot-1]])insert.run(id,source,id,'Sashastra Seema Bal','India','India','Unclassified','https://recruitment.ssb.gov.in/adv_newsUrl',past,future,now-60000,seen,'official_feed_unreviewed','IN','India','national','government_agency','open');
  assert.equal((await get(db,'/api/notices?source='+source)).status,403);
  const add=sqlite.prepare('INSERT INTO source_ingest_runs VALUES (?,?,?,?,?,?,?,?,?,?)');
  for(const [id,ts] of [['old',now-3*3600000],['new',snapshot]])add.run('ssb-'+id,source,ts,ts+20,'ok',2,1,1,null,'{"origin":"scheduled","snapshot":"complete"}');
  const response=await (await get(db,'/api/notices?country=India')).json();
  assert.deepEqual(response.notices.map(x=>x.id),['ssb-current']);
  assert.equal(response.indiaSourceChecks[source].ready,true);
  assert.equal(response.indiaSourceCheck.ready,false);
  assert.equal((await get(db,'/api/release-preview/notices?source='+source)).status,403);
  const status=await (await get(db,'/api/ingestion-status')).json();
  assert.ok(status.bySource.some(x=>x.sourceId===source&&x.count===1));
  add.run('ssb-failed',source,now-100,now-100,'error',0,0,0,'blocked','{"origin":"scheduled","snapshot":"pending"}');
  assert.equal((await get(db,'/api/notices?source='+source)).status,403);
 }finally{sqlite.close();}
});

test("portable NYC publication requires operator scope, documented policy and two successful native snapshots across endpoints",async()=>{
 const {sqlite,db,now,future,past}=fixture();try{
  const source="us-nyc-dcas-open-jobs",snapshot=now-2000;
  sqlite.prepare("INSERT INTO official_job_notices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("nyc-current",source,"Test NYC role","City agency","United States","New York City","Unclassified","https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=123456&posting_type=External",past,future,now-60000,snapshot,"official_feed_unreviewed","US-NY-NYC","New York City","municipal","government_agency","open");
  sqlite.exec("ALTER TABLE official_job_notices ADD COLUMN source_ref TEXT");
  sqlite.prepare("UPDATE official_job_notices SET source_ref=? WHERE id=?").run("123456","nyc-current");
  const add=sqlite.prepare("INSERT INTO source_ingest_runs VALUES (?,?,?,?,?,?,?,?,?,?)");
  for(const [id,ts] of [["old",now-3*3600000],["new",snapshot]])add.run("nyc-"+id,source,ts,ts+20,"ok",1,1,0,null,'{"origin":"scheduled","snapshot":"complete"}');
  sqlite.prepare("INSERT INTO notice_revisions VALUES (?,?,?,?,?,?,?)").run("nyc-current",source,now-100,"Old title","New title",past,future);
  let denied=false;
  const pool={query:async(sql,values)=>({rows:[{automated_access_status:denied&&values[0]===source?"denied":"approved",reuse_status:"conditional",reviewer_label:"repository-policy-seed",reviewed_at:null,expires_at:null}]})};
  const request=(path,enabled)=>worker.fetch(new Request("https://preview.example"+path),{DB:db,SOURCE_POLICY_POOL:pool,REQUIRE_SOURCE_POLICY_REGISTRY:"true",GLOBALGOV_NYC_PUBLICATION:enabled?"true":"false"});
  assert.equal((await request("/api/notices?source="+source+"&scope=research",false)).status,403);
  const published=await(await request("/api/notices?source="+source,true)).json();
  assert.deepEqual(published.notices.map(x=>x.id),["nyc-current"]);
  assert.equal(published.notices[0].sourceReference,"123456");
  assert.equal((await request("/api/release-preview/notices?source="+source,true)).status,403);
  assert.ok((await(await request("/api/ingestion-status",true)).json()).bySource.some(x=>x.sourceId===source&&x.count===1));
  assert.deepEqual((await(await request("/api/notice-changes?country=United%20States",true)).json()).changes.map(x=>x.noticeId),["nyc-current"]);
  denied=true;
  assert.equal((await request("/api/notices?source="+source,true)).status,403);
  assert.deepEqual((await(await request("/api/notice-changes?country=United%20States",true)).json()).changes,[]);
  denied=false;
  add.run("nyc-failed",source,now-100,now-100,"error",0,0,0,"blocked",'{"origin":"scheduled","snapshot":"failed"}');
  assert.equal((await request("/api/notices?source="+source,true)).status,403);
 }finally{sqlite.close();}
});
