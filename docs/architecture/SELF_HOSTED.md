# globalGOV self-hosted architecture (Option B)

**Decision date:** 2026-11-27  
**Status:** Architecture approved; migration not yet executed.  
**Canonical code repository:** `solopreneursid/globalGOV`

## Objective

Operate the public globalGOV application, recruitment collectors, scheduler, database, document store, monitoring, and backups on infrastructure controlled by the owner. Cloudflare Workers, Cloudflare D1, GitHub Actions, managed databases, recruitment aggregators, commercial job APIs, and hosted AI inference must not be required at runtime.

Government recruitment authorities remain the authoritative data sources. globalGOV will access them directly, subject to each source's published terms, robots policy, rate limits, licence, and permitted-use conditions. A government website is an upstream source, not a third-party aggregator.

## Target topology

```text
Public Internet
      |
      v
Owner-controlled domain / DNS
      |
      v
Caddy (TLS termination, reverse proxy)
      |
      +------------------------------+
      |                              |
      v                              v
Node.js application             Node.js scheduler
(Fetch API-compatible)          (persistent, UTC schedule)
      |                              |
      +---------------+--------------+
                      |
                      v
             PostgreSQL 17+
          (private Docker network)
                      |
          +-----------+-----------+
          |                       |
          v                       v
  Local document store     Encrypted backup process
  (content-addressed)      (off-host destination)
```

Optional operational services, added only when justified:
- Prometheus and Grafana for metrics and dashboards.
- Self-hosted GlitchTip or an equivalent error tracker.
- Tesseract OCR and Poppler utilities for local document processing.
- llama.cpp with a locally stored open-weight model for optional extraction assistance. Deterministic parsers and human review remain authoritative.

Redis, Kubernetes, a vector database, and a continuously running LLM are deliberately excluded from the initial deployment. PostgreSQL full-text search and a single well-sized host are sufficient until measured load proves otherwise.

## Technology decisions

| Concern | Initial choice | Reason |
|---|---|---|
| Runtime | Node.js 26 LTS | Existing application is JavaScript ES modules and Fetch API based |
| HTTP | Native Node HTTP server | Avoid an unnecessary web framework and preserve the current request handler |
| Database | PostgreSQL 17 | Durable transactional source of truth, mature backup/restore and indexing |
| Search | PostgreSQL full-text search | Avoid a separate search service at initial scale |
| Scheduler | First-party Node process + PostgreSQL run ledger | No hosted cron dependency; deduplicated scheduled work |
| Documents | Owner-controlled filesystem, content-addressed by SHA-256 | Simple, auditable and portable |
| Edge | Caddy | Self-hosted reverse proxy and automated public TLS |
| Packaging | Docker Compose | Reproducible single-host deployment and simple operations |
| Backups | pg_dump + authenticated encryption | Recoverable independently of the running application |
| OCR | Tesseract / Poppler, self-hosted | No document-processing API dependency |
| AI | Optional local inference only | Not required for ingestion, validation or publication |

## Runtime boundaries

The deployed application must not call GitHub, Cloudflare, hosted model APIs, commercial recruitment aggregators, or third-party scraping services to serve users or run ingestion. GitHub may remain a source-control and off-host source-code backup service; it is not part of the runtime dependency graph.

Direct requests to official recruitment websites are expected and unavoidable. Public-domain registration, an Internet connection, upstream DNS resolution, and a publicly trusted TLS certificate also remain external prerequisites for a public website. The architecture will not use Cloudflare proxying, Workers, D1, R2, or Cloudflare Cron in the final runtime.

No collector may bypass source restrictions. Where automated access or commercial republication rights are not established, globalGOV will retain an official portal link and a documented restriction rather than scraping or republishing unsupported data.

## Data and trust model

1. Source registry: each authority has an explicit canonical URL, jurisdiction, access method, policy/rights state, and last review date.
2. Acquisition: bounded HTTPS requests, strict host/redirect validation, timeouts, byte limits, rate limits, and recorded response metadata.
3. Evidence: preserve original official URLs, retrieval time, content hashes, and source documents where permitted.
4. Extraction: deterministic HTML/PDF parsing first; OCR only for scanned documents; local model assistance is optional and never treated as statutory verification.
5. Normalization: preserve raw extracted values and normalized fields separately; never invent missing vacancies, eligibility, deadlines, fees, or salary.
6. Verification: uncertain records are quarantined. Public status must distinguish source-observed, parser-extracted, reviewer-verified, expired, amended, and withdrawn.
7. Publication: only records that pass the release policy are exposed as current opportunities. Historical records remain a separate dataset.
8. Audit: every ingest run and material notice revision is traceable to source evidence.

## Migration sequence and release gates

