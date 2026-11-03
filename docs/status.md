# Setup status — 2026-11-03

## Current verified setup

- Neon production migration applied after passing on a temporary child branch.
  The child branch was removed and production credentials were preserved.
- Database checks passed for insertion, per-page URL/title deduplication, tenant
  isolation and rollback with no test articles remaining.
- All three Airtable tables created in the EchoLink base, including links and
  approval fields. Integration probes passed for upsert, synchronization
  acknowledgment, edited-caption approval rejection, and matching-caption
  approval acceptance. All synthetic probe records were removed.
- One inactive onboarding page, 20 verified Bangla publisher feeds and one disabled BBC example created. See sources/VERIFIED.md.
- Nine inactive workflows imported into npm-hosted n8n, with a generated worker
  Header Auth credential attached. No schedules or publishing were enabled.
- Managed worker runs at http://127.0.0.1:8787. Health and authenticated database
  readiness returned HTTP 200. DRY_RUN=true.
- Build passed and 16 tests passed, including actual local HTTP startup, fallback routes, source-comment timing and admin session protections.
- BBC RSS fetched and parsed successfully (40 items); no news articles queued.
- All six imported n8n jobs executed successfully through authenticated HTTP into
  the worker: sync (one page/one feed), ingest (disabled feed), process (inactive
  page), mirror, approvals and analytics (dry-run skip). Reproduce with
  `npm run verify:n8n`. These checks do not demonstrate real model generation or
  Facebook publication; no active page is configured yet.
- Complete pipeline now includes all seven stages on one canvas, including
  delayed source comments and analytics; its manual path executes every stage.
  Older workflows are preserved and inactive. Per-job scheduling uses a new
  job_schedule table; five concurrent claims executed the job exactly once on a
  temporary validation branch. Failure releases the lease for a later retry.
- Real Edge browser verification passed for logged-out navigation, login links
  in an existing tab, delayed loading, reload sessions, Settings, workflow view,
  service-outage recovery, logout, page/model controls, 20+ feeds, token masking
  and mobile layout; no browser JavaScript exceptions. Signed sessions survive
  worker restarts. Settings supports a user-chosen dashboard password, service
  credentials, inference, semantic memory, cadence and explicit live switching.
- User supplied a valid n8n API key for immediate dashboard Start/Stop through
  the running n8n HTTP API. CLI publish is deliberately not used because the
  installed n8n reports it requires a restart.
- Expanded Airtable probe verified distinct Skipped (Duplicate) and Failed event
  records with correct statuses, then removed all probe artifacts.
- Dashboard recovery probe passed: explicit confirmation, fresh article approval
  state, refusal to retry ambiguous post outcomes, and comment retries that
  preserve the earliest allowed delivery time. All probe rows were removed.
- Live RSS integration passed on a disposable Neon branch using all 20 configured
  Bangla publisher feeds and a one-item-per-feed probe limit. First pass: 17
  inserted, 2 duplicates, no completely failed feeds, four concurrent network
  requests. Second pass: 2 inserted, 17 duplicates; preflight dedupe avoided
  repeated article extraction. Some items can fail text extraction or use a
  fallback, so these totals do not claim 20 unique full articles per pass.
  No Airtable/Facebook writes were permitted. Branch was deleted afterward.
  Exact output is in sources/INGESTION_VERIFICATION.txt.

Complete Airtable definitions are in `airtable/SCHEMA.md`, `airtable/schema.json`
and three header-only CSV templates. Setup commands are `npm run airtable:setup`
and `npm run n8n:setup`; integration probes are `npm run verify:database` and
`npm run verify:airtable`. Managed worker PID/log files live in `.codex/logs/`.

Remaining: a real model endpoint/model ID and Facebook page configuration. No
local model server responded on default Ollama, LM Studio or LocalAI ports. Neon
CLI confirmed that the Free plan cannot serve AI Gateway model requests. No plan
upgrade or paid inference was performed. Optional cloud companion services and
MCP integrations remain undeployed; the existing uploads bucket was preserved.
Keep DRY_RUN=true for the first real caption generation.

## Historical checks before full access was enabled

The entries below describe the earlier restricted session; the current checks
above supersede those earlier blockers.

## Confirmed

- Workspace file reads and writes succeeded.
- Existing n8n `http://localhost:5678/healthz` returned HTTP 200.
- Installed Neon CLI reported 8.17.1; Node reported v24.21.0.
- `.neon` links organization `org-restless-field-32561692`, project
  `gentle-dust-30064543`, branch `production`.
- `npm run build` passed: syntax checked and seven inactive workflow files generated.
- `npm test` passed eight tests, including actual local worker startup and HTTP
  requests to health and an unauthenticated job endpoint.

## Not verified / blocked

- Docker CLI access: permission denied connecting to Docker Desktop's Linux
  engine pipe. This does not prevent accessing the existing n8n HTTP service.
- `neon projects get` and `neon status`: could not reach the Neon API. The
  project's region, plan and provisioned services could not be verified.
- `.env.local` / `.env` and database/service variables were not present when
  checked. A subsequent `neon env pull` attempt was blocked by the local process
  launcher (`CreateProcessAsUserW failed: 5`). No database migration was applied.
- Initial dependency installation failed with npm `ENOTCACHED` in offline mode.
  An online retry did not complete during the verification window. Database,
  RSS/HTML and S3 dependencies have not been confirmed installed.
- `npm run verify:services` exited 1 and reported every cloud service as
  UNVERIFIED because required variables were missing.
- No workflow was imported or activated in n8n; the HTTP health check alone is
  not permission to operate its authenticated API, and no API credential is
  available in this workspace.
- Airtable, Facebook, local models and optional MCP servers have not been
  configured or exercised. No notification or Facebook post was sent.

## Next manual setup

From a normal PowerShell terminal in this workspace, install dependencies and
pull credentials (keep the resulting file private):

```powershell
npm install --ignore-scripts --offline=false
neon env pull --service postgres --file .env.local
```

Then add Airtable settings, local-model/page aliases and a random WORKER_API_KEY
to `.env.local` using `.env.example` as a reference. Follow README migration
instructions against a development branch before production, then import the
workflow files into the existing n8n UI and attach its Header Auth credential.
Do not enable live mode until the database, approval and dry-run path have been
tested with a real page configuration.

Dashboard control verification: a real Edge browser started and stopped the
combined workflow through the running n8n API using the user-supplied key.
No n8n restart was required. The workflow was left inactive and dry-run.

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
