# GovRadar original-vision restoration — staging plan

Canonical product blueprint: founder-uploaded **GovExam & Job Radar — Global Technical & Non-Technical Government Jobs, Admit Cards & Email Alerts (Step 2).html**. Its email feature is **explicitly removed at the founder's direction**.

## Permanent product scope

The six original areas are retained: **Radar, Alerts & Updates, Feeds, Saved, Community, Guide**. The global product is the app; the UK DfE isolated candidate is only a restricted source/release proof, never the replacement for the global experience.

| Original vision | Current implementation | Required next gate |
| --- | --- | --- |
| 10-country government career/exam radar | Global six-tab responsive research view; official national/regional portal directory | Verified vacancy-by-vacancy coverage per licensed source |
| India first, state and central exams | UPSC, SSC, RRB, JPSC, IBPS, NCS and regional official-source directory; index adapter disabled | Per-source permission and exact official notice proof before automated import |
| Technical/nontechnical, location, citizenship | Browsable prototype research-lead filters; inferred type on official UK records | Source-backed eligibility per vacancy, never infer from nationality alone |
| Admit cards/results/exam lifecycle | Prototype research state and source links, explicitly unverified | Dedicated evidence-based exam events/links with dated audit |
| Feed synchronization | Bounded and audited UK/Manitoba staging collectors; separate private UK mirror | Two real unattended successful mirror runs, independent freshness evidence |
| Saved and alerts | On-device bookmarks, saved UK filters and opt-in visible-tab checking | Unified browser-local history, no remote notification service |
| Community | Separate server-backed moderation-gated staging prototype | Founder approval, abuse and privacy review |
| Guide | Founder-original educational section, adjusted to actual capabilities | Update progressively with shipped functionality |

## No email service
- Do not collect email addresses, store email preferences, create SMTP/email API integrations, display fake email queues, or advertise delivered email messages.
- Prefer on-device changes, read-only feeds, browser-local bookmarks and user-requested checks. Be explicit that no background delivery occurs.
- Historic function names in legacy demo code are **not** an enabled email service; remove those safely as the original script is modularized.

## Non-negotiable truth gates
- Separate **directory**, **research lead**, **source-observed record**, **reviewed official notice**, and **independently verified current vacancy**.
- Never call source URL reachability vacancy verification.
- Do not promote UK OGL reuse permission to Canada/India or other sources.
- Expired and withdrawn records retain non-destructive audit evidence; do not fabricate updates or erase history.
- No domain, production worker, payment or HQ write permissions without founder release.
- CI must pass and independent live browser verification is needed before launch.

## Delivery order
1. Restore global six-tab UI, eliminate email collection, and retain working source monitoring.
2. Verify UK mirror Cron audit and source freshness; keep unknown state visible until proven.
3. Unify browser-local saved searches and change history across the global app, while respecting source rights.
4. Improve India official-source directory and safely enable only lawful factual/attributed adapters.
5. Add verified admit card/result lifecycle as a separate evidence-backed domain, then country-by-country adapters.
6. Audit mobile UX, privacy, safety, accessible navigation, moderation and founder-approved release.

Status: **staging development**. Updating this document never asserts a production launch.

## India source-rights investigation (2026-11-16)
- **Employment News** editorial guidance explicitly reserves article copyright and prohibits reproduction of published articles or parts without permission. Do not assume this journal is openly reusable just because it is operated by a government ministry: https://employmentnews.gov.in/Editorial-Guidelines.pdf
- **Government Open Data License – India (GODL)** explicitly allows commercial and noncommercial reuse with attribution **for data actually published under that license**, not every government website or Employment News article: https://data.gov.in/Godl
- Result: keep Employment News content ingestion disabled pending source-specific rights. Explore individually licensed OGD datasets or official notice metadata as separate adapters, with accurate attribution, evidence and consent checks.

## Founder direction re-confirmed — 2026-11-17

**Do not narrow or rebrand the product as a UK teacher recruitment platform, a single-country listing board, or a source-monitoring dashboard.** The original uploaded HTML remains the feature baseline, **except email notifications are permanently excluded**. All source-specific release candidates are subordinate adapters for the single global GovRadar experience.

### Build criteria and feature parity
1. **Global Radar:** Keep the original ten-country browsing intent, India-first central/state exam discovery, technical/nontechnical filters, location filters, and explicit foreign-eligibility distinctions. Display verified evidence where available; mark research leads honestly. Coverage never implies source-level validation.
2. **Exam lifecycle:** Preserve job, exam, application, admit-card, result and archival concepts. Verified stage transitions require authoritative notice URL, authority, timestamps, evidence, and expiry/withdrawal logic. Never infer admit-card release from a general portal being reachable.
3. **Feeds:** Each source is its own portable plug-in (adapter, rights policy, cursor, freshness ledger, error log, tests). UK, Canada and future India modules contribute records to a unified canonical notice schema.
4. **Saved & Updates:** User-driven browser-local saved jobs/exams/searches, preference filtering and observed-change history. No email transport, email capture, browser-push promise, or external subscription.
5. **Community & Guide:** Preserve the founder's community-preparation and help features with moderation, privacy and clear nonofficial-content labeling.
6. **Mobile discovery:** Maintain concise searchable cards, country/state/category chips, official-link actions, and minimal navigation; no infrastructure-only panels on the primary feed.

### Next engineering milestones (in original product order, not a country-specific detour)
- **Reliability gate:** Demonstrate a real scheduled UK mirror attempt and two successful independent audit records, then prove refresh behavior. A configured Cron alone is not proof.
- **India-first data gate:** Audit UPSC, SSC, RRB, state PSC and other relevant official sources one by one; ingest only documented permitted metadata, test chronology, citation and expiry, and show the first verified India notices in global Radar.
- **Unified global notice gate:** Render verified records from existing allowed UK/Canada feeds alongside India in the common Radar, with separate labels for research leads and independently verified live postings. No duplicate records or silently changing eligibility.
- **Examination event gate:** Implement independent evidence-backed admit-card/result event ingestion and state transitions; include official proof and freshness timestamps.
- **Launch gate:** Independently inspect mobile UI, accessibility, security, community abuse controls, source rights, rate limits, backup/restore, and staging-vs-production isolation. Founder controls production approval.

### Cron verification snapshot
As of the latest check on 2026-11-17 (local India date), private UK mirror Worker `hqventures-govradar-uk-mirror-watch` has schedule `55 */3 * * *` UTC, with `MIRROR_DB` and `SOURCE_DB` D1 bindings. The mirror's state still reads `never_run`, with `last_attempt_at=0`; its `uk_mirror_runs` table is empty. **Do not label unattended synchronization as working.** Investigate and validate after the first scheduled opportunity and preserve unknown status until an actual run is recorded.
