# EchoLink handoff — 2026-11-13

Read this page first; `PROJECT_MEMORY.json` maps files and relationships.

## Commerce, journal and remote merge — November13

- Owner approved both hosted designs and authorized main pushes/CI/CD after checks. Existing live service restart/kill restrictions remain. No worker activation or manual production migration occurred.
- Merged incoming64b435f (profile workflows, fair queue, SQL017–019) with local commerce/journal code; merge505b09a preserves both. New SQL020 adds the signed connector to the database constraint. Fabrything had no incoming remote changes.
- Approved commerce controls/font uploader and full structured journal/topic UI are implemented, with direct server-rendered canonical pages. New commerce/journal controls wait for worker capability markers. Source details remain out of list projections.
- Verification:278 portable +63 root tests;20 disposable PostgreSQL migrations;1,187 Fabrything backend +18 frontend tests; isolated builds and320/390/768/1440 browser QA. Full frontend lint166 baseline errors/234 warnings, zero new errors. Seven live services healthy on read-only check; no synthetic model/publication QA.
- Release/activation details, limitations and exact files: `docs/LOCAL_COMMERCE_JOURNAL_REVIEW.md` and sibling `../fabrythingweb/docs/JOURNAL_ECHOLINK_HANDOFF.md`. CI/CD receipts pending dispatch; the running worker remains unchanged.

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
- GitHub repository proffesergio/echolink is PUBLIC again by the owner’s explicit November12 fallback authorization, after private-repository deployment still failed after the owner reported connecting GitHub. Keep the README client-facing and without installation steps. Do not claim public source is secret or impossible to run; private visibility needs the correct Vercel owner/author association first.

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
  Operational guides remain in source; the owner later explicitly authorized a public-repository fallback for Vercel. Source code and those guides are therefore visible.
- Runbook and scope/limitations: `docs/LOCAL_OPERATIONS.md`. Metrics/health code:
  `platform/server/operations-telemetry.mjs`, `operations-monitor.mjs`; commands:
  `scripts/ensure-platform.mjs`, `platform-status.mjs`. No new backend model or
  Prometheus/Grafana service was installed.

## Previous Operations release — November12

- Final READY production deployment: `dpl_3naxyNV4HE2NK39zPABsMCM17vw2`,
  https://echolink-hmbw2brxk-omniteam1.vercel.app; alias https://echolinkbd.vercel.app.
  Source cb2783385dde9fb5935804fa35e038d6821d5dc9. Native Git deployment
  dpl_ocCzn2ur5JaGMSzz1Aawg8LtR48Z also READY for the same source.
  Live entry `index-D342ZObb.js`, Operations chunk `app-n02bVhhs.js`, including
  the closed-mobile-sidebar shadow fix. Homepage, entry, Operations chunk and
  public health returned200; anonymous Operations returned401.
- GitHub Actions43156762485 completed successfully: test AND deploy jobs passed.
  Local verification:205 portable tests,63 root tests,29 isolated API checks,
  full browser suite, targeted final mobile navigation/overflow checks and builds.
- Final read-only runtime check10:45 Dhaka: all seven services healthy; workerRSS
  154MiB; host free6625MiB; pool waiters0; native tokens12242 input/1044 output
  recorded from real preparation. Four queued tasks, zero due/running,16 retained
  failures. These are observations, not a guarantee that all queued work is done.
- Privacy history: the repository was made private at first. Vercel Hobby
  author-access checks blocked the final deployment. User replied Connected to
  the owner-link request, but the private retry still returned TEAM_ACCESS_REQUIRED.
  User then explicitly authorized public visibility if required for Vercel; that
  fallback was applied and PUBLIC verified. Both automatic deployment paths now
  work. No paid plan was enabled and no Git author identity was changed. Public
  source and operating guides remain visible; removing README setup does not hide
  them. Root private:true/UNLICENSED prevents package publication, not source access.
