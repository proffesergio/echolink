# Public dashboard and GitHub deployments

The production dashboard is https://echolink-green.vercel.app/admin.
Use the existing `DASHBOARD_PASSWORD` from your local `.env.local`.
The requested `echolink.vercel.app` could not be reliably assigned: Vercel
reported a project conflict and a live HTTP check served another application.

Only `deploy/vercel` is deployed. Your local n8n, worker, Ollama, database
credentials and Facebook tokens are not deployed to Vercel. The public proxy
forwards signed sessions through an HTTPS tunnel to a bridge on 127.0.0.1:8788.
The bridge requires a separate random server-only key and exposes dashboard
API routes, excluding owner login tickets and worker job endpoints.

## Finish GitHub CI authorization

The repository is https://github.com/proffesergio/echolink, branch `main`.
`.github/workflows/deploy-dashboard.yml` tests builds and all automated tests
on pull requests and main pushes, then deploys production on main only.
It needs these GitHub Actions repository secrets:

- `VERCEL_TOKEN`: persistent token from https://vercel.com/account/tokens,
  with access to team `omniteam1`. The interactive CLI login is an expiring
  OAuth credential and is not copied into GitHub secrets.
- `VERCEL_ORG_ID`: `team_dbzThFBw87vzPrY0519CfulB`.
- `VERCEL_PROJECT_ID`: `prj_Jk7tozTj0bfpfTxq3JkzWBRZFCv0`.

If GitHub CLI authentication fails, run `gh auth login --hostname github.com --web`.
Save the persistent Vercel token as `VERCEL_TOKEN` in local `.env.local` and
tell the assistant once saved; do not paste it in chat. The assistant can then
set the repository secrets and verify an actual Actions deployment.
See [Vercel's CI workflow documentation](https://vercel.com/kb/guide/using-vercel-cli-for-custom-workflows).

## Running the local services

Keep n8n (`n8n start`), Ollama, the worker, bridge and tunnel running.
Turning off or sleeping this PC interrupts remote dashboard API access and
automation. A GitHub push updates frontend/proxy code only; local worker code
requires a local pull/build/restart. Windows startup tasks have not been installed.

```powershell
Set-Location C:\Users\bhnbi\Music\echolink
powershell -NoProfile -File scripts/restart-worker.ps1
powershell -NoProfile -File scripts/restart-bridge.ps1
```

The present tunnel is a temporary Cloudflare Quick Tunnel. It survives normal
frontend deployments but changes hostname if the tunnel process restarts.
Its executable is installed locally at `.codex/tools/cloudflared.exe`, excluded
from Git. On a new PC install the official Windows amd64 cloudflared release
at that path: https://github.com/cloudflare/cloudflared/releases.

After restarting the tunnel, refresh Vercel's server-only settings and deploy:

```powershell
powershell -NoProfile -File scripts/restart-tunnel.ps1
node scripts/configure-vercel.mjs
npm run build
Push-Location deploy/vercel
vercel deploy --prod --yes --scope omniteam1
Pop-Location
node scripts/check-public-dashboard.mjs
```

`configure-vercel.mjs` uploads only WORKER_ORIGIN, DASHBOARD_PUBLIC_ORIGIN and
WORKER_BRIDGE_TOKEN as encrypted production variables. Never upload `.env.local`.
For a stable hostname, later configure a named Cloudflare Tunnel using a domain
you control; keep the bridge and its authentication in place. Quick Tunnels are
for testing, not a production availability commitment.

Do not enable live Facebook publishing until the Page token is saved, the Page
identity check passes and a human has checked the caption. Local 4B generation
has produced factual contradictions; the tested draft is flagged for review.
