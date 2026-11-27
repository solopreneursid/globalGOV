import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPostTableCandidates} from './recruitment-post-tables.mjs';
import {extractRecruitmentEvidence} from './recruitment-evidence.mjs';
const head='Post Code     Name of Post                  No. of Vacancies';
const line=(code,title,count)=>code.padEnd(14)+title.padEnd(30)+count;
test('separate post rows preserve code and exact evidence positions',()=>{
 const t=head+'\n'+line('01','Technical Assistant','3')+'\n'+line('02','Scientific Assistant','7');
 const r=extractPostTableCandidates(t);assert.equal(r.posts.length,2);assert.deepEqual(r.posts.map(x=>[x.postCode,x.postTitle,x.vacancies]),[['01','Technical Assistant',3],['02','Scientific Assistant',7]]);assert.equal(r.posts[1].evidence.line,3);assert.equal(r.posts[0].state,'candidate_only');
 const report=extractRecruitmentEvidence({sourceId:'india-sdsc-shar',sourceUrl:'https://apps.shar.gov.in/sdscshar/notice/test.pdf',documentBytes:Buffer.from('synthetic'),text:'Age limit: 18-30\n'+t});
 assert.equal(report.postTables.posts.length,2);assert.equal(report.postTables.posts[0].age,undefined);assert.equal(report.publicLaunchAuthorized,false);
});
test('conflicting post codes are excluded; wrapped and category columns are not inferred',()=>{
 const t=head+'\n'+line('01','Engineer','3')+'\f'+head+'\n'+line('01','Engineer','4')+'\n'+line('02','Assistant','2');
 const r=extractPostTableCandidates(t);assert.deepEqual(r.posts.map(x=>x.postCode),['02']);assert.equal(r.issues[0].type,'conflicting_post_code');
 const bad=extractPostTableCandidates(head+'\n01            Multi line\n              Engineer                      2');assert.equal(bad.posts.length,0);assert.equal(bad.issues[0].type,'unresolved_table_row');
 assert.equal(extractPostTableCandidates('Post Code    Name of Post    UR    SC    Total\n01    Engineer    2    1    3').posts.length,0);
});