### Phase 0 — Architecture and inventory (this change)
- Record the target architecture and trust boundaries.
- Define the initial PostgreSQL schema corresponding to the known D1 tables.
- Inventory every persisted data source, including retired/isolated D1 databases and local SQLite evidence files.
- Keep all existing hosted resources unchanged.

### Phase 1 — Portable Node runtime
- Run the existing Fetch API handler under Node.js.
- Add a PostgreSQL-backed database adapter or replace D1 access with explicit repositories.
- Replace Cloudflare cache APIs with a bounded local cache.
- Run ingestion as an owner-operated scheduler with a persistent execution ledger.
- Add Docker Compose, health checks, graceful shutdown, and least-privilege container settings.
- Prove route parity and run all existing tests against PostgreSQL.

### Phase 2 — Data migration
- Export complete snapshots from every relevant D1 database and any populated local SQLite ledger.
- Use the existing `apps/govexam-radar/d1-export-backup.mjs` as an offline validation/encryption step for the canonical D1 SQL export. It validates the required 12-table set, imports the SQL into an isolated SQLite file in safe mode, checks SQLite integrity, and encrypts the export with AES-256-GCM. It does not connect to or export a live D1 database, and it does not import into PostgreSQL.
- Build and verify the separate PostgreSQL importer against the exported schema before loading any records.
- Import into PostgreSQL without deleting or mutating the source snapshots.
- Compare table counts, primary-key coverage, duplicate constraints, and deterministic row-level checksums.
- Preserve browser-local bookmarks through the existing export/import feature; they are not in server-side D1.
- Rotate ingestion and moderator credentials after cutover. Never copy secrets into SQL dumps or Git.

### Phase 3 — Independent operations
- Configure conservative source schedules and prevent overlapping collector runs.
- Verify at least two successful scheduled cycles per source before claiming unattended collection.
- Implement encrypted daily backups, retention, off-host copies, and a tested restore procedure.
- Add independent monitoring, alert delivery, log rotation, disk-space checks, and incident runbooks.

### Phase 4 — Parallel verification and cutover
- Run the self-hosted stack in a non-public test environment first.
- Compare API outputs and source-ingestion outcomes with the existing staging deployment.
- Verify authentication, access controls, TLS, restore, rollback, and performance.
- Change public DNS only after all release gates pass and the owner approves the cutover.

### Phase 5 — Retirement
- Keep existing Cloudflare Workers and D1 snapshots read-only during the rollback window.
- Disable their schedules only after self-hosted ingestion is proven.
- Delete no database, backup, secret, or historical source until its replacement is verified and the owner explicitly approves retirement.

## Data inventory to reconcile before migration

Known canonical D1-backed tables from application queries and repository migrations:
- `official_job_notices`
- `source_ingest_runs`
- `source_feed_cursors`
- `notice_revisions`
- `portal_status`
- `portal_history`
- `members`
- `posts`
- `replies`
- `votes`
- `reports`
- `moderation_actions`

Additional sources that must be checked, not assumed empty:
- Retired/isolated UK mirror or release D1 databases.
- Local SQLite recruitment-document evidence ledger(s).
- Any local exports, snapshots, or founder-held source files.
- Browser-local bookmarks and saved portal selections (export from the browser where needed).
- Static reviewed catalog and source registry files in this repository.

The included PostgreSQL schema is an initial target schema derived from repository SQL and runtime queries. It must be compared with the actual exported D1 schema before import. The current D1 database schema and record counts have not yet been independently reconciled.

## Host prerequisites and manual gate

A public cutover requires an owner-controlled, always-on Linux host with:
- At least 2 vCPU, 4 GB RAM and 80 GB SSD for the initial application/database workload; 4 vCPU and 8 GB RAM are preferred if OCR runs on the same host.
- Docker Engine and the Docker Compose plugin.
- Persistent storage with filesystem monitoring.
- A domain whose DNS can point directly to the host.
- Public inbound TCP 80/443, firewall access, and a stable public address or an owner-controlled dynamic-DNS arrangement.
- A separate off-host backup destination and an independently stored encryption key.

No server, DNS, or D1 export access has been assumed. The owner will need to provide/provision the host and perform the source database export when the migration reaches that gate. Until then, implementation and tests remain repository-side and non-destructive.

## Non-negotiable invariants

- No production DNS change or public cutover without explicit owner approval.
- No deletion of existing Cloudflare resources or D1 databases during migration.
- No fabricated or unverified recruitment data.
- No unattended public publication of unreviewed extracted statutory facts.
- No secrets, tokens, private keys, or backup encryption keys in source control.
- No runtime dependency on GitHub, Cloudflare, hosted AI, or commercial recruitment APIs.
- Every backup must be restorable and integrity-checked before it is considered valid.
