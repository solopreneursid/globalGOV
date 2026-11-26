// Read-only probe: one public official page, one robots.txt, zero D1 writes.
// A successful parse does not prove reuse permission or individual vacancy validity.
import {INDIA_EMPLOYMENT_NEWS,parseEmploymentNews} from "./india-employment-news.mjs";
const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
try{
 const robotsUrl="https://"+INDIA_EMPLOYMENT_NEWS.host+"/robots.txt";
 try{
  const robots=await fetch(robotsUrl,{redirect:"manual",signal:ctrl.signal,headers:{Accept:"text/plain"}});
  let policy="unknown";
  if(robots.status===404)policy="no_robots_file";
  else if(robots.ok){
   const text=(await robots.text()).slice(0,50000),agents=text.split(/\n(?=User-agent:)/i);
   const botBlocks=agents.filter(x=>/^User-agent:\s*\*/im.test(x));
   const forbidden=botBlocks.some(x=>x.split(/\r?\n/).some(v=>/^Disallow:\s*\/(?:\s*$|newemp\/|newemp$)/i.test(v)));
   policy=forbidden?"disallowed":"not_obviously_disallowed";
  }else policy="robots_http_"+robots.status;
  console.log(JSON.stringify({probe:"employment_news_robots",status:robots.status,policy}));
  if(policy==="disallowed")process.exitCode=1;
 }catch(err){console.log(JSON.stringify({probe:"employment_news_robots",status:"unavailable",error:err.name}));process.exitCode=1;}
 if(process.exitCode===1)process.exit();
 const response=await fetch(INDIA_EMPLOYMENT_NEWS.url,{redirect:"manual",signal:ctrl.signal,headers:{Accept:"text/html"}});
 if(!response.ok)throw Error("upstream_http_"+response.status);
 if(!/html/i.test(response.headers.get("content-type")||""))throw Error("unexpected_content_type");
 const html=await response.text();
 const parsed=parseEmploymentNews(html);
 console.log(JSON.stringify({probe:"employment_news",status:response.status,bytes:html.length,tableRows:parsed.received,
  currentlyOpenSummaries:parsed.valid.length,rejected:parsed.rejected,source:INDIA_EMPLOYMENT_NEWS.url}));
}catch(e){console.error(JSON.stringify({probe:"employment_news",status:"failed",reason:String(e?.message||e).slice(0,150)}));process.exitCode=1;}
finally{clearTimeout(timer);}