- Isolated preview accounts/servers were cleaned up. The interrupted screenshot
  fixture was removed only from creator_test, then the final full browser suite
  passed. No production worker restart, synthetic inference or test publication
  was submitted for the frontend release. Earlier blocked deployments remain as
  history; cancelled Actions43156332895 had a passing test job and held deployment.

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

## Settings/grid refresh and NobleSeek logo — November12

- New request: clean up Page Settings and other popups, redesign Content grid,
  and restore NobleSeek branding on news creatives. User explicitly approved
  both designs. Implementation is deployed and verified at
  https://echolinkbd.vercel.app.
- Designs in the existing CMS project: Page Settings dialog
  https://p.superdesign.dev/draft/6c13b372-bba3-4da6-9d22-a002970f4953 (v3);
  Content Grid https://p.superdesign.dev/draft/b5ef7ba5-a27d-4783-9ca6-eea7deadc200 (v2).
  They preserve the approved shell and exact EchoLink wordmark. Implemented dialog:
  left section navigation, grouped fields, scrolling body/sticky footer. Grid:
  complete uncropped previews, short summaries and clear details/edit actions.
- 12ui conversion targets: settings18d984eb-c438-44a8-8b95-aa3f2bd2dc2b,
  responsive derivative992aaa64-362d-4059-9177-af7a7f04fb09; grid
  88a31da4-3125-47c9-b31e-bf99d74b89f4, linked responsive
  2f8e9224-6ab1-4141-b81a-f2c79ab8778c. All completed. Targets/HTML/resume
  are private under .superdesign. Responsive output was read before integration;
  both unchanged target LayerDocs completed12ui improve closeout.
- Logo root cause: current Noble Seek Page had NO logo asset at all. Matched its
  existing clean NobleSeek mark to its currently fetched actual Facebook Page
  picture, then saved a tenant-scoped asset and attached logoAssetId under a row
  lock without overwriting an existing upload. Prior brand saved privately in
  .codex/backups/nobleseek-brand-before-logo.json. No posts/receipts were modified.
- News renderer studio-v8 now honors logoLightWidth, explicit light variants and
  adaptive treatment of the original transparent mark. Original opaque artwork
  remains intact. Private render of a real saved newsroom item shows the actual
  logo: .codex/brand-review/nobleseek-restored-news.jpg. This is a private render,
  not a model QA run, website write or social publication.
- `platform/client/settings-dialog.jsx` / `.css`: shared popup frame with
  bounded body/sticky footer, scroll lock, focus trap/return, Escape/backdrop close
  and busy-close protection. Page Settings has General, Brand & design, Writing
  & prompts, Channels, Publishing, Connections and Advanced panels. Panels stay
  mounted; unsaved values persist and native validation reveals hidden fields.
  Existing payloads/approval controls remain. Other editor popups use the frame.
- `platform/client/content-grid.css` and `ContentGridCard` in `cms.jsx`: three/two/
  one columns, complete uncropped creatives, short copy, truthful receipts/time,
  details/edit actions. Details fetch the protected full post and retain all
  existing audits/scheduling/manual/uncertain-delivery actions. List behavior and
  scoped freshness/pagination remain. New settings icon assets derive from the
  approved 12ui kit; existing logos/photos are preserved rather than stock crops.
- Both target-based12ui alignment kits completed, read and reviewed. Captures
  under platform/.local/verification show desktop/mobile settings, brand panel
  and grid. Full browser suite passed, including hidden validation, keyboard
  navigation, focus trap, unsaved settings, grid details and mobile overflow.
  Isolated visual harness passed sticky footer, original-ratio portrait/square/
  landscape previews, logo preview, details-to-edit, post/connection sticky
  footers, mobile connection layout and zero JS errors/API writes. Platform/root
  builds and CI portable/root tests pass. Preview fixtures/server were cleaned up
  from creator_test only. No production worker restart was needed for this UI.
