import test from "node:test";
import assert from "node:assert/strict";
import {processDiscoveredPdf} from "./discovered-pdf-scheduler.mjs";
const source={id:"india-sdsc-shar",url:"https://apps.shar.gov.in/Recruitment/"};
const url="https://apps.shar.gov.in/sdscshar/advt_1_2026/notice.pdf";
const policy={automated_access_status:"approved",reuse_status:"conditional",permitted_methods:[{method:"GET",path:"/sdscshar/",contentType:"application/pdf"}],allowed_hosts:["apps.shar.gov.in"],policy_url:"https://apps.shar.gov.in/Recruitment/copyright.jsp",reviewed_at:1000,expires_at:100000,reviewer_label:"owner",notes:"synthetic permission fixture"};
test("document scheduler never fetches without a policy and processes at most one exact supported PDF",async()=>{
 let calls=0;
 const collect=async args=>{calls++;assert.equal(args.sourceUrl,url);return {publicationAuthorized:false};};
 const denied=await processDiscoveredPdf({pool:{query:async()=>({rows:[]})},sources:[source],root:"/synthetic",now:2000,collect});
 assert.equal(denied.state,"blocked");assert.equal(calls,0);
 const pool={query:async sql=>({rows:sql.includes("source_policy_reviews")?[policy]:sql.startsWith("SELECT details")?[{details:{candidates:[{kind:"pdf",url:"https://evil.example/jobs.pdf"},{kind:"pdf",url},{kind:"pdf",url}]}}]:[]})};
 const result=await processDiscoveredPdf({pool,sources:[source],root:"/synthetic",now:2000,collect});
 assert.deepEqual(result,{state:"ok",processed:1,publicationAuthorized:false});assert.equal(calls,1);
});
test("recent document attempt prevents duplicate acquisition",async()=>{
 const pool={query:async sql=>({rows:sql.includes("source_policy_reviews")?[policy]:sql.startsWith("SELECT details")?[{details:{candidates:[{kind:"pdf",url}]}}]:[{one:1}]})};
 const result=await processDiscoveredPdf({pool,sources:[source],root:"/synthetic",now:2000,collect:async()=>{throw Error("must not run");}});
 assert.equal(result.state,"no_change");
});
