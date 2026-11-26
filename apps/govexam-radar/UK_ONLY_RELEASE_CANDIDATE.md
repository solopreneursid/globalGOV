# GovRadar — UK-only release candidate (staging, not launched)

Updated 2026-11-16. First HQventures product. **The public website `yorphives.com` is unchanged.** Both GovRadar pull requests remain draft and independent of production.

## Purpose

Provide a mobile-first, source-transparent preview of UK Department for Education job notices while retaining a separate research staging experience for all other jurisdictions. This approach allows product usability and business research to continue without treating Manitoba/India source reuse as commercially approved.

- **Founder preview URL:** `https://hqventures-govexam-parity-preview.solopreneursid-proy.workers.dev/release-preview`.
- **Read-only UK-only source API:** `GET /api/release-preview/notices`.
- **Existing research preview:** `/`, `/api/notices` (still multi-source research, not an authorized commercial launch).
- **Release metadata:** `releaseProfile=uk_only_release_preview`, `publicLaunchAuthorized=false` in every successful UK-only preview API response.
- **Live consumer product:** Not yet authorized, not deployed to the live website, not indexed by crawlers.

## Rights and filtering

1. The release-preview API is a separate Worker-controlled route. It invokes `serveOfficialNotices(db,params,"uk_only_release_preview")`, never accepting the release profile from query parameters.
2. `allowedCommercialPreviewSources` calls `assertSourceRightsForCommercialRelease` and returns only `uk-dfe-teaching-vacancies`. New research feeds are **not** approved automatically.
3. The allowed source is enforced **inside both SQL SELECT and COUNT WHERE predicates**, so pagination, search and country filters cannot include Manitoba/India records.
4. Explicit `?source=manitoba-jobs`, `?source=india-employment-news` and unknown source IDs are rejected with **HTTP 403**. A misconfigured server-side release profile or missing/changed source-rights approval fails closed.
5. The response exposes only UK DfE source licence metadata and attributed records. The default research endpoint continues to label all source statuses accurately.
6. Every job link is validated again in the browser and must use `https://teaching-vacancies.service.gov.uk/jobs/`; imported text is inserted with `textContent`, not `innerHTML`. No third-party scripts, analytics SDKs or accounts are added.

**Important limitation:** This preview endpoint and page are **not** a comprehensive production access-control boundary. The same research staging Worker still has `/api/notices` and other routes, which can include research-only Manitoba records. A genuine commercial release must use a separate code path, Worker or strict production routing policy that excludes all unapproved sources across **every API, UI, download, cache, change feed, saved-record path, and search index**, not just this preview. No commercial launch without that broader review.

## UX and business approach

- Clean responsive navigation with source explanation.
- Accessible UK-only vacancy search, category filter, pagination and genuine result counts. No artificial numbers or vacancy guarantees.
- Direct links to the official UK job listing for applications; no fee to contact, interview or hire a candidate using reused listings.
- Clear language: "Release candidate · staging only" and "Source-observed, not individually verified".
- Empty/failure states do not fabricate vacancies; source unavailability always points users back to the official source.
- Smartphone first, with 320 / 375 / 768 / 1440 px automated browser QA and zero horizontal scrolling.
- Avoid costly technology dependencies; all files and feed ingestion remain first-party, portable, and independently deployable to an owner-controlled Node/SQLite environment in the future.
- Cloudflare Workers **Paid $5/month base plus usage** is currently founder-approved for development; do not upgrade or downgrade without the founder's decision. Monitor account requests, CPU and D1 usage as the audience grows.

## Independent UK-only staging deployment (new)

The earlier `/release-preview` route on the research staging Worker is still available for visual comparison, but the **independent restricted candidate** is now:

**https://hqventures-govradar-uk-isolated-preview.solopreneursid-proy.workers.dev/**

It is a separate Cloudflare Worker with no ingestion, moderation, community, data-export or research routes, **zero Secrets**, **zero Cron triggers**, and a D1 binding to `govradar-uk-candidate-preview` instead of the shared research/community database. The isolated D1 enforces UK-only source and official DfE URL checks at the schema level and contains only the `official_job_notices` application table. Both the isolated Worker route allowlist and D1 contents were independently verified. All visitor methods other than GET are denied.

The UK 15:20 UTC unattended Cron success imported DfE page 3 and advanced the cursor; after a **manually controlled mirror refresh**, the source and separate UK D1 each contained **250 distinct UK DfE records** at 15:27 UTC, no Manitoba, India, HQ or community records. The isolated preview itself remains **noindex** and `publicLaunchAuthorized=false`.

The first-party `uk-preview-sync.mjs` provides a **read-only dry-run by default** and a founder-approved `--apply` workflow, with validated official URLs, maximum four rows per SQL batch and no silent destructive deletions. This does **not** run automatically, and a production release must add a reviewed, separately authorized refresh mechanism.

Read the independent verification and guarded refresh plan in `UK_ISOLATED_RELEASE_READINESS.md`.

## Readiness gates before a real release

1. **Two full unattended Cron cycles per source** independently audited after the single-Cron migration. The status API's `twoCycleCronGatePassed` must be true; historic signed GitHub tests do not count.
2. **Verified rights:** UK terms and OGL attribution retained, Manitoba and India commercial reuse resolved before inclusion. No disguised mixed-source results in any release route.
3. **Full end-to-end QA:** security, no unauthorized source leakage, browser support, safe external links, API status, responsiveness, deployment rollback, D1 backup/restore plan, age/accessibility and privacy requirements.
4. **Founder's explicit release decision:** reviewed source branch, separate deployment target and environment bindings, domain/privacy notice, release rollback plan, monetization placement that does not violate UK terms, and no accidental promotion of HQ/website code.
5. **Billing safeguards:** current plan has a monthly base fee plus usage; confirm cost ceiling and growth thresholds before a larger launch.
6. **Later phases:** genuine opt-in alerts, admit-card/result data and broader global coverage are separate audited milestones, not features implied by this page.

## Verification

- Offline regression tests: `release-preview.test.mjs`, `source-rights.test.mjs` and `worker.test.mjs`.
- Browser QA: `browser.test.mjs` across four viewport widths with controlled synthetic test fixtures (fixtures are never published as jobs).
- External staging smoke: actual `GET /api/release-preview/notices` verifies UK-only rows and legal metadata after deployment.
- Official DfE licence: https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions
- Cloudflare independent staging URL: https://hqventures-govexam-parity-preview.solopreneursid-proy.workers.dev/

## Next engineering step

After verified initial native sync and a founder-reviewed public release, build opt-in, privacy-preserving alerts using first-party templates, verified consent, rate limits, unsubscribe controls and zero third-party SaaS dependency. Do **not** claim email alerts are currently sent.