- 15 focused rendering/brand/recovery tests and all208 portable tests pass.
  Graceful platform restart applied the renderer with active/unknown receipts
  preserved. Following checks: all seven services healthy; one real preparation
  resumed with inference concurrency1 and emergency guard still active.

## Settings/grid production release — November12

- Source765a3f8eed92f87349fb3fdf490b35a09ac1bcde: approved settings/dialog/grid
  implementation, including all original25 Page fields and full publication actions.
- READY deployment dpl_7ywEiCXXRayeXHDuar98ErZx9X6r,
  https://echolink-jtj7y0vq7-omniteam1.vercel.app; production alias
  https://echolinkbd.vercel.app. Native Git deployment
  dpl_Ag5jXWepH4ucKkY5G2vTDWLMRtWT also READY for the same source.
- GitHub Actions43169226646: test and deploy both SUCCESS. Live entry
  index-DNifb4Yg.js, app-C_Stilmi.js, CSS app-CuldIRN0.css.
  Production homepage/entry/app/health200; new settings/grid markers present;
  anonymous Operations401. README remains a client-facing SaaS overview without
  setup instructions; repository visibility remains PUBLIC per owner authorization.
- Final read-only local check12:40 Dhaka: all seven services healthy; workerRSS
  155MB, host free5634MB, pool waiters0. Three queued tasks, zero due/running,
  16 retained failures. Inference concurrency1 and emergency memory guard remain.
  These observations do not mean all retained failures have been resolved.

## Live newsroom scheduling — November12

- Owner reported only5 publications by early afternoon despite70/day and7-minute
  gap. Read-only audit confirmed70 daily cap/target and7-minute minimum, but
  scheduleMode=spread, overnight22:00–07:00 generation, a5-minute emergency
  refill horizon and old rebuild drafts were delaying fresh collection. The
  spread grid was roughly20 minutes; a live source repeatedly waited on model
  HTTP500s and later the generation-window check. Ollama itself remained reachable.
- Aggregated news now selects the newest unseen source timestamp first, with
  a24-HOUR maximum source age explicitly requested by the owner (supersedes the
  initial three-hour proposal).12–24-hour reporting remains eligible. Check age
  before preparation, website write and final social booking/execution; missing
  or future source timestamps need correction. Manual reports retain editorial
  control. Old/held source fingerprints, factual/crisis holds and all receipts stay.
- Live news uses earliest available slots, not spread alignment or a preserved
  far-future planned_at. Actual publication still enforces the7-minute minimum,
  Page window, daily70 cap, approval/version, factual/crisis and tenant checks.
  Keep a single upcoming prepared item, scan feeds again after a minute, avoid
  model ranking for latest-first selection and prioritize queued automated news
  after active work/explicit urgent tasks; publishing keeps its separate lane.
- Live collection ignores overnight generation hours and held/error drafts do not
  fill its active backlog. No-source/failed-source checks resume after one minute
  rather than blocking the whole news desk for the legacy30-minute cooldown.
  Transient model/host errors retry twice at one-minute intervals per news task;
  a repeatedly failing source remains held while collection moves on. Memory
  waits retain the five-minute backoff, serialized inference and emergency guard.
- Corrected unsupported shorthand whitespace/escaped-hyphen constructs in the
  writer's native schema. A compact repeating-word grammar avoids hundreds of
  optional decode branches; the80–500-word range is still enforced after writing.
  All13 focused brief tests pass after that simplification. Factual, originality, chronology, language
  and independent whole-report review remain mandatory. HTTP500 is now correctly
  described as a model request failure when the service has responded, instead
  of always claiming the host is offline. Do not claim the schema warning alone
  proved the cause of every previous500 response.
- Owner NobleSeek settings saved: interval scheduling, latest selection, generation
  window disabled, batch1; cap70/gap7 retained. Backed up privately before changes.
  One delayed, never-submitted version1 source was retained in Review and its queued
  preparation canceled only after checking no manual save, receipt or attempt.
  No published or uncertain post was reset. Worker restarted gracefully; tunnel
  supervisor reconnected normally and all seven services recovered healthy.
