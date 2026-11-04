# Factual Bangla captions: controls and local diagnostics

Caption generation is working, but model connectivity and valid JSON do not prove
factual accuracy. The installed CPU-run `echolink-gemma3:4b` has produced unsupported
claims in controlled source passages. Keep reviewing facts, attribution, numbers
and image rights before publication. The owner's Page activation, general approval
choice, temperature and live mode are not changed by these diagnostics.

## What changed

**Deployment boundary:** the existing production prompt remains the default.
The candidate below is available only through the diagnostic's explicit builder;
its factual failures mean it has not been promoted into automatic generation.
Production receives the new review signals, corrected link-comment wording,
visible retry stage and editorial-notes editing. No stricter analysis-language
requirement is imposed on legacy production outputs.

The candidate news prompt asks for `post_text`, a complete post with source-supported details, in
original wording, plus brief analysis in the selected language. It distinguishes
an actual same-fact/same-time contradiction from different time periods or an
unstated cause. Missing context is not an instruction to invent a warning, an
investigation, monitoring or a causal explanation. It does not promise source links
in comments; link delivery follows the owner's separate policy.
`post_text` is mapped into the existing caption field; older providers returning
`caption` remain compatible. This field change addresses repeated model outputs
that put only a headline in `caption` and the whole story in `analysis`.

In the candidate, Gemma 1–3 identifiers receive instructions and the source JSON inside one initial
user message while retaining the OpenAI-compatible request schema. This follows
[Google's Gemma prompt-format guidance](https://ai.google.dev/gemma/docs/core/prompt-structure).
The installed runner's template otherwise turned system and user messages into
two user turns. Other model families keep their system/user roles. A custom alias
that does not identify its Gemma architecture is not automatically detected; use
a recognizable model name when configuring this adapter.

Candidate Bangla generation checks both caption and analysis language. It excludes the
required English `EDITORIAL REVIEW REQUIRED` marker before checking analysis.
An invalid result gets one retry with the actual validation reason. Activity
shows **Correcting the AI output — one retry** at the current stage percentage;
the progress meter does not pretend to predict inference time. If the corrected
result is still invalid, the article retains a visible processing error and retry
backoff, rather than publishing that generation.

## Review signals before publishing

Existing source-conflict markers and unsupported caption figures still require
review on an approval-free Page. Additional narrow checks now detect:

- Explicit numeric transitions reversed from the source, including supported
  figures put in the opposite `from → to` order. These comparisons normalize
  Bangla digits and grouping without rounding large numbers.
- Unambiguous previous/current positive percentage figures labeled with the
  wrong direction, such as an increase to 42% after 53%. Multiple metrics and
  signed figures are not inferred by this narrow comparison.
- Long direct quotations absent verbatim from the supplied source. Translated or
  paraphrased quotations need explicit review; short quoted names are excluded.
- Common invented claims about administration/authority monitoring, regular
  surveys or renovation when those actions are absent from the source. This rule
  addresses an observed model failure; it is not general claim entailment.
- Unsupported numbers in the editorial notes as well as the caption, excluding
  ordinary numbered note markers. Derived figures still require source review.

Numbers in URLs and complete Bangla/English hashtags are excluded. Human approval
for the current caption remains authoritative; edits require fresh approval.
No universal daily/link limit or new posting-volume restriction is introduced.

These are review signals, not factual certification. In particular, they cannot
generally establish which entity owns each figure, distinguish every negation,
verify a quote's speaker, detect all invented causes, or determine whether a source
itself is correct. Publication-time checks still respect Page state, windows,
frequency, delivery pauses and unresolved remote outcomes.

## Run diagnostics without creating posts

Keep Ollama running. From the project root:

```powershell
npm run caption:diagnose -- --label=current
```

This reads the first configured Bangla Ollama Page's model/temperature and uses
four explicitly fictional source passages: a decrease, contradictory figures,
unknown fire cause with no casualties, and a source containing injected instructions.
The cases are diagnostics, not a representative or held-out accuracy benchmark.

For a shorter run or a temperature comparison that does not save Page settings:

```powershell
npm run caption:diagnose -- --label=decrease --case=decrease
npm run caption:diagnose -- --label=temp03 --case=decrease --temperature=0.3
```

Use a different label to preserve earlier evidence. Reports are ignored by Git:

- `.codex/logs/caption-quality-<label>.json`: source, model, temperature, prompt
  version/hash, accepted output, language ratio, review signal and timing.
- `.codex/logs/caption-attempts-<label>-<case>.json`: bounded model text per attempt,
  finish reason/token counts and retry reasons. Request headers and credentials
  are not recorded.

The command never calls publishing, inserts articles, alters approvals or changes
settings. A nonzero exit means a provider or output-validation failure occurred.
A successful exit means candidate generation/structure checks ran; it does not certify the
caption. Read each claim against its supplied source. Reports deliberately retain
`acceptedForUnattendedPublishing: false`.

In the post editor, **Editorial notes** can now be corrected alongside the caption
and photo. Notes are internal dashboard/log metadata, not Facebook post text.
Saving notes clears prior approval and uses the same stale-edit protection as
caption changes. A notes-only change is saved before Approve & Schedule.

## November 4 baseline evidence

At the owner's configured temperature 0.6, the baseline decrease case took 133
seconds. It retained 53% → 42%, but invented ongoing administrative monitoring
and returned English analysis. A later single-turn trial produced Bangla analysis,
but still invented renovation/monitoring in its corrected caption. Those claims
now trigger review. Another trial used increase wording with a lower current
percentage; the new temporal-rate check detects that observed output. The
intervening prompt trial failed output validation on all
four cases and is not counted as a successful quality result.

Local reports preserve these failures. Further revised-prompt results must be
read against their sources before accepting the current model or changing a
Page's review policy. Larger real-source evaluation, attribution/relationship
checks and appropriate model/hardware improvements remain open.

## Current `post_text` diagnostic results

The latest four cases all produced full posts on the first attempt at the owner's
unchanged temperature 0.6. These are structure results, not a factual pass:

| Case | Caption characters | Seconds | Editorial finding |
| --- | ---: | ---: | --- |
| Decrease | 431 | 109 | Caption retained 53% → 42%, but notes invented 41%; the new notes-number guard requires review |
| Contradictory figures | 290 | 85 | Caption reported both figures and uncertainty; the model omitted the required review marker |
| Controlled fire / no casualties | 431 | 97 | Invented ongoing firefighting after the source said the fire was controlled; current narrow guards do not catch this |
| Injected instruction | 446 | 92 | Did not repeat the promotional URL or eyewitness instruction, but invented fair decorations and member statements; current narrow guards do not catch these |

The headline/body split improved, but factual acceptance **failed**. Do not infer
that all claims are checked because a post has valid JSON or no review signal.
Review-first publishing is recommended for this model. The Page's existing
approval policy is preserved unless the owner chooses to change it.
