// Local-only, append-only evidence review journal. The journal is not a trust
// authority: its entries remain candidates even if supplied by a local user.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile,stat,open} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {officialDocumentUrl} from './recruitment-evidence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=/^[a-f0-9]{64}$/;
export function initLedger(db){
 db.exec("PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS document_evidence(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,source_url TEXT NOT NULL,document_hash TEXT NOT NULL,text_hash TEXT NOT NULL,observed_at TEXT NOT NULL,report_json TEXT NOT NULL,review_state TEXT NOT NULL CHECK(review_state='requires_review')); CREATE INDEX IF NOT EXISTS doc_evidence_source ON document_evidence(source_id,source_url,observed_at);");
}
export function recordEvidence(db,report){
 if(!report||report.schemaVersion!==1||report.reviewState!=='requires_review'||report.publicLaunchAuthorized!==false||!hex.test(report.documentSha256||'')||!hex.test(report.textSha256||'')||!Number.isFinite(Date.parse(report.observedAt))||!['local_unverified','official_https_fetch'].includes(report.provenance))throw Error('invalid_evidence_report');
 const url=officialDocumentUrl(report.sourceId,report.sourceUrl),json=JSON.stringify(report);
 if(Buffer.byteLength(json)>2*1024*1024)throw Error('evidence_report_limit');
 const id=sha(Buffer.from(json));
 const result=db.prepare("INSERT OR IGNORE INTO document_evidence(id,source_id,source_url,document_hash,text_hash,observed_at,report_json,review_state) VALUES(?,?,?,?,?,?,?,'requires_review')").run(id,report.sourceId,url,report.documentSha256,report.textSha256,report.observedAt,json);
 return {id,inserted:result.changes===1,reviewState:'requires_review'};
}
async function main(){
 const [database,file,...extra]=process.argv.slice(2);if(!database||!file||extra.length)throw Error('usage: node recruitment-ledger.mjs PRIVATE.sqlite PRIVATE-REPORT.json');
 const s=await stat(file);if(!s.isFile()||s.size>2*1024*1024)throw Error('invalid_evidence_file');
 // Create with private permissions and never overwrite the existing file.
 try{const handle=await open(database,'wx',0o600);await handle.close();}catch(e){if(e.code!=='EEXIST')throw e;}
 const d=await stat(database);if(!d.isFile()||(d.mode&0o077)!==0)throw Error('ledger_permissions_not_private');
 const report=JSON.parse(await readFile(file,'utf8')),db=new DatabaseSync(database);
 try{initLedger(db);console.log(JSON.stringify(recordEvidence(db,report)));}finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
