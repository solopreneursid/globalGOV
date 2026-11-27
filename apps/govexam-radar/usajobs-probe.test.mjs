import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUsajobsPage,probeUsajobs} from './usajobs-probe.mjs';
const now=Date.parse('2026-11-27T00:00:00Z');
const item=(id='12345',extra={})=>({MatchedObjectId:id,MatchedObjectDescriptor:{PositionID:'TEST-01',PositionTitle:'Synthetic engineer',PositionURI:'https://www.usajobs.gov/job/'+id,OrganizationName:'Synthetic agency',PositionStartDate:'2026-11-26T00:00:00Z',ApplicationCloseDate:'2026-11-30T23:59:00-05:00',PositionLocation:[{CountryCode:'United States'}],...extra}});
const body=rows=>({SearchResult:{SearchResultItems:rows,SearchResultCount:rows.length,SearchResultCountAll:rows.length}});
test('minimal candidate metadata only, explicit deadline and official link',()=>{
 const r=parseUsajobsPage(body([item('12345',{PrivateContact:'not retained'}),item('23456',{ApplicationCloseDate:'2026-11-26T00:00:00Z'}),item('34567',{PositionURI:'https://usajobs.gov.evil.test/job/34567'}),item('45678',{PositionLocation:[{CountryCode:'Canada'}]})]),now);
 assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].closesAt,'2026-12-01T04:59:00.000Z');assert.equal(r.candidates[0].PrivateContact,undefined);assert.equal(r.publicLaunchAuthorized,false);
 assert.throws(()=>parseUsajobsPage(body([item(),item()]),now),/duplicate/);
});
test('requires owner credentials before access and never follows redirects',async()=>{
 let calls=0;await assert.rejects(probeUsajobs({fetcher:async()=>{calls++;}}),/credentials_required/);assert.equal(calls,0);
 const result=await probeUsajobs({email:'fixture@example.test',key:'synthetic-test-key',now,fetcher:async(url,o)=>{calls++;assert.equal(new URL(url).hostname,'data.usajobs.gov');assert.equal(o.redirect,'error');assert.equal(o.headers['Authorization-Key'],'synthetic-test-key');return Response.json(body([item()]));}});
 assert.equal(result.candidates.length,1);assert.equal(calls,1);
});
