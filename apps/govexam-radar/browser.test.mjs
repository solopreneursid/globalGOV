import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import worker from './worker.js';

// Synthetic notices are used only by this local browser-test server. The
// real source and release boundaries are tested separately with SQLite.
const closingAt=new Date(Date.now()+30*86400000).toISOString();
const rows=[
 {id:'test-teacher',title:'Teacher - test data',employer:'Test school',country:'United Kingdom',jurisdiction:'England',jurisdictionCode:'GB-ENG',region:'London',stream:'Non-technical',closingAt,lastSeenAt:Date.now(),sourceId:'uk-dfe-teaching-vacancies',sourceUrl:'https://teaching-vacancies.service.gov.uk/jobs/test-teacher'},
 {id:'test-engineer',title:'Engineer - test data',employer:'Test school',country:'United Kingdom',jurisdiction:'England',jurisdictionCode:'GB-ENG',region:'Leeds',stream:'Technical',closingAt,lastSeenAt:Date.now(),sourceId:'uk-dfe-teaching-vacancies',sourceUrl:'https://teaching-vacancies.service.gov.uk/jobs/test-engineer'}
];
let server,browser,origin;
test.before(async()=>{
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,`http://127.0.0.1:${server.address().port}`);let response;
   if(url.pathname==='/api/notices'){
    const q=(url.searchParams.get('q')||'').toLowerCase(),country=url.searchParams.get('country')||'',stream=url.searchParams.get('stream')||'',region=url.searchParams.get('jurisdiction')||'';
    if(q==='teacher')await new Promise(resolve=>setTimeout(resolve,750));
    const notices=rows.filter(x=>(!q||JSON.stringify(x).toLowerCase().includes(q))&&(!country||x.country===country)&&(!stream||x.stream===stream)&&(!region||x.jurisdictionCode===region));
    response=Response.json({total:notices.length,notices});
   }else if(url.pathname==='/api/notice-changes')response=Response.json({changes:[]});
   else if(url.pathname==='/api/ingestion-status')response=Response.json({latest:[],automation:{}});
   else response=await worker.fetch(new Request(url,{method:req.method}),{});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end('Local test error: '+error.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});

