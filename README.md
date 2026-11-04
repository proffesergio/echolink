# EchoLink

Public dashboard: https://echolinkbd.vercel.app/admin (requires the local
worker and tunnel). See [deployment and CI instructions](docs/CI_CD.md).
Start with [production testing and remaining work](docs/PRODUCTION_TESTING.md).

Open the local admin UI with `npm run dashboard` while the worker is running.
It manages page/feed configuration, local model discovery/testing, token aliases
and content approval. Follow [the Windows 11 setup guide](docs/WINDOWS_GUIDE.md)
for Ollama/LM Studio, WSL networking, Meta Page access and your first dry run.
`EchoLink — Complete pipeline` is an optional single-canvas workflow: use its
schedule or the individual job schedules, not both. The cloud companion does not
serve this local admin UI.

Local n8n news automation with Airtable configuration and Neon PostgreSQL durable state.

The main acceptance plan is [PROJECT_PLAN.md](PROJECT_PLAN.md). The current
catalog contains [20 verified Bangla publishers](sources/VERIFIED.md), imported
disabled. Delayed source-link comments and per-page minimum posting gaps are
implemented. Live AI/Facebook acceptance still awaits the user's model and Meta
authorization. This repository now generates nine inactive workflows.

The first development version includes six scheduled jobs and a reference AI
HTTP adapter. All imported workflows are inactive. Live publishing is disabled
unless `DRY_RUN=false` is explicitly configured.

## Architecture

Existing npm-hosted n8n → authenticated local worker → Neon PostgreSQL.
Airtable controls pages and feeds; the worker mirrors content and status back to
Airtable. Local Ollama, LocalAI and LM Studio use per-page OpenAI-compatible
endpoints. Neon AI Gateway is an optional additional engine.

PostgreSQL holds canonical queue state and the Airtable sync backlog. It provides
per-page unique URL/title constraints, transaction locks, daily-cap reservations,
approval hashes and a publish-attempt journal. An uncertain publishing response
enters `Publish Unknown`; it must be reconciled manually before retrying.
PostgreSQL complements Airtable; this is not an independent disaster-recovery
backup. Configure Neon recovery retention and off-platform exports separately.

## Setup

1. Install Node 22+ and use the existing authorized Neon CLI (`neon`, not the
   unrelated `neon-cli` npm package).
2. Run `npm install --ignore-scripts --offline=false`.
3. Fetch database variables without printing passwords:
   `neon env pull --service postgres --file .env.local`.
4. Add the non-Neon settings from `.env.example` to `.env.local`. Preserve
   existing connection strings. Generate a random `WORKER_API_KEY` of 32 or more
   characters. Never put tokens in Airtable or workflow JSON.
5. Test the migration on a Neon development branch first. Pull that branch's
   variables, then run `npm run migrate`. Migrations require
   `DATABASE_URL_UNPOOLED`; runtime queries use pooled `DATABASE_URL`.
6. Run `npm run build`, `npm test`, then `npm start`. `/health` proves only that
   the worker runs; authenticated `/ready` checks database schema access.
7. Follow [Airtable setup](docs/airtable.md) or run `npm run airtable:setup`, then import each JSON file from
   [workflows](workflows) into n8n using **Import from File**.
8. Create one n8n **HTTP Header Auth** credential: name `Authorization`, value
   `Bearer <WORKER_API_KEY>`. Select it on each **Run job** node.
9. Test jobs in order: sync → ingest → process → mirror → approvals. Analytics
   requires real published posts. Review results before activating schedules.

For this machine's npm n8n installation, `npm run n8n:setup` imports the seven
inactive workflows and creates/attaches the local worker credential. It generates
a private worker key when one is missing. The helper requires one personal n8n
project and uses the supported local n8n CLI. `npm run verify:n8n` executes the
six job workflows and prints their results. Verification schedules nothing and
leaves them inactive. The verification CLI uses task broker port 5689 to avoid
conflicting with the running n8n server on 5679.

