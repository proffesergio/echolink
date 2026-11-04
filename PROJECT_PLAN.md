# EchoLink main project goal and implementation plan

Updated: 2026-11-04. This file is the working acceptance plan. The user's seven
Bangla requirements are mandatory; the reference image defines the desired
pipeline shape, not a claim that every pictured node has been reproduced.

Current operating guide and prioritized remaining work:
[PRODUCTION_TESTING.md](docs/PRODUCTION_TESTING.md). The public dashboard at
https://echolinkbd.vercel.app/admin passed real login and local 4B connectivity
tests. The November 4 outage was an expired Quick Tunnel and was repaired.
GitHub main push and the complete Actions build/test/deploy run now pass.
CLI 65.4.0 resolved the old pinned CLI's project-settings failure with the token.
Facebook authorization and Google Sheets connection have since been completed.
A real photo post and its delayed source comment were verified directly through
Meta on November 4. The user's current Page configuration is disabled; preserve
that choice and the configured 20-post daily cap, 60-minute gap, 09:00–23:00
Asia/Dhaka window and five-minute comment delay. Live mode is configured, but a
disabled Page must remain blocked. Factual-quality acceptance, semantic duplicate
evaluation, stable hosting and the advanced integrations remain open. Earlier
handoff entries below are historical and do not override this current state.

Editorial operations implemented: held Draft state, per-post
Edit/Review/Approve/Schedule/Publish Now controls, navigation counts,
per-task stage/feed percentages, heartbeat recovery and event logs. Next: the
requested visual redesign, favicon and Page-specific image branding, plus website
publishing to https://www.fabrything.com/nobleseek. Design preferences, the logo
asset and the website backend/schema are awaiting user clarification. Preserve
posting gates, stale-edit detection and unknown-outcome protection. A selected
photo must not silently fall back to text-only after Facebook rejection. Setup
guides: docs/FACEBOOK_TOKEN.md, docs/GOOGLE_SHEETS.md and docs/EDITORIAL_OPERATIONS.md.

| Requirement | Acceptance check | Current state |
| --- | --- | --- |
| ১৯টিরও বেশি বাংলা নিউজ সোর্স থেকে RSS দিয়ে একসাথে খবর আসে | At least 20 distinct Bangla publishers, each with a recently fetched, parsed and language-checked feed; bounded concurrent ingestion | 20 verified publishers are enabled and linked to Noble Seek; real previews fetched 20 items with no failed feeds; RSS concurrency defaults to 4; see sources/VERIFIED.md |
| নিউজ একত্র করে গুছিয়ে নেয় এবং আগে পোস্ট হওয়া খবর বাদ দেয় | Tenant-scoped canonical URL/title constraints; historical posted checks; optional semantic similarity; explicit duplicate audit record | Exact constraints tested; semantic adapter exists; duplicate audit events now mirrored to Airtable; real semantic evaluation awaits model |
| কোনো সাইট ব্লক করলে ফলব্যাক সিস্টেম চালু হয়ে যায় | Primary timeout/HTTP/parse failure tries configured permitted fallback; RSS text survives article fetch failure; both failures logged | Blocked/malformed feed fallback tests passed; configured alternate-publisher backups imported visibly; they do not recover the exact blocked article |
| AI আর্টিকেল পড়ে আকর্ষণীয় বাংলা পোস্ট লিখে দেয় | A real installed model produces reviewed Bangla captions from article text without fabricated facts | gemma3:4b installed with an 8192-context profile; real full draft and public-dashboard inference verified. Unapproved captions with explicit conflict warnings or unsupported numbers now require review even on automatic Pages; relationship/name/attribution accuracy and real benchmark acceptance remain open |
| ছবি থাকলে ছবিসহ অটো পোস্ট; পরে কমেন্টে সোর্স লিংক | Photo/text publish, durable delayed-comment job, configurable delay, remote IDs and ambiguous-outcome protection | Real photo post and delayed comment verified through Meta on November 4; next extend the comment to the published NobleSeek website article URL |
| সব রেকর্ড Airtable-এ: posted/skipped/failed | Article log plus bounded duplicate/failure audit entries; comment states | Article/approval roundtrip tested; audit-event mirroring and source-comment state fields implemented |
| শুধু নির্ধারিত সময়ে পোস্ট; স্প্যাম নয় | Page timezone/window, daily cap, minimum inter-post gap, source-comment timing policy, approvals and durable reservations | Window/cap/approval and minimum-gap enforcement implemented; default 30-minute post gap and 5-minute comment delay; comments also respect quiet hours |

## Delivery order

1. Finish the local authenticated admin UI and single-canvas n8n pipeline.
2. Add durable delayed source comments, minimum post gap and operational logs.
3. Validate Bangla publisher feeds; keep unsuccessful sources visible as candidates,
   never count category feeds or unverified/English feeds toward 20 publishers.
4. Import validated feeds disabled, ready to link/enable after the user selects
   pages, models and editorial scope.
5. Test database migrations on an isolated Neon branch, then deploy additive
   schema changes. Verify dashboard, n8n, Airtable and scheduling paths.
