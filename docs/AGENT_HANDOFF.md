# EchoLink handoff — 2026-11-12

Read this page first; `PROJECT_MEMORY.json` maps files and relationships.

## Runtime and delivery

- Frontend: React/Vite on Vercel, https://echolinkbd.vercel.app.
- Persistent Node worker: localhost:8790; protected bridge: localhost:8788;
  supervised Cloudflare tunnel with registry-based route updates.
- `npm run platform:serve` starts supervision; `npm run platform:restart` drains
  active work and restarts it. Root `npm start` is legacy. n8n is optional, not
  the runtime engine. Vercel hosts the frontend/proxy, not persistent inference.
- Current primary: local PostgreSQL 18, port 55432. Aiven is backup/registry;
  Neon is archived/quota-blocked. Preserve the original encryption key and
  encrypted connection secrets. Never select a stale standby as writable primary.
- Root `.env.local` supplies operator/bridge tools; `platform/.env.local` supplies
  the worker. Host selection also lives in ignored `platform/.local/inference-host.json`.
- `npm run db:backup` writes private custom-format dumps under `.codex/backups/`.
- GitHub repository proffesergio/echolink is PRIVATE as of November12, verified through the GitHub API. Owner requested a controlled SaaS repository; do not make it public or add README installation instructions. Main workflows remain configured; deployment status must be verified separately.

## Local operations and monitoring — November 12

- Current local checks: worker8790, bridge8788, PostgreSQL55432, Ollama11434,
  protected tunnel and dashboard API all healthy. A supervisor restart applied
  the new monitoring backend gracefully after tests; active/uncertain delivery
  receipts were preserved. No synthetic model call, website write or social
  publication was submitted. The earlier reconnect/inference warnings were not
  reproduced by current read-only health checks.
- New safe entry point: `npm run platform:up`. It starts the prepared selected
  local cluster, leaves a healthy worker/bridge alone and otherwise uses the
  graceful restart. `platform:start` / `platform:repair` now use this entry point
  instead of directly invoking the internal force-stop restart step.
- `npm run platform:status`, `-- --watch`, `-- --json` work without dashboard login.
  The local operator route uses the existing worker token; the bridge/proxy cannot
  reach `/internal/platform/operations`. `npm start` remains historical.
- Owner-only API `/api/owner/operations`: cached read-only health probes, supervisor
  heartbeat, queue summaries, saved connector test states, database pool and query
  traffic, process CPU/RSS, host RAM, event-loop delay, bounded route/outgoing API
  latency and native inference token counters. No prompts, SQL values, auth cookies,
  secret headers or connection URIs are logged. Old post token data is not invented
  or retroactively merged. Aggregates begin with monitoring activation.
- Rollups persist privately for24 hours, every30 seconds; hard stops may lose the
  last unsaved interval. Route/model tables/latency samples reset on worker restart.
  Native usage was confirmed on real preparation completion:7,448 input and557 output tokens at10:30 Dhaka November12. Counts arrive after non-streaming calls finish.
- This remains one worker host, one writable primary, one local inference/model
  request at a time; load balancing and automatic DB failover are NOT enabled.
  Worker RSS/free RAM are not remote inference-host VRAM measurements.
- All205 portable tests and29 isolated API checks pass, including anonymous/tenant rejection and owner monitoring access.
- User approved the Operations design on November12. The built-in Owner console
  now opens on Operations: real service health, read-only30s auto-refresh, rolling
  traffic/native-token charts, stale snapshot recovery, queue/connector details,
  DB pool/query metrics, host memory/worker CPU and explicit single-host limits.
  `platform/client/operations-monitor.jsx` / `.css` reuse the approved SuperDesign
  target and 12ui conversion/alignment kit; no fake chart crops/counts are shipped.
  Other Owner tabs and their actions remain. Video Studio stays UI-only.
