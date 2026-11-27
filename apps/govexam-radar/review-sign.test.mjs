import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {signReviewedPayload} from './review-sign.mjs';
import {readReviewedCatalog} from './reviewed-catalog.mjs';
test('explicit local signing interoperates with the staging verifier without enrolling keys',async()=>{
 const {privateKey}=generateKeyPairSync('ed25519'),now=Date.parse('2026-11-27T05:00:00.000Z');
 const doc={schemaVersion:1,scope:'globalGOV-reviewed-staging-v1',publicLaunchAuthorized:false,reviewedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),posts:[],events:[]};
 const input={payload:JSON.stringify(doc),keyId:'test',privateKey,sources:['india-sdsc-shar'],now};
 const result=await signReviewedPayload(input);assert.equal((await readReviewedCatalog(result.configuration,now)).state,'reviewed_staging');
 assert.equal((await readReviewedCatalog()).state,'not_enrolled');assert.equal(result.configuration.keys.test.length,43);
 await assert.rejects(signReviewedPayload({...input,payload:JSON.stringify({...doc,publicLaunchAuthorized:true})}),/failed_validation/);
 await assert.rejects(signReviewedPayload({...input,sources:['unknown']}),/invalid_signing_scope/);
});
