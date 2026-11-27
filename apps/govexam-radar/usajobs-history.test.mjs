import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUsajobsHistoricPage,parseUsajobsAnnouncementText,handleUsajobsHistory,handleUsajobsAnnouncementText,normalizeHistoryFilters} from './usajobs-history.mjs';
const now=Date.parse('2026-11-27T00:00:00Z');
const record=(id=12345678,extra={})=>({usajobsControlNumber:id,announcementNumber:'TEST-2026-01',positionTitle:'IT Specialist',hiringAgencyName:'Synthetic agency',hiringAgencyCode:'VA',hiringDepartmentName:'Department of Veterans Affairs',hiringDepartmentCode:'VA',positionOpenDate:'2026-01-01',positionCloseDate:'2026-02-01',positionExpireDate:'1900-01-01',positionOpeningStatus:'Applications under review',minimumSalary:100000,maximumSalary:120000,minimumGrade:'12',maximumGrade:'13',hiringpaths:[{hiringPath:'The public'}],jobcategories:[{series:'2210'}],positionlocations:[{positionLocationCity:'Washington',positionLocationState:'DC',positionLocationCountry:'United States'}],...extra});
const page=(rows,token='next%3D%3D')=>({paging:{metadata:{totalCount:100,pageSize:500,continuationToken:token}},data:rows});
test('normalizes actual lower-camel Historic JOA payload and excludes open records',()=>{
 const r=parseUsajobsHistoricPage(page([record(),record(2,{positionExpireDate:'2026-01-15'}),record(3,{positionCloseDate:'2026-12-31'}),record(4,{positionCloseDate:null}),record(5,{positionOpeningStatus:'Accepting applications'})]),now);
 assert.equal(r.records.length,2);assert.equal(r.records[0].status,'historical_closed');assert.equal(r.records[0].effectiveCloseDate,'2026-02-01');assert.equal(r.records[1].effectiveCloseDate,'2026-01-15');assert.deepEqual(r.records[0].hiringPaths,['The public']);assert.deepEqual(r.records[0].series,['2210']);assert.equal(r.nextCursor,'next%3D%3D');assert.equal(r.rejected.not_historical_yet,1);assert.equal(r.rejected.missing_close_date,1);assert.equal(r.rejected.status_conflicts_with_closed_date,1);
});
test('accepts documented PascalCase field names and omits malformed rows',()=>{
 const raw={USAJOBSControlNumber:9,PositionTitle:'Analyst',HiringAgencyName:'Agency',PositionOpenDate:'2025-01-01T00:00:00',PositionCloseDate:'2025-01-10',PositionExpireDate:null,HiringPaths:[{HiringPath:'The public'}],JobCategories:[{Series:'2210'}],PositionLocations:[{PositionLocationCity:'Arlington'}]};
 const r=parseUsajobsHistoricPage(page([raw]),now);assert.equal(r.records.length,1);assert.equal(r.records[0].controlNumber,'9');assert.deepEqual(r.records[0].series,['2210']);
});
test('validates bounded close-date filters and maps to documented API query names',()=>{
 const p=new URLSearchParams('series=2210&agency=VA&closeFrom=2025-11-27&closeTo=2026-11-27');
 const f=normalizeHistoryFilters(p,now);assert.equal(f.series,'2210');assert.equal(f.close.from,'2025-11-27');
 assert.throws(()=>normalizeHistoryFilters(new URLSearchParams('series=2210'),now),/closed_date_range_required/);
 assert.throws(()=>normalizeHistoryFilters(new URLSearchParams('closeFrom=2023-01-01&closeTo=2026-11-27'),now),/invalid_close_range/);
 assert.throws(()=>normalizeHistoryFilters(new URLSearchParams('closeFrom=2026-11-27&closeTo=2026-11-28'),now),/future_close_to/);
 assert.throws(()=>normalizeHistoryFilters(new URLSearchParams('series=2210&closeFrom=2025-11-27&closeTo=2026-11-27&evil=https://x.test'),now),/unsupported_filter/);
 assert.throws(()=>normalizeHistoryFilters(new URLSearchParams('series=2210&series=2210&closeFrom=2025-11-27&closeTo=2026-11-27'),now),/duplicate_filter/);
});
test('announcement text maps only documented public fields and enforces exact control number',()=>{
 const raw={usajobsControlNumber:77,announcementNumber:'ANN-77',summary:'Summary',duties:'Duties',requirementsQualifications:'Qualifications',howToApply:'Historical instructions',privateApplicantData:'do not retain'};
 const r=parseUsajobsAnnouncementText({data:[raw]},'77');assert.equal(r.fields.summary.text,'Summary');assert.equal(r.fields.howToApply.text,'Historical instructions');assert.equal(r.privateApplicantData,undefined);
 assert.equal(parseUsajobsAnnouncementText({data:[raw]},'78'),null);
 assert.throws(()=>parseUsajobsAnnouncementText({data:Array(11).fill(raw)},'77'),/schema_changed/);
});
test('historic endpoint uses no credentials and makes one bounded request',async()=>{
 let called=0;const response=page([record()],null);
 const r=await handleUsajobsHistory(new Request('https://app.test/api/usajobs/history?series=2210&closeFrom=2025-11-27&closeTo=2026-11-27'),{now,fetcher:async(url,init)=>{called++;const u=new URL(url);assert.equal(u.origin,'https://data.usajobs.gov');assert.equal(u.pathname,'/api/historicjoa');assert.equal(u.searchParams.get('PositionSeries'),'2210');assert.equal(u.searchParams.get('StartPositionCloseDate'),'11-27-2025');assert.equal(u.searchParams.get('EndPositionCloseDate'),'11-27-2026');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers['Authorization-Key'],undefined);return Response.json(response);}});
 assert.equal(r.status,200);assert.equal((await r.json()).records.length,1);assert.equal(called,1);
});
test('history endpoint rejects unbounded queries without touching upstream',async()=>{
 let called=0;const r=await handleUsajobsHistory(new Request('https://app.test/api/usajobs/history?series=2210'),{fetcher:async()=>{called++;return Response.json({});}});
 assert.equal(r.status,400);assert.equal(called,0);
});
test('announcement text endpoint makes exact unauthenticated control-number lookup',async()=>{
 let called=0;const r=await handleUsajobsAnnouncementText(new Request('https://app.test/api/usajobs/announcement-text?controlNumber=77'),{now,fetcher:async(url,init)=>{called++;const u=new URL(url);assert.equal(u.pathname,'/api/historicjoa/announcementtext');assert.equal(u.searchParams.get('USAJOBSControlNumbers'),'77');assert.equal(init.headers['Authorization-Key'],undefined);return Response.json({data:[{usajobsControlNumber:77,summary:'Archived summary'}]});}});
 assert.equal(r.status,200);assert.equal((await r.json()).announcement.fields.summary.text,'Archived summary');assert.equal(called,1);
});
test('rejects unsafe cursors and invalid exact identifiers',async()=>{
 const r=await handleUsajobsHistory(new Request('https://app.test/api/usajobs/history?controlNumber=77&cursor=https%3A%2F%2Fevil.test'),{fetcher:async()=>Response.json({})});
 assert.equal(r.status,400);
 const t=await handleUsajobsAnnouncementText(new Request('https://app.test/api/usajobs/announcement-text?controlNumber=abc'),{fetcher:async()=>Response.json({})});
 assert.equal(t.status,400);
});
