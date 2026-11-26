import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {OFFICIAL_SOURCE_RIGHTS,sourceRights,assertSourceRightsForCommercialRelease} from "./source-rights.mjs";
const uk="uk-dfe-teaching-vacancies",mb="manitoba-jobs",india="india-employment-news",isro="india-isro-opportunities";
test("source licence decisions are bounded and never assume one government's licence covers another",()=>{
 assert.equal(OFFICIAL_SOURCE_RIGHTS.length,5);
 assert.equal(new Set(OFFICIAL_SOURCE_RIGHTS.map(x=>x.id)).size,4);
 const dfe=sourceRights(uk),manitoba=sourceRights(mb),blocked=sourceRights(india);
 assert.equal(dfe.reuseStatus,"conditional_open_licence");
 assert.equal(dfe.commercialReuseApprovedForCurrentFields,true);
 assert.match(dfe.note,/no fees or commission/i);
 assert.match(dfe.attribution,/Open Government Licence v3\.0/);
 assert.equal(manitoba.reuseStatus,"source_specific_review_required");
 assert.equal(manitoba.commercialReuseApprovedForCurrentFields,false);
 assert.match(manitoba.note,/Public Service Commission/);
 assert.match(manitoba.termsUrl,/csc\/aboutpsc\/disclaim/);
 assert.equal(blocked.reuseStatus,"not_approved");
 assert.equal(blocked.commercialReuseApprovedForCurrentFields,false);
 assert.equal(sourceRights(isro).commercialReuseApprovedForCurrentFields,true);
 assert.match(sourceRights(isro).note,/third-party material is excluded/i);
 assert.match(sourceRights(isro).attribution,/Indian Space Research Organisation/);
 assert.equal(sourceRights("untrusted-source"),null);
 for(const policy of OFFICIAL_SOURCE_RIGHTS){
  for(const field of ["licenceUrl","termsUrl","officialSourceUrl"]){
   assert.equal(new URL(policy[field]).protocol,"https:");
  }
 }
});
test("commercial release gate fails closed on Manitoba, India and unknown source",()=>{
 assert.equal(assertSourceRightsForCommercialRelease([uk]),true);
 assert.equal(assertSourceRightsForCommercialRelease([uk,isro,'india-ssb-recruitment']),true);
 assert.throws(()=>assertSourceRightsForCommercialRelease([uk,mb]),/commercial_reuse_review_pending:manitoba-jobs/);
 assert.throws(()=>assertSourceRightsForCommercialRelease([india]),/commercial_reuse_review_pending/);
 assert.throws(()=>assertSourceRightsForCommercialRelease(["unknown"]),/unknown_official_source/);
 assert.throws(()=>assertSourceRightsForCommercialRelease([]),/source_set_required/);
});
test("public UI attributes UK data and does not promote unapproved source feeds",async()=>{
 const code=await readFile(new URL("./official-ui.mjs",import.meta.url),"utf8");
 assert.match(code,/UK DfE listings: contains public sector information licensed under/);
 assert.match(code,/ISRO and SSB notices may appear after source checks/);
 assert.doesNotMatch(code,/Manitoba: official RSS factual summaries/);
 assert.doesNotMatch(code,/India · Employment News digest/);
 assert.doesNotMatch(code,/Contains public sector information licensed under the/);
});
