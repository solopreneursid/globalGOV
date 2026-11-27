# Self-hosted deployment foundation

This directory is the owner-operated deployment target for globalGOV Option B.

**Current state:** the repository now contains a Node.js 26 LTS HTTP runtime, a PostgreSQL-backed adapter for the existing D1 query surface, a process-local bounded cache, a PostgreSQL-ledger scheduler, Docker Compose services, a Caddy reverse proxy, and an initial PostgreSQL schema. CI validates the schema, adapter semantics, Compose configuration, and image build.

**Not yet complete:** full D1/SQLite data import, schema reconciliation against every source database, production backup/restore automation, monitoring/alert delivery, security assessment, owner-host provisioning, parallel source-ingestion verification, and public cutover. This stack is a development/test target, not a production replacement yet.

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