for(const width of [320,375,768,1440]){
 test(`search and job cards fit a ${width}px screen`,async()=>{
  const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#official-notice-grid article').first().waitFor();
   assert.equal(await page.locator('#search-input').isVisible(),true);
   assert.equal(await page.locator('#exam-cards-grid').isVisible(),false);
   assert.equal(await page.locator('#exam-cards-grid article').count(),0);
   assert.equal(await page.locator('#gg-more-filters').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),true,'page should not scroll sideways');
   assert.equal(await page.locator('#gg-region-help').isVisible(),true);
   assert.match(await page.locator('#gg-region-help').innerText(),/filter job notices and government job websites/);
   assert.equal(await page.locator(width<768?'#nav-mobile-radar':'#nav-desktop-radar').getAttribute('aria-current'),'page');
   await page.screenshot({path:`govradar-ready-${width}.png`,fullPage:true,animations:'disabled'});
   assert.deepEqual(errors,[]);
  }finally{await page.close();}
 });
}
test('India and Bihar filter actual notices and the official directory without examples',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}}),urls=[];
 page.on('request',r=>{if(r.url().includes('/api/notices?'))urls.push(r.url());});
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#regional-country option[value="India"]').waitFor({state:'attached'});
  await page.locator('[data-quick-country="India"]').click();
  assert.equal(await page.locator('#official-notice-grid article').count(),0,'old country results must disappear immediately');
  await page.locator('#discovery-region-quick').selectOption('IN-BR');
  await page.waitForFunction(()=>document.querySelector('#regional-subdivision')?.value==='IN-BR');
  await page.waitForFunction(()=>document.querySelector('#official-notice-status')?.textContent.includes('0 notices'));
  assert.equal(await page.locator('#regional-country').inputValue(),'India');
  assert.match(await page.locator('#regional-source-grid').innerText(),/Bihar Public Service Commission/);
  assert.equal(await page.locator('#official-notice-grid article').count(),0);
  assert.ok(urls.some(x=>new URL(x).searchParams.get('country')==='India'&&new URL(x).searchParams.get('jurisdiction')==='IN-BR'));
  await page.locator('#discovery-clear-quick').click();
  await page.waitForFunction(()=>document.querySelector('#regional-country')?.value==='');
  assert.equal(await page.locator('#discovery-region-quick').inputValue(),'ALL');
 }finally{await page.close();}
});
for(const width of [320,768]){
 test(`low-data page filters notices and government websites at ${width}px`,async()=>{
  const page=await browser.newPage({viewport:{width,height:820}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  try{
   await page.goto(origin+'/lite',{waitUntil:'domcontentloaded'});
   await page.locator('#jobs .card').first().waitFor();
   assert.match(await page.locator('#jobs').innerText(),/Teacher - test data/);
   assert.match(await page.locator('#jobs').innerText(),/Last found in feed/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),true);
   await page.locator('#country').selectOption('India');await page.locator('#region').selectOption('IN-BR');
   await page.waitForFunction(()=>document.querySelector('#job-status')?.textContent.includes('0 notices'));
   assert.match(await page.locator('#sites').innerText(),/Bihar Public Service Commission/);
   assert.equal(await page.locator('#jobs .card').count(),0);
   await page.locator('#language').selectOption('hi');assert.match(await page.locator('#title').innerText(),/सरकारी नौकरी/);
   assert.deepEqual(errors,[]);
  }finally{await page.close();}
 });
}
test('low-data directory remains usable if the jobs feed fails',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.route('**/api/notices?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.goto(origin+'/lite',{waitUntil:'domcontentloaded'});await page.locator('#sites .card').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('#job-status')?.textContent.includes('Could not load'));
  assert.ok(await page.locator('#sites .card').count()>0);
 }finally{await page.close();}
});
test('latest search response wins and UK notices can be saved on this device',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#official-notice-grid article').first().waitFor();
  await page.locator('#search-input').fill('teacher');await page.waitForTimeout(500);
  await page.locator('#search-input').fill('engineer');await page.locator('#official-notice-grid').getByText('Engineer - test data').waitFor();
  await page.waitForTimeout(450);assert.doesNotMatch(await page.locator('#official-notice-grid').innerText(),/Teacher - test data/);
  await page.locator('#official-notice-grid [data-save-notice]').click();await page.locator('#nav-mobile-saved').click();
  assert.match(await page.locator('#saved-official-notices').innerText(),/Engineer - test data/);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#regional-country option[value="India"]').waitFor({state:'attached'});await page.locator('#nav-mobile-saved').click();
  assert.match(await page.locator('#saved-official-notices').innerText(),/Engineer - test data/);
 }finally{await page.close();}
});
test('an eligible ISRO notice can be viewed, saved, exported and shown on the low-data page',async()=>{
 // This record is synthetic and exists only in the browser test.
 const sample={id:'test-isro',title:'Test ISRO vacancy',employer:'Space Applications Centre',country:'India',jurisdiction:'India',jurisdictionCode:'IN',region:'All India',stream:'Technical',closingAt,lastSeenAt:Date.now(),sourceId:'india-isro-opportunities',sourceUrl:'https://www.isro.gov.in/SACRecruitment1.html'};
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.route('**/api/notices?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({total:1,notices:[sample]})}));
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#official-notice-grid article').first().waitFor();
  assert.match(await page.locator('#official-notice-grid').innerText(),/ISRO · Government of India/);
  assert.equal(await page.locator('#official-notice-grid a[href="https://www.isro.gov.in/SACRecruitment1.html"]').count(),1);
  await page.locator('#official-notice-grid [data-save-notice]').click();await page.locator('#nav-mobile-saved').click();
  assert.match(await page.locator('#saved-official-notices').innerText(),/Test ISRO vacancy/);
  const downloadPromise=page.waitForEvent('download');await page.locator('#portable-export').click();
  const stream=await (await downloadPromise).createReadStream();let raw='';for await(const chunk of stream)raw+=chunk;
  const exported=JSON.parse(raw);assert.equal(exported.bookmarks[0].sourceId,'india-isro-opportunities');assert.equal(exported.bookmarks[0].sourceUrl,sample.sourceUrl);
  await page.goto(origin+'/lite',{waitUntil:'domcontentloaded'});await page.locator('#jobs .card').first().waitFor();
  assert.match(await page.locator('#jobs').innerText(),/Test ISRO vacancy/);assert.match(await page.locator('#jobs').innerText(),/Source: ISRO, Government of India/);
  assert.equal(await page.locator('#jobs a[href="https://www.isro.gov.in/SACRecruitment1.html"]').count(),1);
  assert.match(await page.locator('#credit').innerText(),/ISRO/);
 }finally{await page.close();}
});
test('Hindi translates the search and government directory while keeping source titles intact',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#official-notice-grid article').first().waitFor();
  await page.locator('#gg-language').selectOption('hi');
  assert.match(await page.locator('#discovery-title').innerText(),/सरकारी नौकरी/);
  assert.match(await page.locator('#regional-title').innerText(),/सरकारी नौकरी/);
  assert.match(await page.locator('#regional-country-label').innerText(),/देश/);
  assert.match(await page.locator('#discovery-region-quick option[value="ALL"]').textContent(),/सभी क्षेत्र/);
  assert.match(await page.locator('#official-notice-grid').innerText(),/Teacher - test data/);
  await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('#gg-language').inputValue(),'hi');
 }finally{await page.close();}
});
test('older saved examples remain accessible without invented dates or result claims',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.addInitScript(()=>localStorage.setItem('govexam_radar_saved_v2',JSON.stringify(['rrb-je-cbt1-2026'])));
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#nav-mobile-saved').click();
  const card=page.locator('#saved-exams-grid .govradar-opportunity-card').first();await card.waitFor();
  assert.match(await card.innerText(),/Example · not confirmed/);
  await card.locator('.govradar-details-button').click();
  assert.match(await page.locator('#modal-body').innerText(),/not a current job or exam update/);
  assert.doesNotMatch(await page.locator('#modal-body').innerText(),/Admit Card.*Released/);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('govexam_radar_saved_v2'))),['rrb-je-cbt1-2026']);
 }finally{await page.close();}
});
test('exam updates link directly to SSB and do not render prototype announcements',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#nav-mobile-alerts').click();
  assert.match(await page.locator('#gr-verified-empty').innerText(),/do not list confirmed/);
  assert.equal(await page.locator('#view-alerts a[href="https://recruitment.ssb.gov.in/AdmitCardUrl"]').count(),1);
  assert.equal(await page.locator('#view-alerts a[href="https://recruitment.ssb.gov.in/resultUrl"]').count(),1);
  assert.equal(await page.locator('.gr-updates-research').isVisible(),false);
  assert.equal(await page.locator('#admit-cards-list article, #results-out-list article').count(),0);
 }finally{await page.close();}
});
test('source links and saved searches work without an account',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#regional-source-grid article').first().waitFor();
  await page.locator('#regional-country').selectOption('Canada');await page.locator('#regional-subdivision').selectOption('CA-MB');
  assert.equal(await page.locator('#regional-source-grid article').count(),1);
  await page.locator('#regional-source-grid [data-source-bookmark]').click();
  await page.locator('[data-quick-country="India"]').click();await page.locator('#discovery-region-quick').selectOption('IN-BR');
  await page.locator('#search-input').fill('railway');await page.locator('#nav-mobile-saved').click();await page.locator('#saved-search-create').click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('govradar-global-saved-searches-v1')));
  assert.equal(stored[0].filters.country,'India');assert.equal(stored[0].filters.region,'IN-BR');
  assert.match(await page.locator('#saved-source-grid').innerText(),/Manitoba/);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#regional-country option[value="India"]').waitFor({state:'attached'});await page.locator('#nav-mobile-saved').click();
  await page.locator('#saved-search-list [data-apply-search]').click();
  assert.equal(await page.locator('#discovery-region-quick').inputValue(),'IN-BR');
 }finally{await page.close();}
});
test('privacy, contact and paused community controls are available',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('footer a[href="/privacy"]').count(),1);
  assert.equal(await page.locator('footer a[href="/terms"]').count(),1);
  const policy=await page.request.get(origin+'/privacy');assert.equal(policy.status(),200);assert.match(await policy.text(),/connect@yorphives\.com/);
  const post=await page.request.post(origin+'/api/community/register');assert.equal(post.status(),503);assert.equal((await post.json()).error,'community_paused');
  const data=await page.request.get(origin+'/api/catalog');assert.deepEqual((await data.json()).leads,[]);
 }finally{await page.close();}
});