6. User installs/starts a local model, authorizes Meta Page access and reviews the
   first Bangla captions. Keep dry run until explicitly enabled for live use.
7. Verify an explicitly authorized live post and delayed comment. Only then mark
   live publishing acceptance complete. Do not claim zero semantic duplicates:
   validate thresholds and false-positive/false-negative behavior on real stories.

## User-owned actions

- Choose the news publishers, target Facebook Pages and posting policy.
- Keep the installed local model running and review its Bangla factual quality.
- Sign into Meta, authorize the app, provide Page access and satisfy any review.
- Approve sensitive content and explicitly decide when to enable live posting.
- Provide the website backend/schema and a restricted publishing connection;
  choose dashboard styling and provide an approved NobleSeek logo asset.

The agent handles code, migration testing, table setup, workflow imports, UI,
integration probes, feed validation and documented operating instructions.

## Website publishing and branding extension — current work

- Add an authenticated website connection and connection test to the dashboard.
  Inspect the actual website schema and publish rules before choosing a driver or
  writing records; do not assume this website uses EchoLink's Neon database.
- Publish a reviewed article, image and relevant hashtags to the website before
  Facebook delivery when website publishing is enabled. Confirm the desired
  draft/review timing with the user. Keep the current approval, window, cap and
  minimum-gap gates; changing the destination must not bypass them.
- Persist the website record ID and canonical public article URL separately from
  the original publisher URL. Reuse that website record on retries, and hold
  Facebook delivery if the required website publication fails or is uncertain.
- Put the canonical website news link into the durable delayed Facebook comment.
  Preserve original-source attribution in the website article and existing logs.
  Do not invent article slugs, alter comments on existing posts, or bulk-publish
  the existing queue without an explicit user action.
- Show separate website and Facebook delivery states, actionable errors and
  task progress. Test a website draft first, then a user-reviewed live article
  and its Facebook comment. Actual acceptance needs a publicly reachable article.
- Add a favicon and reusable per-Page logo/watermark controls, with a preview of
  the exact image being approved. Respect image rights and preserve source
  attribution. Confirm logo placement and the dashboard design before redesign.

Connection checklist and delivery contract:
[WEBSITE_PUBLISHING.md](docs/WEBSITE_PUBLISHING.md).

## Latest verification — 2026-11-04 editorial gate

- `npm test`: 35 passed, zero failed. `npm run build`: passed.
- `node scripts/validate-migration.mjs`: all 12 required tables, concurrent
  scheduler claims, newsroom transitions, durable photo/comment delivery,
  progress recovery and the new editorial holds passed on a disposable Neon
  branch. The branch was removed. Facebook and AI responses were mocked in this
  integration test; no production test post was created.
- A read-only production audit detected the saved polling draft's explicit
  conflict warning. Its existing matching human approval was preserved. This
  does not constitute factual-quality acceptance or certify the approved text.
- The local worker was restarted only after stopping scheduled ticks and
  confirming no task was running. Its health check passed and the previously
  active n8n pipeline was restored. Worker, bridge, tunnel, public dashboard,
  Ollama and n8n connectivity checks passed. The user's Page stays disabled.

## Historical handoff (superseded by the current state above)

The local admin dashboard passed a real Edge browser check, including login,
model/page policy controls, 20+ feed rows, masked secrets and mobile layout.
Nine workflows are preserved, but only Complete pipeline is needed: all seven
functional jobs now connect on one canvas, including delayed comments and
analytics, with per-job cadence and PostgreSQL leases. All remain inactive and
dry-run. Sixteen automated tests pass. Dashboard navigation is guarded during
loading/sign-out/service errors. Settings manages persistent password sign-in,
service credentials, inference, embeddings, job intervals and publishing mode.
Immediate dashboard Start/Stop needs a user-created n8n API key; alternatively
the user can publish directly in n8n.
New SQL was tested on a temporary branch before production. Live Facebook
publication/comment acceptance and real model generation remain pending. Use
docs/WINDOWS_GUIDE.md for the user's setup steps.

## Follow-up evidence

The real 20-feed ingestion probe ran on a disposable Neon branch, with one item
per feed and four concurrent network requests. It inserted 17 items and detected
two duplicates on the first pass; the second inserted two new items and detected
17 duplicates. No feed exhausted all its configured routes. Per-item extraction
can still fail and is audited. The probe prohibited Airtable/Facebook writes and
removed its branch; see sources/INGESTION_VERIFICATION.txt. Exact deduplication
now happens before fetching an already-known article's HTML.

Airtable integration additionally verified actual skipped-duplicate and failed
audit rows. Dashboard recovery now requires confirmation, resets article approval,
preserves comment delay, and excludes ambiguous remote outcomes. These paths
passed real worker/database integration checks. Real model generation, semantic
model evaluation, Facebook authorization and a live post/comment remain pending.

