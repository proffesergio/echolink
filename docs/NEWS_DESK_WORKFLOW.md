# Newsroom v4: evidence, complete report, website, then Facebook

Select a news Page, then **Page settings → Design & prompts → Output format →
News desk · complete website report first**. NobleSeek is configured for this mode.
RSS remains a discovery source; the worker reads the source articles and up to
three supplied related URLs before writing. Source links remain private research
records, while necessary prose attribution and uncertainty remain in the article.

The flow is:

1. Extract the full article body from article containers or structured data. Menus,
   related-story widgets and navigation are excluded. Related reports come from
   the Page's configured feeds and matching event cluster, not arbitrary browsing.
2. Build a private evidence ledger of whole sentences. Exact repeats do not count
   as more evidence. Detect overlapping reports with conflicting quantities or
   outcomes and hold them for an editor. At least 450 unique source words are
   required for this full-report mode; thin RSS summaries are held.
3. Write original, neutral newspaper prose in bounded sections. Aim for complete
   coverage, normally 450–850+ words with at least six readable paragraphs when
   supported. Preserve chronology, names, direct quotes, denials and attribution.
   No padding, invented interviews, moral judgement or unsupported analysis.
4. A separate configured `news_review` model checks each section against assigned
   facts and returns constrained JSON. Deterministic checks also reject unrelated
   scripts, unfinished sentences, unsupported figures, lost denials and repeated
   material. Native Ollama JSON constraints preserve source numbers, ordinals and
   negation during writing. A final originality check holds reports with excessive
   unquoted verbatim source wording. One correction is attempted;
   unresolved problems stay held. Draft writing and accepted section checkpoints
   survive provider errors. Overall coverage, length and reviewed-text hash are
   checked before publication.
5. For an enabled automatic Page, write the complete checked report to the website.
   Verify that its live API exposes the exact full text, not just the slug. Only
   then call the caption model for two short social sentences, configured first-
   comment invitation and relevant hashtags, followed by the news-card design.
   Human-review/manual drafts can prepare a preview without automatically writing
   to the public website. Their explicit approval requirements remain in place.
6. Render the news image with its original source photo, Page logo, selected
   Bangla headline font, category at upper right and the bottom badge:
   **বিস্তারিত জানতে প্রথম কমেন্ট দেখুন**.
7. Reserve the next permitted Facebook slot and publish the card/short caption.
   The existing delayed link-comment job uses the confirmed website article URL.
   The delay remains at least five minutes; no automation-timer text appears in
   the audience-facing caption.

Website writes retain their durable destination receipts. A lost submitted
response is held for reconciliation. A confirmed URL survives a later image,
Facebook or public-verification failure and is not blindly republished.

`news_desk_v3` remains the saved Page setting for compatibility; generated reports
now carry `generationVersion: newsroom-v4`. Earlier short reports cannot silently
pass the new automatic publication gate. Changes to reviewed article text also
invalidate that gate. Published historical articles are not rewritten automatically.

Model agreement does **not** prove the original reporting is true, and no model
configuration guarantees zero mistakes. Sensitive material still requires human
review. Necessary attribution remains in prose even though routine source-link
footers are omitted. The approach follows accuracy/attribution principles described
by [Reuters](https://reutersagency.com/about/standards-values/) and
[AP](https://www.ap.org/about/news-values-and-principles/telling-the-story/),
without claiming their endorsement or certification. Native Ollama reviews use
[structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Verify without publishing

```bash
node scripts/verify-newsroom.mjs --post=POST_UUID
node scripts/verify-newsroom.mjs --post=POST_UUID --writer=gemma3:4b-it-q4_K_M --full
```

The first command stops after one accepted writing/review pair; `--full` assembles
the entire report. These commands only read production source records and save
private files under `.codex/newsroom-check/`. They never submit a website article
or Facebook post. A held/invalid report exits with failure. A temporary writer
override does not change Page settings. Choose a model installed on the worker;
RAM admission, context limits and the CPU deadline still apply.

To prepare existing unsent automatic news drafts for v4 (backup first, preserving
published/website-confirmed stories, sensitive holds and commerce):

```bash
node scripts/upgrade-newsroom.mjs
node scripts/upgrade-newsroom.mjs --apply
```

## Separate website and social writing instructions

Under **Page settings → Design & prompts → Editorial**, use **Website report
voice** for newspaper style. Social caption voice and post-type caption rules
do not shorten or format the website report. Open a draft to inspect its private
**Newsroom evidence and checks**: accepted sections, assigned source facts and
the actual reason a section was held. These audit records are omitted from the
lightweight dashboard list.

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
