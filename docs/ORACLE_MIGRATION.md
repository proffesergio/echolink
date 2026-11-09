# Oracle migration: local preparation and account access

## Execution ownership

EchoLink v2 executes its creator pipeline in `platform/server/jobs.mjs`. The Windows Startup supervisor launches that worker, the protected API bridge, the public tunnel and Ollama independently of n8n. Generation, scheduling, website/Facebook/Instagram publishing, comments and reporting run in the creator worker.

The saved **EchoLink · Multi-tenant creator dispatcher (local)** n8n workflow optionally calls `/internal/platform/tick` every 15 minutes or on demand. It checks due automation rules; it does not execute the full v2 feature set on the n8n canvas. The worker also checks due rules itself. A five-minute dispatch safeguard and due-rule locks prevent repeated external checks from creating extra batches.

On 8 November 2026, the local n8n SQLite database showed all ten workflows inactive, no listener on port 5678, and the newest saved execution dated 5 November. The legacy Complete pipeline and separate source-comment workflows are retained inactive. Keep them inactive to preserve one publishing owner. There is no requirement to move or start n8n for the first creator-worker migration.

## Installed CLI

Oracle CLI is installed separately from the app and its image tools:

Verified on 8 November 2026: `oci --version` reports **3.96.0**, and the isolated environment's `pip check` reports **No broken requirements found**.

- Python environment: `%LOCALAPPDATA%\Programs\EchoLink\oci-cli`
- Executable: `%LOCALAPPDATA%\Programs\EchoLink\oci-cli\Scripts\oci.exe`
- User command wrapper: `%LOCALAPPDATA%\Programs\EchoLink\bin\oci.cmd`
- Oracle credentials: `%USERPROFILE%\.oci` (outside this repository)

The wrapper directory is added to the Windows user PATH. A new terminal can run `oci --version`. The project commands below resolve the executable directly, so they also work from an existing terminal. The installation uses Python 3.11 in a virtual environment; it does not modify the app's Python 3.15 environment or its product-background-removal environment.

## Your browser sign-in

Create/sign into your Oracle Cloud account and note the tenancy's **home region**. From the project root:

```powershell
npm run oracle:login
```

Select that region when prompted, then finish Oracle sign-in/MFA in the browser. If the region is known, pass it explicitly (replace this example with your actual home region):

```powershell
npm run oracle:login -- -Region ap-singapore-1
```

The command creates a named `EchoLink` profile. Keep passwords, security tokens, private keys and configuration contents out of chat and source control. Browser sessions are temporary; log in again if they expire. The cloud VM will not need this desktop session to run EchoLink against Neon and Meta.

Verify access:

```powershell
npm run oracle:check
```

The original user-reported target was an Ubuntu 22.04 Minimal `VM.Standard.E2.1.Micro` instance in Hyderabad (`ap-hyderabad-1`), with 1 GB RAM and no public IP. The owner terminated it; Oracle now confirms `TERMINATED` and no remaining boot volume. Its historical identifier is retained only in ignored `.codex/cloud/oracle/target.json`. After login, inspect the saved target without changing it:

```powershell
npm run oracle:check -- -Region ap-hyderabad-1 -InspectTarget
```

Verify networking and SSH access before deployment. A 1 GB Micro instance is not a host for the current 4B model. The replacement attempt below targets A1 compute instead.

### Verified account results on 8 November

- Browser authentication completed for the `EchoLink` profile. Oracle's API confirmed `ap-hyderabad-1` as the tenancy's home region.
- A fresh inventory after the owner's termination found zero active instances and zero boot/block storage usage across the accessible compartments.
- Capacity reports for both `VM.Standard.A1.Flex` at 2 OCPUs / 12 GB and `VM.Standard.E2.1.Micro` returned `OUT_OF_HOST_CAPACITY` in the available Hyderabad domain. Account quota is not physical capacity or a free-usage allowance.
- A dedicated Ed25519 SSH key was generated at `%USERPROFILE%\.ssh\echolink_oracle_ed25519`; its `.pub` file is the public key. The private key remains on the PC with restricted Windows permissions.
- A separate public subnet and security list were temporarily created inside the existing VCN. SSH was restricted to the operator's public IPv4 `/32`; HTTP/HTTPS were allowed. The existing subnet and security rules were not modified.
- At **2026-11-08 04:49:31 UTC**, an actual `oci compute instance launch` request for Ubuntu 22.04 ARM, A1 2 OCPUs / 12 GB, 50 GB boot storage, the SSH public key and `assignPublicIp: true` was rejected with **HTTP 500 / InternalError / `Out of host capacity.`** This was a real launch rejection, not only a capacity report.
- Reconciliation confirmed zero active instances and zero active boot volumes. The failed attempt's empty subnet and security list were deleted. The SSH key and private launch/error records were retained.
- No public IP was allocated, SSH could not be tested, and no production route or publishing owner was changed. No paid shape or alternate region was substituted.

The raw target, inspection, launch manifest, provider rejection and cleanup state are stored under ignored `.codex/cloud/oracle/`. The retained manifest is an audit record: its temporary subnet was removed, so networking must be recreated and IDs refreshed before a future launch. Capacity is time-sensitive; no recurring launch/retry process was installed. The current allocation is within Oracle's documented A1 allowance, but successful provisioning and current eligibility still need verification.

This command only reads Oracle region subscriptions and prints a summary. Before sign-in it exits with code 2 and `Authentication required`. It creates no cloud resources and does not print tenancy IDs, signing keys or tokens. Other existing Oracle profiles can be selected with `-Profile`.

## Migration sequence

1. Authenticate and verify the actual home region, accessible compartments, existing instances, A1 limits and boot/object-storage use. Confirm current Always Free eligibility and available capacity; CLI installation alone does not establish eligibility.
2. Prepare a Linux worker package with the supported Node runtime, Bengali fonts, image tools, private environment configuration and restart supervision. Keep the Vercel dashboard and canonical Neon database.
3. Provide shared asset storage and migrate existing Windows file references. Verify every copied image before enabling cloud delivery. Copy the existing encryption and auth keys securely, preserving tenant boundaries.
4. Create and test the chosen cloud resources. Connect Windows Ollama over private networking, or configure a cloud inference provider. The first target is cloud API/publishing with Windows inference.
5. Drain existing work, assign publishing ownership to the chosen worker, switch the protected API route, and prove one reviewed live delivery including its image and delayed comment.
6. Add cloud/PC standby failover separately: worker identities and capabilities, ownership leases, stale-worker fencing, health-based routing and reconciliation of ambiguous remote writes. Two existing supervisors writing the current single `primary` route are not a failover system.
7. Back up the database, assets and required keys independently; test restore and failure recovery before relying on standby operation.

The login/preflight commands only inspect access. The separately authorized replacement launch above failed because of provider capacity. The current Windows automation remains the publishing owner until the migration is tested.

See [the hosting assessment](ORACLE_HOSTING.md) for current Oracle limits and Linux cutover considerations. Official references: [CLI virtual-environment installation](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/climanualinst.htm), [browser authentication](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/clitoken.htm), [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
