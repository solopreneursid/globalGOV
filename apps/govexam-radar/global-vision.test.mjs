import test from "node:test";
import assert from "node:assert/strict";
import {FULL_HTML} from "./full-ui.mjs";
import {ENHANCE_JS} from "./enhance.mjs";

test("founder global six-section app remains intact",()=>{
 for(const section of ["radar","alerts","feeds","saved","community","guide"])
  assert.match(FULL_HTML,new RegExp('id="view-'+section+'"'));
 for(const token of ["country-pills-container","cit-pill-FOREIGN_ELIGIBLE","stream-pill-Technical","community-exam-select","saved-exams-grid","monitored-portals-grid"])
  assert.ok(FULL_HTML.includes(token),token+" missing");
});
test("email notification controls and collection are absent",()=>{
 for(const id of ['user-email-input','email-subscription-form','email-lead-days','email-dispatch-log','modal-email-btn'])
  assert.ok(!FULL_HTML.includes('id="'+id+'"'),id+" must not be visible");
 assert.ok(!FULL_HTML.includes('onclick="toggleEmailSubscribeExam'),"no email subscription controls");
 assert.ok(!FULL_HTML.includes('onclick="sendTestEmailNotification'),"no fake delivery control");
 assert.ok(!ENHANCE_JS.includes("emailIds: state.emailSubscribedExamIds"),"do not persist email subscription IDs");
 assert.ok(!ENHANCE_JS.includes("emailSettings: state.emailSettings"),"do not persist email settings");
 assert.ok(!ENHANCE_JS.includes("window.sendTestEmailNotification ="),"no test email handler");
 assert.ok(!ENHANCE_JS.includes("window.saveEmailSettings ="),"no email settings handler");
});
test("real official portal reachability remains functional",()=>{
 assert.match(ENHANCE_JS,/async function refreshSourceStatus\(\)/);
 assert.match(ENHANCE_JS,/window\.runFeedSync=async function/);
 assert.match(ENHANCE_JS,/\/api\/check\?id=/);
});
