# GovRadar Phase 1 — verified reliability, free-tier and recovery controls

Date: 2026-11-16 (UTC). **Staging-only**, PR #7. No changes to `main`, `yorphives.com`, or deployed HQ Workers.

## Scope and restrictions

- Cloudflare account: `69234e51e08d8013980a7ff869746609`.
- Only GovRadar staging Worker: `hqventures-govexam-parity-preview`.
- Shared GovRadar D1: `b1f499a6-283b-47e8-8cd7-ef2b5f7245bc` (`hqventures-govradar-community`). This is **not** a disposable database; it contains community and catalogue data.
- Never test a destructive restore, migration, or data reset on the shared D1. Never export personal data to public CI logs. A Cloudflare Time Travel restore **overwrites the database in place**, and Cloudflare does not currently support cloning it via Time Travel.
- Keep Cloudflare `INGEST_HMAC_KEY` encrypted and preserve the D1 binding using `{type:"inherit",name:"INGEST_HMAC_KEY"}` with `?bindings_inherit=strict` in any staging deployment.
- India Employment News is research-only; **do not publish or schedule India ingestion without resolving commercial reuse terms**.

## Real unattended Cron evidence and two-cycle release gate

D1 `source_ingest_runs` is the source of truth, not successful Worker-invocation logs.

| Source | First audited native scheduled success | Audit proof |
| --- | --- | --- |
| UK DfE | 2026-11-16 12:20:37 UTC | Page 2, 100 accepted, cursor page 3, `origin=scheduled` |
| Manitoba | 2026-11-16 12:40:29 UTC | 15 accepted from eligible RSS; cursor advanced, `origin=scheduled` |

One-time authenticated GitHub collector tests (`origin=signed_portable_collector`) are **not** native Cron evidence. Initial one-time bootstrap imports are also excluded.

`/api/ingestion-status` now reports both `automation.healthy` (last native success within 24 hours) and the separate **`automation.twoCycleCronGatePassed`**. The latter is true only when **both sources** have at least two native Cron successes in the past 8 hours, their last native attempt was successful, and that success is within 5 hours. This is only a *Cron reliability gate*, not overall launch authorization.

The next distinct native schedule windows from the recorded first successes are 15:20 and 15:40 UTC. A completed scheduled event can be late. Never fabricate second-cycle proof from a manual signed upload, an API health check, or elapsed time. Do not infer repeated operation from one successful cycle.

## Actual Cloudflare D1 usage observation

Cloudflare D1 usage endpoint `GET /accounts/{account_id}/d1/insights/databases` returned this 24-hour window:
`2026-11-15T12:58:12.387Z` to `2026-11-16T12:58:12.387Z`.

- All connected account D1 databases, including historical deleted drills: **633,878 rows read**, **8,928 rows written**, **15,161 queries**.
- GovRadar D1: **487,159 rows read**, **5,313 rows written**, **8,808 queries**.
- Three **currently active** D1 databases. GovRadar D1 size at check: **466,944 bytes**.
- Published Workers Free D1 allowances at verification: **5,000,000 rows read/day**, **100,000 written/day**, **10 D1 databases**, **500 MB per database**, **5 GB total account D1 storage**, **7-day Time Travel**. Do not assume all account services will stay within those allowances as traffic grows.
- **Cron quota issue resolved on staging**: The initial account inventory had **six configured Cron triggers** (three GovRadar + three HQ), above the published Workers Free limit of **five**. GovRadar's three were consolidated into one trigger `*/20 */3 * * *`, with a UTC `scheduledTime` dispatcher preserving the previous 0/20/40-minute slots every three hours. Cloudflare verified the **account now has four configured triggers**, with all three HQ schedules unchanged. The new configuration has passed unit routing tests; **actual future Cron executions after migration still need independent audit confirmation**. `schedule.mjs` provides an idempotent, staging-only reproducible configuration command.
- Workers request-count billing usage was **not verified**: the account's current Cloudflare OAuth connection lacks Billing Read, and `GET /accounts/{account_id}/billing/usage?metrics=workersRequests` was rejected with HTTP 403. Workers observability **log event counts are not request/billing counts**. The account subscription list is also inaccessible with this OAuth connection (Billing Read required).
- Do not add additional triggers without reviewing the shared account budget. Current configured Cron count is **4/5 of the published Free allowance**; the account plan and actual Workers billing request count remain unknown with the present OAuth permissions.

## One-Cron operational migration (staging only)

