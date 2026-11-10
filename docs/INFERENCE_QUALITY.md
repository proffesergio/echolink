# Newsroom model and quality tuning

For this CPU-only PC, the current measured baseline is **Gemma3 4B for Bengali
writing, Qwen3 4B Instruct 2507 for separate evidence review**. This is a practical
candidate, not a universal Bengali journalism ranking. Re-test both writers on
the same dossiers before choosing a winner; keep held examples in the comparison.

The older low-temperature writer required one output sentence for each source
sentence. That contract promoted close paraphrasing. Natural paragraph composition
allows a coherent narrative, combining and reordering supported facts, while the
reviewer checks the whole section for missing or changed facts. It does not allow
invented analysis to make a report appear original. Because the current 4B
models failed the freer contract on the test dossier, production retains the
stronger evidence anchors with increased writing variation. Copied reports still
stay held; the originality threshold has not been relaxed.

Page → Design & prompts → Editorial:

- Production on this PC: **Conservative · individual evidence sentences**.
  Natural paragraph composition is an experimental option; the difficult
  dossier still failed it at higher temperature, so it is not the production default.
- Writing temperature: start **0.7**; website voice controls tone separately.
- Experimental paragraph-mode correction edits the actual failed draft at **0.3**, then the reviewer
  remains temperature **0**. Raising it is not an accuracy improvement.
- Use factual feedback and permitted reference samples; exclude caption-length
  instructions from the full report voice.

Qwen's [official model card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)
recommends temperature 0.7, top-p 0.8 and top-k 20. Those are writing sampling
guidelines, not evidence of Bengali quality or a factuality guarantee.
[Gemma3's technical report](https://arxiv.org/abs/2503.19786) describes multilingual
and instruction-following improvements; this also does not replace local testing.

The **windows_quality** operator profile uses all four logical CPU threads on
this PC, up to 8192 context tokens and 3072 output tokens. The configured newsroom
writer uses 4096 context / 2400 output; evidence review uses 4096 / 650. The
30-minute deadline applies per call; a complete report involves multiple calls.
Only one local call/model runs at once. Full CPU use improves throughput; it does
not make a fixed model more intelligent. Context matters when evidence would
otherwise be omitted; an unnecessarily huge context can also slow inference.

The memory admission check does **not** allocate or hide RAM from Ollama. It waits
when estimated loading would leave too little RAM for Windows, PostgreSQL and the
publishing service. Quality mode reduces admission headroom to 768 MiB and aborts
at 512 MiB available RAM. Disabling that last guard risks paging, termination and
lost work without improving prose. No CPU threads are held back from the model.

On a stronger PC, first benchmark a commercially permitted 8B-class writer, then
12B/14B if memory permits; select by measured Bengali quality, supported facts,
originality, latency and peak memory, not parameter count alone. Use Owner →
Inference host to change the origin/profile, then Page text connection task routes.
Choose exact installed Ollama tags. The Ubuntu desktop's GPU must be verified
with its actual driver/backend before promising acceleration. Do not download
large weights or remove working models just to migrate the app.

Newer candidates to benchmark next, not installed or certified by this change:
[Qwen3.5 4B/9B](https://registry.ollama.com/library/qwen3.5) and
[Gemma4](https://ai.google.dev/gemma/docs/core). Ollama currently lists Qwen3.5
4B around 3.3–4.0 GB and 9B around 6.6–7.6 GB depending on format. Download
size is not total inference RAM. Gemma4 E4B or MoE active-parameter labels must
not be mistaken for the full resident weight size. Verify the checkpoint, licence,
runner compatibility, non-thinking mode, peak RAM and Bengali newsroom quality
before changing production routes. The new host is the planned evaluation point.

Reproducible comparisons (replace POST_UUID with a real private dossier ID):

```bash
node scripts/verify-newsroom.mjs --post=POST_UUID --run=gemma-natural --writer=gemma3:4b-it-q4_K_M --reviewer=echotent:qwen3-4b --context=4096 --mode=composed --temperature=0.7 --full
node scripts/verify-newsroom.mjs --post=POST_UUID --run=qwen-natural --writer=echotent:qwen3-4b --reviewer=gemma3:4b-it-q4_K_M --context=4096 --mode=composed --temperature=0.7 --full
```

Run these sequentially. Separate run labels retain private checkpoints/results;
mode and temperature flags are read-only test overrides. Omit `--full` for one
accepted writing/review pair. Neither command publishes. Record failed attempts
and independently read the prose; checked JSON alone is not a quality benchmark.

When moving only Ollama to a remote desktop, set the operator's
`PLATFORM_INFERENCE_THREADS` to that desktop's tested CPU budget and review
`PLATFORM_INFERENCE_MAX_CONTEXT`, `PLATFORM_INFERENCE_RESERVE_MB` and
`PLATFORM_INFERENCE_TIMEOUT_SECONDS`. Current-PC overrides otherwise remain
active. Remote thread budgets are no longer capped by the smaller worker PC's
CPU count; local budgets remain capped at available local threads. Never treat
remote free RAM as measured by the Windows worker.
