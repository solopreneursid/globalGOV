import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSnapshot,monitor} from './launch-monitor.mjs';
const now=Date.now();
function snapshot(){return {
 health:{status:'ok',service:'hqventures-govradar'},
 notices:{releaseProfile:'approved_staging',publicLaunchAuthorized:false,sources:[{id:'uk-dfe-teaching-vacancies',commercialReuseApprovedForCurrentFields:true}],notices:[{sourceId:'uk-dfe-teaching-vacancies',sourceUrl:'https://teaching-vacancies.service.gov.uk/jobs/test',closingAt:new Date(now+86400000).toISOString(),lastSeenAt:now}]},
 india:{filters:{country:'India'},notices:[]},changes:{changes:[]},ingestion:{automation:{healthy:true}},privacy:true,terms:true
};}
test('independent monitor detects unapproved, stale, expired and misdirected notices',()=>{
 assert.deepEqual(checkSnapshot(snapshot(),now),[]);
 const x=snapshot();x.notices.notices.push({sourceId:'manitoba-jobs',sourceUrl:'https://evil.example/jobs/test',closingAt:new Date(now-1).toISOString(),lastSeenAt:now-15*86400000});
 assert.deepEqual(new Set(checkSnapshot(x,now)),new Set(['unapproved_notice_source','expired_or_invalid_notice','stale_notice','unsafe_notice_url']));
});
test('monitor accepts a current approved ISRO notice with an official ISRO URL',()=>{
 const x=snapshot(),row={sourceId:'india-isro-opportunities',country:'India',sourceUrl:'https://www.isro.gov.in/TestRecruitment.html',closingAt:new Date(now+86400000).toISOString(),lastSeenAt:now};
 x.notices.sources.push({id:row.sourceId,commercialReuseApprovedForCurrentFields:true});x.notices.notices.push(row);x.india.notices.push(row);
 assert.deepEqual(checkSnapshot(x,now),[]);
 row.sourceUrl='https://www.isro.gov.in.evil.example/TestRecruitment.html';assert.ok(checkSnapshot(x,now).includes('unsafe_notice_url'));
});
test('independent monitor fails closed for missing health, rights, policy or live ingestion',()=>{
 const x=snapshot();x.health=null;x.notices.sources=[];x.india.notices=[{}];x.changes.changes=[{sourceId:'manitoba-jobs'}];x.ingestion.automation.healthy=false;x.terms=false;
 assert.deepEqual(new Set(checkSnapshot(x,now)),new Set(['health_failed','approved_source_missing','india_notices_not_approved','change_scope_invalid','source_ingestion_not_fresh','policy_page_unavailable']));
});
test('monitor rejects non-HTTPS targets and records failed requests',async()=>{
 await assert.rejects(()=>monitor('http://example.org'),/HTTPS/);
 const report=await monitor('https://example.org',async()=>new Response('down',{status:503}));
 assert.equal(report.status,'error');assert.ok(report.failures.includes('health_request_failed'));
});