- New source constant: `GOVRADAR_SINGLE_CRON = "*/20 */3 * * *"`. It fires at UTC minutes 0, 20 and 40 only during UTC hours divisible by three.
- The Worker routes on `controller.scheduledTime` (the intended UTC time) instead of wall-clock invocation delay. Minute 0 runs portal checks, minute 20 runs UK DfE ingestion, minute 40 runs Manitoba RSS ingestion. Invalid/missing timestamp and any India job are rejected. The original three expressions remain recognized by the code during migration.
- The new Worker code was deployed to **only** `hqventures-govexam-parity-preview`, protecting `INGEST_HMAC_KEY` and the original D1 database binding. Cloudflare's schedule API then replaced the exact three old expressions with one new expression; `GET /schedules` confirmed only `*/20 */3 * * *`.
- The account inventory was independently re-read: GovRadar **one** trigger; HQ pilot `*/5 * * * *`, HQ native preview `*/15 * * * *`, HQ watchdog `*/30 * * * *` (all unchanged). **Four configured triggers account-wide.**
- To reproduce the staging-only configuration from owner-controlled Node 22 with private `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables, run `npm run schedule:staging` in `apps/govexam-radar`. It accepts only the exact pre-migration three expressions or the already-correct single expression; checks encrypted Secret and D1; refuses any other Worker/account or unexpected schedules.
- Because Cloudflare Cron updates can take **up to 15 minutes** to propagate, judge reliability by subsequent D1 audit rows, not immediate API configuration status. A Cron configuration success is **not** proof the next UK or Manitoba import succeeded.

## Completed isolated restore drill — no live data copied

Test database `govradar-phase1-restore-drill-20261116`, ID `04f36b9a-e072-4bac-b512-05ad40a02474` (now **deleted**):

1. Created a new D1 database, `version=production`, with only `recovery_probe(id,source_id,proof)`.
2. Inserted one fully synthetic record: `synthetic-001`, `synthetic-feed`, `recovery-d1-2026-11-16`; confirmed count 1.
3. Recorded D1's Time Travel bookmark.
4. Deleted the synthetic row and independently confirmed count 0.
5. Restored the **isolated test database only** using `POST /accounts/{account_id}/d1/database/{test_database_id}/time_travel/restore?bookmark=...`; restore reported success and prior bookmark.
6. Independently queried the test database; **synthetic row and contents recovered exactly**.
7. Deleted the disposable D1; verified it no longer appeared and the account again had **3 active databases**.

This establishes Cloudflare D1 point-in-time recovery **on a disposable database**, not application-level restoration of the shared GovRadar or HQ data. No real applicants, community users, or HQ records were exported, copied, deleted or restored.

## Controlled recovery procedure for a real GovRadar incident (requires founder decision)

1. **Observe first, don't mutate**: capture source error codes, newest `source_ingest_runs`, public API status, Worker version, D1 row counts, and current D1 bookmark. Verify the correct Worker and database IDs.
2. **Contain the incident**: do not automatically delete records, rotate production secrets, disable all HQ jobs, or restore the shared D1. A person must approve changes that would interrupt users or community data.
3. **Choose the least destructive option**: source failures often recover without restoring any database. For software-only failure, review rolling back **Worker code**, preserving current secrets and bindings. A Worker rollback does not roll back D1 contents.
4. **Before any shared D1 Time Travel**: obtain founder approval identifying the exact restore timestamp, estimated loss of writes since that point, community impact and rollback route; preserve an independent private export if authorized and available. Time Travel overwrites the live database and aborts in-flight activity.
5. **If an approved restore proceeds**, only the authorized operator may restore the exact GovRadar D1 ID through Cloudflare's dashboard or Time Travel API. Confirm row counts and source audit integrity afterward; do not expose source or community data in public logs. Save the previous bookmark to allow undo, subject to its retention validity.
6. **Validate services**: check both live source-import cursors and public disclaimers, community API health, Worker secret binding, and the read-only notice API. Restart or re-enable scheduled activity only after verifying integrity and founder approval.
7. **Post-incident audit**: record before/after state, affected users, row loss, cause, rollback/restore decisions and tests without storing secrets.

## Final production release blockers

- Two observed native scheduled successes per source within the defined gate, with no more recent native failure. **Not yet achieved at the time of the first reading (one per source).**
- **Workers Paid tier is confirmed by founder dashboard screenshots** (current plan, $5 USD/month base plus usage); founder permits using it while developing rather than insisting on permanent zero-cost hosting. Monthly included request usage showed 151.1K/10M and CPU time 406.73K/30M ms for the current billing period, with $0.00 additional usage fees. This is billing-period cumulative usage, not daily request consumption; continue checking cost exposure, especially because the dashboard showed no spending limit set. **Do not change the account plan without explicit founder authorization.**
- **Source-specific licensing/accuracy**: UK DfE is conditionally reusable under OGL; Manitoba Public Service Commission's reproduction terms appear narrower than the province-wide OpenMB licence, so commercial republication remains pending clarification; India remains research-only with no scheduled imports. The API and UI now label each source separately and prohibit implying a universal OGL licence. Founder must review before monetized release.
- Founder-reviewed release of the **currently draft PRs** to the appropriate deployment branch. GitHub signed collector's scheduled fallback still runs **only on a reviewed default-branch release**; do not claim it is already recurring.
- Continue verifying long-term reliability; a two-cycle gate is useful evidence but not proof of months of operation.

## Verified commercial-source attribution and portable release gate

- `source-rights.mjs` enumerates the UK DfE, Manitoba, and India source rights independently and prevents commercial release of sources with unresolved terms via `assertSourceRightsForCommercialRelease`. Production rollout must invoke an appropriately reviewed gate and remain founder-controlled; metadata labels or PR tests alone do not authorize a public monetized launch.
- UK terms: https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions
- Manitoba general OpenMB licence: https://www.gov.mb.ca/asset_library/en/legal/OpenMB-Information-Data-Use-Licence.pdf
- Manitoba Public Service Commission disclaimer: https://www.gov.mb.ca/csc/aboutpsc/disclaim.html
- Manitoba government permissions channel: https://www.gov.mb.ca/legal/permission.html
- Source metadata in `/api/notices` includes status, licence URLs, attributions, and an explicit boolean for commercial reuse; user-visible mixed-source listing attribution is restricted to the correct authority rather than treating UK OGL as globally applicable. Commercial release remains blocked pending rights review of Manitoba and India. No India rows have been ingested.
- The founder permits a lean **growth-based paid infrastructure** approach; optional Free-tier migration is no longer a release condition. All development should remain provider-portable and self-hostable.

## Official references

- Cloudflare D1 Limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
- Workers Limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 REST API: https://developers.cloudflare.com/api/resources/d1/
- Phase 1 detailed evidence: `PHASE1_RELEASE_GATE.md`.
