# Publishing, calendar and delivery policy

Open https://echolinkbd.vercel.app/admin. The Windows worker, n8n, Ollama, internet connection and HTTPS tunnel must remain running; the Vercel frontend cannot run local inference or deliver posts while the PC is off. Keep Windows awake during your posting window.

## Current Page settings

Noble Seek is configured for live publishing, 2 posts per local day, a 60-minute minimum gap, 09:00–23:00 Asia/Dhaka, human approval, and a source comment 5 minutes after successful publication. These are your operating limits, not Meta-provided safe limits or a guarantee against restrictions. Other posts made directly on Facebook are not counted by EchoLink.

In **Pages & models**, select your Page and change:

| Control | Meaning |
| --- | --- |
| Max Posts Per Day | Successful EchoLink publications per Page-local calendar day. Zero stops new delivery. Uncertain in-flight deliveries also reserve capacity. |
| Minimum hours between posts | Minimum hours since the last successful EchoLink post: 1 means 60 minutes; 2 means 120 minutes. |
| Posting Window Start / End | HH:mm in the Page Timezone. Start is inclusive; end is exclusive. Overnight windows work; identical start/end permits all day. |
| Source Comment Delay Minutes | Minimum delay measured from the confirmed Facebook publication, not the scheduled time. Comments also wait through quiet hours and Facebook cooldowns. |
| Require Human Approval | Generated drafts stop for review. Keep this enabled while evaluating local-model accuracy. |

Save the Page. Settings sync to Neon immediately. The UI stores hours as the Airtable **Minimum Minutes Between Posts** field, so both control surfaces stay consistent. Use sensible small limits for testing. Publishing one post at a time and no automatic retry of uncertain outcomes matter more than a universal posting-rate number.

## Publish Now

1. Generate a fresh draft from Overview; this works in live mode and always stops for review.
2. Open Review queue or Drafts. Compare the source, numbers, names, date and attribution with the generated caption. Edit and save corrections. Rewriting a source does not make the Page its original reporter.
3. Review the selected photo, its relevance and permission to reuse it. Check **Include this photo** to publish it. An accessible HTTPS photo URL is required; Facebook fetches it from its servers.
4. Optionally choose **Suggest relevant hashtags** in the editor. Topic rules suggest at most three tags. They become part of the saved caption and need approval like other edits. New AI drafts already include matched topic tags when space permits; remove or edit them as needed.
5. Click **Publish Now** and confirm. The worker begins a background delivery without waiting for an n8n tick. Live mode, Page activation, posting window, daily cap, spacing, calendar reservations and Facebook cooldowns must pass.
6. Activity shows progress; **Published** is populated only after Facebook returns a remote ID and the database records it. The post card links to Facebook. A selected photo is sent to `/PAGE_ID/photos` with the exact reviewed caption; explicitly text-only posts use `/PAGE_ID/feed`. Image rejection is visible and never silently turns into a text-only publication.

The reviewed caption, including hashtags, is the published caption. EchoLink does not append hidden text after approval. Local model output still needs factual review.

## Schedule with the calendar

1. Open **Scheduled** to see the monthly calendar. Previous/next month buttons and clickable dates show reservations and recent publications. Calendar times use the browser timezone, labelled above the grid. Page quotas use the Page timezone.
2. Select a reviewed post and a future time. **Find available time** searches forward within 31 days for a slot inside Page hours, with daily capacity and minimum spacing. Confirm **Approve & Schedule selected post** to reserve it.
3. Alternatively, use **Schedule** on a post card, choose a date/time, or **Find next available time**, then **Approve & Schedule**.
4. Conflicting reservations and times outside Page hours are rejected with a specific reason. Editing an approved caption or photo clears approval. **Save Draft** cancels its schedule and holds the post out of automation; **Review** only opens analysis.
5. Ensure **Workflow → Start workflow** is running. n8n checks every minute; publishing/comments have independent one-minute intervals. A reserved time is an earliest eligible time, not a real-time delivery guarantee: long jobs, downtime, quotas and Meta cooldowns can delay it. The earliest due approved schedule is selected before unscheduled content. At most one post per Page is attempted in each processing run, and the minimum gap still applies.
6. Schedules more than six hours late become held **Drafts**, clear their schedule/approval, and require fresh review. A held Draft also prevents a stale Airtable approval from reactivating an expired schedule. This prevents an old backlog from being sent after downtime. Dry-run does not consume a scheduled approval or send posts/comments.

Automatic AI generation pauses when a Page has three posts awaiting approval. Review, hold as Draft, or reject one to make room. Explicit Preview generation can still be requested. This prevents repeated minute ticks from building an unlimited review backlog or keeping the local model busy continuously.

