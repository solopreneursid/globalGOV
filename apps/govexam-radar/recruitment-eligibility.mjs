// Partial screening from explicitly reviewed requirements. No user profiles stored.
// No inferred reservation or qualification equivalence. Reviewed extra rules may be evaluated.
const whole=n=>Number.isSafeInteger(n)&&n>=0&&n<=1200;
const codeList=x=>Array.isArray(x)&&x.length>0&&x.length<=80&&x.every(s=>typeof s==='string'&&s.length>0&&s.length<=80);
const iso=/^\d{4}-\d{2}-\d{2}$/;
function validDate(s){if(typeof s!=='string'||!iso.test(s))return false;const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s;}
export function ageAt(dob,cutoff){
 if(!validDate(dob)||!validDate(cutoff)||dob>cutoff)throw Error('invalid_age_dates');
 const [y,m,d]=dob.split('-').map(Number),[cy,cm,cd]=cutoff.split('-').map(Number);
 return cy-y-(cm<m||cm===m&&cd<d?1:0);
}
export function screenReviewedRequirements(rules,profile){
 if(!rules||rules.reviewState!=='founder_reviewed'||!Array.isArray(rules.requirements)||rules.requirements.length>20||!profile||typeof profile!=='object')return {status:'review_required',checks:[]};
 const checks=[],seen=new Set();
 for(const r of rules.requirements){
  if(!r||typeof r.id!=='string'||!r.id||seen.has(r.id)||!Number.isSafeInteger(r.evidencePage)||r.evidencePage<1){return {status:'review_required',checks:[]};}
  seen.add(r.id);let result='unknown';
  if(r.kind==='age'&&Number.isInteger(r.min)&&Number.isInteger(r.max)&&r.min>=0&&r.max<=120&&r.min<=r.max&&validDate(r.cutoff)&&r.relaxationsReviewed===true&&r.categorySpecific===false&&profile.dateOfBirth){
   try{const age=ageAt(profile.dateOfBirth,r.cutoff);result=age>=r.min&&age<=r.max?'matches':'does_not_match';}catch{}
  }else if(r.kind==='qualification'&&Array.isArray(r.acceptedCodes)&&r.acceptedCodes.length>0&&r.acceptedCodes.every(x=>typeof x==='string'&&x.length<=80)&&r.equivalenceReviewed===true&&Array.isArray(profile.qualificationCodes)&&profile.qualificationCodes.every(x=>typeof x==='string')){
   if(profile.qualificationCodes.length)result=profile.qualificationCodes.some(x=>r.acceptedCodes.includes(x))?'matches':'unknown';
  }
  // Inputs are explicit, self-reported facts. A missing or unreviewed rule is unknown.
  if(r.kind==='experience'&&whole(r.minimumMonths)&&r.definitionReviewed===true&&r.cutoffReviewed===true&&validDate(r.cutoff)&&profile.experienceAsOf===r.cutoff&&whole(profile.relevantExperienceMonths))
   result=profile.relevantExperienceMonths>=r.minimumMonths?'matches':'does_not_match';
  if(r.kind==='citizenship'&&r.scopeReviewed===true&&r.exceptionsReviewed===true&&codeList(r.acceptedCodes)&&r.acceptedCodes.every(c=>/^[A-Z]{2}$/.test(c))&&codeList(profile.citizenshipCodes)&&profile.citizenshipCodes.every(c=>/^[A-Z]{2}$/.test(c)))
   result=profile.citizenshipCodes.some(c=>r.acceptedCodes.includes(c))?'matches':profile.citizenshipComplete===true?'does_not_match':'unknown';
  if(r.kind==='qualification_all'&&r.equivalenceReviewed===true&&Array.isArray(r.groups)&&r.groups.length>0&&r.groups.length<=10&&r.groups.every(codeList)&&codeList(profile.qualificationCodes))
   result=r.groups.every(g=>g.some(c=>profile.qualificationCodes.includes(c)))?'matches':'unknown';
  // Category-specific age rules require an explicit reviewed table including
  // the ordinary category; no additive or inferred relaxation.
  if(r.kind==='age_category'&&r.relaxationsReviewed===true&&r.categorySpecific===true&&r.combinationsReviewed===true&&validDate(r.cutoff)&&Array.isArray(r.ranges)&&r.ranges.length>0&&r.ranges.length<=30&&typeof profile.reviewedCategoryCode==='string'&&profile.categoryFactsConfirmed===true){
   const entries=r.ranges;
   if(entries.every(x=>x&&typeof x.code==='string'&&/^[A-Z0-9_-]{1,50}$/.test(x.code)&&Number.isInteger(x.min)&&Number.isInteger(x.max)&&x.min>=0&&x.max<=120&&x.min<=x.max)&&new Set(entries.map(x=>x.code)).size===entries.length){
    const entry=entries.find(x=>x.code===profile.reviewedCategoryCode);
    if(entry){try{const age=ageAt(profile.dateOfBirth,r.cutoff);result=age>=entry.min&&age<=entry.max?'matches':'does_not_match';}catch{}}
   }
  }
  checks.push({id:r.id,kind:r.kind,evidencePage:r.evidencePage,result});
 }
 return {status:checks.some(x=>x.result==='does_not_match')?'requirement_mismatch':checks.length&&checks.every(x=>x.result==='matches')?'listed_checks_match_not_full_eligibility':'review_required',checks};
}
