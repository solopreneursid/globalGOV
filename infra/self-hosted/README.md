# Self-hosted deployment foundation

This directory is the owner-operated deployment target for globalGOV Option B.

**Current state:** architecture and initial PostgreSQL schema only. The Node runtime adapter, Compose deployment, database export/import tooling, monitoring, backup automation, and public cutover are subsequent migration phases. This directory is not yet a deployable replacement for the current isolated Cloudflare staging Worker.

## Before using the schema

1. Export every relevant D1 database and any populated local SQLite evidence database.
2. Keep immutable copies of the exports and record their SHA-256 hashes.
3. Compare the actual D1 schema with `postgres/001_core.sql`; the target schema is derived from repository migrations and queries, not yet reconciled against a complete D1 export.
4. Restore the exports into an isolated test environment before importing into the target PostgreSQL database.
5. Never point this schema at production data or delete the source databases during the initial migration.

## Host sizing

- Minimum for the first self-hosted application/database: 2 vCPU, 4 GB RAM, 80 GB SSD.
- Preferred when local PDF/OCR processing shares the host: 4 vCPU, 8 GB RAM, 160 GB SSD.
- A GPU is not required. Local model inference is optional and should be sized separately.
- PostgreSQL must remain on a private container network; do not publish its port to the public Internet.

## Planned service layout

- `app`: Node.js HTTP application.
- `scheduler`: separate Node.js process, sharing the same application code and PostgreSQL database.
- `postgres`: persistent relational database.
- `caddy`: public TLS reverse proxy.
- `monitoring`: self-hosted metrics, dashboards, and alerting added after runtime parity.

## Migration safety

The existing Cloudflare staging application remains the rollback reference. Do not disable its Worker, scheduled triggers, or D1 databases until the self-hosted application has passed route regression, source-ingestion, backup/restore, security, and operational verification. Public DNS remains unchanged until the owner approves the cutover.

See [the architecture and migration plan](../../docs/architecture/SELF_HOSTED.md) and [the PostgreSQL target schema](postgres/001_core.sql).
