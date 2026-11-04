# Editorial operations center

Open https://echolinkbd.vercel.app/admin. Navigation badges count records across
the whole database. The content view currently loads the newest 200 records,
with generated posts first; its shown count reflects those loaded/filter matches.

## Content views and controls

- **Review queue** starts with generated posts. Use **Content stage → News
  inbox** for raw RSS articles, or **Awaiting approval** for the review backlog.
- **Generate Draft** on a raw queued article selects that exact article for the
  local AI, instead of selecting a different top story. Generation requires
  dry-run and runs in the background; watch Activity.
- **Edit** opens the caption/photo/schedule editor. Choose the image URL and
  leave **Include this photo** checked to include it. Uncheck it for text-only.
- **Save Draft** stores an unpublished, held `Draft`. It clears approval and
  schedule and cannot be picked up by the publishing worker.
- **Review / Submit for Review** moves a held item to review. On an item already
  awaiting approval, Review opens its editorial notes for inspection.
- **Approve** explicitly approves the current caption/photo for the next eligible
  processing run. It does not itself start n8n or override dry-run.
- **Schedule** opens the date/time field. Choose a future browser-local time,
  then **Approve & Schedule**. This approves the saved content and stores the
  time in UTC. Edits revoke approval; Page hours, caps, spacing and the running
  n8n schedule determine when it can actually be sent.
- **Publish Now** starts one background publishing task for the selected post.
  It requires live mode, the enabled Page, token/version and all posting rules.
  The button is disabled when live mode/credentials are missing. It never turns
  off dry-run for you. Check Activity/Published for a confirmed Facebook ID.

Saving/editing/approving/scheduling queues an Airtable/Sheets mirror in the
background. The canonical save is durable in Neon immediately. An animated,
indeterminate work bar shows active requests and background jobs; it does not
invent a completion percentage. Activity retains results and failure reasons.
Polling updates counts/progress while preserving unsaved editor text. If another
session changed the post, a stale save is rejected rather than overwriting it.

## Photos and publication failures

The reviewed photo URL is sent through Facebook's `/photos` endpoint with the
caption; a text-only item uses `/feed`. Facebook must be able to fetch the HTTPS
photo. If it rejects that request, EchoLink reports a failure rather than silently
sending a text-only replacement. Edit the photo (or deliberately remove it),
review again and retry. Missing media at ingestion can still produce a text-only
draft; no image generator is connected automatically.

Timeouts/ambiguous remote results become **Publish Unknown**. Inspect Facebook
and reconcile them before another attempt. Unknown or published items cannot be
edited/re-published through these controls. A successful API request or queued
task is not proof of publication; Published requires a confirmed remote post ID.

## Connections and operations

**Operations center** shows draft/review/schedule/publication counts, readiness
issues, upcoming posts, automation mode and run history. **Connections** has a
searchable catalog plus the Facebook, AI and Google Sheets setup forms.
Configured means settings exist; run each connection's test to verify access.

Working adapters cover Facebook Pages, Sheets, Airtable, Neon, n8n and per-Page
OpenAI-compatible AI runners. Embeddings and Slack notifications remain opt-in.
Postiz, Qdrant MCP and paid extraction providers are visibly **Planned**; the
catalog does not claim that those integrations are already installed or connected.
This remains an editorial operations dashboard with one owner login; separate
CRM contacts/sales pipelines and tenant-user roles would require further work.

Account setup guides:
[Facebook token](FACEBOOK_TOKEN.md), [Google service account](GOOGLE_SHEETS.md),
[local AI and production testing](PRODUCTION_TESTING.md),
[first Facebook post and n8n nodes](FIRST_FACEBOOK_POST.md).