- Real observation14:20 Dhaka: a source published14:12:57 was selected14:14:01,
  completed a187-word checked report, saved/verified on the website and scheduled
  automatically for14:21. One earlier fresh teaser was correctly held and the
  next source was collected without a30-minute cooldown. The same post then published
  normally at14:21:20 Dhaka (scheduled14:21:00), bringing today’s confirmed
  news total from5 to6. Its delayed first-link comment subsequently published too. Website and
  Facebook receipts both explicitly confirmed; Facebook ID is saved.
  This demonstrates one recovered cycle, not guaranteed70/day throughput.
- Validation:215 portable tests,30 isolated API/integration checks,63 root tests,
  full browser suite and platform/root builds pass. Tests submitted no real news,
  model requests, website writes or social publications; the observation above is
  the existing authorized production automation, not a synthetic QA publication.
  Code: news-timing.mjs, scheduling.mjs/planner.mjs, generation-window/buffer.mjs,
  news-research.mjs, jobs.mjs and focused news-timing tests. README remains
  client-facing without setup instructions.
- Final source c35ce1e998755516f65f7a6fd6c6688cf3bd4db9 is deployed READY:
  dpl_4AYP5CdpXwfZ3cY9ek1e8L7rvaqi,
  https://echolink-czh5w8uin-omniteam1.vercel.app; native Git deployment
  dpl_6WGSEQHDRNH9dqUwy4Uck59Tbpb8 also READY. Production alias unchanged.
  Actions43182897762 SUCCESS; prior source f0dcff6 Actions43182516598 SUCCESS.
  Entry index-UlM-KyLn.js/app-BP7OcCbN.js verified200 with24h/latest label;
  health200, anonymous Operations401. Compact schema's13 focused tests pass;
  CI portable/root checks pass on that final source. Graceful restart completed.
- Final14:32 Dhaka read-only check: all seven services healthy, workerRSS153MB,
  host free2602MB, pool waiting0;2queued/0due/1running/17retained failures.
  Inference remains serialized, reserve768MiB/emergency512MiB. The187-word
  report measured writer97.2s/reviewer225.6s during verification load. These are
  measured examples, not guaranteed speed or accuracy;70/day remains a ceiling.
  Do not overlap broad local test suites with live inference on this small PC.
  No submitted/uncertain delivery was killed or reset by the refresh.

## Newsroom latency and successor buffer — November12, afternoon

- User reported writing remained too slow and nothing was booked ahead after a
  publication. Live audit confirmed a20+ minute output-limit failure and source
  inputs of6560/7000 tokens overflowing6144 context. The earlier single-upcoming
  booking policy also suppressed preparing the next story while a post waited.
- Supersedes the single-item policy above: keep the next TWO near-term bookings
  supplied, preparing only one task/model at a time. A single scheduled story no
  longer blocks its successor. Distant future bookings do not falsely fill this
  buffer.7-minute actual gap, cap70,24-hour source age, latest-first and all
  publication/approval/crisis/tenant checks remain.
- Local brief target100–150 words; accepted range remains80–500. Select whole
  evidence sentences within200 words/2000 source characters, retaining the lead,
  explicit qualifications/denials and BOTH sides of detected conflicts. If those
  cannot fit, retain the source for review and select another candidate. Full
  source facts still participate in static factual/originality/modality checks;
  the independent reviewer checks the entire output against the selected facts.
  Omitted fact IDs stay in private audit; never truncate a qualification to fit.
- Model context4096, writer output1400, reviewer output256 tokens. Writer native
  request deadline150s; independent review180s; shared attempt deadline360s, so
  repair does not reset the clock. HTTP requests actually cancel at deadline;
  timeout becomes a held-source422, not repeated inference-host retries. Memory
  waits/emergency abort and one-model serialization remain unchanged. The global
  host ceilings are not raised or disabled by these narrower newsroom limits.
