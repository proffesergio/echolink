# EchoLink handoff — 2026-11-10

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
- Public GitHub main pushes run `.github/workflows` tests and Vercel deployment.

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
- Quality profile: 4 threads, context ceiling 8192, output ceiling 3072,
  batch 128, 30-minute call deadline, 768 MiB admission headroom and 512 MiB
  emergency abort. One model/request at a time. No useful GPU acceleration assumed.
- News writer baseline: `gemma3:4b-it-q4_K_M`, purpose context 4096; reviewer:
  `echotent:qwen3-4b` (Qwen3-4B-Instruct-2507), context 4096, temperature 0.
- NobleSeek retains anchored evidence composition at writer temperature 0.7;
  natural paragraph mode is available but experimental and failed this dossier.
  Its targeted editing uses the failed draft at 0.3. Page settings
  expose composition mode, temperature and separate website report voice.
  Other task model routes are preserved.
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
- Short RSS is discovery only. Read full article containers/JSON-LD, build whole-
  sentence evidence, require >=450 source/report words, >=6 paragraphs, >=90%
  assigned evidence coverage, independent checks, reviewed-text hash.
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

- `platform/server/news-report-writer.mjs`: resumable writer/reviewer orchestration.
- `news-composition.mjs`: natural paragraph contract and Page sampling settings.
- `news-quality.mjs`, `news-anchors.mjs`: evidence/quality/legacy constrained grammar.
- `news-extraction.mjs`, `news-desk.mjs`: source extraction and collection.
- `website-first.mjs`, `news-social-stage.mjs`, `jobs.mjs`: delivery order/receipts.
- `inference-resources.mjs`, `inference-host.mjs`: operator capacity and host profiles.
- `platform/client/editorial.jsx`, `newsroom.jsx`: controls and private audit UI.
- `scripts/verify-newsroom.mjs --post=UUID --writer=MODEL --reviewer=MODEL
  --context=4096 --mode=composed --temperature=0.7 --run=LABEL --full`: read-only real inference, no delivery. Default stops after
  one accepted section. Use distinct run labels. Private checkpoint/result: `.codex/newsroom-check/`.
- `npm test --prefix platform`: isolated creator_test DB, never production.
  `npm run test:unit --prefix platform`: portable tests used by CI.
  `npm run test:browser --prefix platform`: isolated real browser flows.
  Build platform first, then root build. Avoid concurrent real model experiments.
- Current local checks: 195 platform tests (all passed), browser checks with
  zero JavaScript errors, both builds. Latest targeted writing/repair tests passed.
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
