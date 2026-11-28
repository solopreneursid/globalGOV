# Self-hosted deployment foundation

This directory is the owner-operated deployment target for globalGOV Option B.

**Current state:** the repository now contains a Node.js 26 LTS HTTP runtime, a PostgreSQL-backed adapter for the existing D1 query surface, a process-local bounded cache, a PostgreSQL-ledger scheduler, Docker Compose services, a Caddy reverse proxy, and an initial PostgreSQL schema. CI validates the schema, adapter semantics, Compose configuration, and image build.

**Implemented in the repository:** the portable runtime, PostgreSQL schema and adapter, first-party scheduler, policy-gated connector inventory, private document archive and manual review intake, encrypted paired database/document backups, SSH off-host copies with SHA-256 verification, monthly isolated restore tests, and a persistent health watchdog.

**Still requires owner-controlled activation:** complete D1 schema reconciliation and export/import, an owner-operated Linux host, real secrets and SSH host-key pinning, an empty PostgreSQL deployment, live source-policy verification, independent security/accessibility review, and production cutover approval. CI success is not proof that a host, remote backup, or restore has been exercised.

## Data migration — implemented, not yet run against owner data

1. Export every relevant D1 database and any populated local SQLite evidence database using owner-controlled credentials. Keep immutable source copies and record their SHA-256 hashes.
2. Run `node apps/govexam-radar/d1-export-backup.mjs encrypt PRIVATE.sql PRIVATE_DIR/backup.enc` offline. It validates the 12 canonical application tables and encrypts the SQL export; it does not contact Cloudflare or mutate source databases.
3. Compare the source schema with `postgres/001_core.sql` and `postgres/002_first_party_operations.sql`. The importer deliberately rejects column-order, column-name, type and foreign-key incompatibilities rather than guessing.
4. Run `node postgres-import.mjs plan /secure/path/backup.enc` with `GLOBALGOV_BACKUP_KEY_HEX` and PostgreSQL credentials. Plan mode restores the encrypted export into a temporary read-only SQLite snapshot, checks integrity, counts rows and computes per-table SHA-256 checksums. It performs no PostgreSQL writes.
5. Only after reviewing the plan, use a dedicated empty PostgreSQL target and explicitly set `GLOBALGOV_IMPORT_ALLOW_WRITE=true` and `GLOBALGOV_IMPORT_CONFIRM_DATABASE=$PGDATABASE` before `node postgres-import.mjs apply /secure/path/backup.enc`. Apply mode rechecks that all 12 target tables are empty, imports in foreign-key order, verifies every row count and checksum, and records an immutable migration-run record. It never deletes or updates source data.
6. Keep source databases and exports unchanged until the owner approves cutover. The importer does not yet migrate unrelated SQLite evidence archives or browser-local bookmarks; those remain separate migration items.

## Local smoke test

Use only an empty disposable PostgreSQL database. This does not migrate D1 data.

1. Copy `.env.example` to `.env` and `backup.env.example` to `.env.backup`.
2. Set `PUBLIC_DOMAIN=localhost`, `ACME_EMAIL` to a valid contact address, and replace every database-role password with a unique random secret (for example, `openssl rand -hex 32`).
3. Validate configuration: `docker compose config --quiet`.
4. Build the runtime and backup images: `docker compose build`.
5. Initialize an empty PostgreSQL database and grant the separate runtime roles: `docker compose --profile tools run --rm migrate`.
6. Start only the application: `docker compose up -d --wait app`. Do not start the scheduler, Caddy, or monitor during initial snapshot reconciliation. Enable those separately after verifying the test origin and permitted source schedules. Do not start `backup` or `restore-scheduler` until the encryption key, remote target and pinned SSH host key are configured.
7. Check `docker compose ps` and `docker compose logs app`; use `docker compose exec -T app node -e 'fetch("http://127.0.0.1:8080/internal/ready").then(r=>{if(!r.ok)process.exitCode=1;console.log(r.status)}).catch(()=>{process.exitCode=1})'` for internal readiness.

For a local Caddy certificate, the browser may require trusting Caddy's local development CA. Do not expose this localhost configuration publicly. A public host needs a real domain pointed directly to the owner-controlled server, inbound TCP 80/443, and a publicly trusted certificate.

## Host sizing

- Minimum for the first self-hosted application/database: 2 vCPU, 4 GB RAM, 80 GB SSD.
- Preferred when local PDF/OCR processing shares the host: 4 vCPU, 8 GB RAM, 160 GB SSD.
- A GPU is not required. Local model inference is optional and should be sized separately.
- PostgreSQL is on an internal-only Docker network; do not publish its port to the public Internet.
- The application and scheduler need outbound HTTPS access to permitted official government sources. PostgreSQL does not need outbound network access.

## Service layout