- Aggregation checks up to three latest candidates, with8s article reads; it
  retains inadequate teasers privately and tries the next recent report in the
  same scan before starting inference. Exact URL/history checks remain inside
  workspace transactions, including when a candidate was already saved. Full
  research caches up to24k characters rather than clipping at6k and rereading.
- Task copy now says writing/correcting report, rather than evidence section1of1.
  The focused checks (including14 brief checks) and30 isolated API/integration
  checks pass. Tests use fixture HTTP and submit no model, website or social
  publication. Final CI43204576029 passed test AND deploy:222 portable checks,
  63 root checks and both builds. The30 API checks also pass locally in isolation.
- Graceful worker updates applied without clearing delivery receipts. Real normal
  automation: a116-word dairy report published16:31:17 Dhaka; the next106-word
  education report generated/reviewed from16:32:52 to16:34:52 and booked16:39.
  These are measured cycles, not guarantees of every report's speed or70/day.
  Follow-up publication16:39:16 confirmed, another106-word report published
  16:47:07; a105-word report published16:54:18, with the next123-word report
  booked17:02 and further preparation continuing. Immediate successor enqueue
  now runs inside successful booking,
  before evergreen work can occupy the preparation lane; no extra inference runs
  concurrently. The isolated integration check verifies that booking queues its
  successor immediately, repeated planning does not duplicate it and two bookings
  stop the chain. Writer/reviewer native measurements for the106-word report
  were39.8s and78.9s. This is one measured result; unsupported reports remain
  held rather than being approved solely to fill the calendar.
- Current runtime source8ae216c23afc009b1662839470d681a7889079ec is applied by
  graceful restart. Native Git production deployment
  dpl_262hjidmgFKqfXjtmHoMEW4rTsoC and Actions deployment
  dpl_7h39PToDJQ1SL9AdqAbUxdiBdqSA are READY; final deployment:
  https://echolink-jihctnadi-omniteam1.vercel.app. The public alias remains
  https://echolinkbd.vercel.app. Homepage/entry/app/health200; anonymous owner
  Operations401. All seven services healthy16:55 Dhaka; database pool waiters0,
  workerRSS337MiB, host free2087MiB. These are point-in-time observations.

## Current inference and newsroom work

- PC: i5-6500 / 4 logical threads / ~12 GiB RAM / GT730; CPU inference.
- Quality profile: 4 threads, context ceiling 8192, output ceiling 4096,
  batch 128, 30-minute call deadline, 768 MiB admission headroom and 512 MiB
  emergency abort. One model/request at a time. No useful GPU acceleration assumed.
- Current automatic mode: `brief`, implemented in `news-brief-writer.mjs`.
  Writer `gemma3:4b-it-q4_K_M` uses context4096, output allowance1400,
  temperature 0.6 (repair 0.3). Reviewer `echotent:qwen3-4b` uses context4096,
  output256, temperature 0. One whole-report review replaces per-section
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

## Profile/content upgrade — November 13 (local source)

- Backend fairness: `queue-scheduler.mjs` claims the least recently served
  workspace/profile preparation turn; urgent/news preference stays within that
  turn. Uses persisted started_at with heartbeat_at fallback because interrupted
  text recovery/restart clears started_at. Failed/deferred attempts consume turns.
  Redis preparation IDs wake the same SQL scheduler; delivery retains exact IDs,
  due times and its independent lane. No per-profile prompts/settings, source
  rules, publishing gaps, single-inference limit or emergency guard changed.
  Focused SQL QA:12 checks passed using disposable PGlite via PGLITE_MODULE;
  seven related planner/queue/news/window/buffer/resource test files also passed.
  No live credentials/models/publication used. Equal turns do not promise equal elapsed time.
  No runtime restart/deployment or live Redis integration was performed here.

