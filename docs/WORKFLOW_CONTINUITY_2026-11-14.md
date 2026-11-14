# Workflow continuity — November14

## Observed cause

The read-only live audit found migrations001–016 and an older worker without the content lifecycle/profile capability markers. Git/CI deploys the dashboard and proxy; it does not update the persistent worker process. The new dashboard sent `NEED_ATTENTION` to the old list validator, causing “Invalid content status.” The old bounded overview sample also cannot supply complete canonical counts.

Fabrything is enabled and verified, with target50/day and a24-hour buffer, but its20-item backlog contains16 errored drafts/reviews and four other drafts. The routine reports “Draft backlog is full.” Its generation window still prefers22:00–07:00. These conditions prevent preparation from reaching the fair scheduler. Noble Seek was active with two upcoming deliveries at the audit; one shared inference lane cannot execute two models simultaneously.

## Implemented and verified

- Preparation claims retain least-recently-served profile fairness and one model call at a time. Planning now has an independent bounded loop, so a long writer cannot prevent other profiles' refill checks. Delivery remains a separate lane.
- Held content remains visible and protected. It no longer fills the working backlog; clean human-approval drafts still count, and actively retried failures count as preparation. Held commerce calendar plans cannot falsely report a healthy automatic buffer. Actual scheduled/published/uncertain receipts still reserve capacity.
- Ecommerce routines check their connected catalog at least daily when operational. Successful checks retain their timestamp; failed checks have a30-minute enqueue cooldown. They use the existing unseen-product fetch/history and refresh product facts before generation. Daily source checks observe fair queue turns but bypass overnight writing hours.
- A Page's daily product cohort is capped at the smaller of its rule target and Page cap. For Fabrything these are50. Allocation metadata includes the Page-local day; held items still consume that day's cohort, preventing endless failed-product replacements. Product history excludes automatic repeat selection, including prior failures and archived/deleted posts; explicit editor retry remains available. Small fair batches refill the calendar rather than launching50 simultaneous model calls.
- Approval, attention and preparation now have matching server-side list/count predicates, complete workspace/Page aggregates and scoped client counts. Approval requests use lowercase `review`, accepted by the older transport validator. An active retry is PREPARING despite a retained prior error. Migration021 refreshes classification without resetting publication status, tokens, content or receipts.
- Worker health/state capability markers identify this release. Local test concurrency is bounded to two to reduce verification memory pressure; inference safeguards remain unchanged.

## Personal profile readiness

Hossain Billal is active, requires review, and has its routine disabled. It uses the existing shared routed text connection: Gemma3 4B for captions/design briefs and Qwen3 4B for the configured complex/review tasks. Both checkpoints are installed. The new profile workflow supports Text and Photo Design + Caption independently of legacy Reel settings. Existing prompts/languages are preserved.

Designed studio typography/image composition works without an image-provider token. AI-generated artwork requires selecting an image-capable connection and its provider credentials; no image connection is currently assigned. This audit made no model call and does not certify generated creative quality. Human review/approval remains required. Personal-profile output uses a manual sharing handoff, not a claimed unattended Facebook Page publication. No additional Facebook Page token is required for that handoff. See [Meta's Share Dialog](https://developers.facebook.com/documentation/sharing/reference/share-dialog) and [Pages API publishing](https://developers.facebook.com/documentation/pages-api/posts) for the different destinations.

## Checks

272 portable tests pass, with two optional PostgreSQL suites skipped in that command; both are run separately. The24 disposable PostgreSQL checks pass, including all21 migrations, fair turns, daily cohort limits, attention/approval/preparation filters, explicit retries and uncertain-receipt retention. All63 root tests pass. The isolated Vite build passes. Browser fixtures confirm nonempty scoped lists and matching tab counts,1440/390 layouts without overflow, zero JavaScript errors and zero API mutations. No synthetic model request, real website article, social post or notification was submitted. A complete private database backup was taken before any proposed live activation.

## Activation awaiting the owner's restart exception

Implementation source1e3e343 is pushed to main. GitHub Actions43561162279 completed successfully, including test and deploy; native Vercel deployment8HjJCFiGKBQYyDAHTAWeXMq33N1s also succeeded. The live dashboard returns200 with entry`index-Cf3rlN1y.js`. The existing persistent worker still returns the old health payload without lifecycle/continuity markers. The owner has been asked for the specific graceful activation exception; no answer is inferred from elapsed time. Later documentation-only commits do not activate that worker.

No live server, daemon, database, inference host, bridge or worker was stopped or restarted. No production EchoLink migration or Page/rule configuration change has been applied. The user previously prohibited live interruptions, so source/CI delivery alone cannot complete runtime activation.

The concrete proposed activation is migrations017–021 followed by the existing graceful drain/restart of the EchoLink worker/bridge supervisor. Active work must finish; uncertain receipts remain held; PostgreSQL and Ollama stay running. Apply only Fabrything's requested planning changes: preserve target50, buffer24h and minimum gap20m; use spread scheduling across the day, disable its overnight-only generation preference, and prepare small batches of three. Preserve all custom prompts/languages/connections and held content. Noble Seek keeps its24-hour live-news mode and24-hour source-age allowance. The personal routine remains paused with manual approval until deliberately enabled.

Noble Seek's saved goal150/day with a10-minute minimum gap can fit at most144 posts in24hours, even with unlimited generation throughput. Model speed, safe sources and plan capacity can lower actual output. Do not promise either profile's target as measured throughput.

Files: `platform/server/automation-planning.mjs`, `jobs.mjs`, `generation-buffer.mjs`, `scheduling.mjs`, `content-list.mjs`, `api.mjs`, `index.mjs`; `platform/shared/content-status.mjs`; `platform/client/content-list.mjs`, `content-status-counts.mjs`, `scope.mjs`; `platform/sql/021-workflow-continuity.sql`; `platform/scripts/unit-tests.mjs`; `platform/test/workflow-continuity.test.mjs`, `content-list.test.mjs`, `generation-buffer.test.mjs`; this report, `AGENT_HANDOFF.md` and `PROJECT_MEMORY.json`.

Fabrything sourcebf06014 is separately deployed through Git/CI: frontend6fo6qmtDysmsK7DFCyNuCTq1sFFS and backendHZKFvwu6Q5iVuFeQ2RqUX4ZSKn41 succeeded. Live banner/photo and1440/390 browser checks pass with no JavaScript errors; anonymous customer export returns401. Media/indexing and export handoffs remain in the sibling repository. The dedicated store image/order-alert worker still needs usable original private secrets and Meta setup; Vercel exported22 protected placeholders.
