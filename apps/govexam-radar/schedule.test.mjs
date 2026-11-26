import test from "node:test";
import assert from "node:assert/strict";
import {planCronConsolidation} from "./schedule.mjs";
import {GOVRADAR_SINGLE_CRON} from "./worker.js";
test("GovRadar source schedule migrates exactly three existing slots to one",()=>{
 assert.equal(planCronConsolidation(["0 */3 * * *","20 */3 * * *","40 */3 * * *"]),
  "consolidate_exact_legacy_three");
 assert.equal(planCronConsolidation([GOVRADAR_SINGLE_CRON]),"already_consolidated");
 assert.equal(planCronConsolidation(["40 */3 * * *","20 */3 * * *","0 */3 * * *"]),
  "consolidate_exact_legacy_three");
});
test("Cron change refuses unrelated worker jobs or unexpected schedules",()=>{
 for(const value of [[],["* * * * *"],["*/20 */3 * * *","0 */3 * * *"],
  ["0 */3 * * *","20 */3 * * *"],["0 */3 * * *","0 */3 * * *","40 */3 * * *"],null]){
  assert.throws(()=>planCronConsolidation(value),/schedule_inventory/);
 }
});
