import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEventIndex,probeEvents,EVENT_INDEX} from './recruitment-events.mjs';
const ref='SDSC SHAR/RMT/01/2026';
test('event headings are classified and tied to an exact reference, never a public status',()=>{
 const html='<h1>SDSC SHAR</h1><p><a href="login">Download admit cards for '+ref+'</a></p><p>List of candidates selected for '+ref+'</p><p>Download admit cards for '+ref+'</p><p>Download admit cards for '+ref+' and SDSC SHAR/RMT/02/2026</p><p>Result published</p><p>List of candidates empanelled for '+ref+' and corrigendum dated 01.02.2026</p>';
 const result=parseEventIndex(html);assert.equal(result.candidates.length,2);assert.deepEqual(result.candidates.map(x=>x.type),['admit_card','result']);
 assert.ok(result.candidates.every(x=>x.sourceUrl===EVENT_INDEX&&x.state==='candidate_only'&&x.advertisement===ref&&!('heading' in x)));
 assert.equal(result.publicLaunchAuthorized,false);
});
test('event index is never fetched without reviewed source policy',async()=>{
 let calls=0;
 await assert.rejects(probeEvents(async()=>{calls++;return new Response('',{status:403});}),/reviewed_source_policy_required/);
 assert.equal(calls,0);
});
test('event index fetch respects robots denial under a reviewed source policy',async()=>{
 let calls=0;
 const policy={sourceId:'india-sdsc-shar',host:'apps.shar.gov.in',automationStatus:'approved',
  automatedCollectionEnabled:true,allowedPaths:['/sdscshar/result1.jsp'],allowedContentTypes:['text/html'],
  maxBytes:512*1024,minIntervalMs:5000};
 await assert.rejects(probeEvents(async()=>{calls++;return new Response('',{status:403});},policy),/robots_access_unconfirmed_403/);
 assert.equal(calls,1);
 assert.throws(()=>parseEventIndex('<html>Login</html>'),/unsupported_event_index_schema/);
});
