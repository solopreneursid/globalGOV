// Owner-controlled offline recovery of an official D1 SQL export.
// No live database mutation, cloud token, network transfer or public CI data.
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodeBackupKey} from './encrypted-backup.mjs';
const MAGIC=Buffer.from('GLOBALGOV-D1-SQL-1\n'),MAX=64*1024*1024;
const REQUIRED=['members','moderation_actions','notice_revisions','official_job_notices','portal_history','portal_status','posts','replies','reports','source_feed_cursors','source_ingest_runs','votes'];
const hash=x=>createHash('sha256').update(x).digest('hex');
function keyCheck(k){if(!Buffer.isBuffer(k)||k.length!==32)throw Error('invalid_backup_key');}
function validateSql(s){if(!Buffer.isBuffer(s)||s.length<16||s.length>MAX||s.includes(0))throw Error('invalid_sql_export');}
export function sealD1Export(sql,key){
 keyCheck(key);validateSql(sql);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(MAGIC);
 const payload=Buffer.concat([cipher.update(sql),cipher.final()]);return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),payload]);
}
export function openD1Export(data,key){
 keyCheck(key);const i=MAGIC.length;
 if(!Buffer.isBuffer(data)||data.length>MAX+i+28||data.length<i+44||!data.subarray(0,i).equals(MAGIC))throw Error('invalid_d1_envelope');
 const d=createDecipheriv('aes-256-gcm',key,data.subarray(i,i+12));d.setAAD(MAGIC);d.setAuthTag(data.subarray(i+12,i+28));
 const sql=Buffer.concat([d.update(data.subarray(i+28)),d.final()]);validateSql(sql);return sql;
}
async function privateFile(path,max){
 const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0||info.size>max)throw Error('private_file_required');
 return readFile(path);
}
async function privateDirectory(path){
 const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw Error('private_directory_required');
}
export async function verifySqlExport(sql){
 validateSql(sql);
 const dir=await mkdtemp(join(tmpdir(),'globalgov-d1-verify-')),path=join(dir,'restored.sqlite');
 try{
  // SQLite CLI safe mode disables shell commands, extension loading, ATTACH,
  // and filesystem access via SQL. Run on an unprivileged dedicated host.
  // Do not include SQL or stderr in error messages.
  try{execFileSync('sqlite3',['-safe','-batch','-bail','-init','/dev/null',path],{input:sql,timeout:30000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:dir,LANG:'C'},cwd:dir});}
  catch{throw Error('isolated_sql_import_failed');}
  const db=new DatabaseSync(path,{readOnly:true});
  try{
   const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(x=>x.name));
   if(REQUIRED.some(t=>!tables.has(t)))throw Error('incomplete_globalgov_export');
   const integrity=db.prepare('PRAGMA integrity_check').all();
   if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('restored_database_integrity_failed');
   // Aggregate counts only; never inspect or emit community records.
   const counts=Object.fromEntries(REQUIRED.map(t=>[t,db.prepare('SELECT COUNT(*) AS n FROM "'+t+'"').get().n]));
   return {integrity:'ok',requiredTables:REQUIRED.length,counts,sqlSha256:hash(sql)};
  }finally{db.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function encryptD1Export(input,output,key){
 keyCheck(key);await privateDirectory(dirname(output));const sql=await privateFile(input,MAX);
 try{
  const proof=await verifySqlExport(sql),encrypted=sealD1Export(sql,key);
  await writeFile(output,encrypted,{flag:'wx',mode:0o600});
  const stored=await privateFile(output,MAX+MAGIC.length+28),opened=openD1Export(stored,key);
  try{if(hash(opened)!==proof.sqlSha256)throw Error('backup_readback_mismatch');}finally{opened.fill(0);}
  return {...proof,encryptedSha256:hash(stored),bytes:stored.length};
 }finally{sql.fill(0);}
}
export async function verifyD1Backup(input,key){
 const data=await privateFile(input,MAX+MAGIC.length+28),sql=openD1Export(data,key);
 try{return {...await verifySqlExport(sql),encryptedSha256:hash(data),bytes:data.length};}finally{sql.fill(0);}
}
async function main(){
 const [action,input,output,...extra]=process.argv.slice(2);
 if(extra.length||!input||!['encrypt','verify'].includes(action)||(action==='encrypt'?!output:!!output))throw Error('usage: d1-export-backup.mjs encrypt PRIVATE.sql PRIVATE_DIR/backup.enc | verify PRIVATE_DIR/backup.enc');
 const key=decodeBackupKey(process.env.GLOBALGOV_BACKUP_KEY_HEX);
 try{const proof=action==='encrypt'?await encryptD1Export(input,output,key):await verifyD1Backup(input,key);console.log(JSON.stringify(proof));}finally{key.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
