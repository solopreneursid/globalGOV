import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {encryptDatabase,verifyEncryptedBackup,openSnapshot,decodeBackupKey} from './encrypted-backup.mjs';
test('SQLite snapshot captures committed WAL changes, encrypts and verifies a restored copy',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'globalgov-backup-test-')),input=join(dir,'source.sqlite'),output=join(dir,'backup.enc'),key=randomBytes(32);
 const db=new DatabaseSync(input);
 try{
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE example(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO example(value) VALUES('synthetic test data');");
  const saved=await encryptDatabase(input,output,key);assert.equal(saved.integrity,'ok');
  assert.equal((await verifyEncryptedBackup(output,key)).sha256,saved.sha256);
  const bytes=await readFile(output);assert.equal(bytes.includes(Buffer.from('synthetic test data')),false);
  assert.ok(openSnapshot(bytes,key).includes(Buffer.from('synthetic test data')));
  assert.throws(()=>openSnapshot(bytes,randomBytes(32)));
  bytes[bytes.length-1]^=1;assert.throws(()=>openSnapshot(bytes,key));
  await assert.rejects(encryptDatabase(input,output,key),/EEXIST/);
  assert.throws(()=>decodeBackupKey('password'));
 }finally{db.close();key.fill(0);await rm(dir,{recursive:true,force:true});}
});
