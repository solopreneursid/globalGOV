import test from "node:test";
import assert from "node:assert/strict";
import {handleModeration} from "./moderation-api.mjs";
const url=new URL("https://example.test/api/moderation/reports");
const req=(path,method="GET",headers={},body)=>new Request("https://example.test"+path,{method,headers,body:body?JSON.stringify(body):undefined});
const db={prepare(){throw Error("unexpected database access without authorization");}};
test("moderation is not accessible when founder secret is absent",async()=>{
 const r=await handleModeration(req("/api/moderation/reports"),{DB:db},url);
 assert.equal(r.status,503);assert.equal((await r.json()).error,"moderation_not_configured");
});
test("unauthorized moderator token fails closed without touching database",async()=>{
 const token="secret-password-minimum-32-characters-very-private";
 for(const value of ["", "weak", "a".repeat(48)]){
  const r=await handleModeration(req("/api/moderation/reports","GET",{"X-GovRadar-Moderator":value}),{DB:db,MODERATOR_TOKEN:token},url);
  assert.equal(r.status,401);
 }
});
test("cross-origin tampering cannot alter reports",async()=>{
 const token="secret-password-minimum-32-characters-very-private";
 const r=await handleModeration(req("/api/moderation/decide","POST",{"X-GovRadar-Moderator":token,"Content-Type":"application/json",Origin:"https://evil.example"},{reportId:"11111111-1111-4111-8111-111111111111",action:"hide"}),{DB:db,MODERATOR_TOKEN:token},new URL("https://example.test/api/moderation/decide"));
 assert.equal(r.status,403);assert.equal((await r.json()).error,"forbidden_origin");
});
