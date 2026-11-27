// Low-volume hosted smoke benchmark. Not a capacity/load test.
// Fixed staging origin and bounded concurrency, no mutations, no auth secrets.
import {performance} from 'node:perf_hooks';
const base='https://hqventures-govexam-parity-preview.solopreneursid-proy.workers.dev';
const paths=['/','/lite','/api/health','/api/notices?limit=18','/api/notices?country=India&limit=18','/api/notice-changes?limit=18'];
const samples=[];
for(let round=0;round<2;round++){
 for(let i=0;i<paths.length;i+=2){
  await Promise.all(paths.slice(i,i+2).map(async path=>{
   const start=performance.now(),r=await fetch(base+path,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('unexpected_status_'+r.status+'_'+path);
   const bytes=(await r.arrayBuffer()).byteLength;
   const ms=Math.round(performance.now()-start);
   if(bytes>1024*1024)throw Error('response_budget_exceeded_'+path);
   if(r.headers.get('x-content-type-options')!=='nosniff')throw Error('missing_nosniff_'+path);
   if((path==='/'||path==='/lite')&&!/noindex/i.test(r.headers.get('x-robots-tag')||''))throw Error('indexing_gate_missing');
   samples.push({path,round,ms,bytes});
  }));
 }
}
const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b);
console.log(JSON.stringify({scope:'bounded hosted staging smoke; not capacity proof',sampleCount:samples.length,concurrency:2,p50Ms:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1),samples}));
