# Local inference and overnight publishing preparation

EchoLink separates preparation from delivery. Caption generation, cutouts and
creative rendering use the generation queue. The publisher remains awake for
Facebook, Instagram, optional website publishing and delayed comments. Preparing
a month of content does **not** let you turn off the PC that serves the publisher
or its media files. Move that service and media to an always-on host first.

## Current Windows PC

The operator profile `windows_safe` uses Qwen3:4b through the `echolink-qwen3:4b` alias locally, thinking disabled,
4,096 context tokens, up to 900 output tokens, two CPU threads and a 64-token
processing batch. GPU offload is disabled to leave the GT 730 available to Windows.
Only one local text request is admitted at a time. Ollama also admits one model
and one request, with a four-request queue and 30-second idle lifetime.

Before a cold load the worker estimates weights, buffers and context memory and
keeps at least 1.5 GiB for other work. Loaded models are not counted twice. An
active request is cancelled below 700 MiB of free RAM; the task remains queued
and retries in five minutes. This reduces risk, but cannot guarantee that Windows,
drivers or other applications never crash. Close unused memory-heavy applications.

If Activity reports **Memory reserve protected**, the job remains queued rather
than failed. The current 4B checkpoint needs roughly **5 GiB free before a cold
load**, including the Windows reserve. This is free RAM, not installed RAM.
Creative studio shows the measured available/required memory and the five-minute
retry countdown. Close unused browser tabs or applications and leave the worker
running; repeated clicks on Generate are unnecessary. The check runs again at
the retry time. Once the model is resident, its weights are not counted twice,
including when Ollama reports another alias of the same checkpoint. The news
routine checks capacity before fetching feeds, then checks again before inference.
Prepared publishing uses a separate queue and does not load the language model.
Unsupported quantities, dates and other critical source checks trigger one automatic correction attempt. A remaining failure is saved for correction instead of entering automatic publication, even on an auto-approved Page. This is a limited source check, not a proof of truth.

The text model unloads before product image processing. Cutouts remain CPU-only,
bounded to a small matting workspace and a finite process timeout.

The safe profile uses a concise, source-bounded caption prompt. Its default
efficient channel mode makes one factual caption and adapts its paragraph layout
for Instagram without dropping qualifications. Choose **Independent AI captions**
under Page caption settings when separate channel instructions are needed; that
uses another model request. Larger host profiles retain independent generation. For bilingual products on this PC, Qwen writes a concise English product line; verified catalog specifications and fluent Bangla framing form the rest of the caption. This avoids literal translations of marketing metaphors and reduces inference time.

Ollama cloud access is disabled. Other provider adapters remain available for
future clients, but the owner Pages use a downloaded local model. Context and
output controls in a connection are capped by the operator's host profile.

## Configure each Page

Open **Page → Automation → Configure workflow**:

1. Choose **Batch buffer**. Set the desired preparation horizon in hours or use
   the 1/3/7/30/90-day shortcuts for products and evergreen Pages.
2. Enable overnight preparation. The initial owner setup uses **22:00–07:00,
   Asia/Dhaka**. This window applies to generation, not publication.
3. Keep daytime queue rescue enabled for continuity. It prepares only slots
   inside the refill lead time, rather than filling a week during the day.
   Turn it off to enforce overnight-only generation and accept possible gaps.
4. Keep a small batch size. One item per source check is appropriate here.
   Work continues sequentially until the fixed refill endpoint is filled.
5. Daily goals and publishing gaps remain independent Page settings. Approved
   scheduled posts no longer count as unfinished drafts.

At night, the generator looks ahead to the next overnight window so it can refill
before an expected daytime shortage. It rests when coverage is sufficient.
Missing sources, plan limits, pending drafts or low memory pause preparation
instead of creating an unbounded backlog. Manual generation remains available
outside the overnight window, with the same resource safeguards.

News is capped at a 24-hour preparation horizon; current reporting cannot be
generated weeks in advance accurately. Products, quotes and evergreen content
can use up to 90 days, **within the active subscription period**. Long horizons
are targets, not a throughput guarantee. Stock, source count, unique products,
available generation time and subscription allowances may shorten coverage.

Before product delivery, the worker refreshes catalog information older than one
hour, verifies availability, and checks whether the saved product facts/photo
changed since caption generation. An unavailable store is retried before Meta
submission. Changed or out-of-stock products need an updated draft. No model is
loaded merely to send a prepared post.

## Ubuntu desktop: Ryzen 3600X, 16 GB RAM, RX 5500 XT 8 GB

The RX 5500 XT is not in Ollama's listed ROCm-supported cards. Use the supported
Vulkan installation path and **verify offload**, retaining CPU fallback. Do not
assume the 8 GB is being used based on the model loading successfully.

