# Indian authority onboarding register — 2026-11-27

Status is source-specific; a public URL or a government domain does not itself grant reuse permission. No new authority may publish until its exact access rules, source rights, schema, current dates and native run evidence are checked.

| Authority | Official notice / policy references | Current decision | Next engineering action |
|---|---|---|---|
| ISRO | https://www.isro.gov.in/ViewAllOpportunities.html ; https://www.isro.gov.in/Website_Policy.html | Conditional first-party reuse; native collector running; no eligible notices in latest checked snapshot | Inspect field-level exclusion reasons; preserve ownership and date filters |
| SSB | https://recruitment.ssb.gov.in/adv_newsUrl ; https://recruitment.ssb.gov.in/websitepolicyUrl | Conditional first-party reuse; adapter merged and staging active; native evidence pending | Run read-only actual parser probe, observe two independent scheduled snapshots |
| UPSC | https://www.upsc.gov.in/advertisements/ ; https://upsc.gov.in/website-policies/ | Permission required for reproduction; direct linking allowed, authority requests notification of links | Obtain source-specific permission or use a separately licensed official dataset; parse per-post deadlines rather than upload dates |
| SSC | https://ssc.gov.in/ | Notice board available; applicable reuse and permitted automated access not established | Inspect current policy and sanctioned feed; keep directory-only |
| RRB Chandigarh | https://www.rrbcdg.gov.in/employment-notices.php | Official recruitment index; site-specific reuse not established | Audit each RRB and authoritative CEN documents; preserve source-specific rights |
| IBPS | https://www.ibps.in/index.php/crp-updates/ ; https://www.ibps.in/index.php/policies-rules-guidelines/ | Public updates; proprietary-rights cautions; no blanket republication permission established | Clarify minimal metadata rights and identify official allowed feed; directory-only |
| DRDO | https://drdo.gov.in/drdo/offerings/vacancies ; https://drdo.gov.in/drdo/en/copyright-policy | Structured dates, but permission required for republication | Request permission; exclude non-recruitment outcomes and third-party ads |
| Department of Expenditure | https://doe.gov.in/en/vacancies ; https://doe.gov.in/en/website-policies | Conditional reuse policy; listing contains publication dates, not explicit closing dates | Investigate permitted official document extraction, distinguish recruitment from outcomes, do not infer deadlines |
| IP India | https://ipindia.gov.in/career ; https://ipindia.gov.in/copyright-policy ; https://ipindia.gov.in/ | General reuse policy with a more recent commercial-use warning; not approved | Reconcile notice and policy; obtain clarification |
| State PSCs | existing official-source directory | source-by-source decisions pending | Prioritize structured current notices and locally applicable policies |

## Production gate

For every candidate retain source URL, policy URL/date, fields permitted, explicit first-party scope, robots/access result, date semantics, parser fixtures, approval decision, and independent native audit evidence. No fabricated vacancies or guessed deadlines. Links remain useful where source reuse is blocked. Source permission requests have not been sent.

## ISRO current-source review — 2026-11-27
Official table https://www.isro.gov.in/ViewAllOpportunities.html includes older closed notices and entries with blank closing dates. For example the URSC 04/2026 detailed notice https://www.isro.gov.in/URSCRecruitment13.html records an extension to 20 November 2026, already elapsed. Do not use an upload or opening date as a closing date. A future extension requires evidence from the exact official notice. The latest native audit inspected 128 entries, rejected 51 for missing/invalid fields, 49 for dates outside the current window, 26 for ownership and 2 for field length; accepted zero. This is not evidence that every ISRO centre has zero opportunities, only that the adapter found no publishable records. Keep the conservative publication gate and qualify official detail-document extraction separately.

SSB source policy was checked again: https://recruitment.ssb.gov.in/websitepolicyUrl allows accurate first-party reuse with attribution. The public advertisement table contains older advertisements with explicit dates; do not manufacture open jobs. A read-only parser probe does not count toward scheduled publication proof.

## Additional review candidate — SDSC SHAR
Official recruitment portal https://apps.shar.gov.in/Recruitment/ and policy https://apps.shar.gov.in/Recruitment/copyright.jsp: accurate first-party reuse with source/date attribution, third-party exclusions. Round SDSC SHAR/RMT/03/2026 closed on 16 November 2026. Document compatibility review only; no new public listing feed. Department of Expenditure policy at /website-policies requires permission while /en/website-policies states otherwise; clarification required before republication.

## International and Indian source audit — 2026-11-27
USAJOBS Search API: https://developer.usajobs.gov/api-reference/get-api-search and https://developer.usajobs.gov/guides/terms-of-service explicitly describe public data reuse including commercial use, subject to exclusions, accurate attribution and non-affiliation. Access is credentialed: https://developer.usajobs.gov/guides/authentication. A founder-authorized API account and key are required; request at https://developer.usajobs.gov/apirequest/addrequestvalid. No scraping substitute or unauthorized credential enrollment.
IPRC careers https://www.iprc.gov.in/careers.html contains a current-openings table and historical exam notices. Its general copyright statement allows reproduction, but its specific terms at https://www.iprc.gov.in/website_policies.html require permission to use IPRC materials. Keep as a directory link; no republication until clarified. Do not assume ISRO's main-site policy overrides IPRC's own terms.

Credential-gated research-only USAJOBS adapter: `usajobs-probe.mjs`. Uses the owner's registered email and key via environment, one bounded public-search page, no applicant or contact data retained, exact official URL and explicit application-close timestamp. Unit fixtures cover source, date, location and credential boundaries. Actual authenticated source compatibility, restrictions metadata audit, pagination, native scheduling and public feed integration are not yet established. Do not enable public USAJOBS publication until those checks pass.


## USAJOBS access request and current terms review — 2026-11-27
The registration confirmation screenshot indicates that USAJOBS sent an email-verification link. It is not proof that the email was verified or that an API key was issued. The official authentication guide requires the registered email as `User-Agent` and the issued token as `Authorization-Key`: https://developer.usajobs.gov/guides/authentication.

The current published API Terms of Service at https://developer.usajobs.gov/guides/terms-of-service expressly permit copying, storage, adaptation, analysis, publication, redistribution and lawful commercial/noncommercial reuse of defined Public Data, subject to third-party or separately restricted metadata and accurate source/non-affiliation presentation. The older Terms text embedded in the API request page still states restrictive redistribution/competing-product terms. Do not assume which version governs this registration. Before using the token for globalGOV's public aggregator, obtain written confirmation from access@usajobs.gov or confirm the accepted terms version from the issued-key email/portal. No API call or public publication until this is resolved.

A manual, credential-gated smoke workflow is available at `.github/workflows/globalgov-usajobs-probe.yml`. After the owner has received the key and confirmed applicable terms, configure repository Actions secrets `USAJOBS_REGISTERED_EMAIL` and `USAJOBS_API_KEY`, then manually dispatch the workflow with the terms-confirmation input enabled. The workflow reports aggregate counts and a response hash only; it does not store or publish job records. Never paste the API token into source, issues, pull requests, chat or logs. This smoke test is not the production feed adapter or proof of permission to publish.
