# First real Facebook post: dashboard and n8n walkthrough

Updated 2026-11-03. The imported workflow is **EchoLink — Complete pipeline**:
http://localhost:5678/workflow/echolinkPipeline01

The canvas calls the EchoLink worker. AI, RSS extraction, deduplication, Graph
requests and PostgreSQL transactions run in that worker. There is no separate
Facebook or Ollama credential to attach to a canvas node: those settings belong
to the dashboard. Keep the older eight workflows stopped when using this one.

## 1. Sign in and start the local services

Your existing `.env.local` `DASHBOARD_PASSWORD` now works at:
http://127.0.0.1:8787/admin

```dotenv
# Example only: use your own password. Quote values containing # or spaces.
DASHBOARD_PASSWORD='your-own-local-dashboard-password'
```

Restart the worker after editing environment variables. From the project:

```powershell
cd C:\Users\bhnbi\Music\echolink
.\scripts\restart-worker.ps1
```

`DASHBOARD_PASSWORD` takes precedence over the hash if both exist. Saving a new
password in Settings clears the plaintext variable and writes a scrypt hash.
The Settings form requires 12–256 characters and matching confirmation. Password
changes invalidate old sessions. Owner recovery remains `npm run dashboard`.

Keep n8n running in its own terminal (`n8n start`). Do not launch a second copy
if port 5678 is already in use. The managed worker is already running on 8787.

For native Windows Ollama, install it from https://ollama.com/download/windows,
launch the app, and download the small starting model described in the Windows
guide:

```powershell
ollama pull gemma3:1b
ollama list
Invoke-RestMethod http://localhost:11434/v1/models
```

This small model is for an initial connection/quality test; review its Bangla
carefully. Ollama's OpenAI-compatible API supports the local endpoint used here:
https://docs.ollama.com/api/openai-compatibility

## 2. Connect the real Facebook Page

Use a Meta developer app associated with a Page you manage. In Meta's Graph API
Explorer, select your app and the Graph API version supported by that app. Use
the same version in EchoLink; do not assume the older v20 example is still valid.

For the intended operations, check Meta's current permission requirements for:

- `pages_show_list`: discover the Pages available to the user.
- `pages_read_engagement`: Page/post read access needed by the publishing setup.
- `pages_manage_posts`: create Page posts/photos.
- `pages_manage_engagement`: publish the delayed source comment as the Page.
- Additional insights access may be required for some analytics fields; analytics
  failure should not be interpreted as failure of an already published post.

The precise access level, app mode, Page tasks and review requirements depend on
your Meta app/use case. Start with your own Page and an app-role user. Other users'
Pages may require advanced access, app review and business verification. A token
that lists a Page does not by itself prove that publishing/comments are permitted.

In Graph API Explorer, use an authorized **User access token** to request:

```text
GET /me/accounts?fields=id,name,access_token,tasks
```

Select the target Page's numeric `id` and its **Page access token**. Use Meta's
Access Token Debugger to inspect the token's permissions and expiry. Tokens are
not guaranteed to remain valid permanently. Never paste token values in n8n node
URLs, screenshots, chat or source control.

In dashboard **Connections**, save:

| Field | Value |
| --- | --- |
| alias | `first-page` (your choice) |
| graphVersion | The supported version selected in your Meta app, formatted `vNN.0` |
| value | The Page access token, entered in the password input |

In **Pages & models**, edit the onboarding page or add a page:

| Field | First-test setting |
| --- | --- |
| FB Page Name | Your actual Page name |
| FB Page ID | The numeric ID from `/me/accounts` |
| FB Secret Alias | `first-page` |
| AI Infrastructure Target | `Ollama` |
| Local Endpoint URL | `http://localhost:11434/v1/chat/completions` |
| Model Identifier | Exact installed ID from Discover models, e.g. `gemma3:1b` |
| AI Secret Alias | Blank for unauthenticated native Ollama |
| Target Language | `Bangla` |
| Temperature | `0.4` |
| Timezone | `Asia/Dhaka` |
| Posting Window Start / End | A window including the current local time |
| Max Posts Per Day | `1` |
| Minimum Minutes Between Posts | `30` |
| Source Comment Delay Minutes | `1` for this test, then your preferred delay |
| Require Human Approval | Checked |
| Active Status | Checked after completing the fields |

Click **Discover models**, **Test caption**, and **Test Facebook connection**.
The Facebook test verifies that `/me` identifies the exact configured Page; it
does not publish. Read the generated Bangla caption before continuing.

## 3. Configure one RSS feed and verify services

Keep only the target Page active. In **News feeds**, enable one verified Bangla
feed, link it to that Page, and leave the other feeds paused for the first test.
The source hostname, article hostname and fallback hostname must be present in
the allowed source hosts. The catalog's configured fallback may be another
publisher; it does not guarantee recovery of the exact blocked article.

