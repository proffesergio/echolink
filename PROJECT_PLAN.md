# EchoLink creator platform: main project goal and implementation plan

Updated: 2026-11-04. EchoLink is being expanded into a multi-niche creator
operations platform: multiple brands/Pages/channels, languages, content types and
post formats, with optional per-Page website publication and link sharing. The
news pipeline remains its first working module. Its seven Bangla requirements
remain the news acceptance track; the reference image describes that pipeline,
not the boundaries of the whole product.

The detailed phased architecture, researched monetization experiments, local
media feasibility and future YouTube plan are in
[PLATFORM_ROADMAP.md](docs/PLATFORM_ROADMAP.md). That roadmap distinguishes working
features from planned adapters and preserves the existing publishing behavior.

Current owner preference: **automatic Facebook source/website link comments are
disabled**. Website posting and linking must be separate per-Page choices. Keep
the publishing path direct; enforce configured policies and actual platform
responses without inventing universal daily/link limits. Existing approvals,
per-Page schedules and disabled states remain authoritative.

Current operating guide and prioritized remaining work:
[PRODUCTION_TESTING.md](docs/PRODUCTION_TESTING.md). The public dashboard at
https://echolinkbd.vercel.app/admin passed real login and local 4B connectivity
tests. The November 4 outage was an expired Quick Tunnel and was repaired.
GitHub main push and the complete Actions build/test/deploy run now pass.
CLI 65.4.0 resolved the old pinned CLI's project-settings failure with the token.
Facebook authorization and Google Sheets connection have since been completed.
A real photo post and its delayed source comment were verified directly through
Meta on November 4. A final November 4 read shows the Page enabled in Airtable;
preserve the current owner-managed activation setting and the configured 20-post
daily cap, 60-minute gap, 09:00–23:00 Asia/Dhaka window and five-minute comment
delay. Live mode is configured; a disabled Page must remain blocked whenever the
owner disables it. Factual-quality acceptance, semantic duplicate
evaluation, stable hosting and the advanced integrations remain open. Earlier
handoff entries below are historical and do not override this current state.

Editorial operations implemented: held Draft state, per-post
Edit/Review/Approve/Schedule/Publish Now controls, navigation counts,
per-task stage/feed percentages, heartbeat recovery and event logs. Next: the
requested visual redesign, favicon and Page-specific image branding, plus live
website delivery acceptance for https://www.fabrything.com/nobleseek. The website
schema and logo assets have been located; branding controls and design choices
remain open. Preserve
posting gates, stale-edit detection and unknown-outcome protection. A selected
photo must not silently fall back to text-only after Facebook rejection. Setup
guides: docs/FACEBOOK_TOKEN.md, docs/GOOGLE_SHEETS.md and docs/EDITORIAL_OPERATIONS.md.