Sources: [Ollama hardware support](https://docs.ollama.com/gpu),
[runner and concurrency settings](https://docs.ollama.com/faq),
[native chat controls](https://docs.ollama.com/api/chat).

On Ubuntu, install/update Ollama from its official installer, then:

```bash
sudo apt update
sudo apt install mesa-vulkan-drivers vulkan-tools libvulkan1 openssh-server
vulkaninfo --summary
sudo usermod -aG render,video ollama
sudo systemctl edit ollama
```

Paste this service override (keep the model API on loopback):

```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_NO_CLOUD=1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_MAX_QUEUE=4"
Environment="OLLAMA_CONTEXT_LENGTH=8192"
Environment="OLLAMA_KEEP_ALIVE=30s"
Environment="OLLAMA_VULKAN=1"
Nice=10
CPUQuota=400%
MemoryHigh=8G
MemoryMax=10G
OOMPolicy=stop
Restart=on-failure
RestartSec=10
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama create echolink-qwen3:4b -f models/echolink-qwen3-4b.Modelfile
ollama run echolink-qwen3:4b "Write two short sentences about reusable shopping bags. /no_think"
ollama ps
journalctl -u ollama --since "10 minutes ago"
```

Confirm `vulkaninfo` sees the Radeon and `ollama ps` shows actual GPU placement.
Only after that test, download `qwen3:8b` and benchmark it. An 8 GB card does not
guarantee every 8B configuration fits: context and GPU desktop use also consume
VRAM. Phi4:14b is not the initial recommendation for this 16 GB host. The service
memory limit intentionally protects Ubuntu even if that rejects a large model.

### Move inference only; leave the current worker on Windows

From Windows, create an SSH tunnel using your Ubuntu username and LAN/VPN address:

```powershell
ssh -N -L 127.0.0.1:11435:127.0.0.1:11434 YOUR_UBUNTU_USER@YOUR_DESKTOP_ADDRESS
```

Set these operator variables in `platform/.env.local`:

```dotenv
PLATFORM_OLLAMA_URL=http://127.0.0.1:11435
PLATFORM_INFERENCE_PROFILE=ubuntu_amd8gb
PLATFORM_INFERENCE_REMOTE=true
PLATFORM_INFERENCE_MAX_CONTEXT=8192
PLATFORM_INFERENCE_RESERVE_MB=1536
PLATFORM_OLLAMA_LOCAL_ONLY=true
```

Restart the platform gracefully, then test the Page's model connection. Select
Qwen3:8b only after its benchmark passes; the same Page tokens, website, calendar
and captions remain independent of the inference host. If the desktop/tunnel is
offline, generation waits/retries; already-prepared publishing still works on
Windows. This route does not automatically start the SSH tunnel at boot: configure
a persistent private SSH/VPN connection once the desktop is available.

`PLATFORM_INFERENCE_REMOTE=true` keeps the API PC's free-RAM guard without
incorrectly counting remote model weights as Windows memory. Ubuntu's systemd
limits protect the actual inference machine. Never publish port 11434 directly.

### Move the whole worker later

Copy the project, private environment files and generated media to Ubuntu using
a private transfer. Preserve `PLATFORM_ENCRYPTION_KEY`, database configuration and
auth settings. Install Node/dependencies and the CPU cutout environment there.
Existing asset rows contain host file paths: migrate them to valid Linux paths or shared storage before moving the publisher. Merely copying files leaves Windows paths invalid on Ubuntu.

Use `PLATFORM_INFERENCE_PROFILE=ubuntu_amd8gb`,
`PLATFORM_INFERENCE_REMOTE=false` and the local 11434 endpoint. Stop the Windows
publisher during cutover, then configure the protected worker tunnel and startup
supervision on Ubuntu. Database task leases and destination receipts must be
preserved; never re-submit deliveries whose outcome is unknown.

## Verification

`npm --prefix platform run test:unit` checks admission, serialization, cancellation,
overnight windows, rescue logic, bounded horizons and long calendar searches.
`node scripts/verify-inference-migration.mjs` runs the migration and queue tests
on an expiring disposable Neon branch, then removes it. It sends no posts.

`node platform/scripts/benchmark-local-model.mjs echolink-qwen3:4b` reads representative
owner source material and generates private caption samples for both channels.
Run it only while production generation is drained. It writes timings, token
rates, memory snapshots and factual-check results under
`platform/.local/verification/qwen3/`, never to a social destination. Automated
checks do not prove complete factual correctness; review the samples too.

The upstream `qwen3:4b` tag inspected here points to the thinking-only 2507 checkpoint. It cannot be converted into a non-thinking model by changing a template. EchoLink pins `qwen3:4b-instruct-2507-q4_K_M` and creates the configured `echolink-qwen3:4b` alias from those weights. The runtime rejects checkpoints that advertise thinking-only operation. Verify the exact checkpoint and capabilities when selecting a future 8B model.