test('an eligible SSB notice can be viewed, saved, exported and shown on the low-data page',async()=>{
 // This record is synthetic and exists only in the browser test.
 const sample={id:'test-ssb',title:'Test SSB vacancy',employer:'Sashastra Seema Bal',country:'India',jurisdiction:'India',jurisdictionCode:'IN',region:'All India',stream:'Technical',closingAt,lastSeenAt:Date.now(),sourceId:'india-ssb-recruitment',sourceUrl:'https://recruitment.ssb.gov.in/adv_newsUrl'};
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  await page.route('**/api/notices?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({total:1,notices:[sample]})}));
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#official-notice-grid article').first().waitFor();
  assert.match(await page.locator('#official-notice-grid').innerText(),/SSB · Government of India/);
  assert.equal(await page.locator('#official-notice-grid a[href="https://recruitment.ssb.gov.in/adv_newsUrl"]').count(),1);
  await page.locator('#official-notice-grid [data-save-notice]').click();await page.locator('#nav-mobile-saved').click();
  assert.match(await page.locator('#saved-official-notices').innerText(),/Test SSB vacancy/);
  const downloadPromise=page.waitForEvent('download');await page.locator('#portable-export').click();
  const stream=await (await downloadPromise).createReadStream();let raw='';for await(const chunk of stream)raw+=chunk;
  const exported=JSON.parse(raw);assert.equal(exported.bookmarks[0].sourceId,'india-ssb-recruitment');assert.equal(exported.bookmarks[0].sourceUrl,sample.sourceUrl);
  await page.goto(origin+'/lite',{waitUntil:'domcontentloaded'});await page.locator('#jobs .card').first().waitFor();
  assert.match(await page.locator('#jobs').innerText(),/Test SSB vacancy/);assert.match(await page.locator('#jobs').innerText(),/Source: SSB, Government of India/);
  assert.equal(await page.locator('#jobs a[href="https://recruitment.ssb.gov.in/adv_newsUrl"]').count(),1);
  assert.match(await page.locator('#credit').innerText(),/SSB/);
 }finally{await page.close();}
});

