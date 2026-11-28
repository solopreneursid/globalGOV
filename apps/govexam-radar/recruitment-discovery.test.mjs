import test from "node:test";
import assert from "node:assert/strict";
import {discoverRecruitmentLinks,runRecruitmentDiscovery} from "./recruitment-discovery.mjs";
const base="https://www.isro.gov.in/ViewAllOpportunities.html";
test("discovery finds bounded official recruitment candidates without visiting them",()=>{
 const html='<a href="/recruitment/new.pdf">Recruitment notice</a><a href="https://www.upsc.gov.in/recruitment">Jobs</a><a href="https://evil.example/jobs">Jobs</a><a href="https://gov.in.evil.example/jobs">Jobs</a><a href="/login">Jobs</a><a href="/jobs?token=secret">Jobs</a><a href="/recruitment/new.pdf#fragment">Recruitment notice</a><script><a href="/fake-jobs">Jobs</a></script>';
 const rows=discoverRecruitmentLinks(html,base,"text/html");
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.url).sort(),["https://www.isro.gov.in/recruitment/new.pdf","https://www.upsc.gov.in/recruitment"].sort());
 assert.ok(rows.every(x=>x.state==="candidate_only"));
 assert.equal(discoverRecruitmentLinks(Array.from({length:100},(_,i)=>'<a href="/jobs/'+i+'">Vacancy</a>').join(""),base,"text/html").length,40);
 assert.throws(()=>discoverRecruitmentLinks("<!DOCTYPE x><loc>https://www.isro.gov.in/jobs</loc>",base,"text/xml"),/unsafe/);
});
test("discovery respects deny policy and does not fetch unknown candidates",async()=>{
 let requests=0;
 const pool={query:async()=>({rows:[]})};
 assert.deepEqual(await runRecruitmentDiscovery({pool,sources:[{id:"india-isro-opportunities",url:base}],slot:"test",fetcher:async()=>{requests++;throw Error("not expected")}}),[]);
 assert.equal(requests,0);
});
