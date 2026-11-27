export const USAJOBS_HISTORY_HTML=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="Search archived USAJOBS federal job announcements using the public Historic JOAs API."><title>Past USAJOBS announcements · globalGOV</title><link rel="stylesheet" href="/usajobs-history.css"><script defer src="/usajobs-history.js"></script></head>
<body><header><a class="brand" href="/">globalGOV</a><nav><a href="/">Main application</a><a href="https://www.usajobs.gov/Search/" target="_blank" rel="noopener noreferrer">Current USAJOBS vacancies ↗</a></nav></header>
<main><div class="eyebrow">UNITED STATES · PUBLIC RECRUITMENT DATA</div><h1>Past USAJOBS announcements</h1><p class="intro">Search the official Historic Job Opportunity Announcements (JOAs) dataset. This archive shows records whose effective closing date has passed; it is not a current vacancy feed.</p>
<div class="notice"><strong>Historical data only.</strong> USAJOBS provides a separate Search API for currently open announcements. Always confirm any record on the official USAJOBS website. globalGOV is independent and is not affiliated with or endorsed by the U.S. Office of Personnel Management.</div>
<form id="history-form"><div class="field"><label for="series">Position series</label><input id="series" name="series" maxlength="60" placeholder="2210 (comma-separated codes)"></div><div class="field"><label for="agency">Hiring agency codes</label><input id="agency" name="agency" maxlength="100" placeholder="VA, AR (optional)"></div><div class="field"><label for="department">Department codes</label><input id="department" name="department" maxlength="100" placeholder="VA, AR (optional)"></div><div class="field"><label for="controlNumber">USAJOBS control number</label><input id="controlNumber" name="controlNumber" inputmode="numeric" maxlength="20" placeholder="Exact record lookup (optional)"></div><div class="field"><label for="announcementNumber">Announcement number</label><input id="announcementNumber" name="announcementNumber" maxlength="80" placeholder="Exact announcement (optional)"></div><div class="field"><label for="closeFrom">Closing date from</label><input id="closeFrom" name="closeFrom" type="date"></div><div class="field"><label for="closeTo">Closing date to</label><input id="closeTo" name="closeTo" type="date"></div><details class="advanced"><summary>Optional opening-date range</summary><div class="dates"><div class="field"><label for="openFrom">Opening date from</label><input id="openFrom" name="openFrom" type="date"></div><div class="field"><label for="openTo">Opening date to</label><input id="openTo" name="openTo" type="date"></div></div></details><div class="actions"><button type="submit">Search historic announcements</button><button type="reset" class="secondary">Reset</button></div></form>
<section class="results"><div class="result-head"><h2>Archive results</h2><p id="status" role="status" aria-live="polite">Choose a date range and search.</p></div><div id="records" class="records"></div><div class="pager"><button id="previous" class="secondary" type="button" hidden>Previous</button><span id="page-label"></span><button id="next" type="button" hidden>Next</button></div></section>
<section class="credit"><h2>Data source and limitations</h2><p>Source: <a href="https://developer.usajobs.gov/api-reference/get-api-historicjoa" target="_blank" rel="noopener noreferrer">USAJOBS Historic JOAs API</a> and <a href="https://developer.usajobs.gov/api-reference/get-api-announcementtext" target="_blank" rel="noopener noreferrer">Announcement Text API</a>. Both endpoints are documented as publicly consumable without authentication. Results are retrieved on demand; globalGOV does not crawl or mirror the complete USAJOBS archive.</p><p>USAJOBS public-data terms permit lawful commercial and noncommercial reuse, subject to separately restricted third-party content, accurate source attribution and a clear statement of non-affiliation. Data is shown with retrieval dates. Announcement records can be incomplete, changed or unavailable; historical application instructions must not be used to apply.</p><p><a href="https://developer.usajobs.gov/guides/terms-of-service" target="_blank" rel="noopener noreferrer">USAJOBS API Terms of Service</a> · <a href="https://www.usajobs.gov/" target="_blank" rel="noopener noreferrer">Official USAJOBS website</a></p></section></main>
<footer><a href="/">globalGOV</a> · Independent information service · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer></body></html>`;
export const USAJOBS_HISTORY_CSS=`*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#17263b;font:16px/1.55 system-ui,-apple-system,sans-serif}header,main,footer{max-width:1120px;margin:auto;padding:18px}header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #dce4ed;background:#fff;max-width:none;padding-left:max(18px,calc((100% - 1084px)/2));padding-right:max(18px,calc((100% - 1084px)/2))}header nav{display:flex;gap:16px;flex-wrap:wrap}a{color:#174a9a}.brand{font-weight:850;font-size:21px;text-decoration:none;color:#17263b}.eyebrow{font-size:11px;font-weight:800;letter-spacing:1.3px;color:#12665f;margin-top:26px}h1{font-size:clamp(30px,5vw,46px);line-height:1.1;letter-spacing:-1.3px;margin:8px 0}.intro{max-width:760px;color:#4b5e73}.notice{border:1px solid #f1d49a;background:#fff9e9;border-radius:12px;padding:13px 16px;margin:18px 0 22px;font-size:14px}form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:13px;background:#fff;border:1px solid #dce4ed;border-radius:16px;padding:18px;box-shadow:0 5px 18px #1d35520b}.field{display:grid;gap:5px;min-width:0}.field label{font-size:13px;font-weight:750;color:#3a5068}.field input{min-width:0;width:100%;min-height:44px;border:1px solid #b8c7d7;border-radius:8px;padding:9px;font:inherit;color:#17263b;background:#fff}.advanced{grid-column:1/-1;border-top:1px solid #e5ebf1;padding-top:10px}.advanced summary{font-weight:700;font-size:13px;cursor:pointer}.dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:13px;padding-top:12px}.actions{display:flex;gap:9px;align-items:end;flex-wrap:wrap}.actions button,.pager button{min-height:44px;border:0;border-radius:9px;background:#145e58;color:#fff;padding:10px 16px;font:700 14px system-ui;cursor:pointer}.actions .secondary,.pager .secondary{background:#fff;border:1px solid #b8c7d7;color:#1b4058}.results{margin:28px 0}.result-head{display:flex;justify-content:space-between;gap:16px;align-items:baseline;flex-wrap:wrap}.result-head h2,.credit h2{font-size:21px;margin:0}.result-head p{font-size:13px;color:#516579}.records{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:12px}.record{background:#fff;border:1px solid #dce4ed;border-radius:13px;padding:15px;min-width:0;overflow-wrap:anywhere}.record h3{font-size:16px;line-height:1.35;margin:7px 0}.record p{font-size:13px;color:#4e6175;margin:5px 0}.badge{display:inline-block;border-radius:30px;background:#e7f5ef;color:#145c48;padding:3px 8px;font-size:11px;font-weight:800}.record button{min-height:38px;margin-top:10px;border:1px solid #b8c7d7;border-radius:8px;background:#f7fafc;padding:7px 11px;font-weight:700;color:#174a69;cursor:pointer}.detail{border-top:1px solid #e5ebf1;margin-top:12px;padding-top:10px}.detail h4{font-size:13px;margin:12px 0 4px}.detail p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}.pager{display:flex;justify-content:center;align-items:center;gap:16px;margin:18px}.pager button[hidden]{display:none}.credit{border-top:1px solid #dce4ed;padding-top:18px;margin:34px 0;color:#526579;font-size:13px}.credit p{max-width:900px}footer{border-top:1px solid #dce4ed;color:#627386;font-size:13px;margin-top:28px}@media(max-width:520px){header{align-items:flex-start;flex-direction:column}header nav{gap:12px;font-size:13px}.result-head{display:block}.result-head p{line-height:1.5}}`;
export const USAJOBS_HISTORY_JS=`(()=>{'use strict';
const $=id=>document.getElementById(id);
const state={records:[],page:0,nextCursor:null,filters:null,totalCount:0,retrievedAt:null,loading:false};
const pageSize=20;
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;}
function date(v){if(!v)return 'Not provided';const d=new Date(v+'T00:00:00Z');return Number.isNaN(d.getTime())?'Not provided':d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});}
function money(v){return Number.isFinite(v)&&v>0?'$'+Math.round(v).toLocaleString('en-US'):'Not provided';}
function addText(parent,label,value){if(!value)return;const p=node('p','',label+': '+value);parent.append(p);}
function render(){
 const root=$('records');root.replaceChildren();
 const start=state.page*pageSize,rows=state.records.slice(start,start+pageSize);
 for(const row of rows){
  const card=node('article','record'),badge=node('span','badge','Closed · historical record');
  card.append(badge,node('h3','',row.title));
  addText(card,'Hiring agency',row.agency);
  if(row.department)addText(card,'Department',row.department);
  if(row.announcementNumber)addText(card,'Announcement number',row.announcementNumber);
  addText(card,'USAJOBS control number',row.controlNumber);
  addText(card,'Opened',date(row.positionOpenDate));
  addText(card,'Effective closing date',date(row.effectiveCloseDate));
  if(row.minimumSalary||row.maximumSalary)addText(card,'Salary range',money(row.minimumSalary)+' – '+money(row.maximumSalary)+' '+(row.salaryType||''));
  if(row.minimumGrade||row.maximumGrade)addText(card,'Grade',(row.minimumGrade||'—')+' – '+(row.maximumGrade||'—')+' '+(row.payScale||''));
  if(row.totalOpenings)addText(card,'Openings in original record',row.totalOpenings);
  if(row.hiringPaths.length)addText(card,'Hiring paths',row.hiringPaths.join(', '));
  if(row.series.length)addText(card,'Position series',row.series.join(', '));
  if(row.locations.length)addText(card,'Location',row.locations.map(x=>[x.city,x.state,x.country].filter(Boolean).join(', ')).join('; '));
  if(row.sourceStatus)addText(card,'Source status at retrieval',row.sourceStatus);
  card.append(node('p','','Historical data retrieved '+new Date(state.retrievedAt).toLocaleString()));
  const detailButton=node('button','','View archived announcement text');
  detailButton.type='button';detailButton.addEventListener('click',()=>loadDetail(row,card,detailButton));card.append(detailButton);
  root.append(card);
 }
 $('page-label').textContent=rows.length?'Page '+(state.page+1)+' · '+state.records.length+' loaded of '+state.totalCount+' reported':'';
 $('previous').hidden=state.page===0;
 $('next').hidden=state.page+1<Math.ceil(state.records.length/pageSize)?false:!state.nextCursor;
 $('next').textContent=state.page+1<Math.ceil(state.records.length/pageSize)?'Next':'Load next data page';
}
async function loadDetail(row,card,button){
 const existing=card.querySelector('.detail');if(existing){existing.remove();button.textContent='View archived announcement text';return;}
 button.disabled=true;button.textContent='Loading archived text…';
 const panel=node('div','detail','Loading historical announcement text…');card.append(panel);
 try{
  const r=await fetch('/api/usajobs/announcement-text?controlNumber='+encodeURIComponent(row.controlNumber),{cache:'no-store'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'unavailable');
  panel.replaceChildren();
  if(!data.announcement){panel.textContent='No archived long-text record was returned for this control number.';}
  else{
   for(const value of Object.values(data.announcement.fields||{})){panel.append(node('h4','',value.label),node('p','',value.text));}
   if(!Object.keys(data.announcement.fields||{}).length)panel.textContent='The announcement text record contains no supported long-text fields.';
   panel.append(node('p','','Retrieved '+new Date(data.retrievedAt).toLocaleString()+'. These are historical instructions, not current application directions.'));
  }
  button.textContent='Hide archived announcement text';
 }catch{panel.textContent='Archived announcement text is temporarily unavailable.';button.textContent='Retry archived announcement text';}
 finally{button.disabled=false;}
}
function formParams(cursor){
 const form=$('history-form'),p=new URLSearchParams();
 const values={series:'series',agency:'agency',department:'department',announcementNumber:'announcementNumber',controlNumber:'controlNumber',closeFrom:'closeFrom',closeTo:'closeTo',openFrom:'openFrom',openTo:'openTo'};
 for(const [id,key] of Object.entries(values)){const v=$(id).value.trim();if(v)p.set(key,v);}
 if(cursor)p.set('cursor',cursor);return p;
}
async function search(cursor,append){
 if(state.loading)return;state.loading=true;$('status').textContent='Requesting one bounded page from the public USAJOBS archive…';
 try{
  const params=formParams(cursor),r=await fetch('/api/usajobs/history?'+params.toString(),{cache:'no-store'}),data=await r.json();
  if(!r.ok)throw Error(data.error||'archive_unavailable');
  if(!append){state.records=[];state.page=0;state.filters=formParams(null);}
  state.records=state.records.concat(data.records||[]);state.nextCursor=data.nextCursor;state.totalCount=data.totalCount;state.retrievedAt=data.retrievedAt;
  $('status').textContent=(data.records||[]).length+' closed historical records received from one upstream page. '+Object.values(data.rejected||{}).reduce((a,b)=>a+b,0)+' records were excluded by date or schema checks. Total reported by USAJOBS for this query: '+data.totalCount+'.';
  if(!state.records.length)$('status').textContent='No closed historical records matched these filters. Change the date range or series.';
  render();
 }catch(error){
  $('status').textContent=error.message==='closed_date_range_required'?'Provide a closing-date range, or search by an exact control or announcement number.':error.message==='invalid_close_range'?'The closing-date range is invalid or exceeds three years.':'The USAJOBS historical archive is temporarily unavailable. Try again later.';
 }finally{state.loading=false;}
}
$('history-form').addEventListener('submit',e=>{e.preventDefault();state.nextCursor=null;void search(null,false);});
$('previous').addEventListener('click',()=>{if(state.page>0){state.page--;render();}});
$('next').addEventListener('click',async()=>{
 if(state.page+1<Math.ceil(state.records.length/pageSize)){state.page++;render();return;}
 if(state.nextCursor){const old=state.records.length;await search(state.nextCursor,true);if(state.records.length>old){state.page++;render();}}
});
$('history-form').addEventListener('reset',()=>{setTimeout(()=>{setDefaults();state.records=[];state.page=0;state.nextCursor=null;render();$('status').textContent='Choose a date range and search.';},0);});
function iso(d){return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
function setDefaults(){const now=new Date(),end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-1);$('closeFrom').value=iso(start);$('closeTo').value=iso(end);}
setDefaults();void search(null,false);
})();`;