In **Settings**:

- Keep `dryRun` checked.
- Set `maxItemsPerFeed=1`, `feedConcurrency=1`, `pageConcurrency=1` initially.
- Leave semantic deduplication off until an embedding model is installed/tested.
  Exact URL/title deduplication remains enabled.
- Click **Test Neon** (both schema checks should be true) and **Test Airtable**.
- Your saved n8n API key enables the dashboard's Start/Stop controls. No additional
  n8n credentials are needed if the existing worker Header Auth credential remains.

## 4. Check the canvas node by node

Open the existing complete workflow. Do not replace it with the older individual
workflows. Every HTTP node must use **Generic Credential Type → Header Auth →
EchoLink local worker**. That saved credential supplies:

```text
Header name: Authorization
Header value: Bearer <WORKER_API_KEY from local .env.local>
```

Only recreate the credential if it is missing. The credential value must match
the worker; the n8n API key is a different key and is not the worker credential.
The imported HTTP nodes already have their URLs, timeouts and error connections.
No JSON request body is needed for these job calls.

| Node | Configuration / what to inspect |
| --- | --- |
| Read me | Sticky note explaining the worker and operating mode. No execution. |
| Manual run | Use Execute Workflow for the first test; it forces every stage. Keep the workflow unpublished initially. |
| Every minute | Schedule Trigger, every 1 minute, workflow timezone Asia/Dhaka. It runs only after publishing/activation. |
| Execution context | Code shown below. It distinguishes the actual schedule trigger from a manual run. |
| Plan this tick | POST worker `/jobs/plan`; manual runs append `?force=1`. Output has `due.sync`, `due.ingest`, etc. |
| sync due? | Boolean IF on `$('Plan this tick').first().json.due.sync`. True runs sync; false goes to ingest's IF. |
| Load page & feed settings | POST `/jobs/sync`. Expect result counts matching Airtable pages and feeds. |
| ingest due? | Same IF pattern for `due.ingest`. |
| Fetch feeds & deduplicate | POST `/jobs/ingest`. Inspect inserts/duplicates/errors; exact duplicates are checked before repeat HTML extraction. |
| approvals due? | Same IF pattern for `due.approvals`. |
| Read review decisions | POST `/jobs/approvals`. Reads matching-caption Airtable approval decisions into the queue. New captions are reviewed after mirroring. |
| process due? | Same IF pattern for `due.process`. |
| Quiet hours → AI → publish gate | POST `/jobs/process`. It checks hours/cap/gap, generates one queued caption per active Page, requires approval, then publishes only in live mode. |
| comments due? | Same IF pattern for `due.comments`. |
| Delayed source comments | POST `/jobs/comments`. Sends only due comments in live mode inside the Page's posting window. |
| mirror due? | Same IF pattern for `due.mirror`. |
| Update dashboard & review queue | POST `/jobs/mirror`. Writes article outcomes and audit/comment fields to Airtable. |
| analytics due? | Same IF pattern for `due.analytics`. |
| Refresh engagement analytics | POST `/jobs/analytics`. Optional post engagement counts; skipped in dry-run. Stored in Neon by the current implementation. |
| Mirror failure records | Shared HTTP error branch; attempts `/jobs/mirror` before stopping the failed run. |
| Stop failed run | Stop and Error after that shared error path. Investigate the failed stage before rerunning. |

Execution context Code node (Run Once for All Items):

```javascript
return [{ json: { scheduled: $('Every minute').isExecuted } }];
```

Plan this tick URL expression:

```javascript
{{ 'http://127.0.0.1:8787/jobs/plan' + ($json.scheduled ? '' : '?force=1') }}
```

Example processing URL expression; the other stages substitute their job name:

```javascript
{{ 'http://127.0.0.1:8787/jobs/process' + ($('Execution context').first().json.scheduled ? '?scheduled=1' : '') }}
```

The interval defaults are sync 15m, ingestion 10m, approvals 1m, processing 2m,
comments 1m, mirroring 2m and analytics 360m. Settings changes these intervals.
Scheduled PostgreSQL leases prevent simultaneous claims of the same job. A job's
next interval starts when it finishes. Manual runs bypass the interval gates.

For stepwise investigation, inspect a completed execution's node outputs. If you
use Execute Step on an IF/expression node, run its upstream nodes first: it depends
on Plan this tick and Execution context. Dashboard Overview also runs individual
jobs, though its manual Process button is restricted to dry-run.

The URLs above assume your current npm-installed n8n. If n8n moves into Docker,
`127.0.0.1` means the container. You must use a worker address reachable from that
container and configure the worker bind/firewall accordingly; changing a node to
`host.docker.internal` alone cannot reach a loopback-only worker in every setup.

