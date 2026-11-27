import assert from 'node:assert/strict';
const base=(process.env.GLOBALGOV_STAGING_BASE||'https://hqventures-govexam-parity-preview.solopreneursid-proy.workers.dev').replace(/\/+$/,'');
const now=new Date(),end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-3);
const iso=d=>d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
const q=new URLSearchParams({series:'2210',closeFrom:iso(start),closeTo:iso(end)});
const page=await fetch(base+'/api/usajobs/history?'+q.toString(),{redirect:'error',signal:AbortSignal.timeout(25000)});
assert.equal(page.status,200,'staging history API must respond 200');
const data=await page.json();
assert.ok(Array.isArray(data.records));assert.ok(Number.isSafeInteger(data.totalCount));assert.ok(data.records.length<=1000);assert.equal(data.source,'USAJOBS Historic JOAs public data');
assert.ok(data.records.every(x=>x.status==='historical_closed'&&x.effectiveCloseDate<=iso(end)));
assert.ok(data.nextCursor===null||typeof data.nextCursor==='string');
const html=await fetch(base+'/usajobs-history',{redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(html.status,200);assert.match(await html.text(),/Past USAJOBS announcements/);assert.match(html.headers.get('x-robots-tag')||'',/noindex/i);
const js=await fetch(base+'/usajobs-history.js',{redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(js.status,200);assert.match(await js.text(),/api\/usajobs\/announcement-text/);
let detail='skipped_no_records';
if(data.records.length){
 const control=data.records[0].controlNumber;
 const r=await fetch(base+'/api/usajobs/announcement-text?controlNumber='+encodeURIComponent(control),{redirect:'error',signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,200);const body=await r.json();
 assert.ok(body.announcement===null||body.announcement.controlNumber===control);
 detail=body.announcement?'available':'no_text_record';
}
console.log(JSON.stringify({staging:'verified',historyRecords:data.records.length,totalCount:data.totalCount,rejected:data.rejected,nextPageAvailable:!!data.nextCursor,detail,archivePage:'ok',retrievedAt:data.retrievedAt}));
