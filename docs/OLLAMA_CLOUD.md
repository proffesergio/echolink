# Current decision: strictly local inference

Owner Pages use the pinned Qwen3-4B-Instruct checkpoint through `echolink-qwen3:4b`. Ollama cloud is disabled; the cloud setup below is retained for a future explicit change. See [local inference and overnight batches](LOCAL_INFERENCE_AND_NIGHT_BATCHES.md).

# Ollama cloud versus local models

The command below uses Ollama's hosted inference. It does not download the
DeepSeek model weights or run that model on the PC's GPU:

```powershell
ollama signin
ollama run deepseek-v4.1-flash:cloud
```

Finish sign-in in the browser. Run a short manual prompt only after checking
the account's credits and pricing. EchoLink has not switched either Page or
submitted a cloud inference request during the setup investigation.

As checked on 8 November 2026, Ollama lists V4.1 Flash cloud at $0.30 per million
input tokens and $1.20 per million output tokens; the published off-peak rates
are $0.15 and $0.60. A $0 subscription is not unlimited free cloud inference.
Account credits, offers and availability must be confirmed in the account.
No credits or subscription are purchased automatically by EchoLink.

The installed Ollama client is 0.40.14. Its model metadata reports the cloud
model at about 763 billion total parameters. Downloading the full model is not
a practical replacement on this 12 GB PC. The smaller active-parameter count
in a mixture-of-experts architecture does not make all its weights disappear.

## EchoLink connection

With an authorized Ollama desktop/CLI account, the existing adapter can use:

| Setting | Value |
| --- | --- |
| Provider | Ollama |
| Operator endpoint | `http://127.0.0.1:11434` |
| Model | `deepseek-v4.1-flash:cloud` |
| Initial temperature | `0.4` |

The adapter sends `/v1/chat/completions`, bounds caption output and requests
thinking off for cloud-tagged Ollama caption models. The local idle manager
skips cloud aliases so it does not send unnecessary unload/generate requests.
These routing preparations do not activate cloud use.

An alternative is Ollama's direct OpenAI-compatible cloud endpoint,
`https://ollama.com/v1`, with an Ollama API key and the direct model name
`deepseek-v4.1-flash`. The current generic Ollama connection targets the local
operator endpoint; a direct-cloud adapter must be configured explicitly. Do
not put an Ollama key in the unrelated DeepSeek API provider field.

Cloud inference sends supplied news/product facts and prompts to the cloud
provider. It does not move the scheduler, website publishing, media generation
or local background removal off this PC. Local creative work still uses CPU
and RAM. The worker remains required until its separate hosting migration.

Noble Seek and Fabrything currently share one imported local model connection.
Use separate Page connections for a controlled cutover instead of editing that
shared record and unexpectedly switching both Pages. Test bilingual captions,
factual consistency, hashtags and actual latency before changing a live Page.
Do not silently fall back to a resource-heavy local model when cloud quota is
exhausted; preserve the job and show an actionable provider error.

## Local model cleanup

No local models were deleted. Installed entries include `gemma3:1b`,
`gemma3:4b`, `echolink-qwen3:4b` and `embeddinggemma:latest`. The two 4B entries
can share weight blobs; adding their displayed sizes overstates disk recovery.
Deleting an unused model saves disk, while unloading a model frees inference
memory. Keep the active fallback until cloud tests pass. The embedding model
is a separate capability and is not replaced by a caption-model switch.

Official references:
[model and CLI command](https://ollama.com/library/deepseek-v4.1-flash),
[pricing](https://ollama.com/pricing),
[cloud setup and data handling](https://docs.ollama.com/cloud),
[OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility).