- Validation:205 portable tests,29 isolated API integration checks and the full
  browser suite passed, including auto-refresh, stale recovery, read-only behavior,
  mobile overflow and zero browser JS errors.63 root tests and platform/root builds pass. Final desktop/mobile capture review also removed the closed mobile sidebar shadow; targeted navigation/overflow checks pass. No synthetic inference or publication was submitted.
- README is now a client-facing SaaS overview with product/demo/contact links,
  truthful delivered/planned capabilities and no installation steps or host details.
  Root package is private/UNLICENSED to avoid accidental package publication.
  Operational guides stay in the now-private source repository for authorized use.
- Runbook and scope/limitations: `docs/LOCAL_OPERATIONS.md`. Metrics/health code:
  `platform/server/operations-telemetry.mjs`, `operations-monitor.mjs`; commands:
  `scripts/ensure-platform.mjs`, `platform-status.mjs`. No new backend model or
  Prometheus/Grafana service was installed.

## Current Operations release — November12

- READY production deployment: `dpl_7y2U6ZPKiLhmtG1yCXrpVGbSeHJv`,
  https://echolink-n86iba907-omniteam1.vercel.app; alias https://echolinkbd.vercel.app.
  Live entry `index-Bf6ByUy9.js`, Operations chunk `app-CsVyjIjY.js`.
  Homepage, entry, Operations chunk and public health returned200; anonymous
  Operations returned401. This includes the approved monitor and final typography.
- One later mobile-only CSS fix removes the hidden sidebar shadow. It is built
  and browser-verified locally (`index-D342ZObb.js` / `app-n02bVhhs.js`) but its
  deployment `dpl_BwWkoiDQjkyVp7x9ESyA1Nwbqqc8` is BLOCKED, not deployed.
  API reason: commit author lacks deployment access; `TEAM_ACCESS_REQUIRED`,
  `isVerified:false`. Making the repository private activated Hobby author checks.
  Do not restore public visibility or falsify author identity to bypass this.
- GitHub authenticated owner is proffesergio; current commit email matches that
  GitHub user's public email. Vercel CLI identity is billsfariji-4299. User was
  asked to connect proffesergio in the actual Hobby owner account's Vercel Login
  Connections, then reply Connected. No paid seat/plan upgrade was purchased.
  After the owner link is fixed, retry the built release and verify the live entry.
- Isolated Operations preview accounts/servers were cleaned up. The interrupted
  browser screenshot fixture was removed only from creator_test; final full suite
  passed. No production publishing/inference restart was needed for frontend work.

## Current CMS release — November 11

- Approved modern CMS: light canvas, white panels, compact charcoal sidebar,
  coral actions, grouped navigation and responsive forms/status/delivery receipts.
  Existing Page automation, editorial/crisis holds and uncertain receipts remain.
- Content now uses independent Page/status/archive/trash queries, with stable
  pagination. Published sorts by actual `published_at`, not draft creation time.
  Polling keeps loaded rows, keyboard focus and scroll position. Live workflow
  events scroll only their own log; navigation starts at the top.
- `platform/client/cms.jsx` / `cms.css`: compact expandable content rows, loaded-
  content search, list/grid toggle, true counts/updated time, recent real Media
  library and a Page prompt overview. Full existing editing/delivery actions stay.
  The obsolete price-caption checkbox was removed; commerce still omits prices
  and directs customers to the website for the current price.
- `platform/client/video-studio.jsx` / `video-studio.css`: UI-only research/brief,
  storyboard/scripts, voice/caption planning, timeline and review/export profiles
  for YouTube, Facebook, Instagram and TikTok. Editable planning drafts save only
  in this browser, scoped by workspace and Page. Reference links are not fetched
  or verified. AI tools, video rendering/exports and uploads are not connected.
  Do not confuse these planning checks with newsroom publication approval.
- SuperDesign CMS/Video direction approved by the user; 12ui responsive conversions
  and target alignment kits completed. Drafting scope still rejected after login;
  conversion worked. Low-overlap selector plans were reviewed manually, with real
  data and honest placeholders preserved. Research: `CMS_DESIGN_RESEARCH.md`.
  Private canvas metadata/targets/QA evidence remain in ignored `.superdesign/`.