test('full application uses strict script CSP and external fixed handlers',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  const violations=[];await page.addInitScript(()=>{window.__ggViolations=[];document.addEventListener('securitypolicyviolation',e=>window.__ggViolations.push(e.violatedDirective));});
  const response=await page.goto(origin,{waitUntil:'domcontentloaded'});
  const csp=response.headers()['content-security-policy'];assert.match(csp,/script-src 'self';/);assert.match(csp,/script-src-attr 'none'/);
  assert.equal(await page.locator('script:not([src])').count(),0);
  assert.equal(await page.locator('[onclick],[onchange],[oninput],[onsubmit]').count(),0);
  assert.equal(await page.locator('script[src="/full-app.js"]').count(),1);
  await page.locator('#official-notice-grid article').first().waitFor();
  await page.locator('#nav-mobile-saved').click();
  assert.equal(await page.locator('#view-saved').isVisible(),true);
  await page.locator('#nav-mobile-radar').click();
  assert.equal(await page.locator('#view-radar').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>window.__ggViolations.filter(x=>x.startsWith('script-src'))),[]);
 }finally{await page.close();}
});

test('reviewed evidence UI is honest about an empty approved catalog in full and lite',async()=>{
 const page=await browser.newPage({viewport:{width:375,height:820}});
 try{
  for(const route of ['/','/lite']){
   await page.goto(origin+route,{waitUntil:'domcontentloaded'});
   await page.locator('#reviewed-recruitment-posts').waitFor();
   await page.locator('#reviewed-recruitment-posts p').filter({hasText:'No reviewed documents are available'}).waitFor();
   assert.equal(await page.locator('#reviewed-recruitment-posts article').count(),0);
  }
 }finally{await page.close();}
});

