# globalGOV · HQventures Product 01

globalGOV is a transparent, zero-dependency government recruitment **source directory and research-lead tracker**. Its first version transforms the uploaded GovExam & Job Radar HTML prototype into a deployable Cloudflare Worker.

## Honest scope (v2.2 pilot)

- Full six-section founder-uploaded interface with advanced location / country / citizenship / stream / stage filters, imported example records, archived data, demo lifecycle, custom personal leads, on-device updates (email subscription interface removed), and 4-part guide.
- 58 official national and subnational recruitment portals in 11 countries, including state, provincial, territory, devolved, municipal and prefectural government career sources.
- 10 imported prototype opportunity *research leads*, explicitly **unverified** and not represented as live vacancies.
- Country / keyword / technical-stream filtering, browser-local bookmarks and responsive mobile-first interface.
- Real **on-device** notification inbox in the Alerts tab: new official-source imports since your last visit and personal bookmarks within 7 days of their source closing date. No remote delivery or background alert service.
- On-demand and scheduled official **site reachability** checker restricted to a fixed allowlist. Reachability **does not** verify recruitment details.
- Installable simplified PWA shell under `/lite`, and full responsive six-tab version under `/`.
- Real shared community discussions, replies, and votes using a separate free-tier Cloudflare D1 database. Device-bound identity tokens prevent username-only impersonation; losing local browser storage loses your handle.
- Community now includes report buttons, personal export, post deletion and account deletion. Reports enter an unreviewed D1 queue; **public community launch still needs human moderation operations, privacy review and abuse-volume monitoring**.
- Self-hosted compiled Tailwind CSS 3.4.17, with source generator and portable CSS. Zero third-party browser runtime fetches.
- OpenAPI 3.1 contract at `/openapi.json` plus JSON catalog and health endpoints, strict Content Security Policy, no third-party client scripts, and no backend collection of candidate information.
- **Official-feed pilot:** one source-specific, daily-to-three-hour rotating adapter for the UK DfE's Teaching Vacancies open-data API. The source returns Schema.org `JobPosting` records; globalGOV only imports records with future `validThrough`, verified official-domain URLs, and required fields. These are **source-confirmed records, not individually verified job notices**.
- **Not implemented**: comprehensive global live vacancy coverage, verified admit-card/result ingestion, background delivery, recoverable cross-device accounts. Do not advertise these as live.

## API

- `GET /openapi.json`: machine-readable OpenAPI 3.1 contract for external tools and agents.
- `GET /api/health`: worker health and version.
- `GET /api/catalog`: official source registry, unverified leads and an empty verified listing dataset.
- `GET /api/check?id=upsc`: on-demand reachability for a registry entry. Public API rejects arbitrary URLs.
- `GET /api/source-status`: persisted reachability status, freshness and last check timestamp for the 58 known source URLs.
- `GET /api/notices`: separate DfE official-feed notice records with server-side pagination, search and inferred job category.
- `GET /api/ingestion-status`: latest source-ingestion outcomes; a failed import never fabricates vacancy data. Read-only inspection only.
- Community API: register / posts / post / reply / vote / report / export / delete-post / delete-account. Posts and replies are held in D1; no third-party account provider.

## Deployment

