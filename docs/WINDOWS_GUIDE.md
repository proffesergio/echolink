# EchoLink: Windows 11 setup and operation

## What the reference image means

`workflows/image.jpg` shows many RSS sources joining a shared news processing and
publishing path. Its labels are small, so this mapping describes the visible
stages rather than claiming every node has been reproduced.

| Reference stage | Your implementation |
| --- | --- |
| Many RSS source nodes | Any number of enabled rows in News feeds / Airtable Ingestion Feeds |
| Merge and duplicate removal | Worker ingestion plus Neon per-page URL/title unique constraints |
| AI processing | Per-page Ollama / LM Studio / LocalAI OpenAI-compatible endpoint |
| Media branch | RSS image → article OpenGraph image → text-only fallback |
| Review / routing | Approval requirement, posting window and daily cap |
| Facebook branches | Direct Graph API text/photo publication and post engagement counts |

The worker performs these operations behind HTTP nodes. It is not a native-node
copy of the screenshot. `EchoLink — Complete pipeline` now connects the stages in
one n8n canvas. The original six job workflows remain available individually;
the seventh original workflow is an optional AI HTTP adapter reference.

## Open the admin dashboard

The worker must be running. It currently runs in the background on port 8787.
From PowerShell:

```powershell
cd C:\Users\bhnbi\Music\echolink
npm run dashboard
```

This opens `http://127.0.0.1:8787/admin` using a two-minute, single-use login link.
Your .env.local DASHBOARD_PASSWORD now works for direct login; restart the worker
after changing it. Alternatively, open Settings and save a dashboard password
(12–256 characters); this clears DASHBOARD_PASSWORD and stores its hash. You can then
sign in directly at `http://127.0.0.1:8787/admin`. The eight-hour local session
survives worker restarts. Changing the password invalidates earlier sessions.
`npm run dashboard` remains the owner recovery command if you forget the password.

The UI manages page configuration, feed configuration, token aliases, source
hosts, model discovery/testing, Facebook identity testing and article approval.
Page/feed writes update Airtable and refresh the Neon configuration snapshot.
Secret values stay in `.env.local`; the UI only returns alias names or whether a
credential is configured. Settings also manages database/Airtable credentials,
model host permissions, concurrency, timeouts, embedding configuration, job
intervals and explicit live-mode switching. Blank secret inputs keep saved values.

## Recommended route: native Windows Ollama

Your detected machine has approximately 12 GB RAM, an Intel i5-6500 CPU, and a
GeForce GT 730 / Intel HD Graphics 530. Start small and expect CPU inference.
Running n8n, Windows and a large model at once can exhaust memory. Model size on
disk is not the same as RAM needed during inference.

1. Download the Windows installer from https://ollama.com/download/windows and
   install it. Launch Ollama from the Start menu.
2. Open a new PowerShell terminal so it sees the installed command.
3. Download a small initial model:

```powershell
ollama --version
ollama pull gemma3:1b
ollama list
```

The small model tests the connection; it does not guarantee publication-quality
Bangla. After the first test, try `ollama pull gemma3:4b` if memory and speed allow.
The official catalog lists the 1B download at about 806 MB and 4B at about 3.4 GB.
Review actual Bangla captions before choosing a model for unattended work.

4. Confirm the server responds:

```powershell
Invoke-RestMethod http://localhost:11434/v1/models
```

The Windows app normally runs its server in the background. If it is not running,
start the app, or use `ollama serve` in a separate terminal. An "address already
in use" message means a server is already listening; do not start a second one.

5. Open the dashboard → **Pages & models** → select the setup page. Enter:

| Setting | Initial value |
| --- | --- |
| AI Infrastructure Target | Ollama |
| Local Endpoint URL | `http://localhost:11434/v1/chat/completions` |
| Model Identifier | Exact ID from `ollama list`, initially `gemma3:1b` |
| Temperature | `0.4` |
| AI Secret Alias | Blank for native local Ollama |
| Target Language | Bangla, English or Bilingual-Mix |
| Max Posts Per Day | `3` initially |
| Posting Window Start / End | `09:00` / `23:00` |
| Timezone | `Asia/Dhaka` |
| Require Human Approval | Checked |
| Source Comment Delay Minutes | `5` initially |
| Minimum Minutes Between Posts | `30` initially |

Click **Discover models** and **Test caption**. The test runs against the current
form values without creating a Facebook post. Model requests allow five minutes
by default (`AI_TIMEOUT_MS=300000`); a model that regularly exceeds this budget
needs a smaller size or shorter input. Do not use the full advertised 128K
context on this machine. A 4K context is a sensible starting point.

You can make a limited-context Ollama model variant with a Modelfile:

```text
FROM gemma3:1b
PARAMETER num_ctx 4096
```

Save this as `Modelfile`, run `ollama create echolink-small -f Modelfile`, and use
`echolink-small` as the model ID. Keep the UI's temperature as the per-page setting.

## Alternative: LM Studio with a model-management UI

