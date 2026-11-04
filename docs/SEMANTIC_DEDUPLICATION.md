# Bangla story deduplication: operation and evidence

Exact per-Page URL and normalized-title constraints are always active. Semantic
similarity is optional and currently **disabled** on this installation. It is
not a factual checker or a guarantee that every duplicate will be detected.

## What the worker checks

When enabled, semantic checking runs for the selected article before generation
or delivery, including already generated and approved captions. It checks only
the same Page's `Posted`, `Publishing` and `Publish Unknown` history. Drafts and
other queued items do not suppress a story merely because they were ingested
first. Cross-source clustering of the whole unpublished queue remains future work.

History uses publication time, or the update time of an unresolved publication,
within the configured 1–30 day window. It does not expire a newly published story
because it originally entered the queue weeks ago. Missing historical embeddings
are computed lazily. Input-format, endpoint/model and source-lead changes invalidate
the corresponding cache. The profile does not detect a provider silently replacing
weights behind an unchanged model name; use a pinned version and recalibrate when
upgrading models.

The representation uses the first 180 characters of the title and 900 of the body,
with normalized whitespace. It represents the lead, not the entire article.
EmbeddingGemma receives its documented sentence-similarity task prefix. Vectors
must be finite, nonzero, consistently dimensioned and correctly indexed. The
configured endpoint uses OpenAI-compatible `/v1/embeddings`, with optional bearer
authorization and the existing local-host allowlist.

A match records `Skipped (Duplicate)`, the prior article ID and cosine score in
the article's outcome detail; it does not call Facebook or create a publish attempt.
Missing/invalid embeddings stop that article with a visible connection error and
normal retry backoff. More than 1,000 historical candidates requires a shorter
window; the worker will not silently check only a subset. Up to that limit,
first-use indexing can take time while the task heartbeat remains visible.

## Local model and settings

`embeddinggemma:latest` is installed and its real OpenAI-compatible response was
verified as 768-dimensional. Keep the current policy disabled while evaluating:

```dotenv
SEMANTIC_ENABLED=false
EMBEDDING_URL=http://localhost:11434/v1/embeddings
EMBEDDING_MODEL=embeddinggemma:latest
SEMANTIC_THRESHOLD=0.95
SEMANTIC_TTL_DAYS=7
```

Settings → Semantic deduplication controls the endpoint/model, threshold and
window. Saving a model does not need to enable the checkbox. The 0.95 value is a
calibration starting point, not an accepted production accuracy threshold.

Run these read-only diagnostics from the project root:

```powershell
npm run semantic:calibrate
npm run semantic:corpus
```

The first uses synthetic Bangla examples explicitly labeled as duplicates or
different updates. The second embeds the 12 strongest cross-publisher headline
pairs among the latest 500 articles from two days. It deliberately selects related
headlines, so it cannot estimate overall precision or recall. Neither command
changes database rows, settings, approval decisions or publication state. Reports
are kept in ignored `.codex/logs/semantic-quality.json` and `semantic-corpus.json`.
Successful command exit means the diagnostic ran, not that a model passed acceptance.

## November 4 local evidence

The 18 synthetic pairs contain seven paraphrase duplicates and eleven negatives,
including changed locations, opponents, decisions and casualty updates.

| Threshold | True duplicates detected | False matches | Duplicates missed |
| --- | ---: | ---: | ---: |
| 0.90 | 7 | 4 | 0 |
| 0.92 | 6 | 1 | 1 |
| 0.95 | 5 | 0 | 2 |
| 0.97 | 3 | 0 | 4 |

At 0.92, a different cricket opponent was wrongly matched. At 0.95, this small
synthetic set had no false matches but missed two duplicates. This is a development
calibration set, not a held-out benchmark; increasing the threshold is not proof
that all future updates will be preserved.

The read-only corpus probe scanned 474 real rows and embedded twelve related
cross-publisher pairs. Five exceeded 0.95; others sharing an event scored lower.
Some leads carried additional facts, so relatedness alone does not establish that
discarding either article is correct. No real row was marked duplicate by this probe.

Disposable Neon integration tests separately verified the prepared-caption path,
old ingestion/recent publication, historical backfill, cache reuse/source/model
changes, tenant isolation, expiry, unresolved publication reservations and failure
without a Facebook request. The embedding provider was mocked in those tests.

An additional opt-in integration run used the real installed local model with
the disposable Neon database: both historical/current leads produced stored
768-dimensional vectors, and the prepared duplicate became `Skipped (Duplicate)`
without a publish attempt or Facebook request. The leads were identical, so this
proves transport/cache/delivery wiring, not paraphrase accuracy. Production rows
were untouched and the temporary branch was removed. To repeat that test on a
machine with this model installed:

```powershell
$env:ECHOLINK_TEST_REAL_EMBEDDINGS = 'true'
try { node scripts/validate-migration.mjs }
finally { Remove-Item Env:ECHOLINK_TEST_REAL_EMBEDDINGS -ErrorAction SilentlyContinue }
```

Remaining acceptance: label a larger, distinct sample of actual publisher stories,
including follow-up reporting and negatives, then measure the chosen threshold on
held-out examples. Do not turn automatic skipping on merely because connectivity,
unit tests or this calibration run succeeded. News caption factual-quality testing
and an editor's source review remain separate requirements.

Sources: [Google's EmbeddingGemma model card](https://huggingface.co/google/embeddinggemma-300m)
documents task-specific prompts and limits;
[Ollama embeddings](https://docs.ollama.com/capabilities/embeddings) documents cosine
comparison and using the same model for indexing and querying.