- Requested multi-entity/profile isolation and Preparing/Needs attention repair.
  Runbook: `docs/PROFILE_CONTENT_UPGRADE.md`; migrations SQL017, SQL018, SQL019.
- Canonical `posts.content_status` is separate from delivery `posts.status`.
  Post/task triggers atomically classify active preparation, review and errors;
  uncertain/publishing/manual receipts keep their existing reconciliation state.
- Overview counts and content lists use the canonical classification, with
  repeatable-read snapshots. Authenticated finite SSE revision frames reconnect
  every3s through the buffered bridge; pulse remains the fallback/task telemetry.
- This coding task has not migrated the live database, restarted the worker,
  deployed the UI or submitted real inference, website writes or social posts.
  Isolated PostgreSQL-WASM migration/lifecycle/RLS checks passed; complete
  credentialed API/browser regression against creator_test is still separate.
- Final portable suite: 257 passed; React/Vite build passed. All19 migrations,
  named defaults, old personal INSERT compatibility, lifecycle and runtime-role
  tenant isolation passed in disposable PostgreSQL-WASM (no live credentials).
- Workflow selector: TEXT / PHOTO_CAPTION / VIDEO_REELS in isolated profile
  config; explicit setting supersedes old reels presets. Personal defaults PHOTO.
  Editable regeneration clears stale media/approval; unresolved receipts remain
  protected. Video captions follow language; narration/overlays remain Bengali.
- Isolated mocked browser smoke passed: workflow/studio settings, phase waves,
  profile task scoping, pause/reduced motion, typography payload, optimistic
  rollback and 390/768/1280 layouts; zero JS errors or API writes. This does not
  replace the credentialed creator_test regression above.

## Resumed profile release — November 13

- Owner authorized main/Vercel release using existing deployment workflow. Existing
  dashboard prompts, languages, presets and workflow choices must be preserved.
- SQL018/019 now add schema/constraints without backfilling profile configuration
  or changing existing language; supersedes named-default migration notes above.
  New profiles still receive creation defaults; explicit workflow edits remain.
- Settings JSON is merged before validation so omitted prompt/settings fields
  survive saves; explicit edits/clears are honored. No live settings write made.
- Preparation claims use least-recently-served profile turns, including failed
  and deferred work; delivery keeps priority/deadlines. Redis preparation IDs
  wake the SQL scheduler. One model/inference and emergency guard remain. Equal
  turns are not equal elapsed task time. Disposable SQL fairness checks pass.
- Motion/layout polish uses reduced-motion support, persistent mounted settings
  panels, responsive studio and personal-profile naming.
- Production worker/database are on another machine behind Cloudflare. The checked
  in GitHub workflow builds/tests/deploys Vercel frontend and proxy only; no remote
  worker updater or DB migration step is configured there. Backend activation
  requires SQL017–019 and a graceful restart on that machine. Health now exposes
  contentLifecycleVersion/profileWorkflowVersion to distinguish source activation.
- Final resumed validation:261 portable checks pass (one optional SQL test skipped
  in that runner, separately passed all12 fairness checks with PGlite);63 root
  tests, both builds and all19 migration/lifecycle/isolation checks pass. Mocked
  Chrome at320/390/768/1280 verifies exact supported manual prompt payloads,
  unsaved edits, Profile labels, reduced motion and pause; zero JS errors and
  real API requests. Existing GitHub/Vercel workflow files remain unchanged.
- Release6bc0071 pushed to main. Existing Actions43302756707 test+deploy SUCCESS;
  production deployment dpl_FUqzCy1ELSUcxofDNE6iE3Sd5BU9 READY at
  https://echolinkbd.vercel.app. Native Git deployment also READY. Live HTML and
  app-CGLpkk04.js verified with workflow/Profile/pause markers; anonymous state401.
  Worker health remains version2 without new feature markers: remote backend
  activation/migrations are still pending, and no restart was performed here.
