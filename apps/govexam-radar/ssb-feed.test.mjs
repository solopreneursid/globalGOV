import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSsbTable,SSB_SOURCE,ingestSsb,ssbPublicationGate} from './ssb-feed.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
const clock=Date.parse('2026-11-26T00:00:00Z');
const header=['Sr. No.','ADVERTISEMENT NUMBER','ADVERTISEMENT FOR THE POST OF','OPENING DATE','CLOSING DATE','VIEW ADVERTISEMENT','APPLY'];
const table=rows=>'<table><thead><tr>'+header.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
const row=(number='123/RC/SSB/TEST/2026',title='Test recruitment',open='25/11/2026',close='30/11/2026')=>'<tr>'+['1',number,title,open,close,'<input type="submit">','<input type="submit">'].map(x=>'<td>'+x+'</td>').join('')+'</tr>';
test('SSB parser accepts only open official advertisements and links to the source index',()=>{
 const p=parseSsbTable(table(row()+row('456/RC/SSB/TEST/2026','Expired','01/01/2026','01/02/2026')+row('external','Unknown')+row('789/RC/SSB/TEST/2026','Invalid','31/02/2026')),clock);
 assert.equal(p.received,4);assert.equal(p.valid.length,1);assert.equal(p.valid[0].sourcePage,SSB_SOURCE.url);
 assert.equal(p.valid[0].closingAt,'2026-11-30T18:29:59.000Z');
 assert.equal(p.rejected.not_current,1);assert.equal(p.rejected.unknown_owner,1);assert.equal(p.rejected.missing_or_invalid_fields,1);
});
test('SSB refuses schema drift, duplicate IDs and malformed snapshots',()=>{
 assert.throws(()=>parseSsbTable('<table></table>',clock),/unsupported_ssb/);
 assert.throws(()=>parseSsbTable(table(row()+row()),clock),/ambiguous_ssb/);
 assert.throws(()=>parseSsbTable(table('<tr><td>1</td></tr>'),clock),/ssb_row_schema_changed/);
});
test('SSB records real SQLite provenance and requires two complete scheduled runs',async()=>{
 const sql=new DatabaseSync(':memory:');try{
  for(const name of ['official-notices.sql','official-notices-jurisdictions.sql'])sql.exec(await readFile(new URL(name,import.meta.url),'utf8'));
  const db={prepare(query){const stmt=sql.prepare(query);let args=[];return{bind(...x){args=x;return this;},async all(){return{results:stmt.all(...args)};},async run(){return{success:true,meta:stmt.run(...args)};}};},async batch(x){return Promise.all(x.map(y=>y.run()));}};
  const now=Date.now(),fmt=x=>new Date(x).toLocaleDateString('en-GB',{timeZone:'UTC'});
  const html=table(row('123/RC/SSB/TEST/2026','Test only',fmt(now-86400000),fmt(now+3*86400000)));
  const fetcher=async url=>url===SSB_SOURCE.robots?new Response('not found',{status:404}):new Response(html,{headers:{'content-type':'text/html'}});
  const approvedPolicy={...SSB_SOURCE,automatedAccessStatus:'approved'};
  const approved={sourcePolicy:approvedPolicy,automatedAccessApproved:true};
  const a=await ingestSsb(db,fetcher,now-3*3600000,approved);assert.equal(a.state,'ok');assert.equal(a.accepted,1);assert.equal((await ssbPublicationGate(db,now,approvedPolicy)).ready,false);
  const b=await ingestSsb(db,fetcher,now-1000,approved);assert.equal(b.state,'ok');assert.equal((await ssbPublicationGate(db,Date.now()+1000,approvedPolicy)).ready,true);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM official_job_notices').get().n,1);
  const failed=await ingestSsb(db,async()=>new Response('blocked',{status:403}),now,approved);assert.equal(failed.state,'error');assert.equal((await ssbPublicationGate(db,Date.now()+1000,approvedPolicy)).ready,false);
 }finally{sql.close();}
});

test('SSB scheduled collection is blocked before HTTP until access is explicitly approved',async()=>{
 const sql=new DatabaseSync(':memory:');
 try{
  for(const name of ['official-notices.sql','official-notices-jurisdictions.sql'])sql.exec(await readFile(new URL(name,import.meta.url),'utf8'));
  const db={prepare(query){const stmt=sql.prepare(query);let args=[];return{bind(...x){args=x;return this;},async all(){return{results:stmt.all(...args)};},async run(){return{success:true,meta:stmt.run(...args)};}};}};
  let calls=0;
  const result=await ingestSsb(db,async()=>{calls++;return new Response('unexpected');},Date.now());
  assert.equal(result.state,'error');
  assert.equal(result.errorCode,'automated_access_not_approved');
  assert.equal(calls,0);
  assert.equal((await ssbPublicationGate(db)).ready,false);
  assert.equal(sql.prepare("SELECT error_code FROM source_ingest_runs WHERE source_id=?").get(SSB_SOURCE.id).error_code,'automated_access_not_approved');
 }finally{sql.close();}
});
