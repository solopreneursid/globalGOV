# globalGOV

An independent HQventures product for discovering official government jobs and examinations. Designed for mobile devices, students and users who need clear, accessible language.

Canonical repository: [solopreneursid/globalGOV](https://github.com/solopreneursid/globalGOV).

The application lives in `apps/govexam-radar/` to preserve existing module, test and workflow paths. See [application documentation](apps/govexam-radar/README.md) and [migration record](MIGRATION.md).

## Infrastructure direction

The approved long-term target is **Option B: owner-operated, self-hosted infrastructure**. The current isolated Cloudflare Worker/D1 staging deployment remains active only as a migration reference and rollback target. The self-hosted replacement is not yet deployed; no public DNS cutover or hosted-resource deletion is authorized.

See [the self-hosted architecture and migration plan](docs/architecture/SELF_HOSTED.md), [self-hosted deployment foundation](infra/self-hosted/README.md), and [PostgreSQL target schema](infra/self-hosted/postgres/001_core.sql).

## Local verification

Use Node.js 22. Run `cd apps/govexam-radar && npm test`. For browser tests install Playwright 1.56.1 and Chromium, then run `node --test browser.test.mjs uk-release-browser.test.mjs`.

No production deployment or data publishing is authorized by this migration.
## Self-hosted runtime

The owner-operated Node.js/PostgreSQL runtime is being built under [infra/self-hosted](infra/self-hosted/README.md). It is not ready for production use until the PostgreSQL migration, data reconciliation, source-ingestion, backup/restore and security gates pass. The existing Cloudflare staging deployment remains unchanged.

