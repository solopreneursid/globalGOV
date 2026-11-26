import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ISRO_SOURCE,parseIsroTable,ingestIsro,isroPublicationGate} from './isro-feed.mjs';
const now=Date.now(),y=new Date(now).getUTCFullYear();
const clock=Date.parse(`${y}-11-25T00:00:00Z`);
function row({employer='Space Applications Centre (SAC)',title='Engineer test role',advert='SAC:TEST',opens=`Nov 01, ${y}`,closes=`Dec 01, ${y}`,href='SACRecruitment1.html'}={}){
 return `<tr><td class="location">${employer}</td><td class="post">${title}</td><td class="advNo">${advert}</td><td class="openDate">${opens}</td><td class="closeDate">${closes}</td><td class="moreDetails"><button onclick="window.location.href='${href}';"></button></td></tr>`;
}
const table=rows=>`<table><thead><tr><th>Location</th><th>Post</th><th>Advertisement Number</th><th>Opening Date</th><th>Last Date of Submission</th><th>More Details</th></tr></thead><tbody>${rows}</tbody></table>`;
function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE official_job_notices(id TEXT PRIMARY KEY,source_id TEXT,source_ref TEXT,title TEXT,employer TEXT,country TEXT,region TEXT,stream TEXT,apply_url TEXT,source_page TEXT,published_at TEXT,closing_at TEXT,first_seen_at INTEGER,last_seen_at INTEGER,evidence_sha256 TEXT,review_state TEXT,life_status TEXT,jurisdiction_code TEXT,jurisdiction_name TEXT,government_tier TEXT,employer_type TEXT,UNIQUE(source_id,source_ref));CREATE TABLE source_ingest_runs(id TEXT PRIMARY KEY,source_id TEXT,started_at INTEGER,finished_at INTEGER,state TEXT,http_status INTEGER,received INTEGER,accepted INTEGER,discarded INTEGER,error_code TEXT,details TEXT);`);
 const db={prepare(sql){const stmt=sqlite.prepare(sql);let params=[];return{bind(...args){params=args;return this;},async all(){return {results:stmt.all(...params)};},async run(){return {success:true,meta:stmt.run(...params)};}};},async batch(items){return Promise.all(items.map(x=>x.run()));}};
 return {sqlite,db};
}
function responses(html,robotsStatus=404){return async url=>url===ISRO_SOURCE.robots?new Response(robotsStatus===200?'User-agent: *\nDisallow: /private':'not found',{status:robotsStatus,headers:{'content-type':'text/plain'}}):new Response(html,{status:200,headers:{'content-type':'text/html'}});}
test('extracts only current, attributable ISRO records and uses Indian calendar boundaries',()=>{
 const html=table(row()+row({employer:'Physical Research Laboratory (PRL)',advert:'third-party'})+row({employer:'ISRO Headquarters',title:'Director in Antrix Corporation',advert:'third-party-title'})+row({advert:'expired',closes:`Oct 01, ${y}`})+row({advert:'undated',closes:''})+row({advert:'future',opens:`Dec 01, ${y}`,closes:`Dec 22, ${y}`})+row({advert:'offsite',href:'https://evil.example/role.html'}));
 const parsed=parseIsroTable(html,clock);assert.equal(parsed.received,7);assert.equal(parsed.valid.length,1);
 assert.equal(parsed.valid[0].sourcePage,'https://www.isro.gov.in/SACRecruitment1.html');
 assert.equal(parsed.valid[0].closingAt,`${y}-12-01T18:29:59.000Z`);
 assert.equal(parsed.rejected.third_party_or_unknown_owner,2);assert.equal(parsed.rejected.not_current,2);assert.equal(parsed.rejected.missing_or_invalid_fields,2);
});
test('schema changes, excessive rows and unsafe authority links fail closed',()=>{
 assert.throws(()=>parseIsroTable('<table><tr><td>No source</td></tr></table>',clock),/unsupported_isro_table_schema/);
 assert.throws(()=>parseIsroTable(table('<tr><td class="post">bad</td></tr>'),clock),/isro_row_schema_changed/);
 assert.throws(()=>parseIsroTable(table(row().repeat(501)),clock),/isro_row_limit/);
 assert.equal(parseIsroTable(table(row({href:'//www.isro.gov.in.evil.example/job.html'})),clock).valid.length,0);
 assert.equal(parseIsroTable(table(row({href:'javascript:alert(1)'})),clock).valid.length,0);
 assert.equal(parseIsroTable(table(row({title:'Long source title '.repeat(20)})),clock).valid.length,0);
});
test('a complete empty snapshot is valid, but publication requires two recent scheduled successes',async()=>{
 const {sqlite,db}=database();try{
  const html=table(row({opens:'Oct 01, 2024',closes:'Oct 31, 2024'}));
  const first=await ingestIsro(db,responses(html),now-3*3600000);assert.equal(first.state,'ok');assert.equal(first.accepted,0);
  assert.equal((await isroPublicationGate(db,now)).ready,false);
  const second=await ingestIsro(db,responses(html),now-1000);assert.equal(second.state,'ok');assert.equal(second.accepted,0);
  const gate=await isroPublicationGate(db,now+1000);assert.equal(gate.ready,true);assert.equal(gate.snapshotAt,now-1000);
  const failed=await ingestIsro(db,responses(html,403),now);assert.equal(failed.state,'error');
  assert.equal((await isroPublicationGate(db,now+1000)).ready,false,'latest failed attempt must immediately close the gate');
 }finally{sqlite.close();}
});
test('a valid snapshot stores only the current ISRO record with source provenance',async()=>{
 const {sqlite,db}=database();try{
  const fmt=x=>new Date(x).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const html=table(row({opens:fmt(now-86400000),closes:fmt(now+3*86400000)})+row({employer:'NewSpace India Limited',advert:'other-owner',opens:fmt(now-86400000),closes:fmt(now+3*86400000)}));
  const result=await ingestIsro(db,responses(html),now-500);assert.equal(result.state,'ok');assert.equal(result.accepted,1);
  const saved=sqlite.prepare('SELECT source_id,source_page,last_seen_at,life_status FROM official_job_notices').get();
  assert.equal(saved.source_id,ISRO_SOURCE.id);assert.equal(saved.source_page,'https://www.isro.gov.in/SACRecruitment1.html');assert.equal(saved.last_seen_at,now-500);assert.equal(saved.life_status,'open');
 }finally{sqlite.close();}
});
test('a retry from the same scheduled cycle cannot count as a second independent check',async()=>{
 const {sqlite,db}=database();try{
  const html=table(row({opens:'Oct 01, 2024',closes:'Oct 31, 2024'}));
  await ingestIsro(db,responses(html),now-2000);await ingestIsro(db,responses(html),now-1000);
  assert.equal((await isroPublicationGate(db,now+1000)).ready,false);
 }finally{sqlite.close();}
});
test('an unfinished scheduled attempt closes the gate and no records are published from blocked robots',async()=>{
 const {sqlite,db}=database();try{
  const html=table(row({opens:'Oct 01, 2024',closes:'Oct 31, 2024'}));
  await ingestIsro(db,responses(html),now-3*3600000);await ingestIsro(db,responses(html),now-2000);
  sqlite.prepare('INSERT INTO source_ingest_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('pending',ISRO_SOURCE.id,now-500,now-500,'error',null,0,0,0,'isro_collection_pending','{"origin":"scheduled","snapshot":"pending"}');
  assert.equal((await isroPublicationGate(db,now+1000)).ready,false);
  const restricted=await ingestIsro(db,responses(html,200),now);assert.equal(restricted.state,'error');assert.match(restricted.errorCode,/robots_rule_review_required/);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM official_job_notices').get().n,0);
 }finally{sqlite.close();}
});
