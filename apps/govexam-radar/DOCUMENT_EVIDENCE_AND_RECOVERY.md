# Evidence-based recruitment document review and recovery

This milestone introduces a portable Node 22+ private extraction pipeline, not a public vacancy or exam-results publisher.

- `recruitment-document.mjs`: read-only acquisition of explicitly allowlisted first-party SDSC SHAR PDF URLs or a locally supplied PDF; robots, no redirects, bounded bytes/pages, process timeout, PDF magic and type validation. Requires Poppler's pdfinfo and pdftotext. Run under an unprivileged isolated process/container, with no credentials or write access beyond its private output directory. Locally supplied PDFs are marked unverified.
- `recruitment-evidence.mjs`: evidence hashes and labelled field candidates, page and line references, conflict detection, exact Indian calendar dates, explicit date/time precision, candidate-only event types. No inferred deadlines. No OCR, general table extraction, multi-post disambiguation, automatic statutory verification or public release.
- `recruitment-eligibility.mjs`: deterministic partial age and qualification checks using reviewed rules, no profile persistence or categorical legal eligibility determination. Unknown relaxations/equivalences remain unknown.
- `encrypted-backup.mjs`: consistent local SQLite backup (including committed WAL changes), authenticated AES-256-GCM encryption with independently generated 32-byte key, integrity check of decrypted temporary database. Do not run against live D1 by pretending it is a local SQLite file. Export/migrate to an independently controlled host, configure encrypted off-site storage and separately retained key, and verify real dataset restore before launch.

## Commands

```sh
node recruitment-document.mjs india-sdsc-shar 'https://apps.shar.gov.in/sdscshar/advt_03_2026/Notice%20dated%2013.11.2026.pdf' --fetch - /private/review.json
node encrypted-backup.mjs encrypt /private/globalgov.sqlite /private/globalgov-backup.enc
node encrypted-backup.mjs verify /private/globalgov-backup.enc
```

Use an existing private directory; output files are created exclusively with mode 0600. Supply GLOBALGOV_BACKUP_KEY_HEX from an independently controlled secret manager; never commit the key or actual recruitment documents, candidate data, unredacted extracted text or database snapshots. CI uses only synthetic fixtures for backup verification.

## Source and release boundary

SDSC SHAR recruitment policy: https://apps.shar.gov.in/Recruitment/copyright.jsp (conditional first-party reuse, attribution with publication date, exclusions). Official portal: https://apps.shar.gov.in/Recruitment/. Latest checked round SDSC SHAR/RMT/03/2026 closed 16 November 2026; no open jobs claimed. A historical official PDF is used solely for a bounded compatibility check. The source is not added to public feed allowlists. The Department of Expenditure has inconsistent permission statements across https://doe.gov.in/website-policies and https://doe.gov.in/en/website-policies; require clarification before automated republication.

Before public activation, build a reviewed evidence ledger, add per-post and multi-document relationships, independently verify dates and eligibility, integrate source-specific update adapters and test public API/UI boundaries. An extracted event is only a candidate; never publish candidate names, roll numbers, or private admit-card data.

### Local evidence journal and event discovery
`node recruitment-ledger.mjs /private/evidence.sqlite /private/review.json` stores each exact report revision and hashes in a private SQLite journal. Duplicate reports are idempotent; this does not confer reviewer approval.
`node recruitment-events.mjs` checks the fixed official SDSC SHAR announcement index, returning only aggregate candidate counts and snapshot hash. Candidate matching requires an explicit advertisement reference and an unambiguous event heading. No candidate names, roll numbers, private documents, or raw headings are published. The index is a research source pending confirmation of rights for that exact path and native source proof. Scheduled research checks do not update public lifecycle records.

