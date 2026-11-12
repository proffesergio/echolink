# Running EchoLink on a local PC

Vercel hosts the dashboard. The persistent Node worker, primary local database,
Ollama inference and protected bridge/tunnel run on the operator PC. Keep that PC
awake, powered and connected for automatic delivery.

## Start and inspect

Open PowerShell in `C:\Users\bhnbi\Music\echolink`:

```powershell
npm run platform:up
npm run platform:status
```

`platform:up` starts the prepared local PostgreSQL cluster when selected, preserves
a healthy worker/bridge, and otherwise drains work through the graceful restart
procedure before starting background supervision. It does not reinstall models
or replace the database. `platform:start` and `platform:repair` use the same safe
entry point. The underlying start-platform.ps1 is an internal restart step; do
not run it directly during publishing.

For a deliberate update/restart:

```powershell
npm run platform:restart
```

This waits for active preparation and delivery and preserves ambiguous receipts.
Use the reconciliation flow for uncertain delivery. `npm start` is the historical
application and does not start this worker.

For continuous local status or machine-readable snapshots:

```powershell
npm run platform:status -- --watch
npm run platform:status -- --json
npm run host:check
```

`npm run platform:serve` is the foreground supervisor alternative. Use it only when
another supervisor/worker is not already running, and keep its terminal open. The
background launcher is Windows-specific; the foreground Node supervisor also
supports other hosts with PostgreSQL/Ollama/cloudflared prepared in their operator
configuration.

## Reading the warnings

- Workspace reconnecting: the dashboard proxy could not reach the protected local
  route. Check the PC, worker8790, bridge8788, tunnel and internet. A healthy HTML
  homepage does not prove its backend is reachable.
- Inference unavailable: the selected model host did not respond. Work remains
  queued with automatic retry. Ollama normally listens on127.0.0.1:11434; the
  supervisor checks every30 seconds. `ollama serve` can run it separately when
  supervision is not managing it. Avoid a second server on the same port.
- Memory/resource wait: the emergency guard or admission reserve held preparation.
  Keep one local model/request at a time. Raising context/output limits does not
  add model knowledge or RAM.
- Booked publishing continues only while the worker, database, destination
  authorization and network remain online and the post is already prepared. It
  cannot continue from a powered-off PC solely because Vercel is online.

## Built-in monitoring

The owner-only monitoring API is `/api/owner/operations`; its visual Owner console
screen is a separate design/integration step. Health probes perform read-only
checks cached15 seconds. The local operator fallback works through
`platform:status` even when the hosted dashboard route fails. Credentials load
from the existing operator files and are never printed.

Metrics distinguish worker API requests, instrumented outgoing HTTP adapters,
database query estimates, pool waiters, worker-process CPU/RSS, host free RAM and
event-loop delay. These are not whole-PC packet capture, Vercel edge analytics,
provider billing bytes or remote-GPU measurements. Saved connector statuses show
their last explicit test; no token-validation call runs on every refresh.
Monitoring does not publish content or run a model benchmark.

Native Ollama input/output counts are recorded when completions return, including
rejected outputs. Resource/host waits are separate from completed inference calls.
Unsupported providers/missing counts stay unknown. Counts are not a paid-cost
estimate. Aggregate minute counters retain24 hours privately in
`platform/.local/operations-metrics.json`, saved every30 seconds; hard stops can
lose that final unsaved interval. Route/model tables and latency samples reset
with the worker. No prompts, article text, query values, auth cookies, keys or
connection URIs are stored in these metrics.

## Capacity and scaling

This is currently one worker host and one writable primary, with one local
inference request/model at a time. There is no inference load balancer or automatic
primary-database failover. Database task leases protect queue claims; they do not
turn process-local inference/memory guards into distributed admission. Do not point
multiple workers at this same small Ollama instance as a scaling shortcut.

Watch queue age/due counts, error rates, pool waiting, event-loop delay, free RAM
and measured tokens/minute before changing capacity. Move inference to the
stronger private LAN/VPN host using Owner → Inference host and its tested model
routes; preserve the existing worker/primary and delivery receipts. Horizontal
workers require shared media access, distributed inference admission and tested
destination-idempotency/cutover procedures first.

A separate host containing the model server must stay awake too. Keep Ollama
private. Database recovery targets remain staged until an explicit verified
cutover, so an old standby cannot silently become the writable primary.

Primary references: [Ollama usage](https://github.com/ollama/ollama/blob/main/docs/api/usage.mdx),
[node-postgres pool counters](https://node-postgres.com/apis/pool),
[Node performance APIs](https://nodejs.org/api/perf_hooks.html).

## Private repository deployment

The owner requested a private SaaS source repository on November12. GitHub visibility
was changed to private and verified. Keep setup material out of the client README.
Vercel's Hobby plan must associate a private-repository commit author with the
project owner. The final mobile sidebar shadow fix was blocked with
TEAM_ACCESS_REQUIRED / isVerified:false. The Operations release immediately before
it is live and healthy. Connect the actual GitHub owner proffesergio through the
Vercel project owner's Login Connections before retrying. Do not change repository
visibility back or substitute another person's Git identity. No paid plan change
has been authorized or made.

Reference: https://vercel.com/docs/deployments/troubleshoot-project-collaboration

Update November12: the owner replied Connected, but the next private deployment
(dpl_6Do21YVBjufTdGrsMHPVCVpJyvoC) remained BLOCKED. The owner then explicitly
authorized making the repository public if required for Vercel. That fallback
was applied and public visibility verified. The README stays SaaS/client-facing
without setup steps, but public source and historical guides are visible. Root
package private:true prevents package publication; it is not source access control.
No Git identity was falsified and no paid plan was enabled.

Final verification: Git deployment dpl_ocCzn2ur5JaGMSzz1Aawg8LtR48Z and Actions
deployment dpl_3naxyNV4HE2NK39zPABsMCM17vw2 are READY for cb278338. Actions
43156762485 test and deployment jobs both passed. Production serves the verified
index-D342ZObb.js / app-n02bVhhs.js, including final mobile polish. Homepage,
assets and health200; anonymous Owner Operations401. All seven runtime service
checks healthy at10:45 Dhaka. No further connection approval is pending.