- Validation: 199 portable tests passed; isolated API integration previously 28/28;
  final full browser suite passed, including Content ordering/scope/310-row paging,
  focus/scroll, video draft persistence/Page isolation and no video API writes.
  Zero browser JS errors and mobile overflow; platform/root builds passed.
  No synthetic website/social publication was submitted. Isolated preview fixtures
  and servers were cleaned up; the production worker was not restarted for this UI.
- Freshness API changes were gracefully restarted/deployed earlier in this task
  (`dpl_FZozQnxKDyHLMjoV3hYo76PiiQBm`). Current CMS deployment: `dpl_J5S7eadXEiTNaAjXVwpQASbEAffT` (READY), https://echolink-ohe511bk2-omniteam1.vercel.app, production https://echolinkbd.vercel.app. Tested entry bundle: `index-cFM2HdKl.js`. Live homepage, entry asset and worker health all returned HTTP 200; the live HTML contains the tested bundle.

## Owner preferences

- Independent per-Page configuration. News: NobleSeek; commerce: Fabrything.
- Auto generation/scheduling/publishing enabled, configurable human approval;
  mandatory crisis/factual holds remain. Do not publish test fixtures.
- Prefer generation 22:00–07:00 Asia/Dhaka, daytime rescue when nearly empty.
  Publishing may run any time, with each Page's existing gap/cap and plan limits.
- News website: https://nobleseek.fabrything.com. Website first, verify exact full
  report, then social caption/design/calendar. Comment URL delay at least 5 min.
- Bengali news; product caption language follows Page settings; price BDT/৳.
- Free local inference. Do not buy credits or delete working models unasked.

## Current inference and newsroom work

- PC: i5-6500 / 4 logical threads / ~12 GiB RAM / GT730; CPU inference.
- Quality profile: 4 threads, context ceiling 8192, output ceiling 4096,
  batch 128, 30-minute call deadline, 768 MiB admission headroom and 512 MiB
  emergency abort. One model/request at a time. No useful GPU acceleration assumed.
- Current automatic mode: `brief`, implemented in `news-brief-writer.mjs`.
  Writer `gemma3:4b-it-q4_K_M` uses context 6144, output allowance 4096,
  temperature 0.6 (repair 0.3). Reviewer `echotent:qwen3-4b` uses context 6144,
  output 1024, temperature 0. One whole-report review replaces per-section
  reviews. Facebook uses the accepted lead without another inference call.
  Keep one local request/model at a time, reserve 768 MiB and abort at 512 MiB.
- Reports accept 80–500 words in two to six paragraphs. Short sources target
  concise 100–150-word copy without padding, but must have a supported/context-complete/
  conflict-resolved independent review and unchanged reviewed-text hash. Length
  alone never approves. Legacy anchored/composed modes remain selectable for
  future stronger-host experiments; their section/coverage rules still apply.
- Sources: at least 100 unique words of extracted reporting, or 120 unique words
  of substantive feed reporting, with >=3 finished source sentences. Headlines,
  repeated snippets and clipped fragments do not qualify. This explicitly
  replaces the earlier full-article-only floor below; source kind stays in audit.
  Research/collection reads at most two closely related articles, reusing fresh
  complete research and cached extractions (six hours). Briefs review essential
  context rather than requiring every source detail or 90% sentence coverage.
  Originality 40%, factual, script/language, chronology and crisis checks remain.
- Model JSON requests a bounded single text field rather than paragraph arrays;
  static checks remain authoritative because native schema compliance is not
  guaranteed. Two attempts maximum. A saved valid draft resumes at its review
  after resource waits without repeating the writer. Source headline numbers are
  evidence; source labels are required when disputed quantities are retained.
