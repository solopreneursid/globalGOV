import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encryptD1Export,verifyD1Backup,verifySqlExport,openD1Export} from './d1-export-backup.mjs';
const tables=['members','moderation_actions','notice_revisions','official_job_notices','portal_history','portal_status','posts','replies','reports','source_feed_cursors','source_ingest_runs','votes'];
const sql=Buffer.from(tables.map(t=>'CREATE TABLE '+t+'(id INTEGER PRIMARY KEY, value TEXT);').join('\n')+"\nINSERT INTO official_job_notices VALUES(1,'synthetic only');");
test('D1 SQL export recovery preserves exact encrypted SQL and required tables',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'globalgov-d1-backup-test-')),input=join(dir,'export.sql'),output=join(dir,'backup.enc'),key=randomBytes(32);
 try{
  await writeFile(input,sql,{mode:0o600});const a=await encryptD1Export(input,output,key),b=await verifyD1Backup(output,key);
  assert.equal(a.requiredTables,12);assert.equal(a.counts.official_job_notices,1);assert.equal(a.encryptedSha256,b.encryptedSha256);
  const data=await readFile(output);assert.equal(data.includes(Buffer.from('synthetic only')),false);assert.deepEqual(openD1Export(data,key),sql);
  assert.throws(()=>openD1Export(data,randomBytes(32)));data[data.length-1]^=1;assert.throws(()=>openD1Export(data,key));
  await assert.rejects(encryptD1Export(input,output,key),/EEXIST/);
  await assert.rejects(verifySqlExport(Buffer.from('CREATE TABLE partial(id INT);')),/incomplete_globalgov_export/);
  await assert.rejects(verifySqlExport(Buffer.concat([sql,Buffer.from('\n.shell echo forbidden')])),/isolated_sql_import_failed/);
 }finally{key.fill(0);await rm(dir,{recursive:true,force:true});}
});
