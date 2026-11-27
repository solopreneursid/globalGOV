// Partial screening from explicitly reviewed requirements. No user profiles stored.
// No reservation, citizenship, experience or qualification equivalence guesses.
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
  checks.push({id:r.id,kind:r.kind,evidencePage:r.evidencePage,result});
 }
 return {status:checks.some(x=>x.result==='does_not_match')?'requirement_mismatch':checks.length&&checks.every(x=>x.result==='matches')?'listed_checks_match_not_full_eligibility':'review_required',checks};
}
