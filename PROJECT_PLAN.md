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
The automation remains paused/dry-run with the approved draft preserved.
Facebook token/version, Sheets authorization, model factual-quality acceptance,
stable hosting and the advanced integrations listed in the guide remain open.
Earlier handoff entries below describe their dated state, not today's blockers.

Editorial operations follow-up: add explicit held Draft state, visible per-post
Edit/Review/Approve/Schedule/Publish Now controls, accurate navigation counts,
animated request/background activity, an operations center and a connection
catalog that distinguishes working adapters from planned providers. Preserve
posting gates, stale-edit detection and unknown-outcome protection. A selected
photo must not silently fall back to text-only after Facebook rejection. Setup
guides: docs/FACEBOOK_TOKEN.md, docs/GOOGLE_SHEETS.md and docs/EDITORIAL_OPERATIONS.md.

| Requirement | Acceptance check | Current state |
| --- | --- | --- |
| ১৯টিরও বেশি বাংলা নিউজ সোর্স থেকে RSS দিয়ে একসাথে খবর আসে | At least 20 distinct Bangla publishers, each with a recently fetched, parsed and language-checked feed; bounded concurrent ingestion | 20 verified publishers are enabled and linked to Noble Seek; real previews fetched 20 items with no failed feeds; RSS concurrency defaults to 4; see sources/VERIFIED.md |
| নিউজ একত্র করে গুছিয়ে নেয় এবং আগে পোস্ট হওয়া খবর বাদ দেয় | Tenant-scoped canonical URL/title constraints; historical posted checks; optional semantic similarity; explicit duplicate audit record | Exact constraints tested; semantic adapter exists; duplicate audit events now mirrored to Airtable; real semantic evaluation awaits model |
| কোনো সাইট ব্লক করলে ফলব্যাক সিস্টেম চালু হয়ে যায় | Primary timeout/HTTP/parse failure tries configured permitted fallback; RSS text survives article fetch failure; both failures logged | Blocked/malformed feed fallback tests passed; configured alternate-publisher backups imported visibly; they do not recover the exact blocked article |
| AI আর্টিকেল পড়ে আকর্ষণীয় বাংলা পোস্ট লিখে দেয় | A real installed model produces reviewed Bangla captions from article text without fabricated facts | gemma3:4b installed with an 8192-context profile; real full draft and public-dashboard inference verified; factual contradictions found and flagged, so editorial quality acceptance remains open |
| ছবি থাকলে ছবিসহ অটো পোস্ট; পরে কমেন্টে সোর্স লিংক | Photo/text publish, durable delayed-comment job, configurable delay, remote IDs and ambiguous-outcome protection | Durable delayed queue implemented; due-time, dry-run and quiet-hour gates tested; Facebook live delivery awaits user credentials/authorization |
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

The agent handles code, migration testing, table setup, workflow imports, UI,
integration probes, feed validation and documented operating instructions.

## Current handoff

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