| Requirement | Acceptance check | Current state |
| --- | --- | --- |
| ১৯টিরও বেশি বাংলা নিউজ সোর্স থেকে RSS দিয়ে একসাথে খবর আসে | At least 20 distinct Bangla publishers, each with a recently fetched, parsed and language-checked feed; bounded concurrent ingestion | 20 verified publishers are enabled and linked to Noble Seek; real previews fetched 20 items with no failed feeds; RSS concurrency defaults to 4; see sources/VERIFIED.md |
| নিউজ একত্র করে গুছিয়ে নেয় এবং আগে পোস্ট হওয়া খবর বাদ দেয় | Tenant-scoped canonical URL/title constraints; historical posted checks; optional semantic similarity; explicit duplicate audit record | Exact constraints tested; semantic checks now include prepared captions and lazily index prior posts using publication-time memory. Real embeddinggemma calibration and corpus probes completed; 0.92 produced a false match, so automatic semantic skipping remains disabled pending held-out evaluation. See docs/SEMANTIC_DEDUPLICATION.md |
| কোনো সাইট ব্লক করলে ফলব্যাক সিস্টেম চালু হয়ে যায় | Primary timeout/HTTP/parse failure tries configured permitted fallback; RSS text survives article fetch failure; both failures logged | Blocked/malformed feed fallback tests passed; configured alternate-publisher backups imported visibly; they do not recover the exact blocked article |
| AI আর্টিকেল পড়ে আকর্ষণীয় বাংলা পোস্ট লিখে দেয় | A real installed model produces reviewed Bangla captions from article text without fabricated facts | Candidate Gemma adapter/post_text mapping produced full Bangla posts, but remains diagnostic-only after factual failures. Production retains its existing prompt with added numeric-direction, quotation, unsupported-notes and observed boilerplate review signals. Broader claim/attribution validation remains open. See docs/CAPTION_QUALITY.md |
| ছবি থাকলে ছবিসহ অটো পোস্ট; পরে কমেন্টে সোর্স লিংক | Photo/text publish, optional delayed-comment job, configurable delay, remote IDs and ambiguous-outcome protection | Real photo post and delayed comment verified through Meta on November 4. Website URLs are supported, but the owner's later instruction disables automatic link comments; current policy skips them |
| সব রেকর্ড Airtable-এ: posted/skipped/failed | Article log plus bounded duplicate/failure audit entries; comment states | Article/approval roundtrip tested; audit-event mirroring and source-comment state fields implemented |
| শুধু নির্ধারিত সময়ে পোস্ট; স্প্যাম নয় | Page timezone/window, daily cap, minimum inter-post gap, source-comment timing policy, approvals and durable reservations | Window/cap/approval and minimum-gap enforcement implemented; default 30-minute post gap and 5-minute comment delay; comments also respect quiet hours |

## Platform delivery order

1. Finish/test the optional NobleSeek website connector and link opt-out.
2. Introduce content profiles, independent destinations and multi-niche/language
   configuration while retaining existing news/Page compatibility.
3. Add brand kits, favicon/logo/watermark and image/quote formats with exact
   media previews; then campaign planning and creator performance tracking.
4. Build an original-video MVP using scripts, suitable narration, subtitles and
   composition before evaluating large generative-video models on appropriate
   hardware. YouTube delivery begins with a private authorized upload.
5. Expand rendering, optional paid providers, teams and measurable revenue
   experiments after the earlier paths are verified. No earnings guarantees.

## Original news delivery order and acceptance

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
- Keep the supplied website connection valid; choose dashboard styling and
  initial niche/content profiles. The website repository supplies NobleSeek logo
  assets; their placement and per-Page branding controls still need implementation.

The agent handles code, migration testing, table setup, workflow imports, UI,
integration probes, feed validation and documented operating instructions.

## Website publishing and branding extension — current work

- Website source/schema inspection is complete: Django/PostgreSQL with the
  supplied separate connection. Add the connection test, deterministic-slug
  writer, delivery fields, mirrors and existing-card status/link display.
- Publish a reviewed article, image and relevant hashtags to the website before
  optional Facebook delivery. Website failure only holds Facebook when explicitly
  configured as required; the default is independent optional delivery. Keep the
  current approval, window, cap and minimum-gap gates.
- Persist the website record ID and canonical public article URL separately from
  the original publisher URL. Reuse that website record on retries, and hold
  Facebook delivery if the required website publication fails or is uncertain.
- Support the canonical website URL in the delayed Facebook comment when the
  owner opts in. The current owner opted out: skip automatic link comments and
  expose the URL for manual sharing. Preserve original-source attribution.
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

## Latest connector and roadmap verification — 2026-11-04

Latest caption follow-up: `npm test` passed 50 tests and build passed. Added
diagnostic-only Gemma 1–3 prompt formatting and complete `post_text` output,
plus narrow source/number/quotation review signals for production. The existing
production prompt remains the default because the candidate failed factual tests.
Candidate language validation does not change the legacy production contract.
Existing `caption` responses stay supported; retry stages are visible.
The post editor now supports correcting notes, with fresh approval and stale-edit
protection. See [CAPTION_QUALITY.md](docs/CAPTION_QUALITY.md).

