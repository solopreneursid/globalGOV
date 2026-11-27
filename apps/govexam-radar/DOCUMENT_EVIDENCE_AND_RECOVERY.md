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