- Real read-only QA: first paragraph-array run degenerated and was held. Revised
  arts draft: 102 words, two paragraphs, verbatim ratio 0, one review accepted;
  inspection then exposed an ended event described as ongoing. A deterministic
  known-end-date check and explicit reporting/as-of dates now prevent that case.
  Current ministry brief: 89 words, two paragraphs, ratio 0, one Qwen review
  accepted after the word target stopped forcing padding. Writer 59.1 s; final
  review 114.6 s. These are measured examples, not general accuracy guarantees.
  QA never submitted website writes or social posts. Private runs are under
  `.codex/newsroom-check/context-brief-*`.
- Both the saved Facebook Page authorization and website schema passed read-only
  checks with `scripts/check-newsroom-ready.mjs`. Recovery utility:
  `scripts/upgrade-newsroom-context.mjs --apply --first=UUID` backs up and rebuilds
  eligible unsent automated drafts, preserves explicitly saved manual drafts,
  crisis holds, active/ambiguous delivery receipts and published website URLs.
  It retires old warning lists privately and releases stale planned slots; it
  does not approve the old text. The worker generates and reviews fresh copy.
- Earlier Nov11 frontend: https://echolinkbd.vercel.app, deployment
  dpl_DAbu3LFyEheBdPymr7SUL9WKZBUb. Worker gracefully restarted. 16 eligible
  unsent automated news drafts backed up/reset; one explicitly saved manual
  draft retained. First ministry story is live on its existing website URL and automatically
  scheduled for Facebook at 17:16 Asia/Dhaka on Nov11. No read-only QA text
  was promoted. Preserve ambiguous delivery receipts.
