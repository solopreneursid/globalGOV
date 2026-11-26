import {parseManitobaRss} from "./manitoba-feed.mjs";
// Read-only compatibility check for a genuine province-level government RSS feed.
// Never write job notices to storage from this probe.
const url="https://jobsearch.gov.mb.ca/rss/newJobPostingsFeed.rss";
const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),9000);
try{
 const response=await fetch(url,{redirect:"error",signal:ctl.signal,headers:{"Accept":"application/rss+xml, application/xml, text/xml"}});
 console.log("MANITOBA_RSS_STATUS",JSON.stringify({status:response.status,type:response.headers.get("content-type"),size:response.headers.get("content-length")}));
 if(!response.ok)process.exit(0);
 const body=await response.text();if(body.length>700000)throw Error("unexpectedly long RSS");
 const items=[...body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/ig)].slice(0,3).map(x=>x[1]);
 console.log("MANITOBA_RSS_SHAPE",JSON.stringify({bytes:body.length,totalItems:(body.match(/<item\b/ig)||[]).length,root:body.slice(0,180).replace(/\s+/g," ").replace(/[<]/g,"("),samples:items.map(s=>({title:(s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.slice(0,140),link:(s.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]?.slice(0,210),pubDate:(s.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)||[])[1]?.slice(0,100),description:(s.match(/<description[^>]*>([\s\S]*?)<\/description>/i)||[])[1]?.slice(0,1400),tags:[...new Set([...s.matchAll(/<([a-z][a-zA-Z0-9:]*)(?:\s[^>]*)?>/g)].map(x=>x[1]))].slice(0,18)}))}));
 const parsed=parseManitobaRss(body);
 console.log("MANITOBA_NORMALIZATION",JSON.stringify({received:parsed.received,valid:parsed.valid.length,rejected:parsed.rejected,firstRecordFields:parsed.valid[0]?Object.keys(parsed.valid[0]):[]}));
 if(parsed.received===0||parsed.valid.length===0)throw Error("Source feed returned no eligible current records");
 const official=parsed.valid.every(x=>x.sourceId==="manitoba-jobs"&&x.sourceRef.startsWith("https://jobsearch.gov.mb.ca/jow/advancedResult.action?ID="));
 console.log("MANITOBA_RSS_VALIDATION",JSON.stringify({publishedItems:parsed.received,eligibleRecords:parsed.valid.length,rejected:parsed.rejected,officialSourceOnly:official}));
 if(!official)process.exitCode=1;

}catch(e){console.log("MANITOBA_RSS_UNAVAILABLE",String(e.message||e).slice(0,150));}finally{clearTimeout(timer);}
