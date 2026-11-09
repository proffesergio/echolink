# Creator pipelines: local first, cloud ready

The current frontend remains React/Vite on Vercel. The persistent Node worker
runs generation, FFmpeg and delivery. Moving to Next.js is not required to use
these features. Existing authentication and tenant isolation remain in place.

## Watch the work

Open **Live workflow**. Choose **All Pages** for separate Page pipelines, or
select one Page. The terminal-inspired view reads recorded task checkpoints:

`sources → writing → branded media → review/calendar → website → Facebook → Instagram → delayed comment`

Click a stage to filter its events. Select a content item to follow its own
history, open its draft, pause log scrolling or hide logs. The view shows elapsed
time, worker heartbeat and next-booked-post countdown. An optional destination
marked **off** is different from a completed delivery. Percentages refer to the
active task, not a prediction of model completion. The dashboard refreshes these
records; it does not stream private model reasoning or fabricated terminal output.

## Configure each Page

Under **Page settings → Edit Page settings**:

1. Select a niche preset: standard/technology/sports news; fashion/gadgets/groceries;
   motivational/daily-facts/riddle Reels. Each injects its own bounded vocabulary
   and factual constraints. Your Page keeps its own logo and connections.
2. Keep or enable **Require human approval**. Current owner Pages retain their
   automatic setting. New Pages default to review. Review status is recorded as
   `PENDING_APPROVAL`; scheduled deliveries are `QUEUED_FOR_PUBLISH`.
3. Configure a notification connection, or use the dashboard alone.
4. Keep the sensitive-topic filter enabled, and optionally add terms. Matching
   content becomes `HIGH_ALERT_MANUAL_REVIEW` before text generation. An admin can
   allow preparation, edit the draft and explicitly approve it. Automatic Page
   approval cannot bypass this hold. Keyword matching is not complete detection
   of every crisis or inappropriate marketing context.

News/blog preparation compares the last 50 published Page headlines before
calling the writer, supplementing existing URL hashes and related-story grouping.
The comparison uses normalized text and token similarity. It can miss semantic
duplicates or flag related follow-up reporting; skipped drafts retain an audit trail.

## Approval notifications

Add a connection under the Page, then choose it in Page settings:

| Connection | Required configuration |
| --- | --- |
| Telegram | Bot token from BotFather; chat ID after starting the bot |
| Discord | Incoming webhook URL for the intended channel |
| WhatsApp Cloud | Sender phone-number ID, recipient including country code, access token; approved template outside the service window |
| Approval webhook / Baileys bridge | HTTPS webhook URL, optional bearer token and recipient |

Use **Send approval preview** on a content card to test actual delivery. The
preview contains Page, niche, text, version, an image when available, and a review
link. Telegram includes an inline URL button. WhatsApp text includes a clickable
review URL; template mode expects two body parameters, preview and review URL.
Set up and approve the corresponding template in your own Meta account.

Opening the link requires the correct signed-in workspace account. It never
approves or publishes by GET, and publication still validates the current version.
Old notifications are skipped after a draft changes. Uncertain notification
outcomes are recorded rather than blindly resent.

The webhook contract is JSON:

```json
{
  "postId": "workspace-owned-post-uuid",
  "version": 3,
  "page": "My Page",
  "niche": "News",
  "state": "PENDING_APPROVAL",
  "preview": "Draft text",
  "imageUrl": "temporary-signed-image-url-or-null",
  "reviewUrl": "https://your-dashboard/?review=post-uuid&version=3",
  "to": "configured-recipient"
}
```

A self-hosted Baileys service must authenticate this request, map `to` to its own
authorized recipient, and call its WhatsApp send API. Pairing remains a manual
step in that service. EchoLink does not silently create a WhatsApp session or
assume arbitrary third-party Baileys gateways use the same API.

## Short Reels

Create a post with type **Reel**, enter its source facts/idea and generate copy.
The worker validates a 30–60-second JSON scene array, including:

```json
[
  {
    "duration_seconds": 8,
    "voiceover_text_bengali": "বাংলা ভয়েসওভারের একটি সংক্ষিপ্ত বাক্য।",
    "visual_asset_search_query": "morning light quiet workspace",
    "text_overlay_style": "minimal high-contrast captions",
    "text_overlay": "নিজস্ব গল্প"
  }
]
```

The example is one scene; the complete storyboard must total 30–60 seconds.
The editor displays all scenes. Provide one permitted image URL per scene and a
voiceover recording following the timing, or configure stock and speech
connections under **Optional short-video tools**:

- **Pexels/Pixabay:** save an API key as a Page connection. Stock credits and
  source links are retained in the editor. Follow the provider's license and
  attribution rules; generated search terms are not a rights clearance.
- **Pollinations speech:** use a separate connection with its supported speech
  model and a Bengali-capable voice. Confirm voice/language support and credits.
- **Pollinations images / Hugging Face Inference:** available as Page image tools
  with server-side API keys. Hugging Face uses Inference Providers, not a promise
  that every arbitrary Gradio Space exposes a compatible endpoint.

Click **Render vertical video**. FFmpeg creates a 720×1280 MP4 with Bengali overlay
text and narration. Missing providers/media, oversized files or narration longer
than the storyboard hold the draft. Enable automatic rendering only after setup.
Review and scheduling follow that Page's policy. This is scene-based media
composition, not a newly trained text-to-video model. Current proxy delivery caps
MP4 files at 4 MB; longer/high-bitrate output needs object-storage delivery.

Facebook video and Instagram REELS payloads use the existing receipt/reconciliation
flow. They need a real approved publishing test after media/provider setup; the
local render test does not prove Meta accepted a video. YouTube upload/OAuth and
Remotion templates remain future work.

## Optional Supabase and BullMQ

The live primary remains local PostgreSQL; Aiven/Neon recovery settings are not
replaced. The root and platform environment files contain blank placeholders:

```dotenv
SUPABASE_DATABASE_URL=
SUPABASE_DATABASE_URL_UNPOOLED=
SUPABASE_CA_CERT_BASE64=
REDIS_URL=
PLATFORM_QUEUE_BACKEND=postgres
PLATFORM_QUEUE_PREFIX=echolink-v2
```

Create projects in your own accounts and save secrets locally. Run
`npm run cloud:check` to probe configured connections without changing the primary.
For the persistent Node worker, Supabase direct TCP or the session pooler fits
the current `pg` driver. Use a direct/admin connection for migrations and restore,
then a dedicated non-superuser runtime login with the existing RLS grants.
Use verified TLS, a small pool and server-only credentials. Do not put a Postgres
URI in a `NEXT_PUBLIC_*` variable. Add/test a **Supabase** database profile in the
Owner console before planning an isolated restore and cutover. Merely filling a
placeholder does not switch the running database to an empty service.

When Redis is ready, use `rediss://` for a remote TLS service, enable persistence
for a local service, test it, then set `PLATFORM_QUEUE_BACKEND=bullmq` and restart
the worker. BullMQ uses separate serial preparation and delivery queues. SQL tasks
remain the durable outbox and publication ledger; Redis stores task IDs, not
captions, images or secrets. The dispatcher reconstructs missing jobs, and SQL
claims prevent concurrent delivery of the same task. Failed/ambiguous Meta sends
are never automatically resubmitted merely because Redis retries a wake-up.

Delayed source comments are due **at least five minutes after confirmed Facebook
publication**. Exact execution at five minutes is not guaranteed if the worker
is busy or offline. The existing Postgres queue enforces the same earliest time.
Optional Page-like actions target the Page's own confirmed comment and record
success/rejection separately. They do not simulate other people's engagement or
guarantee reach; a failed like never causes the comment to be reposted.

References: [BullMQ delays](https://docs.bullmq.io/guide/jobs/delayed),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Pollinations API](https://github.com/pollinations/pollinations),
[Hugging Face image inference](https://huggingface.co/docs/inference-providers/tasks/text-to-image),
[Pexels API](https://www.pexels.com/api/documentation/).
