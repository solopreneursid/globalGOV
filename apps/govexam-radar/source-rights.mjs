// First-party, source-scoped release guard for GovRadar staging.
// A government's general open-data policy never overrides a narrower
// service-specific notice. This is a conservative implementation checklist,
// not a legal opinion or a substitute for written permission where required.
const RIGHT_ENTRIES=[
 {
  id:"uk-dfe-teaching-vacancies",
  reuseStatus:"conditional_open_licence",
  commercialReuseApprovedForCurrentFields:true,
  licence:"Open Government Licence v3.0 — DfE Teaching Vacancies listing data",
  licenceUrl:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  termsUrl:"https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions",
  officialSourceUrl:"https://teaching-vacancies.service.gov.uk/jobs",
  attribution:"Contains public sector information licensed under the Open Government Licence v3.0 (© Crown copyright).",
  note:"Reuse is conditional: no fees or commission for contacting, interviewing or hiring respondents to reused listings. Do not imply government endorsement. Keep applications on the official site."
 },
 {
  id:"india-isro-opportunities",
  reuseStatus:"conditional_isro_website_policy",
  commercialReuseApprovedForCurrentFields:true,
  licence:"ISRO/DOS website copyright policy; accurate reproduction and prominent attribution required",
  licenceUrl:"https://www.isro.gov.in/Website_Policy.html",
  termsUrl:"https://www.isro.gov.in/Website_Policy.html",
  officialSourceUrl:"https://www.isro.gov.in/ViewAllOpportunities.html",
  attribution:"Source: Indian Space Research Organisation / Department of Space, Government of India.",
  note:"The permission covers ISRO/DOS material on its site, with accurate reproduction and prominent attribution; identified third-party material is excluded. Import only named ISRO/DOS centres and official ISRO links. Not a government service or endorsement."
 },
 {
  id:"manitoba-jobs",
  reuseStatus:"source_specific_review_required",
  commercialReuseApprovedForCurrentFields:false,
  licence:"Government of Manitoba OpenMB (general); Public Service Commission terms may be narrower",
  licenceUrl:"https://www.gov.mb.ca/legal/print,copyright.html",
  termsUrl:"https://www.gov.mb.ca/csc/aboutpsc/disclaim.html",
  officialSourceUrl:"https://jobsearch.gov.mb.ca/rssFeeds.action",
  attribution:"Job opportunity information sourced from the Government of Manitoba Public Service Commission. Not a government service or endorsement.",
  note:"A government RSS feed is offered to readers, but its syndication page does not explicitly grant commercial republication of the Public Service Commission's materials. The PSC's own terms restrict reproduction beyond non-profit educational use. Obtain clarification/permission before commercial release; only minimal factual fields and official links are retained in staging."
 },
 {
  id:"india-employment-news",
  reuseStatus:"not_approved",
  commercialReuseApprovedForCurrentFields:false,
  licence:"Commercial republication permission has not been established",
  licenceUrl:"https://employmentnews.gov.in/newemp/AllJobs.aspx?k=All",
  termsUrl:"https://employmentnews.gov.in/",
  officialSourceUrl:"https://employmentnews.gov.in/newemp/AllJobs.aspx?k=All",
  attribution:"Employment News, Government of India (index research only).",
  note:"Parser is a research-only pilot: no automated India import, and no claim of independently verified vacancies."
 }
];
export const OFFICIAL_SOURCE_RIGHTS=Object.freeze(RIGHT_ENTRIES.map(x=>Object.freeze({...x})));
export function sourceRights(id){
 return OFFICIAL_SOURCE_RIGHTS.find(x=>x.id===id)||null;
}
export function assertSourceRightsForCommercialRelease(ids){
 if(!Array.isArray(ids)||ids.length===0)throw Error("source_set_required");
 const unknown=ids.filter(x=>!sourceRights(x));
 if(unknown.length)throw Error("unknown_official_source");
 const pending=ids.filter(x=>!sourceRights(x).commercialReuseApprovedForCurrentFields);
 if(pending.length)throw Error("commercial_reuse_review_pending:"+pending.join(","));
 return true;
}

// A narrowly scoped *preview*, never a switch that can be set by public query
// parameters. Actual commercial publication still requires a reviewed release.
// Explicit source IDs rather than a broad boolean prevent accidental rollout
// when new research-only source adapters are added to the platform.
export const UK_ONLY_PREVIEW_SOURCE_IDS=Object.freeze(["uk-dfe-teaching-vacancies"]);
export function allowedCommercialPreviewSources(){
 assertSourceRightsForCommercialRelease(UK_ONLY_PREVIEW_SOURCE_IDS);
 return [...UK_ONLY_PREVIEW_SOURCE_IDS];
}

export function allowedIsroPreviewSource(){
 const id="india-isro-opportunities";
 assertSourceRightsForCommercialRelease([id]);
 return id;
}
