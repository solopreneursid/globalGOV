# GovRadar — Private UK mirror scheduler (staging)

**Installed on 2026-11-16. No public production release.** This is the write boundary for the UK-only candidate, independent of YorpHives HQ and `yorphives.com`.

## Deployment and isolation

| Component | Exact role |
| --- | --- |
| `hqventures-govexam-parity-preview` | Existing official source ingest Worker; retains one consolidated Cron `*/20 */3 * * *` and its existing encrypted HMAC Secret |
| `hqventures-govradar-uk-mirror-watch` | **NEW private scheduled mirror Worker**; has `scheduled()` only, **no HTTP fetch entrypoint**, no workers.dev URL or custom domain, zero Secrets |
| `SOURCE_DB` | D1 binding to shared *staging* research database `b1f499a6-283b-47e8-8cd7-ef2b5f7245bc`. Background code performs **SELECT only**; no community data is selected or copied. Note: D1's binding itself is not read-only at infrastructure level. |
| `MIRROR_DB` | D1 binding to isolated UK candidate `c5e0b548-528c-4698-a172-a527abf68e27`. Only the background Worker writes UK notice rows and private sync metadata |
| `hqventures-govradar-uk-isolated-preview` | **Public-facing staging candidate**, one `DB` binding to the isolated UK database, zero Secrets, zero Cron. Only approved GET routes; no write SQL |
| Scheduler | `55 */3 * * *` UTC; **55 minutes past every third UTC hour**. Runs after the 20-minute UK and 40-minute Manitoba ingestion slots, with no new HQ dependencies |

The account moved from **4 to 5 configured Cron triggers**. None of the other four schedules were changed. Workers Paid was already founder-approved as a modest development cost. **Five configured schedules are not evidence of usage billing; keep checking account usage.**

## Data controls and recovery

- Exact source rights gate: **UK Department for Education Teaching Vacancies only**, not a blanket government or OpenMB licence. The three canonical UK URLs (`source_page`, `source_ref`, `apply_url`) must all stay on the official Teaching Vacancies jobs host/path.
- Refuse a run if the **latest native UK DfE Cron source attempt** was unsuccessful, not genuinely scheduled, or more than **six hours old**. A GitHub signed upload does not satisfy this source-health check.
- Read source rows via **last_seen_at/id keyset cursor**, bounded by a high-water timestamp and a maximum of **500 source rows per invocation**.
- Write via D1's transactional `batch()` using single-row upserts in groups of **20**, not huge SQL statements or unreliable row-by-row public APIs.
- Maintain `uk_mirror_state`: successful cursor, last attempt/success, latest native-source timestamp, sanitized error code, last row count and `ok`/`partial`/`error`.
- Maintain `uk_mirror_runs`: scheduled event ID (unique), start/finish times, rows upserted, sanitized state. Duplicate Cron events are refused by atomic `INSERT OR IGNORE`.
- On a failure, leave the last successful cursor **unchanged**, log a failure, and retry idempotently at the next schedule. Unexpected unapproved rows stop the run; no silent source-missing deletions.
- No applicant or community data is copied; the UK D1 contains only `official_job_notices` plus **three private lifecycle/operations tables**: `uk_mirror_state`, `uk_mirror_runs`, and `uk_withdrawal_checks`. No community or HQ tables are present.
- The isolated public `GET /api/freshness` exposes only safe recency status: `pending`, `current`, `delayed`, `unavailable`; it never emits database IDs, credentials, raw errors or private run IDs. Its `current` state requires a recent successful mirror and recent native UK source import.
- The UI reports freshness cautiously and always links users to the official source. It does **not** claim that every vacancy has been verified or that a production release is authorized.
- SQL schema recorded in `uk-mirror-schema.sql`. Logic is first-party ESM using SQLite-like SQL, with reusable Node/D1 tests; it does not require a third-party SaaS collector.

## Official vacancy lifecycle safeguards (staging)

