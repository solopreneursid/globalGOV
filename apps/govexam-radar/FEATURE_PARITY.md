# GovRadar v2 — exact feature comparison

Source: founder-uploaded **GovExam & Job Radar — Global Technical & Non-Technical Government Jobs, Admit Cards & Email Alerts (Step 2).html** (3,570 lines; 61 JavaScript functions; six views).

Status legend: **Working** = function tested in running web app; **Reference-only** = UI/filters work using clearly labelled unverified data; **Partial** = honest, useful fallback but not the originally claimed automated service; **Not yet** = requires external delivery/validated source feeds.

| Uploaded prototype function / area | Version 2 behavior | Status |
|---|---|---|
| Exam Radar, responsive cards, detail modal | Full six-section original-inspired layout at `/`, simpler layout at `/lite` | Working |
| 10-country browsing | Original source countries and source directory retained | Working |
| Location timezone + optional GPS | Country inference and manual selection; explicit limitations outside recognized bounding boxes | Partial |
| Native and potential foreign opportunities | Sorting and four location modes; flagged unverified eligibility summaries | Reference-only |
| Country / region / technical and nontechnical streams | Working filter and cascade | Working |
| Citizenship, category, lifecycle and status filters | Working filters over prototype records, not legal determinations | Reference-only |
| Search, clear, reset, counts | Functional | Working |
| Admit-card and results boards | Separate tab and official links preserved; claimed releases must be checked independently | Reference-only |
| Email address, lead days, stream and trigger preferences | Saved locally on device; no server collection or dispatch | Partial |
| Send test email | Replaced with truthful local browser notification test | Partial |
| Per-exam email subscription toggles | Local alert interest list, not active email delivery | Partial |
| Auto-sync 15+ portals | On-demand checks for 17 allowlisted official portal URLs plus isolated Cloudflare preview cron (3 sources every 3 hours) with SQLite/D1 result history; reports reachable/restricted/unconfirmed | Partial |
| Auto-detect and upload new vacancies | Not active; source-specific authorized data ingestion still required | Not yet |
| Auto-update admit cards and results | Not active without verified official event adapters | Not yet |
| Auto-remove and restore expired exams | Local archive examples with restore and hide controls | Reference-only |
| Demonstrate lifecycle | Explicitly marked demo; cannot mutate verified recruitment records | Working |
| Custom regional job form | Valid HTTPS user-provided lead stored locally and marked unverified | Working |
| Saved bookmarks and alert interests | Persist in browser localStorage; survive reload | Working |
| Interactive 4-part guide | Original instructional panels restored | Working |
| Community per-exam study rooms and topic filters | Server-backed D1 records, no fabricated official bot posts | Working |
| Community username login | Browser-bound private token, handle reservation, no username-only impersonation | Working |
| Community posts / replies / votes | D1 records with real persistence, rate limiting and HTML-safe rendering | Working |
| Shared community abuse moderation / account recovery | Still requires moderation workflow, account recovery and privacy controls | Not yet |
| Mobile and tablet navigation | 320, 375, 768, 1440 pixel browser-tested responsive layouts | Working |
| Installable mobile PWA and offline shell | Cached first-party static shell; API/community requires network | Working |
| Machine-readable catalog API | `/api/catalog`, `/api/health`, `/api/check`, `/openapi.json` | Working |
| Full source ownership | First-party compiled CSS, no runtime CDN, no paid APIs, separate D1 database | Working |

## Trust policy

No page may claim that an application window is currently open, an exam date is verified, an admit card was released, a candidate is legally eligible to apply, or an email was sent solely on the basis of the uploaded prototype, site reachability, timezone or a demonstration record.

## Deployment boundary

The independent Worker `hqventures-govexam-radar` is not the production YorpHives website. No deployment to `yorphives.com` was authorized or performed in this branch. The GitHub branch is kept under a draft pull request for founder review.

## Next launch gate

Implement the first trusted source adapter with an official feed/API or permitted HTML parsing; persist notice document, observed URL, source timestamp, version, application deadline, status and evidence. Require review for ambiguous date and eligibility changes. Add moderation/reporting and verified opt-in email sending only when infrastructure and costs have been approved.
