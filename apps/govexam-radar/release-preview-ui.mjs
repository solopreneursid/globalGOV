// Static first-party UK-only launch-candidate experience.
// All dynamic records are fetched from /api/release-preview/notices and inserted
// with textContent, never HTML. No user accounts, trackers or paid APIs.
export const RELEASE_PREVIEW_HTML=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#071525">
<meta name="description" content="globalGOV research preview: explore UK Department for Education teaching vacancies sourced from the official feed.">
<title>globalGOV · UK Education Release Preview</title>
<link rel="stylesheet" href="/release-preview.css">
<script src="/release-preview.js" defer></script>
</head>
<body>
<a class="skip-link" href="#vacancies">Skip to vacancies</a>
<div class="site-shell">
<header class="topbar">
 <a class="brand" href="/release-preview" aria-label="globalGOV UK release preview"><span class="brand-mark" aria-hidden="true">G</span><span>Gov<span class="accent">Radar</span><small>by HQventures</small></span></a>
 <nav aria-label="Main navigation"><a href="#vacancies">Explore jobs</a><a href="#about">Our source</a><a class="back-link" href="/">Research HQ <span aria-hidden="true">↗</span></a></nav>
</header>
<main>
 <section class="hero" aria-labelledby="hero-title">
  <div class="hero-copy">
   <p class="eyebrow"><span class="status-pulse" aria-hidden="true"></span>RELEASE CANDIDATE · STAGING ONLY</p>
   <h1 id="hero-title">A clearer path to your <span>next teaching role.</span></h1>
   <p class="lede">Browse source-observed vacancies from the UK Department for Education. No account needed. Applications stay on the official website.</p>
   <div class="hero-actions"><a class="primary-action" href="#vacancies">Explore opportunities <span aria-hidden="true">→</span></a><a class="secondary-action" href="#about">How listings work</a></div>
  </div>
  <aside class="hero-proof" aria-label="About this preview">
   <div class="mini-label">SOURCE TRANSPARENCY</div>
   <div class="proof-number" id="hero-count">—</div><p class="proof-caption" id="hero-count-label">Matching source-observed listings</p>
   <div class="proof-rule"></div>
   <div class="proof-line"><span>Coverage</span><strong>UK education</strong></div>
   <div class="proof-line"><span>Feed</span><strong>DfE Teaching Vacancies</strong></div>
   <div class="proof-line"><span>Applications</span><strong>Official source only</strong></div>
  </aside>
 </section>
 <section class="listings" id="vacancies" aria-labelledby="listings-title">
  <div class="section-heading"><div><p class="section-kicker">OFFICIAL-SOURCE SNAPSHOT</p><h2 id="listings-title">Explore teaching vacancies</h2><p>Source-observed, not individually verified. Confirm current details on the official source.</p><p id="preview-freshness" class="freshness-note" role="status" aria-live="polite">Snapshot refresh status is being checked.</p></div><span class="source-pill">UK DfE · OGL v3.0</span></div>
  <form id="preview-filters" class="filters" role="search">
   <label class="field field-search">Search title, employer or region<input type="search" id="preview-search" autocomplete="off" maxlength="60" placeholder="e.g. mathematics, London" aria-label="Search UK teaching roles"></label>
   <label class="field field-type">Category<select id="preview-stream"><option value="">All categories</option><option value="Technical">Technical (inferred)</option><option value="Non-technical">Non-technical (inferred)</option><option value="Unclassified">Unclassified</option></select></label>
   <button class="filter-submit" type="submit">Search jobs <span aria-hidden="true">→</span></button>
  </form>
  <div class="saved-search"><div><strong>Save your UK job search</strong><p>Keep your filters on this device. Reopen globalGOV to check matching vacancies; no off-device notification service.</p><p id="saved-search-status" role="status" aria-live="polite">No search saved.</p></div><div class="saved-search-actions"><button id="save-search" type="button">Save search</button><button id="use-saved-search" type="button">Use saved search</button><button id="clear-saved-search" type="button">Remove</button></div></div>
  <div class="listing-toolbar"><p id="preview-status" role="status" aria-live="polite">Loading source-observed listings…</p><button id="preview-reset" class="reset-button" type="button">Clear filters</button></div>
  <div class="watch-panel"><div><strong>Watch this search while this page is open</strong><p>Optional check every 15 minutes while the tab is visible. No remote delivery or checks after closing the page.</p><p id="watch-status" role="status" aria-live="polite">Watching is off.</p></div><button id="watch-toggle" type="button" aria-pressed="false">Start watching</button></div>
  <section class="local-alerts" aria-labelledby="local-alerts-title"><div class="local-alerts-head"><div><h3 id="local-alerts-title">Recent changes on this device</h3><p>Detected only when you view or watch listings here. Not a complete source history.</p></div><button id="clear-local-alerts" type="button">Clear history</button></div><p id="local-alerts-status" role="status" aria-live="polite">No changes recorded.</p><div id="local-alerts-list" class="local-alerts-list"></div></section>
  <p class="change-note" id="preview-changes" role="status" aria-live="polite">Changes are compared only for listings viewed in this browser; this is not an automatic background alert.</p>
  <div id="preview-grid" class="job-grid" aria-live="polite"></div>
  <div id="preview-pages" class="pages" aria-label="Results pagination"></div>
 </section>
 <section class="trust-section" id="about" aria-labelledby="about-heading">
  <div><p class="section-kicker">BUILT FOR CLARITY</p><h2 id="about-heading">Your next step stays in your hands.</h2><p>globalGOV helps you discover relevant official-source opportunities. It does not verify each job, handle applications, charge job-seekers to contact employers, or represent any government authority.</p></div>
  <div class="trust-cards">
   <article><span class="trust-icon" aria-hidden="true">01</span><h3>Official-source links</h3><p>Every listing points back to the Department for Education's Teaching Vacancies site.</p></article>
   <article><span class="trust-icon" aria-hidden="true">02</span><h3>Information, not endorsement</h3><p>Check closing dates, job details and eligibility on the official listing before applying.</p></article>
   <article><span class="trust-icon" aria-hidden="true">03</span><h3>Preview, not launch</h3><p>This manually refreshed staging snapshot covers UK DfE data only. Other country sources remain under rights review. Confirm freshness on the official DfE site.</p></article>
  </div>
 </section>
