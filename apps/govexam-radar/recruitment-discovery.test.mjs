import test from "node:test";
import assert from "node:assert/strict";
import {discoverRecruitmentLinks,runRecruitmentDiscovery,discoveryDue} from "./recruitment-discovery.mjs";
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

test("persistent retry cooldown bounds failures and resets after success",()=>{
 const day=86400000,now=10*day;
 assert.equal(discoveryDue([],now),true);
 assert.equal(discoveryDue([{state:"ok",finished_at:now-day}],now),true);
 assert.equal(discoveryDue([{state:"error",finished_at:now-day}],now),false);
 assert.equal(discoveryDue([{state:"error",finished_at:now-2*day}],now),true);
 assert.equal(discoveryDue(Array.from({length:4},()=>({state:"error",finished_at:now-6*day})),now),false);
 assert.equal(discoveryDue(Array.from({length:4},()=>({state:"error",finished_at:now-7*day})),now),true);
 assert.equal(discoveryDue([{state:"ok",finished_at:now+1}],now),false);
});
