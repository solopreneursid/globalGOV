# globalGOV development rules

- All future globalGOV development belongs exclusively in `solopreneursid/globalGOV`. Treat the former YorpHives_Website GovRadar branches as historical source, not active development targets.
- Public product name: `globalGOV`. Preserve legacy internal identifiers, API headers, storage keys, infrastructure names and paths until a compatibility-tested migration is explicitly planned.
- Keep the mobile-first interface simple and accessible to students and users from rural backgrounds; use plain language.
- Ingest only verified official government sources within their permitted use. Never fabricate notices or imply unsupported coverage.
- Preserve release gates; verify tests, live preview, data isolation, source rights and rollback before any production activation. Do not migrate secrets into Git.
- Do not modify YorpHives, YorpHives HQ, Taxpulse or unrelated infrastructure. Keep operating costs minimal.
