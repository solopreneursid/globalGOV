import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initLedger,recordEvidence} from './recruitment-ledger.mjs';
import {extractRecruitmentEvidence} from './recruitment-evidence.mjs';
test('ledger preserves exact report revisions, deduplicates and rejects release claims',()=>{
 const db=new DatabaseSync(':memory:');try{
  initLedger(db);
  const a=extractRecruitmentEvidence({sourceId:'india-sdsc-shar',sourceUrl:'https://apps.shar.gov.in/sdscshar/notice/Test.pdf',documentBytes:Buffer.from('synthetic'),text:'Post name: Engineer'});
  assert.equal(recordEvidence(db,a).inserted,true);assert.equal(recordEvidence(db,a).inserted,false);
  assert.equal(recordEvidence(db,{...a,observedAt:'2026-11-27T00:00:00Z'}).inserted,true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM document_evidence').get().n,2);
  assert.throws(()=>recordEvidence(db,{...a,publicLaunchAuthorized:true}),/invalid_evidence_report/);
 }finally{db.close();}
});
