# Echotent content desk and Page typography

Echotent is EchoLink's configured local content desk, with shared instructions,
Page-specific style settings, research evidence and factual checks. It is **not
a newly trained foundation model**, a merge of model weights, or a guarantee of
journalistic accuracy. Original base-model licenses still apply.

| Engine | Installed alias | Role |
| --- | --- | --- |
| Gemma 2 2B Q4_0 | `echotent:gemma2-2b` | Research summaries, short news/Instagram captions, comment CTA |
| Phi-3 3.8B Q4_0 | `echotent:phi3-3.8b` | Choose a feature ID from verified catalogue options; no public prose |
| Qwen3 4B Instruct | `echotent:qwen3-4b` | Website articles, product captions, design briefs, storyboards |
| Qwen2.5 3B Q4_K_M | `echotent:qwen2.5-3b` | Installed for research evaluation; excluded from commercial routing |
| Qwen2.5 1.5B Q4_K_M | `echotent:qwen2.5-1.5b` | Retained for optional small-model experiments |
| Gemma 3 4B Q4_K_M | `echotent:gemma3-4b` | Retained, manually selectable alternative |

All aliases receive the same factual/editorial system rules. The request also
includes the selected Page's language, channel instructions, post-type prompt
and its own source evidence. Instructions do not train or modify the weights.

## Memory-aware selection

Under **Page connections**, edit the local content connection and open **Route
different tasks to different models**. Enable routing, choose standard/complex
defaults, and optionally override each named task. The owner connection has the
three production engines above configured. New connections start with Gemma 2
as a single model; enable routing after installing the chosen engines.

Specific task mappings take priority. Otherwise articles/storyboards/reference
analysis and prompts over 6,000 characters use the complex default. Other work
uses the standard default. The owner matrix caps short tasks at 2,048 context
tokens, the comment CTA at 1,024, and complex copy at 4,096; the host profile can
cap these further. Previous engines are unloaded before switching inside the
serialized inference lane. Switching has a cold-load cost; it is not a speed-up
for every individual request.

Automatic fallback is disabled on the owner connection. It is separate from task
routing: a smaller engine should not silently replace a more capable writer merely
because RAM is tight. A deferred task keeps its checkpoint and retries later.

The router keeps the primary if it passes admission. Otherwise, it considers the
installed secondary and uses it only if the same memory safeguard passes. Model
requests remain serialized; Windows retains its reserve and low-memory abort.
Actual model names and fallback selection are recorded in generation metrics.

Gemma's standard Ollama download is about **3.35 GB**, versus about **2.50 GB** for
the installed Qwen checkpoint. At 4,096 context tokens the conservative cold-load
estimates, including Windows headroom, are roughly **5.8 GiB** for Gemma and
**4.9 GiB** for Qwen. These are estimates, not measured peak working sets.
Gemma is therefore **not a guaranteed under-5-GB fallback**. A model already
resident can qualify with less free RAM because its weights are not counted
twice. If neither fits, preparation stays queued and retries; prepared delivery
does not need to load either text model. No paid cloud fallback is enabled.

To rebuild the aliases on another prepared inference host:

```powershell
ollama pull qwen2.5:1.5b
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama pull gemma2:2b
ollama pull phi3:3.8b
ollama pull gemma3:4b-it-q4_K_M
node scripts/setup-echotent.mjs
```