Entry: `apps/govexam-radar/worker.js`. It exports the standard Fetch API Worker handler and imports seven first-party runtime modules, including compiled CSS. Deploy it as an ES module Worker initially named `hqventures-govexam-parity-preview` (the deploy helper's safe default). Override `GOVRADAR_WORKER_NAME` only after review;  Cloudflare D1 binding `DB` is required for community posts, replies and votes. No paid subscription, third-party runtime CDN or AI secrets are needed within Free plan limits. This can be done using Cloudflare's Workers API multipart-module upload, the Cloudflare dashboard or the self-contained `deploy.mjs` Node helper in this folder. Never place deployment tokens in GitHub code or user-facing pages. For an ongoing CI deployment, configure protected GitHub secrets.

To deploy from a local clone with Node.js 22+, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the **local environment** and run `node apps/govexam-radar/deploy.mjs`. Keep write permissions scoped to this Worker.

## Testing

```bash
node --test apps/govexam-radar/worker.test.mjs apps/govexam-radar/source-monitor.test.mjs apps/govexam-radar/official-feed.test.mjs
```

GitHub Actions executes these tests on changes to this product. Smoke-test the independent Cloudflare URL before merging the PR or linking the product from the YorpHives site.

## Growing toward a full live employment product

1. Add source-specific connectors only for public feeds/APIs or permitted scraping and comply with terms and rate limits.
2. Store each notice with official document URL, source snapshot/hash, published/check times, closing date and a manual/automated verification state.
3. Quarantine uncertain notices; never infer open status from a portal being reachable. Re-verify expiry and eligibility against **each specific posting**.
4. Add audited storage (portable SQLite schema; Cloudflare D1 may be an optional managed adapter), scheduled ingestion and a founder/reviewer queue.
5. Improve opt-in browser-local vacancy watching and on-device alert history. Do not implement an email notification service or claim off-device delivery.
6. Add authenticated, moderated community only after secure identities, rate limits and abuse handling exist.

## Cost and ownership

The Worker Free plan has request and CPU caps; zero cost applies **within free-tier quotas**. To support large-scale static traffic, move CSS/HTML/JS to Workers Static Assets while retaining optional API functionality. Source, UI, catalog and logic can be moved to another standards-compatible host; there is no paid AI or closed API dependency.

© HQventures. Independent product; not affiliated with government recruiting organizations. Repo license applies.

### Deployment DB binding

`DB` → `b1f499a6-283b-47e8-8cd7-ef2b5f7245bc` in account `69234e51e08d8013980a7ff869746609`. D1 schema: `members`, `posts`, `replies`, `votes` plus indexes. Source domain, account and DB identifiers are not secrets; API credentials must never enter source code. The staging Worker is `hqventures-govexam-parity-preview` and the established independent globalGOV Worker is `hqventures-govexam-radar`.

## Scheduled monitoring (verified source availability only)

- The **staging** Worker has Cloudflare Cron Trigger `0 */3 * * *` (UTC): six of 58 portal URLs per run, prioritizing the least recently checked. Full directory reachability normally rotates in approximately 30 hours; URL reachability does not verify job vacancies.
- No browser session or AI model needs to stay online. The D1 tables `portal_status` and `portal_history` hold 30-day reachability history. See `portal-status.sql` for a portable SQLite schema.
- A successful HTTP response, including redirect, means the **site responded**. It is never evidence that a vacancy exists or that a listed examination is current. Some government sites reject automated checks; those are explicitly flagged as restricted or unconfirmed.
- Free-tier quotas, external website policies and rate limits remain binding. Monitoring cadence may be reduced if required. Do not add large-scale scraping without source permissions.

## Community safety and ownership

- Every community participant uses a browser-bound random credential; user handles alone cannot authenticate. No email address is required for discussion.
- A member may report any other member's post or reply; `reports` is a *review queue*, not a claim of automatic moderation. The founder must review reports before broad public launch.
- Members can download their own post/reply data, delete their own thread (including its replies), or permanently delete their community account. This removes their own content and any replies by others under their threads.
- No public administrative mutation endpoint exists. Staff moderation/abuse policy, resilience and privacy review remain launch blockers.

## Official-feed pilot: UK Department for Education (DfE)

- Official source: https://teaching-vacancies.service.gov.uk/api/v1/jobs.json (the public JSON read endpoint). This is **not** the DfE's authenticated ATS/publisher API. Live compatibility confirmed on 16 November 2026 via a one-shot HTTP 200 read; response includes `data` (Schema.org JobPosting) and `meta.totalPages`.
- Licence/terms: https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions and Open Government Licence v3. Listings may be reused, but no fee or commission may be charged for contacting, interviewing or hiring a respondent. Include attribution and a link to the original posting.
- Each scheduled read requests only **one page** (up to 100 records) and rotates a persisted page cursor. This is a **limited sample**, not complete or instantaneous collection of all DfE vacancies.
- Mandatory provenance: HTTPS URL on the exact `teaching-vacancies.service.gov.uk` host under `/jobs/`, title, employer, future closing timestamp, source ID, first/last seen, and a SHA-256 field summary. The feed is never used to infer foreign citizenship eligibility.
- Store in `official_job_notices`, audit in `source_ingest_runs`, and page cursor in `source_feed_cursors`; all described in the portable SQLite migration `official-notices.sql`. The deployed staging Cloudflare D1 already has the migration applied.
- Cron `20 */3 * * *` runs the official job adapter; existing `0 */3 * * *` remains exclusively for portal website reachability. D1 read endpoints do not trigger upstream requests; visitors cannot force scraping.
- The implementation fails closed on wrong schema, non-JSON, unexpected redirect, source restriction, excessive response size, wrong domain, stale closing timestamp, or database error; prior records are not silently deleted.
- Do **not** refer to source-confirmed imported notices as individually verified, automatically checked for right-to-work, or proof that the job is still open. All hiring conditions must be checked on the original posting.
- The data feed does not cover UPSC, SSC, RRB, JPSC or other Indian exam notifications. Those remain directory links and historical sample leads until suitable legal, authentic public sources are integrated separately.

### Pilot verification — 16 November 2026

- The UK DfE official JSON feed returned HTTP 200 with a Schema.org `JobPosting` `data` array, 100 items and 62 pages. All 100 records in the first page passed strict validation in a GitHub Actions read-only probe.
- A one-time, audited, source-provenance preserving bootstrap placed 100 official-feed records into the isolated Cloudflare D1 database. The browser and HTTP integration checks confirmed imported records can be read and bookmarked.
- Current draft PR CI passed at 320, 375, 768, 1440px and on live preview mobile. These records remain **source-confirmed, not independently verified**, and the pilot is not yet exhaustive.
- The bootstrap was a single operation. It does **not** prove the future Cron Trigger can fetch this source from Cloudflare; observe and independently verify the first scheduled ingestion outcome. Until then, scheduled ingestion is configured but not operationally proven. Until then do not claim unattended recruitment synchronization is operational.
- The experimental minute-frequency schedule was removed. Only conservative 3-hour recurring checks remain enabled on the separate staging Worker. No production website files were changed.

## Phase 3: Major country state/provincial/territorial jobs (v2.5)

- Verified directory: **58 official government recruitment portals** in **11 countries**, including regional and city employers where available, with country, government-level and state/province/territory filters and device-local official-portal bookmarks. A portal is not an imported vacancy or proof of current openings.
- **Two actual official-source datasets** (as of 16 November 2026): **100** records from the UK Department for Education Teaching Vacancies JSON public-data feed (**public education**, not asserted to be civil service); **53** records from the **Manitoba provincial civil-service RSS** (56 published feed items read; 53 valid, 3 rejected). Both preserve source URLs, employer, jurisdiction, closing date and SHA-256 provenance. All records remain individually **unverified**.
- Manitoba RSS published by the Government of Manitoba: `https://jobsearch.gov.mb.ca/rss/newJobPostingsFeed.rss`; the official directory of government RSS feeds: `https://jobsearch.gov.mb.ca/rssFeeds.action`. Date-only deadlines are displayed as calendar dates, not precise closing times; always check official source.
- To add a source with no machine-readable feed or no closing-date information: add its **official recruiting portal only**. **Never fabricate vacancies, closing dates, qualifications or citizenship eligibility**. Inspect use rights and format before introducing a source-specific read adapter.
- Two bounded ingesters run via scheduled Worker events: `20 */3 * * *` for UK DfE (one page at a time) and `40 */3 * * *` for Manitoba (up to 15 notices per pass). These triggers are configured, but **reliable unattended runs are not yet proven**; D1 currently records verified one-time bootstraps, not confirmed recurring executions. Future source additions must be individually audited for access and rate limits.
- All read APIs are labelled: `/api/jurisdictions` (58 directory sources), `/api/notices` (actual imported source records with country, source, province and stream filters), `/api/notice-changes` (official source-observed title/deadline changes only), `/api/ingestion-status` (read-only audit), `/api/source-status` (reachability only).
- Notice expiration runs on observed source closing timestamps. Missing records from partial pages are **never** declared withdrawn without reliable official withdrawal evidence. Revision history is retained in `notice_revisions` and cleaned up after 90 days.
- Migrations: `official-notices.sql`, `official-notices-jurisdictions.sql`, `official-notices-revisions.sql` and `moderation.sql`. SQLite/D1 compatible; no proprietary agent orchestration.
- **Human moderation:** `/moderation` interface, `/api/moderation/reports`, `/api/moderation/decide`, `/api/moderation/hidden`, `/api/moderation/restore`. All actions require the founder-only `MODERATOR_TOKEN` secret, and return `503` when it is not configured; no privileged guest access, no HQ agent access.
- **Device-to-device bookmark portability:** the Saved tab can export and import a validation-controlled JSON file with official job bookmarks, saved state/province/government portals and prototype example bookmarks. This is local-only, does not require accounts, and never exports community credentials or stored email settings. For changes to appear immediately after importing, reload the page.
- **Still pending:** independently verified unattended Worker Cron source access, authentic live recruitment ingestion for Indian PSCs and all remaining subnational portals, admit-card/result change detection, browser-local alert history and honest visible-tab monitoring (no email transport), cross-device account recovery, scalable regional directory vetting and user-facing launch privacy/terms.

### Release boundary

This remains an isolated Cloudflare staging Worker plus a **draft GitHub pull request**. The main branch and `yorphives.com` have not been modified by this phase. Stay within Cloudflare's free-tier request/D1 allowances or migrate the portable runtime to the owner's server.


## Phase 1 source automation pilot — 16 November 2026

- The staging Worker has three explicitly configured schedules: source-site reachability (`0 */3 * * *`), the DfE jobs JSON page reader (`20 */3 * * *`), and the Manitoba civil-service RSS reader (`40 */3 * * *`). A scheduler being configured is **not** proof of successful unattended import.
- The first scheduled UK and Manitoba attempts both recorded `network_error` from the Worker. The bounded, same-official-host redirect/retry fixes are now deployed to the **isolated preview**, but recurrence after the fixes must still be demonstrated by successful source-specific D1 audits.
- `GET /api/ingestion-status` now returns `automation.observedForAllSources` and `automation.healthy`, excluding `bootstrap-*` one-time imports. The frontend does not call a bootstrap or failed fetch a healthy live sync.
- A new adapter can read only minimal date-labeled entries from India's official Employment News index. Its read-only government site probe returned HTTP 200 and parsed two future-closing summaries from the current snapshot. Because prior written permission for commercial republication has **not** been established, the **India importer is deliberately not scheduled or bootstrapped**. Never claim its listings are available in globalGOV before that changes.
- Consult `PHASE1_RELEASE_GATE.md` for the evidence, policy review and remaining release conditions. Prefer officially reusable open datasets under India's Government Open Data License or direct authorized recruitment feeds rather than assuming all official websites grant commercial republication rights.
- Keep deployment portable: the modules use standard Fetch APIs and SQLite-compatible D1 SQL; any fallback collector must remain first-party and independently verified. No production YorpHives website deployment was made.


## Phase 1 status (16 November 2026): portable official-source fallback

- Source collection targets the UK Department for Education public JSON feed and the Government of Manitoba provincial RSS. Imported source data remains unreviewed until separately validated.
- The staging Worker provides a read-only `GET /api/collector/plan` with source cursor state and a **disabled-by-default** `POST /api/collector/ingest` receiving only cryptographically signed source snapshots.
- The bridge reuses the existing official-feed validation, preserves provenance, enforces byte caps and exact DfE page cursors, rejects unsupported sources and duplicate request IDs, and signs messages for the intended destination hostname.
- Source-ingestion audits identify `signed_portable_collector` separately from Worker scheduling. Signing keys never belong in GitHub source or site JavaScript.
- The platform-independent `collector-client.mjs` runs on Node 22 with no third-party packages. It fetches both feeds independently, retries transient upstream failures and publishes only when `GOVRADAR_COLLECTOR_KEY` is configured. Otherwise `--dry-run` reads and validates source data without updating D1.
- The GitHub Actions workflow `.github/workflows/govradar-portable-collector.yml` runs **read-only** in pull requests. Scheduled publishing requires that the workflow be released to the default branch and the founder install the matching Cloudflare `INGEST_HMAC_KEY` Worker secret and GitHub `GOVRADAR_COLLECTOR_KEY` Actions secret. Until then, background fallback is **not activated**.
- Employment News India is limited to source directory and read-only parser testing because rights for commercial republication have not been established. No India ingest trigger is configured; no Indian vacancy records have been imported by this phase.
- Existing `yorphives.com` deployment and the repository default branch are deliberately unchanged. Track release blockers and evidence in `PHASE1_RELEASE_GATE.md`.

## Founder-original global product scope

The six-section global app, not the UK-only candidate, is the product blueprint. See [`ORIGINAL_VISION_IMPLEMENTATION.md`](./ORIGINAL_VISION_IMPLEMENTATION.md). No email collection, mail transport or remote alert service is in scope. The UK isolated Worker remains a source/safety release proof. Existing exam sample records are research leads, not verified live announcements.
