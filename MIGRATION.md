# Repository migration — 2026-11-26

Source: `solopreneursid/YorpHives_Website`, branch `feat/govradar-phase1-sources-20261116`, commit `f78a29f7140eef4305e6504482a8dc6f602ef490`, tree `920b15b0e2ccd275fd26939b56254cf806fef43f`. This branch is 272 commits ahead of and contains the original GovRadar branch. The initial snapshot commit in this repository is `f227c0984b8100740ca284b5b75d99121b5ca5ba`; it preserves 86 application files, three workflows, and the license exactly. Full prior commit history remains in the former repository; this is a snapshot import, not a Git history rewrite.

The subsequent migration changes public branding, npm package name and workflow triggers. Legacy paths, storage identifiers, headers, Worker names and URLs remain stable for compatibility. Hosted smoke checks require manual dispatch; scheduled publishing is disabled. Existing Cloudflare deployments, databases, secrets and external integrations are not copied or changed. Verify the new repository's CI, permissions, source ingestion and isolated preview before any infrastructure cutover. Do not delete historical source branches or activate publishing until the cutover is verified.

## Staging cutover — 2026-11-26

- Migration PR #1 merged into main at `509acee96c53186b79a088768e39813b32a1c05b`; pre-merge unit/API/browser tests and collector dry run passed.
- Full-parity staging Worker `hqventures-govexam-parity-preview` uploaded as version `e9b7d18a-7f32-4cb3-a79d-14d38d8c9341` from the migrated commit. All 21 runtime modules verified against Git blob SHA-1 hashes before upload. Version metadata records the new repository and commit.
- Staging traffic switched to that version; existing D1 binding, encrypted ingestion secret and cron schedule verified unchanged. Rollback version: `9c17f787-c71b-4efb-9a65-882f685d641a`.
- Existing deployment uses the Cloudflare API, not a linked Git build. The legacy worker name is retained to preserve links and data. Hosted staging verification is read-only; collector publishing remains disabled by default.
- Fixed the incomplete staging deploy module list and added a regression test against the runtime import graph.
- The original baseline Worker and isolated UK mirror/release Workers are not production-cutover targets; preserve their resources until independently verified. No public launch is authorized.
