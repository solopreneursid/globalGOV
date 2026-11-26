import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
// End-to-end test against isolated Cloudflare preview; creates and removes QA-only accounts.
const base=process.env.GOVRADAR_TEST_URL||"https://hqventures-govexam-parity-preview.solopreneursid-proy.workers.dev";
const suffix=randomBytes(5).toString("hex");
const examId="qa-room-"+suffix;
const users=[
  {handle:"qa_"+suffix,token:randomBytes(32).toString("hex")},
  {handle:"review_"+suffix,token:randomBytes(32).toString("hex")}
];
async function call(path,method="GET",body,user=users[0],expectStatus){
  const headers={Accept:"application/json"};
  if(method==="POST")headers["Content-Type"]="application/json";
  if(user)headers["X-GovRadar-Token"]=user.token;
  const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
  let result;try{result=await response.json();}catch{throw Error("Non-JSON response "+response.status+" for "+path);}
  if(expectStatus!==undefined)assert.equal(response.status,expectStatus,path+": "+JSON.stringify(result));
  else assert.ok(response.ok,path+" status "+response.status+": "+JSON.stringify(result));
  return result;
}
const {status}=await call("/api/health");assert.equal(status,"ok");
const noticeFeed=await call("/api/notices?source=uk-dfe-teaching-vacancies&limit=3", "GET", undefined, null);
assert.ok(noticeFeed.total>=100,"Expected seeded official DfE notices");
assert.equal(noticeFeed.notices.length,3);
assert.ok(noticeFeed.notices.every(x=>x.sourceUrl.startsWith("https://teaching-vacancies.service.gov.uk/jobs/") && x.reviewState==="official_feed_unreviewed"));
const importedStatus=await call("/api/ingestion-status","GET",undefined,null);
assert.ok(importedStatus.openImportedNotices>=90);
assert.ok(importedStatus.latest?.some(x=>x.state==="ok" && x.accepted>=100));
console.log("SUCCESS: verified official DfE records, provenance and database audit through public API.");
const mb=await call("/api/notices?country=Canada&level=province&jurisdiction=CA-MB&limit=5","GET",undefined,null);
assert.ok(mb.total>=40,"Expected validated Manitoba provincial government vacancies in staging");
assert.equal(mb.notices.length,5);
assert.ok(mb.notices.every(x=>x.sourceId==="manitoba-jobs"&&x.country==="Canada"&&x.jurisdictionCode==="CA-MB"&&x.level==="province"&&x.employerType==="provincial_government"&&x.sourceUrl.startsWith("https://jobsearch.gov.mb.ca/jow/advancedResult.action?ID=")));
const uk=await call("/api/notices?country=United%20Kingdom&limit=3","GET",undefined,null);
assert.ok(uk.total>=90,"Expected UK public education source entries");
assert.ok(uk.notices.every(x=>x.sourceId==="uk-dfe-teaching-vacancies"&&x.employerType==="public_education"));
const jurisdiction=await call("/api/jurisdictions?country=Canada&level=province","GET",undefined,null);
assert.ok(jurisdiction.total>=4);
const revisions=await call("/api/notice-changes?limit=5","GET",undefined,null);
assert.ok(Array.isArray(revisions.changes));
console.log("SUCCESS: Manitoba provincial jobs are separately classified, queryable and linked to official public-sector employer source.");
try{
  for(const user of users){
    const reg=await call("/api/community/register","POST",{handle:user.handle,token:user.token},null,201);
    assert.equal(reg.handle,user.handle);
  }
  const post=await call("/api/community/post","POST",{examId,tag:"#Syllabus & Strategy",content:"Automated API check in an unlisted QA room."},users[0],201);
  const reply=await call("/api/community/reply","POST",{postId:post.id,content:"Temporary QA reply checking D1 persistence."},users[1],201);
  assert.ok(reply.id);
  assert.equal((await call("/api/community/vote","POST",{postId:post.id},users[1])).voted,true);
  const room=await call("/api/community/posts?examId="+examId,"GET",undefined,users[1]);
  assert.equal(room.posts.length,1);assert.equal(room.posts[0].replies.length,1);
  assert.equal(room.posts[0].upvotes,1);assert.equal(room.posts[0].upvotedByMe,true);
  const report=await call("/api/community/report","POST",{targetType:"post",targetId:post.id,reason:"other"},users[1]);
  assert.equal(report.status,"submitted");
  const me=await call("/api/community/export","GET",undefined,users[0]);
  assert.equal(me.handle,users[0].handle);assert.equal(me.posts.length,1);
  await call("/api/community/delete-post","POST",{postId:post.id},users[0]);
  assert.equal((await call("/api/community/posts?examId="+examId)).posts.length,0);
  console.log("SUCCESS: verified community register, post, reply, vote, report, export, and owner deletion.");
}finally{
  for(const user of users) {
    try{await call("/api/community/delete-account","POST",{confirm:"DELETE"},user);}
    catch(e){console.error("QA account cleanup failed for",user.handle,String(e));process.exitCode=1;}
  }
}
