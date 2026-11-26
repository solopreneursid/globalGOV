# GovRadar — Isolated UK-only release candidate

Date: 2026-11-16. **Non-production**, independent of `yorphives.com`, YorpHives HQ, and existing GovRadar research Worker.

## Staging architecture (verified)

- Dedicated first-party Cloudflare Worker: `hqventures-govradar-uk-isolated-preview`.
- Staging URL: https://hqventures-govradar-uk-isolated-preview.solopreneursid-proy.workers.dev/
- Dedicated D1 (not shared with community): `govradar-uk-candidate-preview`, ID `c5e0b548-528c-4698-a172-a527abf68e27`.
- **Exactly one binding** on this Worker: `DB`, pointing only to the UK-specific D1.
- **Zero Secrets**, **zero Cron schedules**, no site routes, no custom domain. Enabled `workers.dev` solely to allow a founder-visible staging URL. Pages and existing Workers unchanged.
- D1 initially received **185 UK DfE source-observed notices** from the official-feed staging table. After the independently verified 15:20 UTC native UK DfE Cron import of page 3 (100 accepted, source cursor advanced to page 4), a controlled, source-validated refresh copied new/revised records into the isolated D1. At **15:27 UTC** the original source and isolated D1 each contained **250 distinct UK records**, with **zero non-UK rows**. This refresh was **manually executed and audited**, not unattended. SQL table-level `CHECK` constraints reject any source other than `uk-dfe-teaching-vacancies`, any country other than `United Kingdom`, and any source URL outside the official Teaching Vacancies jobs prefix. The isolated D1 contains **one public application-data table**, `official_job_notices`, plus three **private** mirror/lifecycle tables (`uk_mirror_state`, `uk_mirror_runs`, `uk_withdrawal_checks`) and Cloudflare internal metadata. There are **no Manitoba, India, HQ or community application rows or tables**.
- The source was not modified or deleted by copying. Import into the isolated D1 was done in batches of **four rows per SQL call** to respect the D1 bind-variable limit. The isolated UK dataset was subsequently reconciled to 250 records after the second native Cron import, without any unapproved-source rows.
- Standalone handler: `uk-release-worker.mjs` (separate entry point) importing `official-feed.mjs`, `source-rights.mjs`, `uk-release-db.mjs` and the first-party UK preview UI.
- Scope of permitted routes is explicitly limited to the homepage, first-party CSS/JS, `/robots.txt`, `/openapi.json`, `/api/health`, `/api/notices` and the UK-only API alias. The existing collector, community, moderation, research, admin, alert, exported source and other app endpoints are **absent (404)**. All non-GET methods are denied (405).
- D1 access is further restricted by `readonlyOfficialNoticesDb`, which only exposes `SELECT ... FROM official_job_notices` query methods. `run`, `batch` and raw D1 writes are not exposed to the HTTP handler.
- Both SQL row/count queries also include `source_id IN (?)` with the **UK-only allowlisted source**, independent of the D1 table `CHECK` constraints. Unapproved source selectors fail HTTP 403.
- Response metadata remains `releaseProfile=uk_only_release_preview` and `publicLaunchAuthorized=false`; robots and HTTP headers explicitly request no indexing. No application flows, signups, payments, emails or user data collection are enabled.
- Strict security headers, a first-party-only CSP, safe URL validation and DOM `textContent` rendering guard against upstream HTML and unauthorized outbound script dependencies.

## Current limitation: dataset freshness

**The 250 records are a manually refreshed staging snapshot, not an automatically synchronized public feed.** The isolated Worker intentionally has no ingest route, scheduler or database write capability. A portable first-party synchronizer is now available as `uk-preview-sync.mjs` with default read-only dry-run, UK-only source validation, <=84 SQL parameters per batch, explicit founder approval for `--apply`, no silent deletion of source-missing rows, and reconciled target counts. **The new private scheduled mirror is configured and deployed, but its first genuine unattended execution has not yet been observed.** The separate `hqventures-govradar-uk-mirror-watch` Worker uses two D1 bindings, no public HTTP endpoint, no Secrets, and a `55 */3 * * *` UTC Cron. It validates the most recent native UK feed import, moves approved records by a resumable cursor, and logs errors without advancing the cursor on failure. We must verify an actual successful scheduled run before claiming an automatically current dataset. The UK-only API filters outdated or expired records; it must not silently present stale dates as live opportunities.

Automated cross-database synchronization is enabled only on the **private staging mirror Worker**, with a separate audit; do not grant write access or Cron scheduling to the public-facing Worker, and do not merge a fallback workflow onto the default branch without founder review.

## Founder-controlled manual UK snapshot maintenance (optional fallback)

From `apps/govexam-radar` on an owner-controlled Node.js 22+ machine with a private Cloudflare API token and Cloudflare account ID supplied through environment variables:

- `npm run uk-mirror:dry-run`: source-verified, read-only comparison; returns counts only. This is the default behavior even when no option is passed to the Node script.
- `GOVRADAR_UK_SYNC_APPROVED=YES npm run uk-mirror:apply`: explicitly authorizes an upsert of **UK source-only** records into this staging mirror. The approval environment value does **not** waive account identity, source-rights, URL, database, row-count or schema checks.
- Never put Cloudflare API tokens into a repository, browser, public workflow log or web page. Use a narrowly scoped token, keep it private, and revoke it if compromised.
- The current script does **not** delete records if the source has fewer rows or withdraws notices; instead it rejects orphaned records for a founder-reviewed reconciliation. A future production mirror must define safe withdrawal and tombstone semantics with audit trails.
- A manual mirror update is not evidence of scheduled feed reliability. A separate reviewed synchronization architecture and deployment control is required for a commercial release.

