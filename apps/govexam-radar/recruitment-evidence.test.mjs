import test from 'node:test';
import assert from 'node:assert/strict';
import {extractRecruitmentEvidence,officialDocumentUrl,indiaCalendarDate} from './recruitment-evidence.mjs';
import {fetchOfficialDocument,extractPdfText} from './recruitment-document.mjs';
import {screenReviewedRequirements,ageAt} from './recruitment-eligibility.mjs';
const sourceId='india-sdsc-shar',sourceUrl='https://apps.shar.gov.in/sdscshar/advt_03_2026/Test.pdf';
const fixture=(text)=>extractRecruitmentEvidence({sourceId,sourceUrl,documentBytes:Buffer.from('synthetic fixture'),text});
test('labelled fields retain pages and original evidence; never publish',()=>{
 const r=fixture('Advertisement No. TEST/2026\nPost name: Engineer\nVacancies: 4\nEssential qualification: Degree\nAge limit: 18–30\nApplication fee: Rs. 500\nPay level: Level 7\nOpening date: 01.11.2026\nClosing date: 30.11.2026 (23:59 hrs)\fExam date: 01.12.2026\nCorrigendum');
 assert.equal(r.fields.advertisement.value,'TEST/2026');assert.equal(r.fields.vacancies.value,4);assert.equal(r.fields.examDate.page,2);assert.equal(r.fields.closing.value.instant,'2026-11-30T18:29:00.000Z');assert.equal(r.events[0].type,'corrigendum');assert.equal(r.publicLaunchAuthorized,false);assert.equal(r.reviewState,'requires_review');assert.match(r.documentSha256,/^[a-f0-9]{64}$/);
});
test('multiple post names or conflicting dates are not silently selected',()=>{
 const r=fixture('Post name: Engineer\nPost name: Clerk\nClosing date: 29.11.2026\nClosing date: 30.11.2026\nVacancies: four\nResult published');
 assert.deepEqual(r.conflicts,['post','closing','vacancies']);assert.equal(r.fields.closing,undefined);assert.equal(r.events.length,0);
 assert.equal(indiaCalendarDate('31.02.2026'),null);assert.equal(indiaCalendarDate('30.11.2026').instant,null);assert.equal(indiaCalendarDate('30.11.2026 (25:00 hrs)'),null);
});
test('source allowlist blocks spoofed host, arbitrary path, query and non-HTTPS',()=>{
 for(const u of ['https://apps.shar.gov.in.evil.test/sdscshar/notice/test.pdf','https://apps.shar.gov.in/login.pdf','http://apps.shar.gov.in/sdscshar/notice/test.pdf',sourceUrl+'?a=1','https://apps.shar.gov.in/sdscshar/notice/a%2Fb.pdf'])assert.throws(()=>officialDocumentUrl(sourceId,u));
 assert.equal(officialDocumentUrl(sourceId,sourceUrl),sourceUrl);
});
test('fetch stops at login redirect and restrictive robots; no upstream PDF fetch',async()=>{
 let calls=0;await assert.rejects(fetchOfficialDocument(sourceId,sourceUrl,async()=>{calls++;return new Response('',{status:302,headers:{location:'https://apps.shar.gov.in/login'}});}),/robots_access_unconfirmed/);assert.equal(calls,1);
 calls=0;await assert.rejects(fetchOfficialDocument(sourceId,sourceUrl,async()=>{calls++;return new Response('User-agent: *\nDisallow: /',{headers:{'content-type':'text/plain'}});}),/robots_review_required/);assert.equal(calls,1);
 assert.throws(()=>extractPdfText(Buffer.from('not pdf')),/invalid_pdf/);
});
test('eligibility uses reviewed cutoff and never asserts complete eligibility',()=>{
 assert.equal(ageAt('2000-12-01','2026-11-30'),25);
 const rules={reviewState:'founder_reviewed',requirements:[{id:'age',kind:'age',min:18,max:30,cutoff:'2026-11-30',relaxationsReviewed:true,categorySpecific:false,evidencePage:2}]};
 assert.equal(screenReviewedRequirements(rules,{dateOfBirth:'2000-12-01'}).status,'listed_checks_match_not_full_eligibility');
 assert.equal(screenReviewedRequirements(rules,{dateOfBirth:'1980-01-01'}).status,'requirement_mismatch');
 assert.equal(screenReviewedRequirements({...rules,reviewState:'requires_review'},{dateOfBirth:'2000-12-01'}).status,'review_required');
 rules.requirements[0].relaxationsReviewed=false;
 assert.equal(screenReviewedRequirements(rules,{dateOfBirth:'1980-01-01'}).status,'review_required');
});
