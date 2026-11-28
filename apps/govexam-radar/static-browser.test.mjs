import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {chromium} from "playwright";
import {compileCatalogue} from "./static-publisher.mjs";
test("real browser: search, current membership, no-JS, expiry, withdrawal and version mismatch",async()=>{
 const now=Date.now();
 const row={source_id:"uk-dfe-teaching-vacancies",title:"Synthetic engineer",employer:"Synthetic school",region:"England",source_page:"https://teaching-vacancies.service.gov.uk/jobs/synthetic-engineer",closing_at:new Date(now+3600000).toISOString(),last_seen_at:now-1000,review_state:"official_feed_unreviewed",life_status:"open"};
 const {files}=compileCatalogue({rows:[row],generatedAt:now,sourceHealthy:true});
 const path=[...files.keys()].find(k=>k.startsWith("job/"));
 const active=[...files.keys()].find(k=>k.startsWith("index/active/"));
 const server=createServer((req,res)=>{
  let name=new URL(req.url,"http://localhost").pathname.slice(1);
  if(!name||name.endsWith("/"))name+="index.html";
  const body=files.get(name);if(body===undefined){res.writeHead(404);res.end();return;}
  res.setHeader("content-type",name.endsWith(".json")?"application/json":name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":"text/html; charset=utf-8");
  res.setHeader("cache-control","no-store");res.end(body);
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const requests=[];page.on("request",r=>requests.push(r.url()));
  await page.goto(base+"/");
  await page.locator("#q").fill("engineer");await page.getByRole("button",{name:"Search"}).click();
  await page.getByRole("link",{name:"Synthetic engineer"}).waitFor();
  await page.getByRole("link",{name:"Synthetic engineer"}).click();
  await page.getByRole("link",{name:"Read the official recruitment notice / apply"}).waitFor();
  assert.match(await page.locator("#observed").textContent(),/Last observed:/);
  assert.ok(requests.every(x=>new URL(x).origin===base&&!new URL(x).pathname.startsWith("/api/")));
  const job=page.locator("[data-job-id]");
  await page.route("**/"+active,route=>route.fulfill({json:{generatedAt:now,jobs:{}}}));
  await page.reload();await page.locator("[data-job-id][data-validation=blocked]").waitFor({state:"attached"});await page.locator("#stale").waitFor({state:"visible"});
  assert.equal(await job.isVisible(),false);
  await page.unroute("**/"+active);
  await page.route("**/"+active,route=>route.fulfill({json:{...JSON.parse(files.get(active)),generatedAt:now-1}}));
  await page.reload();await page.locator("[data-job-id][data-validation=blocked]").waitFor({state:"attached"});await page.locator("#stale").waitFor({state:"visible"});assert.equal(await job.isVisible(),false);
  await page.unroute("**/"+active);
  await page.route("**/index/manifest.json",route=>route.fulfill({json:{...JSON.parse(files.get("index/manifest.json")),validUntil:now-1}}));
  await page.reload();await page.locator("[data-job-id][data-validation=blocked]").waitFor({state:"attached"});await page.locator("#stale").waitFor({state:"visible"});assert.equal(await job.isVisible(),false);
  await context.close();
  const noJs=await browser.newContext({javaScriptEnabled:false});
  const disabled=await noJs.newPage();await disabled.goto(base+"/"+path.replace(/index\.html$/,""));
  assert.equal(await disabled.locator("[data-job-id]").isVisible(),false);
  await noJs.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
