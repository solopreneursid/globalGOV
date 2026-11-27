import test from 'node:test';
import assert from 'node:assert/strict';
import {readReviewedCatalog,REVIEW_CONFIGURATION} from './reviewed-catalog.mjs';
const now=Date.parse('2026-11-27T05:00:00.000Z'),iso=n=>new Date(now+n).toISOString();
async function fixture(){
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const key=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
 const e={url:'https://apps.shar.gov.in/sdscshar/notice/test.pdf',sha256:'a'.repeat(64),page:1,line:3,publishedAt:iso(-10000),observedAt:iso(-5000)};
 const base={sourceId:'india-sdsc-shar',advertisement:'SDSC SHAR/RMT/01/2026',evidence:e};
 const doc={schemaVersion:1,scope:'globalGOV-reviewed-staging-v1',publicLaunchAuthorized:false,reviewedAt:iso(-1000),expiresAt:iso(3600000),posts:[{...base,id:'post-1',postCode:'01',title:'Synthetic test engineer',vacancies:2,opensAt:iso(-3600000),closesAt:iso(7200000),qualification:'Reviewed qualification',privateApplicantName:'never project this'}],events:[{...base,id:'event-1',type:'exam_schedule'}]};
 async function sign(d=doc){const payload=JSON.stringify(d);const signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(payload))).toString('base64url');return {keys:{test:key},sources:['india-sdsc-shar'],bundle:{keyId:'test',payload,signature}};}
 return {doc,sign};
}
test('actual configuration has no approved data or release authorization',async()=>{
 const r=await readReviewedCatalog(REVIEW_CONFIGURATION,now);assert.equal(r.state,'not_enrolled');assert.deepEqual(r.posts,[]);assert.deepEqual(r.events,[]);assert.equal(r.publicLaunchAuthorized,false);
});
test('valid signed review projects only approved fields; cancellations suppress jobs',async()=>{
 const {doc,sign}=await fixture();const r=await readReviewedCatalog(await sign(),now);
 assert.equal(r.state,'reviewed_staging');assert.equal(r.posts.length,1);assert.equal(r.events.length,1);assert.equal(r.posts[0].privateApplicantName,undefined);
 doc.events[0].type='cancellation';const c=await readReviewedCatalog(await sign(),now);assert.equal(c.posts.length,0);assert.equal(c.events.length,1);
});
test('tampered, expired, unapproved or spoofed evidence is withheld',async()=>{
 const {doc,sign}=await fixture(),config=await sign();
 config.bundle.payload=config.bundle.payload.replace('Synthetic test engineer','Tampered');
 assert.equal((await readReviewedCatalog(config,now)).state,'withheld');
 assert.equal((await readReviewedCatalog(await sign(),now+3600000)).state,'withheld');
 const disabled=await sign();disabled.sources=['unknown'];assert.equal((await readReviewedCatalog(disabled,now)).state,'withheld');
 doc.posts[0].evidence.url='https://apps.shar.gov.in.evil.example/sdscshar/notice/test.pdf';
 assert.equal((await readReviewedCatalog(await sign(),now)).state,'withheld');
});
