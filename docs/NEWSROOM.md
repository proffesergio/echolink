# Newsroom: visible previews, top-news selection and post panels

The first empty run was caused by all 21 feeds being paused. Ollama was reachable,
but ingestion inserted zero articles and processing had an empty queue. This was
an HTTP-successful no-op, not a generated draft. The dashboard now shows that
condition and records stage results under Activity.

## Generate a visible draft

1. Confirm **DRY RUN** at the top of the dashboard.
2. On Overview choose the enabled Page under **Today's top story → your draft**.
3. Enable the verified Bangla feeds if needed. That action links/enables the 20
   verified publishers for the chosen Page; the BBC example stays paused.
4. Click **Generate today's top draft**. The HTTP call returns a run ID quickly.
   The actual feed fetch and local model inference run in the background.
5. Watch the preview summary and **Activity**. Active panels refresh every ten
   seconds unless you are editing a form. If a stage blocks/fails, inspect its
   expanded result; a green HTTP response alone is not proof of content creation.
6. Open **Drafts**. The new item includes the source URL/date, ranking reason,
   rewritten caption, editorial analysis and image suggestion.

Preview samples one latest item per enabled linked feed to bound extraction
time. Regular ingestion uses the Settings maxItemsPerFeed value. Inference may
take minutes on the local CPU. A preview can generate outside the posting window
because it requires dry-run and always creates a review draft. The ordinary n8n
publishing path still checks quiet hours before generating/publishing.

## What “top news today” means here

The worker preserves the RSS publication timestamp and ranks eligible stories
whose source date is today in the Page's timezone. Missing/invalid timestamps,
old stories and dates over 15 minutes in the future are excluded from today's
automatic selection. A source with no known date is not silently called today's
news. Approved posts with an explicit schedule can still publish later.

The ranking favors freshness, related headline coverage from distinct publisher
hosts, public-interest topic keywords and image availability. This is a
transparent heuristic over configured feeds, not a verified national popularity
or trending chart. Headline token overlap is an approximation; optional semantic
deduplication remains a separate embedding-model feature.

The selected article is sent to the model for factual analysis and fresh Page
wording with attribution preserved. New phrasing does not guarantee copyright
originality, fact-checking or ownership of the source's reporting. Review names,
numbers, claims and uncertainty against the original source before approval.

## Images

An RSS image or article OpenGraph image is displayed as a **source image
candidate**. Check its context and permission before publishing. You can keep an
authorized source URL, replace it with an authorized/generated image URL, or
clear it for text-only publishing.

The model also provides an illustrative image prompt. This is a suggestion, not
an image file. No image-generation server is currently connected, and the app
does not claim that an image has been generated or licensed. If you generate an
image elsewhere, host it at an accessible HTTPS URL and paste it into Image URL.

## Drafts, Scheduled and Published

- **Drafts**: captions waiting for approval, queued captions and completed dry-run
  captions. Saving caption, image or scheduled time requires fresh approval.
- **Scheduled**: approved posts waiting for their chosen time or next eligible
  publishing window. Choosing a future time does not override approval, quiet
  hours, daily caps or minimum gap. The actual post can occur after the chosen
  time if those gates or a later n8n tick require it.
- **Published**: confirmed Facebook publications, with post/comment IDs and times.
  Dry Run and Publish Unknown are not shown as confirmed publications.
- **Review queue**: all latest articles, including raw news inbox records and
  failed/skipped ingestion audit events.

To schedule: save a future local date/time in the draft, review the content again,
then approve it. Time entry uses the browser's local timezone and is stored in
UTC. The worker excludes future scheduled posts from processing. A draft saved
in dry-run will not publish until live mode is explicitly enabled. Do not run an
approved item through dry-run Process if you intend to publish that same item;
it becomes Dry Run and then needs requeue/review.

The Page ID does not authorize Facebook writes. Save a **Page access token** in
Connections and assign that exact FB Secret Alias to the Page. The dashboard
warns if the alias has no token. Preview generation works without a token; live
mode must not be enabled until the Page identity check and credentials pass.

Google Sheets is an optional additional log; see [GOOGLE_SHEETS.md](GOOGLE_SHEETS.md).