For npm-hosted n8n and worker on Windows, the generated workflows use
`http://127.0.0.1:8787`. Leave the worker bound to loopback.
For a Windows-hosted worker, Docker n8n uses
`http://host.docker.internal:8787`. The default worker binds to loopback. If the
container cannot reach it, use `compose.worker.yaml` on the same Docker network
as n8n and change the workflow URL to `http://echolink-worker:8787`. Do not expose
the worker's port publicly. The compose file supplies the worker only; it leaves
your existing n8n instance intact. To generate different worker URLs, set
`ECHOLINK_WORKER_URL` in the build process environment before `npm run build`.
Create `package-lock.json` with a successful
install before building the worker Docker image.

## Workflow behavior

| Job | Interval | Purpose |
| --- | --- | --- |
| sync | 15 minutes | Snapshot paginated Airtable page/feed configuration into PostgreSQL |
| ingest | 10 minutes | RSS and fallback URL, article extraction, OpenGraph image fallback, exact dedupe |
| process | 2 minutes | Quiet hours, daily cap, optional semantic match, AI caption, approval or publication |
| mirror | 2 minutes | Retryable PostgreSQL → Airtable upserts using Automation ID |
| approvals | 2 minutes | Read explicit Airtable decisions; optional Slack notification |
| analytics | 6 hours | Fetch post engagement counts into PostgreSQL |

Per-page posting windows use the configured IANA timezone and support overnight
windows. Equal start/end means all day. Outside-window items remain `Queued`.
Processing takes one article per page per tick, with one page at a time by
default on this machine. PAGE_CONCURRENCY can increase this to at most three.
URL and normalized-title deduplication are scoped per page. A source appearing
on different pages is allowed.

Semantic deduplication is optional and uses local embeddings plus PostgreSQL JSON
vectors, comparing up to 500 recent vectors per page. The configured TTL limits
the comparison window; it does not physically delete data. This initial bounded
implementation can miss older or more distant duplicates. Qdrant/MCP migration
options are recorded in [integration notes](docs/integrations.md).

Dry-run items enter `Dry Run` and are not automatically requeued when live mode
is enabled. The dashboard's Requeue control deliberately resets eligible
failed/dry-run articles for fresh approval; it requires explicit confirmation.
Definitively failed source comments can also be retried after connection fixes.
Ambiguous remote outcomes cannot be retried through this control. Automatic
article retries are limited to pre-publication failures.
Caption edits made directly in Airtable invalidate approval; the current version
requires approval of the generated caption without edits.

## Optional Neon cloud services

The existing `neon.ts` branch policy is preserved. Set
`ECHOLINK_ENABLE_CLOUD=true` in `.env.local` only after checking supported region
and paid gateway availability. It declares a private `echolink-archives` bucket,
AI Gateway, and an authenticated `echolinkapi` Function. Run
`neon config plan --env .env.local`, review it, then
`neon deploy --env .env.local`. No cloud service is required for local inference.

The cloud Function exposes authenticated `GET /ready` and `POST /snapshot`.
Snapshots write aggregate queue telemetry to Object Storage. It cannot reach
Windows localhost, so ingestion, local AI, and publishing remain on the local
worker. `npm run verify:services` tests actual database write/read/rollback, a
small configured gateway inference request, object put/get/delete, and the cloud
Function's database readiness and storage snapshot. Missing variables count as
unverified and produce a failing exit code, never a false pass. Gateway inference
and storage probes may incur small provider charges.

## Current verification limits

Local build and tests can run without installed cloud/database packages. They
check syntax, generation, scheduling gates, deduplication normalization,
authentication and a real local HTTP startup. They do not prove that Airtable,
Neon, Facebook, local models, or imported n8n executions work. Those require
installed dependencies, network access and configured credentials. See
[setup status](docs/status.md) for the latest observed checks.