## Automated private UK sync (no public write access)

See `UK_PRIVATE_MIRROR_OPERATIONS.md` for the complete private scheduler inventory, source-freshness gate, bounded D1 batches, audit state, rollback procedure and first-run verification requirements. Its schema is versioned in `uk-mirror-schema.sql`. The isolated public `/api/freshness` endpoint reveals only safe status values; it cannot trigger ingestion or database writes.

## Expiry and withdrawal safeguards

- The **private**, non-public UK mirror Worker now reconciles closing dates each scheduled run, even where a source record's `last_seen_at` has not changed. Confirmed withdrawals are non-destructive and excluded from visitor results by the existing `life_status='open'` SQL policy.
- Missing jobs from a single or partial DfE feed page are **never** treated as withdrawn. Direct official page checks occur only for unexpired jobs more than 48 hours since the last feed observation, maximum four per 3-hour cycle.
- HTTP 404: evidence retained and flagged for founder review after a second independent observation; **no automatic withdrawal**. HTTP 410 Gone: a second confirmed response after at least three hours, with unchanged canonical source evidence, can mark `withdrawn_confirmed`. HTTP failures, redirects, rate limits or unverified sources never justify withdrawal.
- Rows and evidence remain available privately for audit; no public write or admin endpoint was added. Stale source-copy upserts are prevented from silently reopening confirmed withdrawals.
- The code, migration and extensive safety tests are deployed **only to the staging private mirror Worker**. **The first unattended execution of this lifecycle version has not yet been observed**; public launch remains blocked by that evidence and broader compliance/recovery review. Details: `UK_PRIVATE_MIRROR_OPERATIONS.md`.

## Safe isolated-Worker redeployment

`uk-release-deploy.mjs` is a dependency-free Node 22+ Cloudflare REST adapter for the **existing isolated staging Worker only**, not a general production deployer. No YorpHives site domains, HQ Workers, additional Cron triggers, or research Worker settings are changed.

- `npm run uk-deploy:dry-run`: read-only inspection of the exact Cloudflare account/Worker name, UK-only D1 identifier, table inventory, UK-only rows, existing `workers.dev` subdomain, Secrets and Cron inventory. Requires a private account ID and narrowly scoped Cloudflare API token through environment variables.
- `GOVRADAR_UK_STAGING_DEPLOY_APPROVED=YES npm run uk-deploy:apply`: an explicitly approved **staging-only** Worker redeployment. It requires exactly one D1 binding, no Secrets, no Cron, no community tables, no non-UK records, and a subdomain configured to serve only the isolated staging version.
- The deployer packages exactly seven first-party modules and uses strict binding-inheritance protection on upload. It independently checks all forbidden bindings after upload. It never copies `INGEST_HMAC_KEY` into the public-facing candidate.
- Any future launch at a public domain requires a separately reviewed production deployment plan and founder authorization; **this command does not publish to a domain**.

## Quality assurance

- Node unit tests in `uk-release-worker.test.mjs`: route allowlist, denied write/research paths, zero D1 writes, accepted UK records and accurate totals, denied Manitoba/India, query-string bypass attempts, no fabricated records without D1, minimal OpenAPI and noindex/CSP.
- Chromium browser tests in `uk-release-browser.test.mjs`: 320, 375, 768 and 1440 px, XSS text safety, official source URL and page overflow, denied community/collector/moderation paths.
- Independent CI staging smoke checks verify the **actual** isolated `workers.dev` URL for allowed routes, blocked routes, noindex, source metadata and UK-only row results.
- The existing GovRadar PR and `main` remain separate: no merge and no production `yorphives.com` deployment.
- UK DfE data reuse remains conditional on the Teaching Vacancies terms and Open Government Licence v3.0; no application, contact, interview or hiring fees are charged. Manitoba and India rights are not assumed.

## Remaining launch conditions

1. **Initial two-cycle Cron gate satisfied** on 2026-11-16 at 15:41 UTC: UK and Manitoba each have two audited, independent native successful scheduled imports and the gate calculation returned true. Continue observing scheduled runs across days; a two-cycle pass is not proof of permanent reliability.
2. **Private UK mirror implemented and scheduled in staging** (55 minutes past every third UTC hour). Its exact URL-free Worker and source/target D1 bindings were verified, but **the first completed native scheduled mirror still needs independent D1 audit proof**. Confirm recency, failure recovery and the stale-record/withdrawal policy before public release.
3. Confirm all security, privacy, accessibility and source compliance checks, with explicit release approval. The founder controls domain association, go-live, rollback and monetization.
4. Noindex and `publicLaunchAuthorized=false` are mandatory in this staging candidate. Public SEO/indexing is a separate founder-approved decision.
5. Cloudflare Workers Paid is currently accepted as a modest development cost; monitor metered requests/CPU/D1 usage and keep architecture portable to owner-operated Node/SQLite.

**Status: independent UK-only staging deployment with first native two-cycle gate passed; not yet a production-ready, automatically refreshed commercial product.**
