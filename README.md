# globalGOV

An independent HQventures product for discovering official government jobs and examinations. Designed for mobile devices, students and users who need clear, accessible language.

Canonical repository: [solopreneursid/globalGOV](https://github.com/solopreneursid/globalGOV).

The application lives in `apps/govexam-radar/` to preserve existing module, test and workflow paths. See [application documentation](apps/govexam-radar/README.md) and [migration record](MIGRATION.md).

## Local verification

Use Node.js 22. Run `cd apps/govexam-radar && npm test`. For browser tests install Playwright 1.56.1 and Chromium, then run `node --test browser.test.mjs uk-release-browser.test.mjs`.

No production deployment or data publishing is authorized by this migration.
