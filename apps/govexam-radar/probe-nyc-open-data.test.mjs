import test from "node:test";
import assert from "node:assert/strict";
import {assessNycRows} from "./probe-nyc-open-data.mjs";
test("NYC probe distinguishes external and internal jobs and reports missing deadlines without publishing",()=>{
 const row={job_id:"12345",agency:"Synthetic city agency",business_title:"Synthetic title",posting_type:"External",post_until:"30-NOV-2026"};
 assert.deepEqual(assessNycRows([row,{...row,posting_type:"Internal"},{...row,post_until:""},{...row,job_id:"6789",post_until:null}]),{received:4,external:3,valid:2,duplicateIds:1,missingDeadline:1,publicationAuthorized:false});
 assert.throws(()=>assessNycRows([{invalid:true}]),/schema_mismatch/);
 assert.throws(()=>assessNycRows(Array(101).fill(row)),/schema_mismatch/);
});