</main>
<footer class="footer"><div class="footer-brand">globalGOV <span>· HQventures</span></div><p>Contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer">Open Government Licence v3.0</a> (© Crown copyright). Not affiliated with or endorsed by the UK government. No fees for contacting, interviewing or hiring through reused DfE listings.</p><p class="footer-last">This page is a controlled release preview, not a public product launch. Manitoba and India content is excluded.</p></footer>
</div>
</body></html>`;
export const RELEASE_PREVIEW_CSS=`
:root{color-scheme:light;--navy:#071525;--ink:#182438;--muted:#5d6979;--border:#e3e8ee;--accent:#0a8172;--green:#c0f9e6;--surface:#f5f8fb;--white:#fff}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fff;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}button,input,select{font:inherit}a{color:inherit}button{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #17a9c5;outline-offset:3px}.skip-link{position:absolute;top:-80px;left:12px;z-index:15;padding:12px;background:#fff;border-radius:6px}.skip-link:focus{top:12px}.site-shell{overflow-x:clip}.topbar{max-width:1180px;margin:auto;padding:19px 30px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{display:flex;align-items:center;gap:11px;font-size:20px;font-weight:800;letter-spacing:-.7px;text-decoration:none;line-height:1.1}.brand-mark{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--navy);color:#a4eed6;font-size:22px}.brand .accent{color:var(--accent)}.brand small{display:block;color:#637183;font-size:10px;font-weight:650;letter-spacing:.7px;margin-top:3px}.topbar nav{display:flex;align-items:center;gap:26px;font-size:13px;font-weight:650}.topbar nav a{text-decoration:none}.topbar nav a:hover{text-decoration:underline}.back-link{border:1px solid var(--border);padding:10px 14px;border-radius:9px}.hero{background:radial-gradient(ellipse at 90% 5%,#205c60 0%,transparent 45%),linear-gradient(120deg,#061424 0%,#0c2638 100%);color:#fff;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.65fr);gap:68px;padding:92px max(30px,calc((100vw - 1120px)/2));align-items:center}.hero-copy{max-width:660px}.eyebrow,.section-kicker,.mini-label{letter-spacing:2px;font-size:10px;font-weight:800}.eyebrow{color:#afe6db;display:flex;align-items:center;gap:10px}.status-pulse{width:8px;height:8px;background:#86e5c8;border-radius:50%;box-shadow:0 0 0 5px #28665f80}.hero h1{font-size:clamp(43px,5.6vw,76px);line-height:1.07;letter-spacing:-3px;font-weight:790;margin:27px 0 22px}.hero h1 span{color:#a9f4d7}.lede{font-size:clamp(15px,1.6vw,18px);color:#d3e2e8;max-width:550px}.hero-actions{display:flex;align-items:center;flex-wrap:wrap;gap:14px;margin-top:34px}.hero-actions a{text-decoration:none;padding:13px 21px;border-radius:11px;font-size:14px;font-weight:750}.primary-action{background:#b2efd5;color:#092a32}.primary-action:hover{background:#d4ffea}.secondary-action{color:#fff;border:1px solid #6d89904f}.hero-proof{background:#ffffff10;border:1px solid #ffffff27;padding:29px;border-radius:20px;backdrop-filter:blur(6px);align-self:center}.mini-label{color:#91ceca}.proof-number{font-size:62px;line-height:1.2;font-weight:780;letter-spacing:-2px;margin-top:20px}.proof-caption{font-size:13px;color:#cddde6;margin:4px 0 26px}.proof-rule{height:1px;background:#ffffff2a;margin:20px 0}.proof-line{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:10px 0}.proof-line span{color:#b6cad4}.proof-line strong{font-weight:670;text-align:right}.listings{max-width:1180px;padding:76px 30px 92px;margin:auto;scroll-margin-top:20px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:20px}.section-kicker{color:var(--accent);margin:0 0 8px}.section-heading h2,.trust-section h2{font-size:clamp(29px,3vw,42px);line-height:1.14;letter-spacing:-1.4px;margin:0}.section-heading p:not(.section-kicker){font-size:14px;color:var(--muted);margin:14px 0 0}.freshness-note{padding:10px 12px;background:#eaf5f2;border-left:3px solid #138672;border-radius:7px;font-size:12px!important;margin-top:12px!important;max-width:720px}.source-pill{white-space:nowrap;font-size:12px;font-weight:750;color:#056e60;background:#e2faf1;border:1px solid #b8e7d6;border-radius:90px;padding:9px 14px}.filters{margin-top:34px;background:var(--surface);border:1px solid var(--border);padding:18px;border-radius:18px;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(165px,.75fr) auto;align-items:end;gap:14px}.field{font-size:12px;font-weight:730;display:block}.field input,.field select{display:block;width:100%;background:#fff;border:1px solid #d4dce4;border-radius:10px;margin-top:7px;padding:12px 14px;color:var(--ink);min-height:46px;min-width:0}.filter-submit{background:var(--navy);color:#fff;border:0;border-radius:10px;padding:13px 19px;font-weight:730;min-height:46px}.filter-submit:hover{background:#17435a}.local-alerts{background:#f8fafc;border:1px solid #dbe5ec;border-radius:15px;padding:18px;margin:18px 0}.local-alerts-head{display:flex;justify-content:space-between;gap:15px;align-items:center}.local-alerts h3{font-size:15px;margin:0}.local-alerts p{font-size:12px;color:#536577;margin:5px 0}.local-alerts button{background:#fff;border:1px solid #cbd7df;border-radius:9px;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer}.local-alerts-list{display:grid;gap:9px;margin-top:12px}.local-alert-item{background:#fff;border:1px solid #e1eaf0;border-radius:10px;padding:11px 12px}.local-alert-item strong{font-size:13px;overflow-wrap:anywhere}.local-alert-item a{display:block;color:#096a60;font-size:12px;overflow-wrap:anywhere}.watch-panel{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 18px;margin:18px 0;background:#f1f7ff;border:1px solid #d4e4f8;border-radius:14px}.watch-panel strong{font-size:14px}.watch-panel p{font-size:12px;color:#50637b;margin:5px 0}.watch-panel button{flex-shrink:0;border:0;background:#183e5b;color:#fff;font-size:12px;font-weight:750;border-radius:10px;padding:12px 16px;min-height:44px}.watch-panel button[aria-pressed="true"]{background:#fefefe;color:#183e5b;border:1px solid #8aacc6}.change-note{font-size:12px;color:#536577;background:#f5f8fc;border-radius:8px;padding:10px 13px;margin:0 0 18px}.job-change{border-color:#67b49e;box-shadow:0 0 0 1px #b9e6d6}.change-badge{font-size:11px;color:#056851;font-weight:750;background:#e0f8ed;border-radius:6px;padding:5px 8px;margin-top:12px;align-self:flex-start}.saved-search{display:flex;justify-content:space-between;align-items:center;gap:18px;border:1px solid #cde6dc;background:#f1faf6;border-radius:14px;padding:18px;margin-top:16px}.saved-search strong{font-size:14px}.saved-search p{font-size:12px;color:#526b65;margin:5px 0}.saved-search-actions{display:flex;gap:8px;flex-wrap:wrap}.saved-search-actions button{border:1px solid #9ccbbd;background:white;border-radius:9px;padding:9px 12px;color:#075f53;font-size:12px;font-weight:750}.saved-search-actions button:first-child{background:#075f53;color:white}.saved-search-actions button:disabled{opacity:.4;cursor:not-allowed}.listing-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:23px 0}.listing-toolbar p{color:var(--muted);font-size:13px;margin:0}.reset-button{border:0;background:transparent;color:#0e776e;font-weight:740;font-size:12px;padding:8px}.job-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px}.job-card{border:1px solid var(--border);border-radius:16px;padding:23px;background:#fff;box-shadow:0 9px 26px #12344a09;display:flex;flex-direction:column;min-width:0}.job-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.job-chip{font-size:10px;font-weight:780;text-transform:uppercase;letter-spacing:.5px;padding:6px 9px;border-radius:6px;background:#e5f9f2;color:#086e5f}.job-note{color:#8b6131;background:#fff4e2;font-size:10px;border-radius:6px;padding:6px 8px;font-weight:730}.job-card h3{font-size:18px;line-height:1.32;letter-spacing:-.4px;overflow-wrap:anywhere;margin:19px 0 11px}.job-employer{color:#536374;font-size:13px;margin:0}.job-region{font-size:12px;color:#647184;margin:11px 0 0;overflow-wrap:anywhere}.job-deadline{margin-top:auto;padding-top:23px;font-size:12px;color:#4e5c6c}.job-deadline strong{color:var(--ink)}.job-link{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:17px;padding:12px 14px;background:#f0f8f7;border-radius:10px;color:#076b61;text-decoration:none;font-size:12px;font-weight:770}.job-link:hover{background:#d4f3e9}.no-results{grid-column:1/-1;background:#f6f9fc;border:1px dashed #c9d5df;border-radius:16px;padding:32px;color:#516375}.pages{display:flex;justify-content:center;align-items:center;gap:14px;margin:28px auto 0;font-size:13px;color:#546579}.pages button{background:#fff;border:1px solid #ccd8df;padding:9px 15px;border-radius:9px;font-weight:690;color:#1a4254}.pages button:disabled{opacity:.37;cursor:default}.trust-section{background:#f4f8fa;padding:76px max(30px,calc((100vw - 1120px)/2));display:grid;gap:44px}.trust-section>div:first-child{max-width:700px}.trust-section>div:first-child>p:last-child{font-size:14px;color:#657384}.trust-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.trust-cards article{background:#fff;border:1px solid #e4ebef;border-radius:16px;padding:25px}.trust-icon{font-weight:800;color:#098572;font-size:13px}.trust-cards h3{font-size:17px;margin:17px 0 10px}.trust-cards p{color:#657483;font-size:13px;margin:0}.footer{max-width:1180px;margin:auto;padding:40px 30px 60px;color:#5c6e7b;font-size:12px}.footer-brand{color:#061d29;font-size:17px;font-weight:790}.footer-brand span{color:#718090;font-weight:500}.footer p{max-width:850px}.footer a{color:#086b61}.footer-last{font-weight:700}
@media(max-width:940px){.hero{padding:70px 30px;gap:26px;grid-template-columns:1.2fr .8fr}.hero h1{font-size:clamp(42px,6vw,64px)}.job-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.proof-number{font-size:52px}}
@media(max-width:700px){.local-alerts-head{align-items:flex-start;flex-direction:column}.watch-panel{align-items:stretch;flex-direction:column}.watch-panel button{width:100%}.saved-search{align-items:stretch;flex-direction:column}.saved-search-actions{display:grid;grid-template-columns:1fr 1fr}.topbar{padding:15px 18px}.topbar nav{gap:14px}.topbar nav a:not(.back-link){display:none}.topbar nav .back-link{padding:9px 11px}.hero{padding:57px 22px 42px;grid-template-columns:1fr;gap:28px}.hero h1{font-size:clamp(38px,11vw,56px);letter-spacing:-1.9px;margin:22px 0}.hero-copy{max-width:100%}.hero-proof{padding:21px}.hero-proof .proof-number{margin-top:12px;font-size:47px}.hero-proof .proof-caption{margin-bottom:12px}.hero-proof .proof-rule{margin:12px 0}.listings{padding:55px 18px 65px}.section-heading{align-items:start;flex-direction:column;gap:14px}.filters{grid-template-columns:1fr;gap:14px;padding:14px;margin-top:24px}.job-grid{grid-template-columns:1fr}.trust-section{padding:60px 18px;gap:30px}.trust-cards{grid-template-columns:1fr;gap:12px}.footer{padding:33px 18px 48px}}
@media(max-width:360px){.hero{padding:45px 18px}.brand{font-size:18px}.brand-mark{width:36px;height:36px}.topbar nav .back-link{font-size:11px}.hero h1{font-size:38px}.hero-actions a{padding:12px 16px}.proof-line{font-size:11px}.job-card{padding:19px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}}
`;
export const RELEASE_PREVIEW_JS=`
"use strict";
(()=>{
 const byId=id=>document.getElementById(id),grid=byId("preview-grid"),status=byId("preview-status"),pages=byId("preview-pages"),form=byId("preview-filters");
 if(!grid||!status||!pages||!form)return;
 let page=1,term="",stream="",pending=0,watchTimer=null;
 const WATCH_INTERVAL_MS=15*60*1000;
 const watchButton=byId("watch-toggle"),watchLabel=byId("watch-status");
 function watchState(){const active=watchTimer!==null;watchButton.setAttribute("aria-pressed",String(active));watchButton.textContent=active?"Stop watching":"Start watching";watchLabel.textContent=!active?"Watching is off.":document.hidden?"Watching paused while tab is hidden.":"Watching this page's UK search every 15 minutes while visible. No background delivery.";}
 function stopWatch(){if(watchTimer!==null)clearInterval(watchTimer);watchTimer=null;watchState();}
 function startWatch(){if(watchTimer!==null)return;
  const choice=byId("preview-stream").value;
  if(!ALLOWED_STREAMS.has(choice))return;
  term=byId("preview-search").value.trim().slice(0,60);stream=choice;page=1;
  watchTimer=setInterval(()=>{if(document.hidden)return;void loadFreshness();void load();},WATCH_INTERVAL_MS);
  watchState();void loadFreshness();void load();
 }
 watchButton.addEventListener("click",()=>watchTimer===null?startWatch():stopWatch());
 document.addEventListener("visibilitychange",()=>{if(watchTimer!==null){watchState();if(!document.hidden){void loadFreshness();void load();}}});
 window.addEventListener("pagehide",stopWatch);
 const HISTORY_KEY="govradar-uk-viewed-notices-v1",MAX_HISTORY=300;
 const ALERT_KEY="govradar-uk-local-alerts-v1",MAX_ALERTS=50;
 function readAlerts(){try{const data=JSON.parse(localStorage.getItem(ALERT_KEY)||"null");return data&&data.version===1&&Array.isArray(data.items)?data.items.filter(x=>x&&typeof x.id==="string"&&typeof x.url==="string"&&isTrustedUrl(x.url)).slice(0,MAX_ALERTS):[];}catch{return [];}}
 function renderAlerts(){const items=readAlerts(),list=byId("local-alerts-list");list.replaceChildren();byId("local-alerts-status").textContent=items.length?items.length+" saved change(s) detected on this device.":"No changes recorded on this device.";for(const item of items){const el=node("div","local-alert-item"),label=node("strong","",item.title||"UK listing updated"),detail=node("p","",(item.fields?.includes("closingAt")?"Closing date changed":"Listing information changed")+" · "+new Date(item.at).toLocaleDateString()),link=node("a","","View official listing ↗");link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";el.append(label,detail,link);list.append(el);}}
 function recordAlerts(rows,changes){if(!changes.size)return;const items=readAlerts();for(const row of rows){const fields=changes.get(row.id);if(!fields||!isTrustedUrl(row.sourceUrl))continue;items.unshift({id:row.id,title:String(row.title||"UK job").slice(0,180),url:row.sourceUrl,fields,at:Date.now()});}try{localStorage.setItem(ALERT_KEY,JSON.stringify({version:1,items:items.slice(0,MAX_ALERTS)}));}catch{/* no remote storage fallback */}renderAlerts();}
 byId("clear-local-alerts").addEventListener("click",()=>{try{localStorage.removeItem(ALERT_KEY);}catch{/* storage unavailable */}renderAlerts();});
 let history=null;
 function readHistory(){try{const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||"null");return x&&x.version===1&&x.rows&&typeof x.rows==="object"&&!Array.isArray(x.rows)?x.rows:{};}catch{return {};}}
 function summary(row){return {title:String(row.title||"").slice(0,180),employer:String(row.employer||"").slice(0,160),closingAt:String(row.closingAt||""),sourceUrl:String(row.sourceUrl||"")};}
 function compareRows(rows){
  const before=readHistory(),updated={...before},changes=new Map();let matched=0;
  for(const row of rows){
   if(row.sourceId!=="uk-dfe-teaching-vacancies"||!isTrustedUrl(row.sourceUrl)||typeof row.id!=="string"||!row.id.startsWith("uk-dfe-teaching-vacancies:"))continue;
   const current=summary(row),previous=before[row.id];
   if(previous){const fields=Object.keys(current).filter(k=>current[k]!==previous[k]);if(fields.length){changes.set(row.id,fields);matched++;}}
   updated[row.id]=current;
  }
  const limited=Object.fromEntries(Object.entries(updated).slice(-MAX_HISTORY));
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify({version:1,rows:limited}));}catch{/* browser-private comparison remains best-effort */}
  return{changes,matched};
 }
 const LIMIT=12,SEARCH_KEY="govradar-uk-saved-search-v1",ALLOWED_STREAMS=new Set(["","Technical","Non-technical","Unclassified"]);
 let saved=null;
 function readSaved(){try{const value=JSON.parse(localStorage.getItem(SEARCH_KEY)||"null");return value&&value.version===1&&typeof value.term==="string"&&value.term.length<=60&&ALLOWED_STREAMS.has(value.stream)?value:null;}catch{return null;}}
 function refreshSaved(){saved=readSaved();const label=byId("saved-search-status");label.textContent=saved?"Saved on this device · "+(saved.term||saved.stream||"All UK teaching roles"):"No search saved on this device.";byId("use-saved-search").disabled=!saved;byId("clear-saved-search").disabled=!saved;}
 function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;}
 function isTrustedUrl(raw){try{const u=new URL(raw);return u.protocol==="https:"&&u.hostname==="teaching-vacancies.service.gov.uk"&&u.pathname.startsWith("/jobs/");}catch{return false;}}
 function dateLabel(raw){const ms=Date.parse(raw);return Number.isFinite(ms)?new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(ms)):"Check official listing";}
 async function loadFreshness(){
  const label=byId("preview-freshness");if(!label)return;
  try{
   const r=await fetch("/api/freshness",{cache:"no-store"});
   if(!r.ok)throw Error("unavailable");
   const state=await r.json();
   if(state?.status==="current"&&state.fresh===true&&state.lastSuccessfulMirrorAt){
    label.textContent="Automated UK snapshot updated "+new Intl.DateTimeFormat(undefined,
     {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"})
     .format(new Date(state.lastSuccessfulMirrorAt))+". Verify job details at the official site.";
   }else if(state?.status==="pending"){
    label.textContent="Automated UK refresh configured; first successful run not yet verified.";
   }else if(state?.status==="delayed"){
    label.textContent="UK snapshot refresh delayed. Confirm vacancies directly with the official source.";
   }else throw Error("unavailable");
  }catch{
   label.textContent="Snapshot freshness not independently verified. Check the official source before applying.";
  }
 }
 function renderCard(row,changedFields=[]){
  if(row.sourceId!=="uk-dfe-teaching-vacancies"||!isTrustedUrl(row.sourceUrl))return null;
  const card=node("article","job-card"+(changedFields.length?" job-change":""));
  if(changedFields.length)card.append(node("span","change-badge",changedFields.includes("closingAt")?"Closing date changed since last view":"Listing updated since last view"));
  const badges=node("div","job-meta");badges.append(node("span","job-chip","UK Department for Education"),node("span","job-note","Verify on official site"));
  card.append(badges,node("h3","",row.title||"Untitled official listing"),node("p","job-employer",row.employer||"Employer not specified"),node("p","job-region",[row.jurisdiction,row.region].filter(Boolean).join(" · ")||"United Kingdom"));
  const observedAt=Number(row.lastSeenAt);
  if(Number.isSafeInteger(observedAt)&&observedAt>0)
   card.append(node("p","job-region","Last observed in source · "+new Intl.DateTimeFormat(undefined,
    {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(observedAt))));
  const deadline=node("p","job-deadline");deadline.append(node("span","","Closing · "),node("strong","",dateLabel(row.closingAt)));card.append(deadline);
  const link=node("a","job-link","Read on official website ↗");link.href=row.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";card.append(link);
  return card;
 }
 function controls(total){
  pages.replaceChildren();const max=Math.ceil(total/LIMIT);if(max<2)return;
  const prev=node("button","","← Previous"),next=node("button","","Next →"),counter=node("span","","Page "+page+" of "+max);
  prev.type=next.type="button";prev.disabled=page<=1;next.disabled=page>=max;
  prev.addEventListener("click",()=>{page=Math.max(1,page-1);void load();document.getElementById("vacancies")?.scrollIntoView({block:"start"});});
  next.addEventListener("click",()=>{page=Math.min(max,page+1);void load();document.getElementById("vacancies")?.scrollIntoView({block:"start"});});
  pages.append(prev,counter,next);
 }
 async function load(){
  const own=++pending;status.textContent="Loading UK-source vacancies…";grid.replaceChildren();pages.replaceChildren();
  const q=new URLSearchParams({page:String(page),limit:String(LIMIT)});
  if(term)q.set("q",term);if(stream)q.set("stream",stream);
  try{
   const response=await fetch("/api/release-preview/notices?"+q.toString(),{cache:"no-store"});
   if(!response.ok)throw Error("source_unavailable");
   const data=await response.json();
   if(own!==pending)return;
   if(data.releaseProfile!=="uk_only_release_preview"||data.publicLaunchAuthorized!==false||
      !Array.isArray(data.sources)||data.sources.length!==1||data.sources[0].id!=="uk-dfe-teaching-vacancies"||
      !Array.isArray(data.notices))throw Error("source_policy_invalid");
   const total=Number(data.total)||0;
   byId("hero-count").textContent=total.toLocaleString();
   byId("hero-count-label").textContent=term||stream?"Matching UK source-observed listings":"Source-observed UK listings";
   status.textContent=total+" UK source-observed listing"+(total===1?"":"s")+" match. Confirm each on the official website.";
   const comparison=compareRows(data.notices);
   recordAlerts(data.notices,comparison.changes);
   const changeLabel=byId("preview-changes");
   changeLabel.textContent=comparison.matched?comparison.matched+" previously viewed listing(s) changed on this page. Verify changes on the official source.":"No changes detected among previously viewed listings on this page. This does not check unseen results or run in the background.";
   const cards=data.notices.map(row=>renderCard(row,comparison.changes.get(row.id)||[])).filter(Boolean);
   if(cards.length)grid.append(...cards);
   else grid.append(node("div","no-results","No matching UK DfE vacancies were found. Try a broader search or visit the official Teaching Vacancies site."));
   controls(total);
  }catch{
   if(own!==pending)return;
   status.textContent="UK listing data is temporarily unavailable. No vacancies have been inferred or simulated.";
   grid.append(node("div","no-results","The source feed is unavailable. Visit teaching-vacancies.service.gov.uk for current notices."));
   byId("hero-count").textContent="—";
  }
 }
 byId("save-search").addEventListener("click",()=>{
  const candidate={version:1,term:byId("preview-search").value.trim().slice(0,60),stream:byId("preview-stream").value};
  if(!ALLOWED_STREAMS.has(candidate.stream))return;
  try{localStorage.setItem(SEARCH_KEY,JSON.stringify(candidate));refreshSaved();}
  catch{byId("saved-search-status").textContent="Browser storage unavailable. Search was not saved.";}
 });
 byId("use-saved-search").addEventListener("click",()=>{stopWatch();
  refreshSaved();if(!saved)return;
  byId("preview-search").value=saved.term;byId("preview-stream").value=saved.stream;
  term=saved.term;stream=saved.stream;page=1;void load();
 });
 byId("clear-saved-search").addEventListener("click",()=>{
  try{localStorage.removeItem(SEARCH_KEY);}catch{byId("saved-search-status").textContent="Cannot remove saved search: browser storage unavailable.";return;}
  refreshSaved();
 });
 refreshSaved();watchState();renderAlerts();
 form.addEventListener("submit",event=>{
  event.preventDefault();stopWatch();term=byId("preview-search").value.trim().slice(0,60);stream=byId("preview-stream").value;page=1;void load();
 });
 byId("preview-reset").addEventListener("click",()=>{stopWatch();byId("preview-search").value="";byId("preview-stream").value="";term="";stream="";page=1;void load();});
 void loadFreshness();
 void load();
})();
`;