- **Expiry:** Every private mirror run applies `closing_at <= current UTC time` to the UK-only mirror, marking expired listings regardless of whether `last_seen_at` changed in the paginated source feed. Public notice SQL independently excludes both non-open states and past deadlines.
- **Conservative withdrawal:** Only candidates at least **48 hours since last seen** with an unexpired closing date are eligible for a bounded direct official-site check. Maximum **four GET requests per three-hour Cron**; only the original HTTPS `teaching-vacancies.service.gov.uk/jobs/` URL is queried, with no cross-origin redirects followed.
- **HTTP outcomes:** a 200 resets prior suspicion; a 404 is **not** conclusive and records a founder-review flag only after two independent checks; a direct 410 is only conclusive after **two separate observations at least three hours apart** and no newer source observation. 429, 403, 5xx, timeouts, redirects and network failures do not count as proof.
- **Evidence retention:** `uk_withdrawal_checks` stores the URL-observation code, source `last_seen_at` value, bounded proof count, last-check time and review flag. Only the private scheduled Worker writes this table. No public API exposes evidence internals.
- **No silent deletion:** `withdrawn_confirmed` remains in the D1 database for audit. Public notice queries require `life_status='open'`; the confirmed-withdrawn row therefore disappears from search results without a destructive delete.
- **Recovery:** A new genuine official-feed observation can supersede an old withdrawn state. Upserts explicitly prevent a stale or equal-timestamp source copy from silently reopening a previously confirmed withdrawn listing. An old, disappeared or omitted feed-page record never triggers a delete.
- **Testing:** `uk-mirror-lifecycle.test.mjs` covers one-page omission, deadline expiry without updated cursors, single and repeated 404/410, minimum time separation, source reappearance, error responses, spoofed URLs and the four-probe limit. Tests run in CI.
- **Remaining review:** An intermittent 404 can indicate a genuine withdrawal, but is deliberately **not auto-confirmed**. Founder review should resolve such records before commercial launch; these checks are not a claim to independently verify every job in the feed.

## Verification and limits

- GitHub CI includes `uk-mirror-worker.test.mjs` and `uk-mirror-status.test.mjs` covering source approval, native freshness, resumable cursor, duplicate schedule, safety limits, public read-only status, and absence of a fetch handler.
- Cloudflare staging configuration was independently read after deployment: private Worker has exactly two D1 bindings, zero Secrets, no public workers.dev subdomain, and the exact one Cron expression above. The public UK candidate has one isolated D1 binding, zero Secrets, zero Cron.
- **Do not claim a successful unattended UK mirror before at least one real `uk_mirror_runs` event finishes with `state=ok`.** A configured schedule, unit test and initial manual data copy are different evidence.
- The first scheduled opportunity after configuration is **2026-11-16 18:55 UTC (2026-11-17 00:25 IST)**. Cloudflare Cron propagation can take up to 15 minutes. Future scheduled success must be observed from private D1 audit and the sanitized public freshness status.
- Read-only operator verification from Cloudflare D1:
  `SELECT id, scheduled_at, state, rows_upserted, error_code FROM uk_mirror_runs ORDER BY scheduled_at DESC LIMIT 6`
  and `SELECT status,last_success_at,last_native_source_at,last_rows_upserted FROM uk_mirror_state WHERE id=1`.
- **Non-destructive withdrawal evidence is now implemented in staging**, but has not yet been demonstrated during a completed unattended mirror run. Missing records from a partial official feed never imply withdrawal. A direct HTTP 404 is review-only even after repeated checks. Two independent direct HTTP **410 Gone** responses, at least three hours apart with unchanged official-source evidence, can mark a listing `withdrawn_confirmed` without deleting the row. A broader confirmed-removal, reappearance, moderation and restoration workflow remains a public-release review gate.
- **Do not merge either draft PR or attach this isolated preview to a public domain without founder review.** Staging Workers, HQ Workers, secrets, `yorphives.com` and Cloudflare billing were not changed except the two GovRadar staging components described here.

## Rollback

If a source-specific incident occurs, disable **only** the `55 */3 * * *` schedule on `hqventures-govradar-uk-mirror-watch` and preserve both D1 databases and their data. Never delete HQ jobs, clear the shared database, rotate unrelated Secrets, or restore the shared D1 as a first response. Investigate source and mirror audit rows, then use a founder-approved safe rollback with explicit data-loss assessment if necessary.