### Live proof and post-scoped candidates
2026-11-27: main workflow 45943730249 passed all three jobs. The official reopening PDF SHA-256 was `f4c5178ba24c2890a90f916472ae8ca5de2e5d9654dfcce2d37d6681167f9cb8`; extracted fields were reopenedWindow and ageCutoff, no conflicts. Advertisement number not extracted from that actual PDF, so zero linked events; keep review required. The separate official event index produced 17 candidates (5 corrigenda, 10 results, 2 exam schedules), snapshot hash `75fa1a7494f4ef9ccdc18d84a21b783e71d409c4271b2ff760bcb260c52bcaee`. These are historical/research candidates, not verified current announcements.
The new fixed-column table parser extracts post code, title and explicit total vacancies from recognised three-column headers and retains page/line evidence. It excludes conflicting post codes, stops on unresolved or wrapped rows, and does not assign document-wide age/fee/qualification rules to every post. No publication permission is conferred.

## Reviewed publication boundary
The public Worker includes a read-only reviewed recruitment API and integrated full/lite UI. It verifies an Ed25519-signed byte-exact JSON payload with a locally enrolled public key and explicit source allowlist, bounded 72-hour validity, official document URL, evidence hash/page/line, publication and observation timestamps. Expired, invalid or unauthorized bundles expose no data. Cancellation notices suppress open posts for the same advertisement. Current configuration has no enrolled key, enabled document source, or signed bundle: no candidate information is published. Founder enrollment, source-specific permission and genuine independently reviewed evidence remain required. No signing key is stored in the repository or Worker. Public launch remains false.

### Expanded extraction and eligibility
Hindi-labelled fields, explicit Hindi table headers and Devanagari digits are supported in bounded recognised layouts. No general OCR or translation-based inference. Reviewed experience, citizenship (including explicit exception review), and conjunctive qualification groups are evaluated only when the stated rule definition, cutoff and applicant input are supplied. Missing inputs remain unknown; no applicant profile is stored. Complex or category-specific rules still require individual review.

## Owner-controlled D1 export and isolated restore
The new `d1-export-backup.mjs` preserves the exact SQL dump in a separate AES-256-GCM authenticated format. It validates the complete globalGOV application-table inventory, SQLite integrity and foreign keys in a temporary isolated database, then verifies encrypted readback. It refuses public-readable input and output directories and overwrites. Use SQLite CLI safe mode on an unprivileged, encrypted owner-controlled machine; do not execute dumps from unknown sources. Cloudflare's export operation can temporarily block database requests, so schedule a maintenance window. Export the full schema and data using the official D1 dashboard/API; see https://developers.cloudflare.com/d1/best-practices/import-export-data/. Do not export into this public Git repository, Actions, chat, or an unencrypted workstation. The existing D1 includes community data.

```sh
# On an owner-controlled machine, set GLOBALGOV_BACKUP_KEY_HEX privately first.
# Both input and destination must be private (0600 file, 0700 directory).
node d1-export-backup.mjs encrypt /private/globalgov.sql /independent-private/globalgov-2026-11-27.enc
node d1-export-backup.mjs verify /independent-private/globalgov-2026-11-27.enc
```

Keep the secret separately from ciphertext, keep two independent encrypted copies, and record aggregate verification evidence only. This procedure does not overwrite live D1 or provision any storage. Actual owner-controlled D1 export and independent restore remain required. A local integrity test is not a live-cloud restore certification. Category age ranges are explicitly reviewed and never stacked by inference; the matching code and applicant facts must be confirmed. No real category data is stored or published.

### Owner-side signing
The `review-sign.mjs` helper validates and signs a manually prepared byte-exact review payload using an existing owner-controlled Ed25519 private key. It requires `GLOBALGOV_REVIEW_APPROVED=YES`, private input and output permissions, and the explicit SDSC source scope. It writes only the signed configuration for separate founder-approved enrollment. It does not enroll the public key, turn on the source or assert legal/statutory approval. An empty or synthetic test bundle is never a production approval. Never share the private signing key with ChatGPT, GitHub or Cloudflare.
