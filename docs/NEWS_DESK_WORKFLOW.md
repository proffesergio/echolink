# News desk: report first, social post second

Select a news Page, then **Page settings → Design & prompts → Output format →
News desk · complete website report first**. NobleSeek is configured for this mode.
RSS remains a discovery source; the worker reads the source articles and up to
three supplied related URLs before writing. Source links remain private research
records, while necessary prose attribution and uncertainty remain in the article.

The flow is:

1. Collect full available reporting, not just an RSS excerpt.
2. Write a neutral Bangladeshi newspaper-style report in saved paragraph steps:
   factual lead, developments, documented context, implications and known next
   steps. The normal target is five substantive paragraphs, approximately
   400–550 Bengali words when supported. Thin reporting uses a smaller report or
   stays held rather than being expanded with invented facts.
3. Prepare two short social-summary sentences. Append the configured first-comment
   invitation and relevant hashtags. A closing engagement question is optional.
4. For an enabled automatic Page, publish and verify the complete website report
   before preparing its news-card image. Human-review Pages retain their review
   requirement; drafts explicitly saved outside automation are not auto-published.
5. Render the news image with its original source photo, Page logo, selected
   Bangla headline font, category at upper right and the bottom badge:
   **বিস্তারিত জানতে প্রথম কমেন্ট দেখুন**.
6. Reserve the next permitted Facebook slot and publish the card/short caption.
   The existing delayed link-comment job uses the confirmed website article URL.
   The delay remains at least five minutes; no automation-timer text appears in
   the audience-facing caption.

Website writes retain their durable destination receipts. A lost submitted
response is held for reconciliation. A confirmed URL survives a later image,
Facebook or public-verification failure and is not blindly republished.

## Upload a Bangla headline font

Open **Page settings → Edit Page settings → Design typography**:

1. Tick **I have permission to use this font in published designs**.
2. Upload a Unicode Bengali **TTF/OTF under 2 MB**. Legacy Bijoy/ANSI fonts are not
   suitable for Unicode news text.
3. Upload selects the new **Headline font** automatically. Check the Bangla preview.
4. Save the Page. Use **Refresh queued designs** if you want existing unpublished
   images to use it. Uploaded fonts do not change Facebook's native caption font.

## Understand held content

The overview now calls the review backlog **Needs attention** rather than implying
all held posts are actively preparing. Source conflicts, unsupported figures,
insufficient evidence and sensitive stories remain genuine editorial holds.
The obsolete mandatory-question check no longer blocks a first-comment CTA.
Failed preparation records its actual error on the draft; successful preparation
clears old error text before resuming scheduling.

An operator repair backs up the existing state before repairing automatically
generated product captions from verified catalogue facts and marking old short
news drafts for staged full-report regeneration. It preserves published posts,
manually created drafts, unavailable products and sensitive-content review holds:

```bash
node scripts/repair-prepared-content.mjs
node scripts/repair-prepared-content.mjs --apply
```

## Insights and CPU use

Facebook/Instagram reports refresh every six hours for connected Pages, using the
non-inference task lane. Manual refresh also avoids waiting for a long text call.
An unlinked Instagram account is shown as unlinked, not as invented zero activity.
Reports fetched from Meta on this installation include both Facebook Pages and
Fabrything's linked Instagram account. NobleSeek currently exposes no linked
Instagram account through its Page connection.

The current four-core PC uses `PLATFORM_INFERENCE_THREADS=4`, one model/request at
a time, with the memory reserve and 20-minute per-call deadline retained. The
operator can change this CPU-thread budget; it is capped at available local CPU
threads. More threads are not a guarantee of faster generation for every model.
News article paragraph progress and resource/retry waits are recorded separately
from website, design and social-delivery receipts.
