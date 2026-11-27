// Conservative column-based extraction from pdftotext -layout output.
// Only explicitly recognised headers; no inferred row joins or vacancy sums.
const headerNames={
 code:/^(?:post\s*code|post\s*no\.?|code)$/i,
 title:/^(?:name\s+of\s+(?:the\s+)?post|post\s+name|name\s+of\s+post)$/i,
 vacancies:/^(?:total\s+vacancies|no\.?\s+of\s+vacancies|vacancies|no\.?\s+of\s+posts)$/i
};
const tidy=s=>s.trim().replace(/\s+/g,' ');
function cells(line){return [...line.matchAll(/\S(?:.*?\S)?(?=\s{2,}|$)/g)].map(x=>({text:tidy(x[0]),start:x.index}));}
function header(line){
 const parts=cells(line);
 if(parts.length!==3)return null;
 const keys=parts.map(p=>Object.keys(headerNames).find(k=>headerNames[k].test(p.text)));
 if(keys.join(',')!=='code,title,vacancies')return null;
 return parts.map(x=>x.start);
}
export function extractPostTableCandidates(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>2*1024*1024)throw Error('invalid_post_table_text');
 const rows=[],issues=[],byCode=new Map();
 for(const [pi,page] of text.split('\f').entries()){
  const lines=page.split(/\r?\n/);let active=null;
  for(const [li,line] of lines.entries()){
   const found=header(line);
   if(found){active={positions:found,headerLine:li+1};continue;}
   if(!active)continue;
   if(!line.trim()||/^\s*[-=]+\s*$/.test(line)){active=null;continue;}
   const parts=cells(line);
   if(parts.length!==3){issues.push({type:'unresolved_table_row',page:pi+1,line:li+1,headerLine:active.headerLine});active=null;continue;}
   const [code,title,count]=parts.map(x=>x.text);
   const [a,b,c]=active.positions;
   // Permit small alignment shifts, but never move numbers between columns.
   if(parts[0].start>b-2||parts[1].start<b-2||parts[1].start>=c-2||parts[2].start<c-2||!/^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$/.test(code)||!/[A-Za-z]/.test(title)||title.length>200||!/^[1-9]\d{0,5}$/.test(count)){
    issues.push({type:'unresolved_table_row',page:pi+1,line:li+1,headerLine:active.headerLine});active=null;continue;
   }
   const row={postCode:code,postTitle:title,vacancies:Number(count),evidence:{page:pi+1,line:li+1,headerLine:active.headerLine},state:'candidate_only'};
   const prior=byCode.get(code);
   if(prior){
    if(prior.postTitle!==title||prior.vacancies!==row.vacancies)issues.push({type:'conflicting_post_code',postCode:code,page:pi+1,line:li+1});
    continue;
   }
   byCode.set(code,row);rows.push(row);
   if(rows.length>300)throw Error('post_table_row_limit');
  }
 }
 const blocked=new Set(issues.filter(x=>x.type==='conflicting_post_code').map(x=>x.postCode));
 return {posts:rows.filter(x=>!blocked.has(x.postCode)),issues,reviewState:'requires_review'};
}
