# Oracle Cloud hosting assessment

Checked 6 November 2026. **n8n can run on an Oracle Always Free VM. Moving n8n alone will not move EchoLink’s publishing worker or local AI off the PC.** No Oracle resources have been provisioned or charged by this change.

## Current free resources

Oracle currently lists **1,500 OCPU-hours and 9,000 GB-hours per month** for Ampere A1; for an Always Free tenancy this corresponds to **2 OCPUs / 12 GB RAM**, shared across its A1 instances. Older tutorials advertising 4 OCPUs / 24 GB are unsuitable for planning this deployment. Total eligible boot/block storage is 200 GB in the home region. Capacity can be unavailable; qualifying idle instances can be reclaimed after seven days. Free resources therefore do not guarantee uninterrupted production service. Confirm the Console's eligibility labels and tenancy limits before creation. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## Choose the migration scope

| Setup | What stays available when the PC sleeps? | Work required |
| --- | --- | --- |
| n8n on Oracle; worker + Ollama on Windows | n8n editor and its own triggers only | Docker n8n, private connection to Windows |
| n8n + EchoLink worker on Oracle; Ollama on Windows | Dashboard, calendar and prepared-post publication; new local inference waits for the PC | Linux worker service, asset migration, stable HTTPS origin |
| n8n + worker + inference on Oracle | Whole system, subject to capacity/reclamation | ARM-compatible dependencies and CPU inference benchmark |

For this project, the second setup is the useful first migration: prepared Facebook/Instagram posts no longer depend on the Windows tunnel. Inference can remain local or use an optional remote provider. A 2-core CPU VM should be benchmarked before committing to multiple caption models; the free allocation includes no GPU. Product cutout support must also be tested on ARM Linux.

## n8n installation and migration

1. Create an Always Free-eligible Ubuntu ARM VM in the home region. Keep the combined A1 allocation within 2 OCPUs / 12 GB. Keep the SSH private key on your PC.
2. Install Docker Engine and Compose v2 using the distribution’s supported procedure. Follow [n8n’s Docker Compose guide](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose.md). Pin the **same n8n version as the working local installation** for the first move, and check that its image supports `linux/arm64` before pulling. An upgrade is a separate change.
3. Back up the existing n8n data directory/database and its encryption key while n8n is stopped. Keep a persistent `/home/node/.n8n` volume. Existing credentials need the original key. A fresh PostgreSQL configuration does not automatically import an existing SQLite database; use n8n’s migration/export procedure.
4. Put n8n behind HTTPS on a stable subdomain, for example `n8n.your-domain.com`. Bind port 5678 to loopback behind the proxy. Restrict SSH to your IP; expose HTTPS through the OCI network rules and OS firewall.
5. Set `N8N_HOST`, `N8N_PROTOCOL=https`, `N8N_EDITOR_BASE_URL`, and `N8N_PROXY_HOPS=1`. Current n8n uses `N8N_WEBHOOK_URL`; versions before 2.35 use `WEBHOOK_URL`. Forward the proxy headers described in [n8n’s reverse-proxy guide](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/configuration-examples/configure-webhook-urls-with-reverse-proxy.md).
6. Confirm `/healthz`, login and a harmless manual workflow. Keep imported publishing workflows inactive until the worker endpoint is ready. Do not turn the retired EchoLink v1 pipelines back on.

## EchoLink worker cutover is a separate task

The current `platform:start`, Windows supervisor, Ollama launcher and tunnel repair are Windows-specific. They are **not a tested Linux deployment package**. Before cutting over:

- Install the app’s supported Node runtime, dependencies, fonts (including Bangla) and any chosen cutout engine on Linux; build and test there.
- Install a restricted service account and a `systemd` service running `node platform/server/index.mjs` with automatic restart. Run from the project root so environment/asset paths resolve consistently.
- Transfer the existing `platform/.local/assets` directory securely. Asset paths stored in PostgreSQL currently contain Windows absolute paths: translate them to verified Linux paths in a controlled migration, or move assets to shared object storage first. Copying the database alone loses image access.
- Preserve the existing platform encryption key and auth session secret; transfer private environment files securely, never through Git. Keep the same tenant-restricted Neon runtime role. Give the worker only the database/service credentials it actually uses.
- Configure the stable worker origin, Vercel’s protected proxy/route registry, Google OAuth callback, public signed media origin and store/model endpoints consistently. Keep the main Vercel dashboard domain unchanged if desired.
- Use a private network for Ollama on Windows; `localhost` on Oracle points to Oracle, not this PC. Never expose an unauthenticated model port publicly. Test AI-unavailable behavior and ready-post publication independently.
- Pause dispatch, drain running tasks, stop the Windows worker, migrate paths, start the Linux worker and validate tenant access, images, scheduling and token decryption. Then test one reviewed live post and its Instagram delivery. Resume automation only on the chosen worker. Do not publish the same content from two separate n8n pipelines.
- Keep database, assets, n8n credentials and keys backed up outside the VM. Verify restore and alerts; idle reclamation is a real operational limitation.

## What you would need to provide

An Oracle account with an eligible A1 VM available, its public IP, an SSH access method, and a subdomain you control. Keep private keys and secrets out of chat and source control. This assessment does not deploy or replace your working Windows setup.