## 5. Generate and review without publishing

1. Verify dry-run is enabled and the workflow is still stopped/unpublished.
2. In n8n, click **Execute Workflow** once from Manual run.
3. Inspect the processing node output and dashboard **Review queue**. Expect
   `Pending Approval` and a Bangla caption, then the corresponding Airtable row.
4. Check the facts, source, image and caption. If the model/connection failed,
   fix it first; HTTP 200 alone is not success. A job may report an item-level
   failure in `result`, and failed items have a retry delay.
5. Pause the RSS feed after you have a suitable item. Leave the Page enabled so
   it can publish and send the comment. Saving feed changes syncs configuration.
6. Approve exactly the caption you intend to post, using Review queue. It should
   become `Approved`.

**Do not run Process again in dry-run after approval if this is the item you want
to publish.** An approved item processed in dry-run becomes `Dry Run` and will
not automatically publish when live mode is enabled. If that happened, use
**Requeue for fresh review**; approval resets and you must approve it again.
Changing a caption in Airtable also invalidates the previous approval hash.

## 6. Publish one real post

This is the point at which your next eligible approved article may become public.
Keep the Page's daily cap at 1 and human approval enabled. Confirm the correct
Page and exact approved caption. Your workflow remains unpublished for this test.

1. Dashboard **Settings → Publishing mode**: uncheck dryRun, type
   `ENABLE LIVE PUBLISHING`, and save. Page/token/version checks must pass.
2. In n8n, execute **Manual run** once. Do not start the recurring schedule yet.
3. Inspect **Quiet hours → AI → publish gate**. Confirm a `posted` result, then
   `Posted` in Review queue/Airtable and a nonempty **FB Post ID Reference**.
4. Visit the real Facebook Page and check the post. An accessible image produces
   a photo post; no image produces text. A definitively rejected photo can fall
   back to text. A timeout/ambiguous publish outcome is not blindly retried.
5. If the status is `Publish Unknown`, inspect Facebook before taking further
   action. Do not requeue or rerun it as if publication definitely failed.

Do not turn dry-run back on yet if you want to test the delayed comment next.

## 7. Verify the delayed source comment and stop

1. Wait at least the configured Source Comment Delay Minutes from the successful
   post time. Keep the worker/model/n8n running and the Page enabled. The posting
   window must still be open.
2. Execute the complete workflow manually again. With cap 1 and the feed paused,
   processing should not create another post; comments can still run.
3. Inspect **Delayed source comments**. Confirm `sent: 1`, then **Source Comment
   Status = Sent** and its remote ID in Airtable after the mirror stage.
4. Verify the source link is an actual comment below the Facebook post. Quiet
   hours or a later tick can delay delivery beyond the configured minimum.
5. Return Settings to dry-run after the test, or deliberately keep live mode and
   start the recurring workflow when you are ready. Re-enable chosen feeds only
   after reviewing the initial result.

The current analytics adapter collects post engagement counts into Neon. It does
not yet provide the requested full Page Insights/automatic optimization feedback
loop or mirror those analytics fields into Airtable. Qdrant/MCP, Postiz and paid
scraping adapters remain future extensions; they are not prerequisites for this
direct Graph API test.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Dashboard still shows first-time setup | Restart the worker after saving DASHBOARD_PASSWORD; use the port 8787 dashboard, not an old copied HTML file. |
| Incorrect password | Exact value from `.env.local`, with dotenv quotes removed by the parser; nonempty DASHBOARD_PASSWORD overrides the hash. |
| n8n HTTP 401 | Worker Header Auth must contain WORKER_API_KEY, not N8N_API_KEY or a Facebook token. |
| n8n connection refused | Worker running on 8787; npm vs Docker network address. |
| Discover models fails | Model app is running; correct endpoint/port; hostname allowed in Settings; exact installed model ID. |
| Nothing gets generated | Active Page/feed linkage, posting window, cap/gap, queued items and item retry times. |
| Approved item did not publish | Live mode, matching approval, no earlier queued item ahead of it, limits/window and valid token alias. Inspect result and status. |
| Comment remains queued | Live mode, due time passed, Page enabled and still inside its posting window. |
| Facebook permission rejection | Page token type, Page identity/tasks, token scopes/expiry and Meta app's current access/review requirements. |
| Comment is Unknown | Inspect Facebook before retrying; delivery may have succeeded. |

Meta reference pages (Meta returned HTTP 429 during this session, so verify the
current requirements in your app's developer dashboard as part of setup):

- https://developers.facebook.com/docs/pages-api/getting-started/
- https://developers.facebook.com/docs/pages-api/posts/
- https://developers.facebook.com/docs/permissions/