Single-workflow acceptance now passes both manual execution of all seven stages
and two scheduled ticks with due/skip assertions. The temporary probe workflow
was deleted, preserving the original nine. Build, 16 automated tests, dashboard
HTTP/secret checks and Edge browser regression checks all pass.

2026-11-03 authentication/hosting update: DASHBOARD_PASSWORD is supported and
actual user-password login was verified without changing the password. Settings
password creation/hash persistence/re-login passed a real Edge test against an
isolated worker. Public-origin/Secure-cookie support and a Vercel static UI +
server-side tunnel proxy were added; 17 automated tests pass. Deployment files
are prepared, not publicly deployed. FIRST_FACEBOOK_POST.md documents all 21
canvas nodes, the first approved live post, delayed comment and manual account
steps. HOSTING_AND_VERCEL.md explains local/tunnel operation and free-tier limits.

2026-11-03 newsroom update: root cause of empty user run was zero enabled feeds.
Twenty verified Bangla feeds were enabled/linked for Noble Seek (BBC remains
paused). Real Ollama preview sampled 20 items: 17 inserted, 2 duplicate encounters,
0 failed feeds, 14 eligible today candidates. It generated a review caption with
analysis and a source-image candidate/suggestion and mirrored records to Airtable.
Added source timestamps/ranking, durable run activity, background previews, draft
editing and future scheduling with fresh approval. Source-image candidates and
illustration prompts are reviewable; no image-generation engine is connected.
Google Sheets connection/mirroring adapter is ready; the user will create/share
a spreadsheet after setup. Real Google writes remain unverified until authorized.
See NEWSROOM.md and GOOGLE_SHEETS.md. Successful/manual n8n results/progress are
now retained without replacing the user's nodes or connections.

2026-11-03 deployment/model follow-up: the 4B model was downloaded and a local
echolink-gemma3:4b profile created with 8192 context. A real preview generated a
full Bangla draft, but contradictory polling numbers were found and flagged;
this is not a factual-quality acceptance pass. The n8n schedule remains paused
after isolated testing to preserve the user's approved draft. DRY_RUN remains
true. Facebook still requires a Page access token; Google requires the user's
spreadsheet/service-account authorization. The dashboard was deployed to Vercel
at echolink-green.vercel.app through a restricted, authenticated local bridge
and temporary Cloudflare tunnel. GitHub main CI/CD is defined; actual push and
Actions acceptance depend on valid GitHub login and a persistent Vercel token.

Public Edge acceptance passed using the existing local password: one Page,
21 feeds, Drafts and Activity, Secure/HttpOnly session, no browser errors or
exposed secrets. Anonymous tunnel HTTP 401 confirmed. Build and 24 automated
tests passed. Initial commit exists locally; GitHub rejected the main push
with invalid saved credentials, so CI deployment is not yet verified.
# Publishing platform update — 2026-11-04

User criteria: immediate reviewed photo publishing; monthly calendar and automatic due delivery; Page-local daily cap and configurable hourly gap; relevant reviewed hashtags; delayed source citation; persistent Meta cooldowns and credential/policy pauses; no blind retry of uncertain writes. Implementation and operating guide: [PUBLISHING_PLATFORM.md](docs/PUBLISHING_PLATFORM.md).

Saved live connections verified: Facebook token resolves to Noble Seek and Google Sheets metadata resolves to EchoLink Posts. Preserve the user's 2 posts/day, 60-minute gap, 09:00–23:00 Asia/Dhaka, required approval and 5-minute source-comment delay. User requested a fresh draft for review before the first live acceptance post; the overdue Senate-poll article is held as Draft because its stored editorial analysis flags contradictory figures. A new 4 November draft with photo/hashtags was generated, corrected against the stored source, left Pending Approval, and mirrored successfully to Airtable and Google Sheets. Do not claim a real Facebook post/comment has been accepted until it is reviewed and confirmed remotely. The initial n8n API HTTP 401 was resolved with the user's fresh key (HTTP 200); the updated single pipeline was saved and activated through the running API. Automatic generation pauses at three pending reviews; severely late schedules become held Drafts to prevent stale Airtable approvals from reactivating them.
# Publication diagnosis and task observability — 2026-11-04

User reported a rejected Publish Now and endless loading. Diagnosis: the selected image returned HTTP 200/JPEG and the saved Page token identified Noble Seek, but Meta token inspection showed Ads/read scopes without `pages_manage_posts` or `pages_manage_engagement`. An unpublished-photo diagnostic returned HTTP 403/code 200 explicitly naming missing `pages_manage_posts`; no diagnostic object was created. The replacement token retained the same missing scopes, and the user confirmed their app's permission picker only offers Ads/read permissions. They must enable a Page-management use case or create an appropriate app; do not retry a live post until publishing permission is verified.

Implemented scope-aware connection/publishing preflight, sanitized actionable Meta diagnostics and clean explicit retry state. Replace the shared animation with per-task calculated stage/feed percentages, heartbeat/deadline recovery, elapsed time and event logs; include n8n initiation and output preparation. Add a modern README/banner and contribution/security guides. Real publishing remains pending Meta authorization; no code can add ungranted app permissions.