Four real local-model diagnostic cases produced 290–446 character captions in
85–109 seconds, all on their first attempt with the new response field. The
owner's temperature 0.6 was preserved. They still included invented details,
an incorrect analysis figure and an omitted conflict marker: factual-quality
acceptance failed, even though structure improved. No diagnostic article, approval,
website post or Facebook post was created. Review-first publishing was recommended;
the owner's current approval policy is not changed without their choice.
Final disposable-Neon checks passed all scheduling, editorial, delivery and semantic
paths, including notes editing and the new review signals. The temporary branch
was removed. Browser fixtures verified notes-only correction before scheduling;
no real content was changed. The worker was reloaded while idle and n8n's prior
active state was restored, with the stable production prompt retained.

Earlier semantic follow-up: `npm test` passed 42 tests and build passed. Disposable
Neon checks passed the prepared-caption path, prior-post backfill, input/model
cache invalidation, Page isolation, publication-time expiry and safe provider
failure. An additional real local embeddinggemma → cloned Neon → prepared-caption
skip integration passed with 768-dimensional vectors and no Facebook request.
The temporary branch was removed; no production migration was needed. Eighteen
synthetic pairs and twelve related real-feed
pairs were measured without publication or article-state changes. At 0.95 the
synthetic set had zero false matches and two missed duplicates; this is calibration,
not accepted general accuracy. Semantic mode remains disabled. The implementation
and remaining held-out evaluation are in
[SEMANTIC_DEDUPLICATION.md](docs/SEMANTIC_DEDUPLICATION.md).
The installed model and 0.95 calibration setting were saved without enabling
semantic mode. Worker restart waited for idle tasks; the active n8n state was
restored. Public login/session/privacy checks passed after the update.

- Expanded product direction: multi-niche content profiles, Pages/channels,
  languages, image/quote/video formats, independent optional website destinations,
  creator performance experiments and phased YouTube support. These future
  modules are planned, not marked implemented.
- `npm test`: 39 passed; build passed. Disposable Neon checks proved website-first
  publication, required versus optional website failure, idempotent retry, skipped
  automatic comments, dry-run safety and a second Facebook-only Page working
  even with an invalid website connection. Remote APIs were mocked.
- The real website database passed 28-column validation and a DRAFT insert/read/
  retry/rollback probe; no test article was retained. Public listing matched the
  database, but existing Bangla-slug detail URLs returned 404. A new live public
  article URL remains unverified; do not claim full website delivery acceptance.
- Migration 008 and Airtable website fields/Skipped comment state were applied.
  Optional website delivery is configured only for NobleSeek. Initial checks
  preserved the disabled Page; a final Airtable read shows it enabled. No test
  changed that setting. The 20/day cap and 60-minute gap remain. A comments job returned
  `policyDisabled:true` with zero sent. Sheets upgraded its dedicated header and
  synchronized 64 rows successfully.
- Local worker/bridge/tunnel/dashboard/Ollama/n8n connectivity and the CMS browser
  regression passed. The browser tested website status/link display and publishing
  controls with intercepted writes, not a real post.
- Repeated n8n API HTTP 401 was traced to the dashboard password replacing the
  API key. The latest full secret passed a real HTTP 200 check. Credential fields
  now use password-manager hints separate from login, and the backend rejects a
  dashboard password in the n8n key field before changing memory or disk. Both
  plaintext/hash password modes passed isolated regression tests. The running
  worker also rejected the autofilled password with HTTP 400 while leaving
  `.env.local` unchanged. Dashboard Start/Stop/Start passed against n8n, and the
  original active workflow state was restored. Browser checks confirmed the
  Settings key field is blank and uses the new credential hints.
- `embeddinggemma` was downloaded successfully for later Bangla semantic testing;
  semantic mode remains disabled and its accuracy is not accepted yet.

## Earlier verification — 2026-11-04 editorial gate

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
