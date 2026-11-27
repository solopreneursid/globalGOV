// Independent local SQLite snapshot encryption and recovery verification.
// No Cloudflare credentials, repository upload, or automatic key generation.
import {DatabaseSync,backup} from 'node:sqlite';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const MAGIC=Buffer.from('GLOBALGOV-SQLITE-1\n'),MAX=64*1024*1024;
export function decodeBackupKey(raw){
 if(typeof raw!=='string'||!(/^[a-fA-F0-9]{64}$/).test(raw))throw Error('backup_key_must_be_32_random_bytes_hex');
 return Buffer.from(raw,'hex');
}
function keyCheck(key){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('invalid_backup_key');}
function assertSqlite(bytes){if(!Buffer.isBuffer(bytes)||bytes.length>MAX||bytes.length<100||bytes.subarray(0,16).toString('binary')!=='SQLite format 3\0')throw Error('invalid_sqlite_snapshot');}
export function sealSnapshot(bytes,key){
 keyCheck(key);assertSqlite(bytes);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(MAGIC);
 const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
}
export function openSnapshot(envelope,key){
 keyCheck(key);if(!Buffer.isBuffer(envelope)||envelope.length>MAX+MAGIC.length+28||!envelope.subarray(0,MAGIC.length).equals(MAGIC)||envelope.length<MAGIC.length+128)throw Error('invalid_backup_envelope');
 const start=MAGIC.length,decipher=createDecipheriv('aes-256-gcm',key,envelope.subarray(start,start+12));decipher.setAAD(MAGIC);decipher.setAuthTag(envelope.subarray(start+12,start+28));
 const bytes=Buffer.concat([decipher.update(envelope.subarray(start+28)),decipher.final()]);assertSqlite(bytes);return bytes;
}
async function readBounded(path,max){const s=await stat(path);if(!s.isFile()||s.size>max)throw Error('invalid_backup_file_size');return readFile(path);}
function verifySqlite(path){
 const db=new DatabaseSync(path,{readOnly:true});try{
  const rows=db.prepare('PRAGMA integrity_check').all();if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw Error('sqlite_integrity_failed');
  return {integrity:'ok',tables:db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n};
 }finally{db.close();}
}
export async function encryptDatabase(input,output,key){
 keyCheck(key);const s=await stat(input);if(!s.isFile()||s.size>MAX)throw Error('invalid_source_database');
 const dir=await mkdtemp(join(tmpdir(),'globalgov-backup-')),snapshot=join(dir,'snapshot.sqlite');
 try{
  const db=new DatabaseSync(input,{readOnly:true});try{await backup(db,snapshot);}finally{db.close();}
  const verification=verifySqlite(snapshot),bytes=await readBounded(snapshot,MAX),envelope=sealSnapshot(bytes,key);
  await writeFile(output,envelope,{flag:'wx',mode:0o600});return {...verification,bytes:envelope.length,sha256:createHash('sha256').update(envelope).digest('hex')};
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function verifyEncryptedBackup(input,key){
 const envelope=await readBounded(input,MAX+MAGIC.length+28),bytes=openSnapshot(envelope,key);
 const dir=await mkdtemp(join(tmpdir(),'globalgov-restore-')),path=join(dir,'restore.sqlite');
 try{await writeFile(path,bytes,{mode:0o600,flag:'wx'});return {...verifySqlite(path),sha256:createHash('sha256').update(envelope).digest('hex')};}finally{await rm(dir,{recursive:true,force:true});}
}
async function main(){
 const [command,input,output,...extra]=process.argv.slice(2);if(extra.length||!input||!['encrypt','verify'].includes(command)||command==='encrypt'&&!output||command==='verify'&&output)throw Error('usage: encrypted-backup.mjs encrypt INPUT.sqlite OUTPUT.enc | verify OUTPUT.enc; set GLOBALGOV_BACKUP_KEY_HEX outside Git');
 const key=decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
 try{const result=command==='encrypt'?await encryptDatabase(input,output,key):await verifyEncryptedBackup(input,key);console.log(JSON.stringify(result));}finally{key.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