test('USAJOBS archive paginates without skipped records and renders archived text as inert text',async()=>{
 const makeRecord=n=>({controlNumber:String(700000+n),announcementNumber:'ANN-'+n,title:'Archive Record '+n,agency:'Test federal agency',department:'Test department',positionOpenDate:'2025-11-01',positionCloseDate:'2025-12-01',effectiveCloseDate:'2025-12-01',status:'historical_closed',sourceStatus:'Applications under review',minimumSalary:90000,maximumSalary:110000,salaryType:'Per Year',minimumGrade:'12',maximumGrade:'13',payScale:'GS',totalOpenings:'1',hiringPaths:['The public'],series:['2210'],locations:[{city:'Washington',state:'DC',country:'United States'}]});
 for(const width of [320,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(()=>{window.__archiveXss=0;});
  await page.route('**/api/usajobs/history?*',async route=>{
   const url=new URL(route.request().url()),cursor=url.searchParams.get('cursor');requests.push(url);
   const records=cursor?Array.from({length:25},(_,i)=>makeRecord(i+25)):Array.from({length:25},(_,i)=>makeRecord(i));
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records,rejected:{},totalCount:50,pageSize:500,nextCursor:cursor?null:'next%3D%3D',retrievedAt:'2026-11-27T00:00:00.000Z',source:'USAJOBS Historic JOAs public data'})});
  });
  await page.route('**/api/usajobs/announcement-text?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({announcement:{controlNumber:'700000',fields:{summary:{label:'Summary',text:'Historical text <img src=x onerror=window.__archiveXss=1>'}}},retrievedAt:'2026-11-27T00:00:00.000Z'})}));
  try{
   await page.goto(origin+'/usajobs-history',{waitUntil:'domcontentloaded'});
   await page.locator('#records .record h3').first().waitFor();
   assert.match(await page.locator('h1').innerText(),/Past USAJOBS announcements/);
   assert.match(await page.locator('.notice').innerText(),/Historical data only/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),true);
   await page.locator('#series').fill('2210');
   const searchResponse=page.waitForResponse(response=>response.url().includes('/api/usajobs/history?')&&new URL(response.url()).searchParams.get('series')==='2210');
   await page.locator('#history-form button[type="submit"]').click();
   await searchResponse;
   assert.equal(await page.locator('#records .record').count(),20);
   const firstQuery=requests.find(x=>x.searchParams.get('series')==='2210');
   assert.equal(firstQuery.searchParams.get('series'),'2210');
   assert.ok(firstQuery.searchParams.has('closeFrom')&&firstQuery.searchParams.has('closeTo'));
   await page.locator('#records .record').first().getByRole('button',{name:'View archived announcement text'}).click();
   await page.locator('.detail').waitFor();
   assert.match(await page.locator('.detail').innerText(),/Historical text <img src=x onerror=window.__archiveXss=1>/);
   assert.equal(await page.locator('.detail img').count(),0);
   assert.equal(await page.evaluate(()=>window.__archiveXss),0);
   await page.locator('#next').click();
   assert.equal(await page.locator('#records .record').count(),5);
   assert.equal(await page.locator('#records .record h3').first().innerText(),'Archive Record 20');
   assert.equal(await page.locator('#next').innerText(),'Load next data page');
   await page.locator('#next').click();
   await page.waitForFunction(()=>document.querySelector('#page-label')?.textContent.startsWith('Page 3'));
   assert.equal(await page.locator('#records .record').count(),20);
   assert.equal(await page.locator('#records .record h3').first().innerText(),'Archive Record 25');
   assert.equal(await page.locator('#records .record h3').last().innerText(),'Archive Record 44');
   assert.ok(requests.some(x=>x.searchParams.get('cursor')==='next%3D%3D'));
   await page.locator('#previous').click();
   assert.equal(await page.locator('#records .record h3').first().innerText(),'Archive Record 20');
   await page.locator('#next').click();
   assert.equal(await page.locator('#records .record h3').first().innerText(),'Archive Record 25');
   await page.locator('#next').click();
   assert.equal(await page.locator('#records .record').count(),5);
   assert.equal(await page.locator('#records .record h3').first().innerText(),'Archive Record 45');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),true);
   assert.deepEqual(errors,[]);
  }finally{await page.close();}
 }
});