- `app`: Node.js HTTP application, preserving the existing Fetch API handler.
- `scheduler`: separate Node.js process, sharing application code and PostgreSQL; a unique schedule-slot ledger prevents duplicate runs.
- `postgres`: persistent relational database, isolated on an internal-only network.
- `migrate`: one-shot schema initialization and least-privilege role grants, enabled only through the `tools` profile.
- `policy-review`: one-shot founder-only source-policy review CLI; no public route can approve a source.
- `monitor`: independent database, application, scheduler, source freshness, backup and disk watchdog. Open incidents are deduplicated and resolved automatically after recovery.
- `backup`: daily encrypted PostgreSQL and document-volume archives, with owner-hosted SSH copy and remote SHA-256 verification.
- `restore-scheduler`: monthly isolated database and document archive restore tests using a separate CREATEDB-only role.
- `caddy`: public TLS reverse proxy; internal readiness routes are blocked from public requests.
- `globalgov_documents`: private content-addressed PDF archive. Manual evidence intake and policy-gated automated collection feed an append-only human-review queue; no intake action publishes a notice.

## Migration safety

The existing isolated Cloudflare staging application remains the rollback reference. Do not disable its Worker, scheduled triggers, or D1 databases until the self-hosted application has passed route regression, source-ingestion, data reconciliation, backup/restore, security, and operational verification. Public DNS remains unchanged until the owner approves cutover.

See [the architecture and migration plan](../../docs/architecture/SELF_HOSTED.md) and [the PostgreSQL target schema](postgres/001_core.sql).

## Source policy and independent collection

- The canonical registry contains 60 official recruitment portals. Directory membership is not automated-access permission.
- The self-hosted migration seeds one `source_policy_reviews` row per source using the version-controlled connector allowlist. Existing founder-reviewed rows are preserved.
- Automated document intake requires an explicit, unexpired database policy review, an exact official HTTPS host, an allowlisted GET path/content type, a successful `robots.txt` check, bounded response size and manual review after extraction.
- HTTP redirects, login pages, robots denial and unknown policy status stop collection. No login, CAPTCHA bypass, proxy rotation or third-party scraper is used.
- SSB remains `clarification_required`. Its `robots.txt` login redirect is not bypassed. The public directory link remains available, and founder-supplied PDFs can be added to the private manual-review queue.
- Manual SSB PDF intake (after downloading from the official site): keep the file private and make it readable by the container's non-root `node` user (UID 1000), e.g. `sudo chown 1000:1000 /secure/path/notice.pdf && chmod 600 /secure/path/notice.pdf`. Then run `docker compose run --rm -v /secure/path/notice.pdf:/tmp/notice.pdf:ro app node source-document-collector.mjs manual ssb-india-recruitment https://recruitment.ssb.gov.in/official-notice-path.pdf /tmp/notice.pdf`. The source URL must use the registered SSB host. The operation stores the original by SHA-256 and queues it as pending review; it does not publish.
- An automated PDF fetch is possible only after a founder records an approved, time-limited policy review. The collector still obeys robots rules and redirect restrictions. The public website copyright policy is not treated as automated-access approval.

## Encrypted backups and recovery

The backup service runs daily at 02:15 UTC. It creates an AES-256-GCM encrypted PostgreSQL custom archive and a separately encrypted content-addressed PDF archive, verifies both locally, copies both to the owner-controlled SSH target, and compares remote SHA-256 hashes. Local retention defaults to 14 days. A separate restore scheduler performs full PostgreSQL and document archive verification at least every 30 days. It restores into a uniquely named temporary database, verifies all required tables and schema migrations, checks document hashes, and drops the temporary database before marking the restore test successful.

The PostgreSQL roles are separated:
- `globalgov_admin`: database initialization and schema migrations only.
- `globalgov_app`: application and scheduler table/sequence privileges; no role or database creation.
- `globalgov_backup`: read access to application-schema tables and sequences in the configured database, plus read/write access to `backup_runs`; no `CREATEDB` or cluster-wide reader membership.
- `RESTORE_TEST_DB_USER`: `CREATEDB` and maintenance-database connection only; used by the isolated restore scheduler, not the app or backup worker.

Before enabling the backup service:

1. Set unique random values for every password and generate `GLOBALGOV_BACKUP_KEY_HEX` with `openssl rand -hex 32`; keep `.env` and `.env.backup` owner-only.
2. Set `BACKUP_REMOTE_TARGET` to a directory on a host you control. Keep `BACKUP_REQUIRE_REMOTE=true`.
3. Put the SSH private key and a previously verified `known_hosts` file in `./secrets/ssh`. The directory must be private; the private key must be readable only by the backup container's `globalgov` user (UID 1000). Do not use unauthenticated host-key discovery at backup time.
4. Initialize a fresh PostgreSQL data volume so the role bootstrap script creates the app, backup, and restore-test roles. The init script does not rerun automatically against an existing data volume.
5. Run `docker compose config --quiet`, build the stack, apply migrations to an empty test database, then start the backup service.
6. Verify `backup_runs` shows both local archives, remote hashes, archive verification, and the latest monthly restore timestamps. A successful CI image build does not count as an actual backup or restore test.

Use `docker compose run --rm restore-scheduler postgres-restore-test.mjs` for an owner-triggered restore test against the latest successful backup. It does not modify the source database; it creates and drops a temporary database on the same PostgreSQL server.