1. Install LM Studio from https://lmstudio.ai/.
2. Download a small instruct GGUF model appropriate for the available memory.
   Start with a small quantized model, then evaluate language quality.
3. Load it, open the Developer tab and start its API server.
4. In EchoLink select **LM Studio**, with endpoint
   `http://localhost:1234/v1/chat/completions`.
5. Click **Discover models** and copy the exact returned model ID into the page.
6. If LM Studio server authentication is enabled, save its API token under
   Connections → AI authentication and put that alias in the page's AI Secret
   Alias. Otherwise leave it blank.

You need only one inference engine initially. EchoLink manages connections and
tests; model downloads/loading happen in Ollama or LM Studio. It does not install
or download models from the admin dashboard.

LocalAI is also supported: run its OpenAI-compatible server, usually at port
8080, then use `http://localhost:8080/v1/chat/completions` and the model ID exposed
by that installation. LocalAI port/auth/model configuration depends on its launch
configuration. Start with one of the Windows-native options above.

## WSL option

WSL is optional because n8n and the worker already run on Windows. Avoid running
two Ollama instances or downloading the same model in both Windows and WSL.

If you prefer Linux Ollama, follow its official Linux installation instructions:
https://docs.ollama.com/linux. With the WSL server running, first test its API from
Windows using `Invoke-RestMethod http://localhost:11434/v1/models`. Windows can
normally reach WSL-hosted services through localhost forwarding.

