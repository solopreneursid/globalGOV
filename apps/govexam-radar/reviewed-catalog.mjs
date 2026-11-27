// Read-only projection of an independently reviewed, signed release.
// No enrolled key or enabled document source in the actual configuration.
// Never accept keys, source scope or a bundle from public requests.
export const REVIEW_CONFIGURATION=Object.freeze({keys:Object.freeze({}),sources:Object.freeze([]),bundle:null});
const SOURCE='india-sdsc-shar',AUTHORITY='Satish Dhawan Space Centre SHAR / Department of Space, Government of India';
const POLICY='https://apps.shar.gov.in/Recruitment/copyright.jsp';
const INDEX='https://apps.shar.gov.in/sdscshar/result1.jsp';
const day=86400000,hex=/^[a-f0-9]{64}$/,ref=/^SDSC SHAR\/RMT\/\d{2}\/20\d{2}$/;
const types=new Set(['admit_card','exam_schedule','answer_key','result','corrigendum','cancellation','application_reopened']);
const blank=state=>({releaseProfile:'reviewed_document_staging',publicLaunchAuthorized:false,state,posts:[],events:[]});
function str(s,max){return typeof s==='string'&&s.length>0&&s.length<=max&&s===s.trim()&&!/[\u0000-\u001f\u007f]/.test(s);}
function timestamp(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s))return NaN;const t=Date.parse(s);return Number.isFinite(t)&&new Date(t).toISOString()===s?t:NaN;}
function bytes(s,n){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s)||s.length>200)throw Error('invalid_base64url');const a=Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));if(a.length!==n)throw Error('invalid_key_or_signature_size');return a;}
function sourceUrl(raw,event=false){
 if(!str(raw,1500))throw Error('invalid_source_url');
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.hostname!=='apps.shar.gov.in'||u.port||u.username||u.password||u.search||u.hash||/%(?:2f|5c|00)/i.test(u.pathname))throw Error('invalid_source_url');
 if(event&&u.href===INDEX)return u.href;
 if(!/^\/sdscshar\/(?:advt_[0-9_]+|apprentice|notice)\/[^/]+\.pdf$/i.test(u.pathname)&&!/^\/Recruitment[0-9_]*\/css\/images\/[^/]+\.pdf$/i.test(u.pathname))throw Error('invalid_source_path');
 return u.href;
}
function evidence(item,now,reviewedAt,event=false){
 if(!item||!hex.test(item.sha256||'')||!Number.isSafeInteger(item.page)||item.page<1||item.page>100||!Number.isSafeInteger(item.line)||item.line<1||item.line>20000)throw Error('invalid_evidence_reference');
 const published=timestamp(item.publishedAt),observed=timestamp(item.observedAt);
 if(!Number.isFinite(published)||!Number.isFinite(observed)||published>observed||observed>reviewedAt||now-observed>3*day)throw Error('invalid_evidence_time');
 return {url:sourceUrl(item.url,event),sha256:item.sha256,page:item.page,line:item.line,publishedAt:item.publishedAt,observedAt:item.observedAt};
}
export async function readReviewedCatalog(config=REVIEW_CONFIGURATION,now=Date.now()){
 if(!config.bundle||!Object.keys(config.keys).length||!config.sources.length)return blank('not_enrolled');
 try{
  const {keyId,payload,signature}=config.bundle;
  if(!str(keyId,80)||!Object.hasOwn(config.keys,keyId)||typeof payload!=='string'||new TextEncoder().encode(payload).length>256*1024)throw Error('untrusted_bundle');
  const key=await crypto.subtle.importKey('raw',bytes(config.keys[keyId],32),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,bytes(signature,64),new TextEncoder().encode(payload)))throw Error('invalid_review_signature');
  const doc=JSON.parse(payload),reviewedAt=timestamp(doc.reviewedAt),expires=timestamp(doc.expiresAt);
  if(doc.schemaVersion!==1||doc.scope!=='globalGOV-reviewed-staging-v1'||doc.publicLaunchAuthorized!==false||!Number.isFinite(reviewedAt)||!Number.isFinite(expires)||reviewedAt>now||expires<=now||expires-reviewedAt>3*day||!Array.isArray(doc.posts)||!Array.isArray(doc.events)||doc.posts.length>200||doc.events.length>200)throw Error('invalid_review_bundle');
  const ids=new Set(),postIds=new Set();
  function base(r,event=false){
   if(!r||r.sourceId!==SOURCE||!config.sources.includes(r.sourceId)||!ref.test(r.advertisement||'')||!str(r.id,120)||ids.has(r.id))throw Error('unapproved_review_record');
   ids.add(r.id);
   return {id:r.id,sourceId:SOURCE,authority:AUTHORITY,country:'India',advertisement:r.advertisement,policyUrl:POLICY,evidence:evidence(r.evidence,now,reviewedAt,event),reviewedAt:doc.reviewedAt};
  }
  const posts=doc.posts.map(r=>{
   const b=base(r),opens=timestamp(r.opensAt),closes=timestamp(r.closesAt),identity=r.advertisement+'/'+r.postCode;
   if(!str(r.postCode,30)||!/^[A-Za-z0-9/-]+$/.test(r.postCode)||postIds.has(identity)||!str(r.title,200)||!Number.isSafeInteger(r.vacancies)||r.vacancies<1||r.vacancies>999999||!Number.isFinite(opens)||!Number.isFinite(closes)||closes<=opens)throw Error('invalid_post');
   postIds.add(identity);
   const result={...b,postCode:r.postCode,title:r.title,vacancies:r.vacancies,opensAt:r.opensAt,closesAt:r.closesAt};
   for(const field of ['qualification','age','fee','salary']){
    if(r[field]!==undefined){if(!str(r[field],400))throw Error('invalid_reviewed_field');result[field]=r[field];}
   }
   return result;
  });
  const events=doc.events.map(r=>{
   const b=base(r,true);
   if(!types.has(r.type)||now-timestamp(b.evidence.publishedAt)>30*day)throw Error('invalid_or_stale_event');
   return {...b,type:r.type};
  });
  const cancelled=new Set(events.filter(r=>r.type==='cancellation').map(r=>r.advertisement));
  return {...blank('reviewed_staging'),posts:posts.filter(r=>timestamp(r.opensAt)<=now&&timestamp(r.closesAt)>now&&!cancelled.has(r.advertisement)),events};
 }catch{return blank('withheld');}
}