The script writes reproducible Modelfiles and creates aliases without deleting
existing models. Refer to [Ollama's Modelfile documentation](https://docs.ollama.com/modelfile)
and [Gemma's model details and license](https://ollama.com/library/gemma3:4b).

## Measured comparison on this Windows PC

These are bounded fixture checks, not general benchmarks. Generation was held
during comparisons; no test fixture was sent to Facebook. Times include loading
and depend on available RAM, context and response length.

| Model | Download | Measured decode | Observed result |
| --- | --- | --- | --- |
| Qwen2.5 3B | ~1.9 GB | ~4.8–5.2 tokens/s | Research JSON/design checks passed; Bengali summary failed |
| Gemma 2 2B | ~1.6 GB | ~7.6–8.0 tokens/s | Research and short Bengali summary passed; free-form design failed |
| Phi-3 3.8B | ~2.2 GB | ~4.5–6.4 tokens/s | Constrained feature-ID selection passed; free-form copy changed a specification |
| Qwen3 4B | ~2.5 GB | ~4.6–5.8 tokens/s | Short research, design and Bengali summary checks passed |

The full three-part generation tests did **not** establish end-to-end newsroom
quality: the smallest model produced weak/incorrectly formatted copy, and a
Gemma full-bundle attempt stopped before completion. The configured split routes
have passed adapter and safety tests, but real long-form drafts still need factual
assessment. Warnings can hold a draft even on an auto-publishing Page.

There is no official `qwen2.5:4b` or `gemma2:4b` tag in these model families.
Gemma **3** 4B is a different engine. See the official
[Qwen2.5 tags](https://ollama.com/library/qwen2.5/tags),
[Gemma 2 tags](https://ollama.com/library/gemma2/tags), and
[Phi-3 model](https://ollama.com/library/phi3:3.8b).

Qwen2.5 **3B** uses the [Qwen Research License](https://ollama.com/library/qwen2.5:3b/blobs/b5c0e5cf74cf).
It stays installed for evaluation and is blocked in commercial calls, including
fallback selection. The operator may enable a separately licensed deployment
only after obtaining that licence. Other variants have their own terms; installing
an alias does not change any base-model licence.

## News articles and social captions are separate

Previously the website connector used the social caption as its article body.
The configured news profile assembles three labelled parts separated by `---`:

1. Website article: `শিরোনাম: ` headline and 2–3 complete Bengali paragraphs.
2. Facebook caption: at most three short sentences, a genuine closing question,
   then exactly three relevant hashtags; no website URL.
3. First-comment CTA: a short Bengali invitation, with the confirmed website URL
   appended only during the separately delayed comment delivery.

On the Windows safe profile, bounded calls prepare these parts with private
checkpoints. A timeout retries unfinished work rather than throwing away every
completed section. Other profiles can request a complete structured response in
one call. A complete article bypasses the older separate `write_article` stage;
that stage remains for previously prepared/legacy captions.

The website part now uses two smaller paragraph calls on Windows, saving the lead
before starting the next paragraph. This avoids restarting an entire article when
a CPU response reaches its configured deadline. The public result still has the
same three-part structure. **Live workflow** shows **RETRY WAIT**, the saved task
checkpoint and the server's retry eligibility countdown; the default CPU budget is now 20 minutes per call, adjustable with
`PLATFORM_INFERENCE_TIMEOUT_SECONDS` (30–3600 seconds). A queued retry is not
reported as idle or as an actively running model.

Both owner routines prepare a **24-hour buffer**, preferably **22:00–07:00
Asia/Dhaka**, with a small daytime rescue when the queue is nearly empty. This is
a coverage target, not proof that every daily slot has been prepared. Source
availability, factual holds, product variety and CPU throughput can leave gaps.
The worker/publisher must stay online to deliver local scheduled jobs. Generation
hours do not limit booked publication hours.

The commerce profile maps its three parts to a design brief, Facebook copy and
Instagram copy. The latest owner request permits the **verified catalogue price
in captions**; artwork remains price-free. Claims of limited stock still need
support. Native Bengali product framing may contain useful English product terms,
without two parallel translations.

Qwen2.5 1.5B is about 986 MB of weights, much smaller than the 4B engines. A Modelfile
alias is a configured persona, not a newly trained expert. Real small-model tests
have returned malformed or weak Bengali copy; output/format checks can hold those
drafts. Installing this model does not establish journalistic quality or remove
the need to review facts. Choose a larger tested engine when your next host permits.

Open **Owner console → Inference** to test a private Ollama origin and select a
machine safety profile. Under a Page connection, **Find installed models** lists
that host's exact names. Pull larger models on that machine first. The remote
host's RAM is not measured by this PC; configure its own concurrency and memory
limits. Do not expose unauthenticated Ollama publicly. RX 5500 XT acceleration
must be verified on the target driver/runtime; CPU operation remains available.

The prompts use an inverted-pyramid structure, natural Bangla, neutral language,
documented context and clear uncertainty. The model works from collected reports;
it does not conduct interviews or independently witness events. These principles
follow the accuracy, sourcing and attribution guidance in
[Reuters' journalistic standards](https://reutersagency.com/about/standards-values/).
This is not a certification of compliance with every journalism code.

Routine source lists and external source URLs are omitted from public website
articles. Research links remain privately in EchoLink. Necessary prose attribution
for quotes, allegations and report-dependent claims remains, as do configured
image credits. Automatic news comments use the Page's own published website URL;
they no longer fall back to a third-party news source. Product comments still use
their associated product URL. Both keep the configured five-minute delay.

Existing EchoLink website articles had their public source-name/link fields
cleared, with a private metadata backup saved first. Their existing bodies and
Facebook posts were not rewritten. New generation produces the expanded body.

Open **Content → Edit → Website article** to read or edit the complete article.
The Facebook caption remains a separate field. Unsupported facts, language
problems and insufficient article depth can hold automatic scheduling for review.
The checks are limited safeguards, not proof that every statement is correct.

## Fonts for each Page

Open **Page settings → Edit Page settings → Design typography**:

1. Choose separate **Headline font** and **Supporting text font** settings.
2. To add a font, confirm you have permission to use it, then upload a **TTF or
   OTF under 2 MB**. Use a Unicode Bengali font, not a legacy Bijoy/ANSI font.
3. Check the editable preview and the **Bangla supported** label.
4. Save Page settings. New article/product creatives and Page branding use the
   selection. Existing images retain their artwork until explicitly refreshed.

The owner workspace includes Noto Sans Bengali as an available choice. The same
open font is bundled for reliable default Bangla rendering, with its SIL Open Font
License in `platform/assets/fonts/`. You can upload other appropriately licensed
fonts. Each workspace can store up to 20; other clients cannot read or select its
private font assets. Only validated font assets can be selected as fonts, and
font assets cannot be used as logos.

Uploaded fonts affect **text rendered inside images**, not the native Facebook or
Instagram caption font. Both platforms control that text's display. Local font
files are included with the existing asset backup procedure.