In the reverse direction, WSL reaching a Windows service under default NAT may
need the Windows host IP rather than localhost. Windows 11 22H2+ also supports
mirrored networking. To use it, preserve any existing settings and add this to
`%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

Apply with `wsl --shutdown`, then relaunch WSL. This stops current WSL sessions,
so save Linux work first. GPU limitations remain hardware limitations; WSL does
not make the GT 730 a modern supported inference GPU.

## Facebook Page setup

These account actions require you to sign into Facebook/Meta and authorize the
app. The dashboard can store and test the resulting token, but does not yet
provide a complete Facebook OAuth onboarding flow.

1. Sign in at https://developers.facebook.com/apps/ with an account that has the
   required content-management access to your Page. Create or choose your Meta
   developer app and configure its Facebook Page management use case.
2. Follow the current Pages API setup in your app. For basic Page discovery,
   posting and engagement, the relevant permissions are `pages_show_list`,
   `pages_manage_posts`, and `pages_read_engagement`. Page insights additionally
   use `read_insights`. Business-managed assets may require additional access.
   Adding the delayed source comment also requires the appropriate comment
   management permission, generally `pages_manage_engagement` for Page actions.
   Meta controls which permissions, app roles, review and business verification
   apply to your use case; the EchoLink dashboard cannot bypass those requirements.
3. In Graph API Explorer select your app and its supported API version. Generate
   a user token with the permissions granted to your app and select your Page.
   With a user token, the following GET request can return managed pages:

```text
me/accounts?fields=id,name,access_token,tasks
```

4. Copy your target Page's numeric `id` and its **Page access token**. A user
   token or App Secret is not a replacement for a Page access token. Use Meta's
   supported long-lived token flow for regular operation; tokens can still be
   revoked or invalidated. Do not treat them as permanently valid.
5. In EchoLink → Connections, enter alias `primary-page`, your Page token and the
   same supported Graph API version shown in your Meta app (format `vNN.0`).
   Save the token. Do not put it into Airtable's legacy token field or chat.
6. In Pages & models, enter FB Page Name, FB Page ID, and FB Secret Alias
   `primary-page`. Click **Test Facebook connection**. This performs a read-only
   `/me` check and verifies the token identifies the entered Page. It does not
   prove every publishing permission; verify those in Meta before going live.
7. Keep approval required and `DRY_RUN=true` while testing the full news path.

Meta docs returned HTTP 429 during this setup session. The URLs below are the
official references to follow for your app's current setup and access rules:

- https://developers.facebook.com/docs/pages-api/getting-started/
- https://developers.facebook.com/docs/pages-api/posts/
- https://developers.facebook.com/docs/facebook-login/guides/access-tokens/

## Configure sources and generate the first caption

1. Enter your Page ID and model settings, then enable the page's Active Status.
   For a generation-only test before Meta onboarding, use a separate clearly
   named test page with Page ID `0`, keep DRY_RUN=true and do not save a Facebook
   token. Replace that placeholder before any live configuration.
2. Under Connections → Source hosts, include every RSS host and article host.
   The initial BBC example uses `feeds.bbci.co.uk`, `www.bbc.com`, and
   `www.bbc.co.uk`. Add your chosen sources' actual final hostnames.
3. Under News feeds, edit the disabled example or add your own HTTPS RSS URL,
   link it to the target page and check Active Status. Feed URLs must return
   RSS/Atom; HTML scraper results are not interchangeable with RSS in this version.
4. During the page's allowed posting hours, use Overview to run:

```text
sync → ingest → process → mirror
```

5. The first caption should appear as Pending Approval under Review queue. Read
   the source, caption and media link, then approve or reject it. Approval is also
   available through Airtable's Approval Decision field.
6. Run Process again. An approved article should become Dry Run. It is not sent
   to Facebook. Dry Run rows do not automatically become live posts later.

Quiet hours stop AI processing as well as posting. Items remain Queued until the
next permitted window. Start with one feed because fetching/extracting every
story can be slow, and the small CPU processes one page at a time by default.

## Run automatically

Use **EchoLink — Complete pipeline**. Its single canvas contains all seven jobs,
including source comments and analytics. A one-minute tick plans due jobs;
independent intervals in Settings prevent running every job each minute.
PostgreSQL leases prevent concurrent scheduled claims of the same job.

For dashboard Start/Stop, create a key in n8n **Settings → n8n API**, then save it
in dashboard **Settings → n8n API connection → Replace n8n API key → Verify & save n8n key**. The key needs workflow read/activate/deactivate
permissions when the n8n edition supports scopes. Start stops older EchoLink
schedules before activating the combined workflow through n8n's running HTTP API.
Without a key, open the workflow link and publish it directly in n8n. CLI
publishing is not used for dashboard controls because it requires an n8n restart.
Existing eight workflows remain preserved and inactive; they are not required
alongside this combined workflow.

The combined pipeline reads prior approval
decisions before processing, then mirrors newly generated captions afterward.
A caption created this run waits for a later run after human review.

The computer must stay awake with n8n, worker and model server running. For a
normal manual start use two terminals: `n8n start` in one and `npm start` in the
project in another, plus the model app. Do not start another worker if port 8787
is already in use. Background worker PID/logs are in `.codex/logs/`.

For unattended Windows startup, configure Task Scheduler to start your n8n,
worker and model app under your own account. No auto-start task has been installed
by this change.

## Live publishing and optional improvements

### The seven mandatory project criteria

The acceptance checklist is in `PROJECT_PLAN.md`. Twenty distinct Bangla
publishers are now verified and imported, disabled, alongside the older BBC
example. See `sources/VERIFIED.md` for exact URLs and check time. Enable the
publishers you approve under News feeds. Each visible fallback is another
verified publisher: it supplies alternate news if a feed fails, rather than
recovering the exact blocked story. You may replace it with an approved
same-publisher alternative. Parsing failures also trigger fallback.

After a confirmed Facebook post, its source link is queued durably for a later
comment; captions no longer automatically append that link. Set Source Comment
Delay Minutes per page (default 5). The complete workflow checks due comments
every minute; leave the older companion workflow inactive. Comments are never sent before their due time and
also wait through quiet hours; actual delivery can therefore be later than the
configured delay. Unknown API outcomes require reconciliation instead of blind
retries. The default Minimum Minutes Between Posts is 30, in addition to the
daily cap and posting window.

Content Log now includes duplicate/failure audit events and source-comment
status, ID and due time. Exact URL/title deduplication is tested; cross-publisher
semantic duplicates still need an installed embedding model and evaluation.
No configuration can guarantee perfect semantic duplicate detection.

Review queue also displays skipped/failed ingestion audit events. For a failed
pre-publication article or a completed Dry Run, Requeue requires confirmation and
resets approval. A definitively failed source comment can be retried after fixing
its token/permissions; its due time is preserved. Publish Unknown / Unknown
comment outcomes are excluded because the remote action may already have
succeeded. Reconcile those in Facebook before any retry.

After one-page dry runs and a successful Page connection check, you can make an
explicit live configuration in dashboard Settings: uncheck dryRun and type
`ENABLE LIVE PUBLISHING`. Enabled pages must have saved Page token aliases and
a valid Graph API version. Keep approval required and a small daily cap. The next
eligible approved article may then publish. Dashboard manual Process deliberately
stays restricted to dry-run; the configured n8n pipeline handles live processing.
I have not switched this installation to live mode or posted anything.

Optional semantic deduplication needs a separate embedding model, for example
`ollama pull nomic-embed-text`, followed by enabling semanticEnabled and setting
embeddingURL / embeddingModel in Settings. The initial implementation stores
bounded semantic memory in PostgreSQL; Qdrant/MCP is a later adapter, not installed.
Bright Data/Decodo scraping, Postiz fan-out, and advanced image processing remain
future integrations. The screenshot alone does not specify those implementations.

## Official model and networking references

- Ollama Windows: https://docs.ollama.com/windows
- OpenAI-compatible API: https://docs.ollama.com/api/openai-compatibility
- Model sizes: https://ollama.com/library/gemma3
- LM Studio server: https://lmstudio.ai/docs/developer/core/server
- WSL networking: https://learn.microsoft.com/en-us/windows/wsl/networking

## Detailed walkthroughs

- [First Facebook post, node by node](FIRST_FACEBOOK_POST.md)
- [Hosting and the prepared Vercel frontend](HOSTING_AND_VERCEL.md)