- Current routes: Gemma3 4B Q4 for writing/design; Qwen3 4B for news review and
  structured complex tasks. Free local only, serialized. DeepSeek V4.1 Flash is
  officially paid cloud inference (https://ollama.com/pricing); assessed for
  availability, not called or enabled as a free API. No credit/model purchase.
- Real 80–500 mode QA: ministry report146 words/two paragraphs, originality
  heuristic ratio0, accepted whole-report review/no warnings; writer78.4s,
  reviewer141.6s. No website/social submission. Sample outcomes do not establish
  general accuracy or language quality. Private context-report-80-500 artifacts.
- Real commerce sample: Gemma caption39s/design21s; Qwen caption80s/design19s.
  Both designs passed bounded checks; both captions raised quantity warnings,
  Qwen also emitted a broken tool marker. Invalid local copy now falls back to
  checked catalogue copy, retaining failure reasons. Internal model markers fail
  language validation. Two resumable commerce calls: design + Facebook copy;
  Instagram reuses supported claims. Optional feature ranking uses catalogue
  order under efficientContent=true. Published prices remain absent and the
  updated-price website notice remains mandatory.
- Fabrything import reads next100 unseen IDs using saved products as durable
  history, ordered updated_at/id. Automation imports another batch when eligible
  products are exhausted. Published/unknown/active posts prevent automatic reuse
  per Page, including archived published history. No product history is deleted.
  Active Page catalogue hides published items and shows fetched/published totals.
  Availability refresh targets externalId beyond first100; generation refreshes
  the selected product before writing too. Read-only probe: saved100 -> next100,
  overlap0; a previously missed product found directly and in stock. One real
  commerce publication confirmed after restart; unknown delivery retained.
- Countdown reads Page calendar, uses recorded retry time for overdue delivery,
  stays visible during preparation, and preserves its database clock anchor
  during polling. Explicit urgent preparation may start in daytime; paused rules,
  delivery gaps/caps, factual/crisis checks and memory safeguards still apply.
- Validation: 225 platform tests, platform/root builds and full browser suite
  passed; zero browser JS errors/mobile overflow; no test publication submitted.
- Final production inspection caught double-escaped paragraph breaks, a repeated
  heading and an unsupported reversal of the ministry noticing misinformation.
  Normalization now runs before review; an explicit awareness-reversal guard
  was added. The first article was source-corrected to107 words, independently
  re-reviewed by Qwen (119.7s), updated in place and exactly verified, then auto
  approved/rescheduled for17:16. The temporary preparation hold was restored;
  both owner routines are enabled. No duplicate article was inserted.
- Previous forced one-sentence-per-source writer at 0.25 copied too closely.
  It produced 594 words / 12 paragraphs / six reviewed sections, but retained
  ~61% unquoted source prose; it was correctly held, never test-published.
- Real composition comparisons on the same difficult cricket dossier: Gemma3
  0.7 introduced an unsupported ordinal; Qwen3 0.7 repeated paragraphs and
  corrupted Bengali. Both were held, never published. At 4096 context the
  Gemma3 draft took 54.2 s and Qwen3 review 54.5 s; reviewer caught omitted/
  changed facts. A long correction later received Ollama HTTP 500. Do not
  represent any of this as a fully validated original report. The final scoped
  paragraph/edit check was held for unsupported numbers,
  changed modality and internal-format leakage. Anchored baseline at temperature 0.7 passed a real writing/review pair:
  Gemma3 60.8 s, Qwen3 70.7 s. This is one section, NOT a fully validated
  original article. Never describe free composition as production-validated.
- Keep originality threshold 40% substantial unquoted whole-source sentences;
  this is an internal heuristic, not Meta's originality certification.
- Superseded first CPU brief attempt: >=180 unique source words, >=150 report words,
  >=3 paragraphs. Research full articles/JSON-LD, never combine RSS-only snippets
  to qualify. Prefer the primary report; select leading whole facts to roughly
  260 source words and retain later allegations, denials, caveats and contrasts.
  Related coverage still participates in conflict detection. Audit records scoped
  and omitted evidence IDs. Keep >=90% assigned coverage, independent section
  review, the 40% originality limit and reviewed-text hash. Headline numbers from
  the canonical source headline are evidence too. Copying now triggers section
  repair before final assembly; repair includes the actual failed draft.
- News social copy: two factual sentences, configured first-comment invitation,
  three final hashtags; no mandatory engagement question. Old caption warnings
  on untouched drafts are historical; only regeneration replaces their checks.
- Daytime rescue for automatic news ignores unprepared/held draft slots when
  deciding whether delivery coverage is healthy; writing excludes its own planned
  reservation. Publication gap/cap reservations remain intact. Manual-review
  Pages still count their pending approval slots.
- Conflict detection compares same-unit quantities and outcome polarity rather
  than treating every extra date/context number as a contradiction. It remains
  heuristic, not a substitute for verification.
- November 11 recovery: backed up/requeued 14 undelivered owner automation
  drafts; one remaining conflict held. The worker resumed real source research
  and writing, but some attempts still failed model JSON/language/originality
  checks. Do not claim a successful automatic news publication without receipts.
  Last live observation: a recovered story is writing section 1 of 2; another
  correctly held because its only 1,400-character source remained feed_only.
- Ecommerce captions omit prices even under older includePrice settings and add
  “আপডেটেড মূল্য জানতে আমাদের ওয়েবসাইট দেখুন।” (English equivalent for English
  Pages). Updated the owner's ecommerce Page and 33 eligible pending captions;
  removed their obsolete price snapshots. Active/ambiguous deliveries excluded.
- Website DB sessions now have a 60-second absolute deadline and bounded cleanup,
  including a guard against queries continuing after expiry. Submitted writes
  still become uncertain on lost responses. A >1-hour catalog-read preflight
  blocked restart: recovered only after checking scheduled state, no attempts
  and no active receipts, holding workspace/post locks through process restart.
  `npm run platform:restart -- --recover-preflight` supports this narrow recovery.
- Shared whole-article instructions also conflicted with section composition;
  the writer system now explicitly limits each call to its assigned section.
- Earlier AI-generated corrupt titles and caption-length instructions polluted
  article prompts. Canonical source titles and separate articleStyleNotes fix this.
- Paragraph composition permits fact combination/reordering; strict evidence
  review, numbers/units/negation/language and final originality checks remain.
- Source URLs/evidence/audit stay private; necessary prose attribution remains.
  Never invent reporting, interviews, causes, analysis or claim external verification.
- Native Ollama supports JSON `format`; prompts and schema must agree.

## Files and verification

- `platform/server/news-brief-writer.mjs`: current one-report writer/context review.
- `platform/server/news-report-writer.mjs`: mode routing and legacy section writer.
- `news-composition.mjs`: natural paragraph contract and Page sampling settings.
- `news-quality.mjs`, `news-anchors.mjs`: evidence/quality/legacy constrained grammar.
- `news-extraction.mjs`, `news-desk.mjs`: source extraction and collection.
- `website-first.mjs`, `news-social-stage.mjs`, `jobs.mjs`: delivery order/receipts.
- `inference-resources.mjs`, `inference-host.mjs`: operator capacity and host profiles.
- `platform/client/editorial.jsx`, `newsroom.jsx`: controls and private audit UI.
- `scripts/verify-newsroom.mjs --post=UUID --writer=MODEL --reviewer=MODEL
  --context=4096 --mode=brief --run=LABEL --full`: read-only real inference, no delivery. Brief mode uses its bounded 6144 context. Default stops after
  one accepted section. Use distinct run labels. Private checkpoint/result: `.codex/newsroom-check/`.
- `npm test --prefix platform`: isolated creator_test DB, never production.
  `npm run test:unit --prefix platform`: portable tests used by CI.
  `npm run test:browser --prefix platform`: isolated real browser flows.
  Build platform first, then root build. Avoid concurrent real model experiments.
- November 11 final checks: 203 platform tests passed against isolated test DB;
  both builds passed. Earlier portable run: 172 passed before final brief/rescue
  additions; full final suite includes those additions. No new browser UI changes.
  Runtime restarted gracefully with these server changes. No Git/deployment commit
  was created in this workspace; frontend assets unchanged, backend is local.
  Previous baseline: 187 platform tests, 63 root tests,
  browser checks, both builds; deployment commit `3d782ef` succeeded. New checks
  and latest commit must be recorded after this change.

## Recovery and next machine

- `echotent:*` names are local model aliases, not a newly trained newsroom model.
- Avoid repeating the same failed 4B benchmark without a substantive model or
  prompt change; the private logs already show its limits.
- Both original Page routines were restored after tuning from private
  `.codex/backups/newsroom-performance-routines.json`. Preserve their enabled state.
- Pending legacy drafts already reset by `upgrade-newsroom.mjs`: 15 unsent news
  drafts, with backups. Published/website-confirmed/sensitive/manual stories preserved.
- For active local-only generation upgrade, `restart-stalled-generation.mjs
  --apply-update` backs up/requeues local preparation; refuses active delivery.
- On a stronger host, install Ollama and a commercially permitted model, connect
  over LAN/VPN using Owner → Inference host, select profile, test models, then
  set per-purpose model/context routes in the Page's text connection. Never expose
  unauthenticated Ollama publicly. Benchmark stronger writers on the same evidence;
  do not assume model size, GPU usage or higher temperature proves accuracy.
- Follow `INFERENCE_QUALITY.md` and `EDITORIAL_POLICY.md`. Meta policy pages may
  require login; check current Page/account eligibility in Professional Dashboard.

## Continue efficiently

Do not rerun known failing 4B experiments merely to obtain a green result. Read
the private run metadata first. The next substantive newsroom step is a stronger-
model benchmark with human scoring on multiple niches and numerical/negation
adversarial cases, preserving publication holds. Source-relative date resolution
and auditable media licensing need further work; do not claim every Meta policy
is automatically enforced. For the broader SaaS scope consult the relevant
sections of `MULTI_TENANT_PLAN.md` and `PLATFORM_ROADMAP.md`, treating their dated
items as plans until verified. When changing inference host, review the existing
operator CPU/context overrides; remote CPUs are not capped by this worker's count.
