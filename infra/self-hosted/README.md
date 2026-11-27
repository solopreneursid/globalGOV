# Self-hosted deployment foundation

This directory is the owner-operated deployment target for globalGOV Option B.

**Current state:** the repository now contains a Node.js 26 LTS HTTP runtime, a PostgreSQL-backed adapter for the existing D1 query surface, a process-local bounded cache, a PostgreSQL-ledger scheduler, Docker Compose services, a Caddy reverse proxy, and an initial PostgreSQL schema. CI validates the schema, adapter semantics, Compose configuration, and image build.

**Implemented in the repository:** the portable runtime, PostgreSQL schema and adapter, first-party scheduler, policy-gated connector inventory, private document archive and manual review intake, encrypted paired database/document backups, SSH off-host copies with SHA-256 verification, monthly isolated restore tests, and a persistent health watchdog.

**Still requires owner-controlled activation:** complete D1 schema reconciliation and export/import, an owner-operated Linux host, real secrets and SSH host-key pinning, an empty PostgreSQL deployment, live source-policy verification, independent security/accessibility review, and production cutover approval. CI success is not proof that a host, remote backup, or restore has been exercised.

## Before using the schema

1. Export every relevant D1 database and any populated local SQLite evidence database.
2. Keep immutable copies of the exports and record their SHA-256 hashes.
3. Run the existing `node apps/govexam-radar/d1-export-backup.mjs encrypt PRIVATE.sql PRIVATE_DIR/backup.enc` offline after exporting the canonical D1 SQL. It validates the 12 required canonical tables and encrypts the export; it does not contact Cloudflare or import PostgreSQL data.
4. Compare the actual D1 schema with `postgres/001_core.sql`; the target schema is derived from repository migrations and queries, not yet reconciled against a complete D1 export.
5. Restore the exports into an isolated test environment before importing into the target PostgreSQL database.
6. Never point this schema at production data or delete the source databases during the initial migration.

## Local smoke test

Use only an empty disposable PostgreSQL database. This does not migrate D1 data.

1. Copy `.env.example` to `.env`.
2. Set `PUBLIC_DOMAIN=localhost`, `ACME_EMAIL` to a valid contact address, and `POSTGRES_PASSWORD` to a random hex secret (for example, generate one with `openssl rand -hex 32`).
3. Validate configuration: `docker compose config --quiet`.
4. Build the image: `docker compose build`.
5. Initialize an empty PostgreSQL database: `docker compose --profile tools run --rm migrate`.
6. Start the local stack: `docker compose up -d`.
7. Check `docker compose ps` and `docker compose logs app scheduler`.

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
- `migrate`: one-shot schema initialization service, enabled only through the `tools` profile.
- `caddy`: public TLS reverse proxy; internal readiness routes are blocked from public requests.
- `globalgov_documents`: persistent owner-controlled document volume. Document ingestion/storage workers are not yet connected.

## Migration safety

The existing isolated Cloudflare staging application remains the rollback reference. Do not disable its Worker, scheduled triggers, or D1 databases until the self-hosted application has passed route regression, source-ingestion, data reconciliation, backup/restore, security, and operational verification. Public DNS remains unchanged until the owner approves cutover.

See [the architecture and migration plan](../../docs/architecture/SELF_HOSTED.md) and [the PostgreSQL target schema](postgres/001_core.sql).

## Encrypted backups and recovery

The backup service runs daily at 02:15 UTC. It creates an AES-256-GCM encrypted PostgreSQL custom archive and a separately encrypted content-addressed PDF archive, verifies both locally, copies both to the owner-controlled SSH target, and compares remote SHA-256 hashes. Local retention defaults to 14 days. A full PostgreSQL plus document restore test runs monthly into a uniquely named temporary database; the database is dropped before the test is reported successful. The backup role has read access plus access to its backup ledger rows. Only the separate `RESTORE_TEST_DB_USER` role receives `CREATEDB` for isolated recovery tests.

Before enabling the backup service:

1. Set unique random values for every password and generate `GLOBALGOV_BACKUP_KEY_HEX` with `openssl rand -hex 32`; keep `.env` and `.env.backup` owner-only.
2. Set `BACKUP_REMOTE_TARGET` to a directory on a host you control. Keep `BACKUP_REQUIRE_REMOTE=true`.
3. Put the SSH private key and a previously verified `known_hosts` file in `./secrets/ssh`. The directory must be private; the private key must be readable only by the backup container's `globalgov` user (UID 1000). Do not use unauthenticated host-key discovery at backup time.
4. Initialize a fresh PostgreSQL data volume so the role bootstrap script creates the app, backup, and restore-test roles. The init script does not rerun automatically against an existing data volume.
5. Run `docker compose config --quiet`, build the stack, apply migrations to an empty test database, then start the backup service.
6. Verify `backup_runs` shows both local archives, remote hashes, archive verification, and the latest monthly restore timestamps. A successful CI image build does not count as an actual backup or restore test.

Use `cd apps/govexam-radar && npm run backup:restore-test` for an owner-triggered restore test against the latest successful backup. It does not modify the source database; it creates and drops a temporary database on the same PostgreSQL server.