The calendar has a separate query from the newest 200 content cards; it includes up to 2,000 scheduled/recently published entries. No bulk-publish command is enabled.

## Source comments and mirrors

After a successful post, Neon stores a durable source-comment job containing `সূত্র: SOURCE_URL`. The single n8n workflow checks due comments before ingestion/AI, so a slow model does not hold up that tick's comment stage. Each run takes one due comment per Page. Caption attribution should still make the reporting source clear; the delayed link is a citation, not an engagement trick.

The comment status is visible on the post card. Posted/Draft/Pending Approval/Scheduled states, caption, image URL, source URL and Facebook IDs mirror to Airtable and the dedicated Google Sheets tab. Mirrors are asynchronous: a temporary Google/Airtable failure does not undo a successful Facebook publication. Stable Automation IDs update existing Sheet rows instead of adding duplicate rows.

## Facebook errors and restrictions

**Publishing preflight:** Page identity alone is insufficient. Test Facebook connection and Publish Now inspect the actual granted scopes with Meta's token debugger. `pages_manage_posts` and `pages_read_engagement` are required to publish; source comments additionally need `pages_manage_engagement`. A token with only Ads permissions is rejected before a publication request. See the [Ads-only app troubleshooting steps](FACEBOOK_TOKEN.md#2-generate-a-user-token-with-page-permissions).

- Explicit rate-limit rejections queue the same post/comment after a persistent cooldown. `Retry-After` and usage headers can extend the wait; the local fallback is 15 minutes. Usage at 90% triggers a five-minute pause. App-wide throttles pause all Pages using this worker.
- Token, permission and policy errors pause Page delivery until repaired. Check Operations center → Facebook delivery controls, repair the problem, then **Acknowledge repair & Resume**. This acknowledgement preserves any server-requested cooldown; it cannot remove a restriction imposed by Meta.
- Other definite photo/post rejections are **Failed** and need editorial/operator action. No immediate retries or automatic text-only fallback.
- A timeout, missing response ID, server failure or loss of database confirmation becomes **Publish Unknown**. Check the real Page and reconcile the remote ID before retrying. The Page is blocked from additional publication while that outcome is unresolved. Unknown comments likewise require reconciliation.
- Delivery locks, durable attempt records and approval hashes protect against concurrent ticks and repeated clicks. They cannot guarantee exactly-once delivery across an ambiguous external API failure; uncertain writes are held for inspection.

Meta warns against excessive hashtags, unrelated captions, repetitive spam networks, fake engagement and unauthorized reuse. Keep relevant short tags, source-supported original wording, licensed images and human review. See [Meta’s spam guidance](https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/). The implementation also reads Graph usage headers following the [rate-limit reference](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/) and classifies credential/policy errors using the [error-handling reference](https://developers.facebook.com/docs/graph-api/guides/error-handling/); those two documentation URLs returned HTTP 429 to the research browser during this update.

## n8n authentication

If Start/Stop reports HTTP 401, create a new API key at **n8n → Settings → n8n API** and save it in **EchoLink → Settings → n8nAPIKey**. Saving through the dashboard applies immediately. If editing `.env.local` instead, restart the worker after inference finishes. The combined workflow is `echolinkPipeline01`; keep older EchoLink schedules inactive.

## Task progress and logs

The dashboard shows one determinate meter for each active task. Percentages use completed stages or feeds, with the task's stage name, elapsed time and heartbeat. Network requests move through response received, result validation and acknowledgement; HTTP acknowledgement is separate from a durable background job's completion.

Preview tasks show Page loading, feed collection, model preparation, local AI and output/log saving. Publishing shows Page-rule checks, caption/media preparation, the Facebook request, confirmed delivery and log persistence. Activity includes a bounded timestamped event history and the saved result or blocking reason. Failed tasks keep their last completed percentage; they never become 100% success.

AI completion time cannot be predicted from these stages. Its meter stays at the current percentage while the model runs, with a refreshed heartbeat and elapsed time. No fake timer drives it toward 99%. A heartbeat missing for 90 seconds or a reached task deadline becomes Interrupted; expired scheduling leases are released when no matching task is still running. Check real Facebook state before retrying uncertain publication. Current default task deadlines are 30 minutes for preview/process, 10 minutes for Publish Now and 15 minutes for other jobs.

## Verification

`npm run build` and `npm test` check code/manifests and policy/transport behavior. `node scripts/validate-migration.mjs` creates a disposable Neon branch and tests migrations, concurrent scheduler claims, editorial transitions and the full Publish Now → photo → delayed source-comment path against mocked Facebook responses; it then deletes the branch. `npm run verify:cms` tests the real browser with intercepted mutations, including calendar scheduling and Publish Now. These tests do not publish to a real Page. A reviewed real post, its source comment and real Facebook visibility still need acceptance in the dashboard.
