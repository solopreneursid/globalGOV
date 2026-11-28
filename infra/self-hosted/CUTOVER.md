# Owner-controlled globalGOV cutover

Status: **NOT APPROVED**. This is a release checklist, not authorization to switch traffic. The canonical and UK-only D1 databases, Workers, schedules and routing stay intact until all applicable gates are evidenced.

## 1. Preserve source data

- Export the canonical and UK-only D1 databases separately. An export is point-in-time; it is not a continuous replica. Record UTC timestamps, source database identity, and SHA-256 of the downloaded bytes on the owner-controlled host.
- Treat exports as confidential. The canonical database includes community records and credential hashes. Store in a directory with mode 0700 and files with mode 0600. Do not put SQL, signed URLs, encryption keys or owner data in Git, public CI artifacts or logs.
- Run the canonical offline encryption and validation tool and retain its encrypted archive plus the key in separate protected storage. Use the canonical importer in plan mode, then apply only against a dedicated empty rehearsal database. Save aggregate counts and checksums privately.
- Preserve the UK snapshot independently. Its four application tables are official_job_notices, uk_mirror_runs, uk_mirror_state and uk_withdrawal_checks; the UK-only constraints and audit state must not be silently discarded or merged into the canonical database. A separate verified import and isolated preview runtime are required before retiring the UK deployment.
- Reconcile local evidence SQLite files and browser-local saved items separately. Do not claim they are included in D1 exports.

## 2. Rehearse on a dedicated Linux host

Use an isolated Compose project, unique database name and non-public test origin. Generate unique secrets locally; never send them through chat. Run the migration and encrypted snapshot importer before starting any writers. Keep the new scheduler and collectors stopped during data parity testing. Do not point any rehearsal component at a live database.

CI synthetic rehearsal is not owner-data verification. Require a successful encrypted export readback, SQLite integrity/foreign-key checks, schema compatibility, all canonical table counts/checksums, identity-sequence checks, and a real PostgreSQL restore. Any mismatch blocks cutover.

## 3. Parallel acceptance

- Compare the canonical Worker and self-hosted Node runtime using the same snapshot and equivalent release profile. Run route/HTTP status, response schema, source scope, notices, filtering, pagination, revisions, provenance and paused-community checks.
- Compare database row counts and checksums against the same point-in-time snapshot, not a concurrently changing staging database. Report legitimate source changes separately.
- Test browser layouts at 320, 375, 768 and 1440 px and verify physical accessibility separately. Verify browser-local saved items and export/import across origins.
- Run separate permission and isolation checks on the UK-only runtime. No research/community data may become visible.
- Verify independent monitoring, disk limits, app restart, PostgreSQL restart, encrypted backups, off-host copies and restore from the off-host copy. Check restored data and document hashes, not merely that pg_restore exits successfully.
- Verify source-policy approvals, direct official-source access and at least two scheduled cycles per enabled collector. Do not run unauthorized source probes. Parallel testing must not create duplicate upstream polling.

## 4. Final cutover

The owner must approve a recorded release commit, destination host, maintenance window and rollback plan. Establish an agreed RPO/RTO and rollback retention window before changing DNS.

1. Freeze old-system writes and record the final high-water marks. Preserve the old deployment configuration and database snapshots. Do not delete source data.
2. Export and reconcile a final snapshot or verified delta; do not overwrite the rehearsal database or silently discard changes. Validate against an empty final target.
3. Start the new stack, verify readiness, TLS, routing, data and security boundaries, then enable approved scheduling on exactly one system.
4. Switch traffic only with explicit owner authorization. Record previous DNS values and monitor health and errors.
5. If any mandatory gate fails, stop cutover. Restore routing to the previous verified environment if traffic has changed. Reconcile any writes accepted by the new system before resuming old-system writes; DNS rollback alone does not recover database state.
6. Retain the old resources and encrypted snapshots throughout the agreed rollback window. Retirement or deletion requires explicit separate owner approval.

## Evidence required for approval

| Gate | Evidence |
|---|---|
| CI | Passing latest commit: unit, API, browser, PostgreSQL, image and synthetic rehearsal jobs |
| Snapshot | Private archive hashes, integrity results and separate UK migration results |
| Data | Matching counts and deterministic checksums; no unexplained omissions |
| Runtime | Same-snapshot API and browser parity, security and accessibility verification |
| Recovery | Local and off-host backup restoration, data/document verification, measured recovery time |
| Operations | Monitoring, approved source schedules, credential rotation, restart tests |
| Authorization | Owner-approved cutover, maintenance window, rollback RPO/RTO and retention |

No gate is marked passed by this document. Record real results separately.
