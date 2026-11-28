import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {compileCatalogue,LIMITS} from "./static-publisher.mjs";
import {buildRelease} from "./static-build.mjs";
import {SNAPSHOT_SQL,acquireSnapshot} from "./static-snapshot.mjs";
import {verifyStaticTarget} from "./static-deploy-preflight.mjs";
import {collectionSlot,reserveCollection,BUDGET,runZeroCostCollection} from "./zero-cost-collector.mjs";
const now=Date.parse("2026-11-28T12:00:00Z"),hour=3600000;
const row={source_id:"uk-dfe-teaching-vacancies",title:"Synthetic <test> role",employer:"Synthetic school",region:"Test region",source_page:"https://teaching-vacancies.service.gov.uk/jobs/synthetic-role",closing_at:new Date(now+hour).toISOString(),last_seen_at:now-1000,review_state:"official_feed_unreviewed",life_status:"open"};
const snapshot={rows:[row],generatedAt:now,sourceHealthy:true};
test("static catalogue has no runtime API calls and escapes upstream content",()=>{
 const a=compileCatalogue(snapshot),b=compileCatalogue(snapshot);
 assert.equal(a.manifest.digest,b.manifest.digest);
 const path=[...a.files.keys()].find(p=>p.startsWith("job/"));
 assert.match(a.files.get(path),/Synthetic &lt;test&gt; role/);
 assert.match(a.files.get(path),/noindex,nofollow/);
 assert.match(a.files.get(path),new RegExp("data-until=\""+(now+hour)+"\""));
 assert.doesNotMatch(a.files.get(path),/JobPosting/);
 assert.doesNotMatch(a.files.get("catalogue.js"),/\/api\//);
 assert.doesNotThrow(()=>new Function(a.files.get("catalogue.js")));
 assert.equal(JSON.parse(a.files.get("index/manifest.json")).count,1);
 assert.equal(a.files.get("robots.txt"),"User-agent: *\nDisallow: /\n");
});
test("source, duplicate, expiry, unhealthy and file budgets fail closed",()=>{
 for(const changed of [{source_id:"manitoba-jobs"},{source_page:"https://teaching-vacancies.service.gov.uk.evil.test/jobs/x"},{closing_at:new Date(now).toISOString()},{last_seen_at:now-15*86400000},{review_state:"requires_review"}])assert.throws(()=>compileCatalogue({...snapshot,rows:[{...row,...changed}]}));
 assert.throws(()=>compileCatalogue({...snapshot,sourceHealthy:false}));
 assert.throws(()=>compileCatalogue({...snapshot,rows:[row,row]}),/duplicate/);
 assert.throws(()=>compileCatalogue({...snapshot,rows:Array(LIMITS.jobs+1).fill(row)}));
 assert.throws(()=>compileCatalogue({...snapshot,indexable:true}));
});
test("atomic output does not overwrite existing release or leave an invalid directory",async()=>{
 const root=await mkdtemp(join(tmpdir(),"globalgov-static-"));
 try{
  const output=join(root,"release");
  await buildRelease({snapshot,output});
  const original=await readFile(join(output,"public","index.html"),"utf8");
  await assert.rejects(buildRelease({snapshot,output}),/exists/);
  await assert.rejects(buildRelease({snapshot:{...snapshot,sourceHealthy:false},output:join(root,"invalid")}));
  assert.equal(await readFile(join(output,"public","index.html"),"utf8"),original);
 }finally{await rm(root,{recursive:true,force:true});}
});
function dbFixture(){
 const sql=new DatabaseSync(":memory:");
 sql.exec("CREATE TABLE source_ingest_runs(id TEXT,source_id TEXT,started_at INTEGER,finished_at INTEGER,state TEXT,details TEXT,error_code TEXT); CREATE TABLE official_job_notices(id TEXT,source_id TEXT,title TEXT,employer TEXT,region TEXT,source_page TEXT,closing_at TEXT,last_seen_at INTEGER,review_state TEXT,life_status TEXT);");
 sql.prepare("INSERT INTO official_job_notices VALUES(?,?,?,?,?,?,?,?,?,?)").run("test",...Object.values(row));
 const add=sql.prepare("INSERT INTO source_ingest_runs VALUES(?,?,?,?,?,?,?)");
 for(const t of [now-hour,now-4*hour])add.run(String(t),row.source_id,t,t+100,"ok",'{"origin":"scheduled"}',null);
 return sql;
}
test("D1 snapshot SQL includes only licensed current notices with two native cycles",()=>{
 const db=dbFixture();
 try{
  const args=[row.source_id,now-8*hour,2*hour,now-5*hour,now+60000,row.source_id,new Date(now).toISOString(),now-5*86400000,10001];
  assert.equal(db.prepare(SNAPSHOT_SQL).all(...args).length,1);
  db.prepare("INSERT INTO source_ingest_runs VALUES(?,?,?,?,?,?,?)").run("failure",row.source_id,now-500,now-400,"error","failure","network");
  assert.equal(db.prepare(SNAPSHOT_SQL).all(...args).length,0);
 }finally{db.close();}
});
test("snapshot API refuses unverified cost and oversized responses",async()=>{
 const account="69234e51e08d8013980a7ff869746609",token="synthetic-read-only-token";
 const fetcher=async()=>Response.json({success:true,result:[{success:true,results:[row],meta:{rows_read:100,rows_written:0}}]});
 assert.equal((await acquireSnapshot({account,token,fetcher,now})).usage.rowsRead,100);
 await assert.rejects(acquireSnapshot({account,token,now,fetcher:async()=>Response.json({success:true,result:[{success:true,results:[row],meta:{rows_read:100001,rows_written:0}}]})}),/budget|exceeded/);
 await assert.rejects(acquireSnapshot({account:"wrong",token,fetcher,now}),/credentials/);
});
test("durable SQLite ledger allows eight slots and denies repeated claims",async()=>{
 const sql=new DatabaseSync(":memory:");
 try{
  sql.exec("CREATE TABLE source_ingest_runs(id TEXT PRIMARY KEY,source_id TEXT,started_at INTEGER,finished_at INTEGER,state TEXT,http_status INTEGER,received INTEGER,accepted INTEGER,discarded INTEGER,error_code TEXT,details TEXT);");
  const db={prepare(q){return{bind(...args){return{async run(){const r=sql.prepare(q).run(...args);return{meta:{changes:Number(r.changes)}}}}}}}};
  const start=Date.parse("2026-11-28T00:00:00Z");
  for(let i=0;i<8;i++){const t=start+i*3*hour,s=collectionSlot(t);assert.equal(await reserveCollection(db,s,t),true);assert.equal(await reserveCollection(db,s,t),false);}
  const r=sql.prepare("SELECT COUNT(*) AS n,SUM(json_extract(details,'$.reservedReads')) AS reads,SUM(json_extract(details,'$.reservedWrites')) AS writes,SUM(json_extract(details,'$.reservedFetches')) AS fetches FROM source_ingest_runs").get();
  assert.equal(r.n,8);assert.equal(r.reads,BUDGET.reads);assert.equal(r.writes,BUDGET.writes);assert.equal(r.fetches,BUDGET.fetches);
  assert.equal((await runZeroCostCollection({db,scheduledTime:start,now:start,fetcher:async()=>{throw Error("must not fetch")}})).state,"blocked");
 }finally{sql.close();}
});

test("deployment preflight refuses production, external domains and absent approval",async()=>{
 const account="69234e51e08d8013980a7ff869746609",token="synthetic-pages-test-token";
 const project={name:"globalgov-static",production_branch:"main",source:null,domains:["globalgov-static.pages.dev"]};
 const fetcher=async url=>Response.json({success:true,result:url.includes("/deployments?")?[]:project});
 assert.equal((await verifyStaticTarget({account,token,approved:"true",fetcher,now})).branch,"zero-cost-preview");
 await assert.rejects(verifyStaticTarget({account,token,approved:"false",fetcher,now}),/approval/);
 project.production_branch="zero-cost-preview";
 await assert.rejects(verifyStaticTarget({account,token,approved:"true",fetcher,now}),/unexpected/);
 project.production_branch="main";project.domains.push("globalgov.example.com");
 await assert.rejects(verifyStaticTarget({account,token,approved:"true",fetcher,now}),/unexpected/);
});
