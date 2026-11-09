# Move EchoLink to another PC

GitHub contains the application. It does **not** contain production credentials,
the PostgreSQL database, generated media, uploaded fonts, or model weights.
The current dashboard is https://echolinkbd.vercel.app; n8n is optional.

## Choose the move

| Approach | What moves | What stays online |
| --- | --- | --- |
| Inference first | Ollama, optionally image tools | Existing Windows worker, database, bridge and publisher |
| Full worker move | Database, application, private configuration, assets and inference | Vercel frontend and external website databases |

Start with inference first. It avoids a database cutover and allows a direct
throughput comparison before moving publication. For either approach, use a
private LAN/VPN; do not expose unauthenticated Ollama or PostgreSQL publicly.

## 1. Prepare the new machine

Install Git, **Node.js 24 LTS**, **Ollama**, **FFmpeg/ffprobe**, **Python 3.11**
and PostgreSQL **18**. Use PostgreSQL 18 tools to restore the current version-18
backup. Install Cloudflare Tunnel only for a full worker move. Install Playwright
Chromium for browser acceptance tests. Install packages from their official sites.

On Ubuntu, use the [official PostgreSQL repository instructions](https://www.postgresql.org/download/linux/ubuntu/):

```bash
sudo apt update
sudo apt install -y git curl ca-certificates ffmpeg python3-venv postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt update
sudo apt install -y postgresql-18 postgresql-client-18
```

Install Node 24 using your preferred supported Node installer, and Ollama using
its [Linux installation guide](https://docs.ollama.com/linux). Run the application
as your normal user, **not root**. The app's separate loopback PostgreSQL cluster
uses port 55432; the distro's port-5432 cluster is independent.

On Windows, install Node 24, Git, Ollama, FFmpeg and PostgreSQL 18. Set `PG_BIN_DIR`
to the PostgreSQL `bin` directory, such as `C:\Program Files\PostgreSQL\18\bin`.
The current bundled binaries also work at `.codex/tools/postgres18/pgsql/bin`;
that directory is deliberately not in Git. Install `uv` for the provided Windows
background-removal setup. Keep this machine's GPU driver up to date.

```bash
git clone https://github.com/proffesergio/echolink.git
cd echolink
npm ci
npm ci --prefix platform
npm run build --prefix platform
npm run build
```

Do not run the legacy root `npm start`. Use `npm run platform:serve` for the
cross-platform supervisor after private configuration and storage are ready.

## 2. Inference-only move

On the new PC, pull the current production trio first:

```bash
ollama pull gemma2:2b
ollama pull phi3:3.8b
ollama pull qwen3:4b-instruct-2507-q4_K_M
npm run ai:setup
```

Alias setup skips uninstalled optional engines. For a later larger-engine test,
pull an appropriate permitted checkpoint, for example `qwen3:8b`, and test it
before assigning tasks. Qwen2.5 3B has research-only terms and is not a production
replacement without a separate licence.

Give Ollama access only on the private interface/VPN with a firewall allowing
the worker PC. With the Linux Ollama systemd service, use `sudo systemctl edit
ollama` to set, for example:

```ini
[Service]
Environment="OLLAMA_HOST=PRIVATE_VPN_IP:11434"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_MAX_QUEUE=4"
Environment="OLLAMA_CONTEXT_LENGTH=4096"
Environment="OLLAMA_KEEP_ALIVE=30s"
Environment="OLLAMA_NO_CLOUD=1"
```

Replace `PRIVATE_VPN_IP`; then `sudo systemctl daemon-reload` and `sudo systemctl
restart ollama`. On Windows, set the same variables for the Ollama process and
restart Ollama. Do not bind a public interface without network access controls.

From EchoLink, open **Owner console → Inference**, enter
`http://PRIVATE_VPN_IP:11434`, select the appropriate machine profile, then
**Test & list installed models → Save inference host**. Changes wait for active
generation to drain. Each Page's text connection can select installed task models
under **Route different tasks to different models**.

The Ryzen 3600X / 16 GB / RX 5500 XT desktop is an improvement, but 8 GB VRAM does
not guarantee compatibility or suitability for large video diffusion models.
[Ollama's hardware guide](https://docs.ollama.com/gpu) describes Vulkan support and
GPU selection. Verify `ollama ps`, the API's `size_vram`, and system GPU usage
during a real request. CPU mode remains a fallback. Do not assume ROCm supports
the RX 5500 XT. A copied `OLLAMA_VULKAN=0` explicitly disables Vulkan; change it
only on the new host when testing its supported driver/backend.

Remote free RAM is not measured by the old PC. Apply Ollama's one-model/one-request
limits on the inference host itself. Keep 4,096 context tokens initially; raise
context/output only after measured tests. Larger Windows loopback mode requires
at least 24 GiB system RAM; the current 12 GB PC remains protected.

## 3. Full migration: take a final private snapshot

Do this **when ready for cutover**, not during an inference-only test:

1. On the old PC, set `PLATFORM_WORKER_ENABLED=false` and
   `PLATFORM_PUBLISHING_ENABLED=false` in `platform/.env.local`.
2. Run `npm run platform:restart`. It drains active work before pausing dispatch.
   Confirm no publication is still in progress.
3. Run `npm run db:backup` and `npm run db:recovery:backup`.
4. Transfer the complete `.dump` and its `.json`, the encrypted materials `.enc`,
   and its separate `.key` through private storage. Keep the key separately.
5. Stop the old supervisor before starting the new public bridge. Two separate
   restored databases must not both publish: neither knows the other's receipts.

The recovery materials contain root `.env.local`, `platform/.env.local`, original
encryption/auth secrets, media/fonts under `platform/.local/assets`, and the CA
certificate. They are **not** a SQL export; transfer the `.dump` too. Retain the
original encryption key or stored Page credentials cannot be decrypted. Do not
upload any of these files to GitHub or Vercel's public/static directories.

On the new PC, put private backups inside `.codex/backups` and the key inside
`.codex/secrets`, then authenticate/extract the archive:

```bash
node scripts/backup-recovery-materials.mjs unpack .codex/backups/PRIVATE.enc .codex/secrets/PRIVATE.key
```

It creates a new `.codex/recovery-unpack-*` folder and does not overwrite the app.
Copy the extracted root/platform environments and media into their corresponding
new project locations. Keep both worker/publishing flags **false**. Preserve the
original authentication, encryption and bridge keys. Replace Windows-only paths
for FFmpeg, Python, PostgreSQL and certificates. Re-download models; do not copy
Windows virtual environments or `node_modules` to Linux.

## 4. Restore PostgreSQL and media

In the new `platform/.env.local`, set `PG_BIN_DIR=/usr/lib/postgresql/18/bin`
on Ubuntu (or your Windows bin directory). Leave the old `.env.postgres.local`
behind: setup creates fresh local passwords and a new cluster.

```bash
npm run db:local:setup
node scripts/restore-platform-local.mjs .codex/backups/YOUR-PRODUCTION.dump
```

Setup creates empty local/test databases without changing the active app database.
Restore creates **a new** `echolink_recovery_*` database and checks tenant
isolation. It writes private `.codex/echolink_recovery_*.env`; copy its
`DATABASE_URL`, `DATABASE_URL_UNPOOLED` and TCP setting into `platform/.env.local`.
Keep queue dispatch/publishing false. Mirror the selected primary configuration
into root `.env.local` where operational scripts require it. Do not replace the
separate NobleSeek website or product-catalogue connection credentials.

```bash
npm run media:relocate
npm run media:relocate -- --apply
npm run migrate --prefix platform
npm run host:check
```

Media relocation checks every local asset exists before applying new absolute
paths. Its dry run reports missing files. It requires paused dispatch/publishing
for application. Keep the copied assets' workspace folders intact. Font IDs and
post-image references survive because asset IDs are unchanged.

`host:check` prints tool availability, installed models, RAM, inference deadline,
database reachability and the runtime role's RLS status without printing secrets.
The runtime role must report `rolsuper=false` and `rolbypassrls=false`.

## 5. Start, test, and switch live routing

```bash
npm run platform:serve
```

Run this in a terminal for initial validation. The supervisor starts the worker
on 8790, protected bridge on 8788 and prepared loopback PostgreSQL on 55432. On
Ubuntu install `cloudflared` on PATH; on Windows use the existing tool location
or set `PLATFORM_CLOUDFLARED_PATH`. For durable hosting prefer a named tunnel;
the current quick-tunnel registry remains supported when its private credentials
are copied. The new supervisor updates the existing registry used by Vercel.

Sign in using the existing Google owner identity. Keep the production Google
redirect URI already registered. For local login on the new host add its actual
origin and `/api/auth/callback/google` in Google Cloud if needed.

Check existing Pages, connections, uploaded logo/fonts, catalogue, review queue
and calendar. Generate a draft and inspect factual accuracy, BDT prices and media.
Render a test Reel with **your own narration/media** before configuring paid APIs.
Do not submit a real post merely to test the installation.

When satisfied, reconcile any task marked `unknown` against Meta/website receipts;
never blindly retry an uncertain publication. Set worker/publishing flags true
only on the new active worker and restart its supervisor. Verify a deliberately
chosen scheduled post using the returned website/Facebook/Instagram receipts.

The new host must stay powered on and online for local delivery. For unattended
Linux startup use a normal-user systemd service running
`/ABSOLUTE/PATH/TO/node /ABSOLUTE/PATH/TO/echolink/scripts/platform-supervisor.mjs`,
with `WorkingDirectory` set to that checkout, `Restart=on-failure`, and PATH
including node, Ollama, FFmpeg and cloudflared. Use `systemctl --user enable
--now echolink` after creating the unit; enable user lingering with your system
administrator if it must run before login. Use Windows Task Scheduler for the
Windows supervisor. Never run two supervisors on the same host/ports.

## 6. Free-first content tools and integration status

| Task | Tool | EchoLink status / requirement |
| --- | --- | --- |
| Text, analysis, JSON storyboards | Ollama | Integrated; installed models and private network |
| Branded news/product designs | Sharp + uploaded fonts/logo | Integrated, no generation API key |
| Real product cutout | rembg + ONNX Runtime CPU | Integrated; install the Python environment/models |
| AI background generation | ComfyUI / AUTOMATIC1111 | Integrated adapters; install supported GPU/runtime and export an API workflow |
| Stock imagery | Pexels / Pixabay | Integrated; own API keys, limits and content/attribution terms |
| Images through cloud inference | Hugging Face / Pollinations | Integrated adapters; credentials/credits may be required |
| Narration | Own licensed recording/audio URL | Supported, no TTS API charge |
| Local neural TTS | Piper | Future adapter; voice availability, Bengali quality and model licences need validation |
| Vertical slideshow Reel | FFmpeg + Sharp | Integrated 30–60s 9:16 renderer; stock/own photos + narration |
| Advanced animated typography | Remotion | Future renderer; optional developer skills, licence eligibility applies |
| Speech transcription/caption timing | Whisper / faster-whisper | Future adapter; current Reels use storyboard overlays |
| Generative motion/video | ComfyUI video workflows | Future dedicated adapter; model/GPU-dependent, not current slideshow rendering |
| YouTube channel publishing | YouTube Data API | Planned; separate Google consent, quota and upload/review work |

On Ubuntu install the cutout environment without reusing Windows files:

```bash
python3 -m venv platform/.local/rembg-venv
platform/.local/rembg-venv/bin/pip install 'rembg[cpu]==2.0.72'
U2NET_HOME="$PWD/platform/.local/models/rembg" platform/.local/rembg-venv/bin/python -c "from rembg import new_session; new_session('u2netp', providers=['CPUExecutionProvider'])"
```

On Windows, `npm run creative:setup` uses uv/Python 3.11. Accurate edges still need
inspection; a generic cutout is not guaranteed to handle every product perfectly.

Use [ComfyUI's manual install guide](https://docs.comfy.org/installation/manual_install)
for the target GPU. Do not copy Nvidia CUDA instructions onto the AMD machine.
Store a reviewed API workflow in an operator-owned JSON file and set
`PLATFORM_COMFYUI_WORKFLOW_PATH`; tenant accounts cannot execute arbitrary graphs.
Keep product identity/specifications and typography in the compositor rather than
asking diffusion to redraw the product or spell Bengali text.

No service provides all Internet AI tools free and unlimited. For example,
[Hugging Face ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu) has account
quotas and queues, not guaranteed production capacity. Software being free does
not make every model, stock asset, voice or GPU server free/licensed for SaaS.

## 7. Claude/Codex skills for video design

The repository includes `skills/echolink-reel-director/SKILL.md`, a project-specific
production brief/checklist usable by compatible agents. It helps an agent plan
brand-safe scenes and hand off schema-valid storyboards to the current renderer.
It does not train a model, supply GPU time, or add Claude API credits.

For a future Remotion renderer, the official [Remotion Agent Skills](https://www.remotion.dev/docs/ai/skills)
support Claude Code and Codex:

```bash
npx skills add remotion-dev/skills
```

Install reviewed skills on your development machine. Do not enable generated code
execution from client prompts in the production worker. Claude access has its own
account/usage terms. [Remotion's licence](https://www.remotion.dev/docs/license/pricing)
offers a free tier for eligible individuals/small companies; check eligibility
before using it for a public automated video service.

## What an overnight run can actually promise

Both current Pages target the next **24 hours**, preferably **22:00–07:00
Asia/Dhaka**, with daytime rescue enabled. Generation stops when slots are filled
or held by quality/resource/capacity checks. It does not guarantee 100 news + 50
product posts every night. Measure actual end-to-end throughput on the new PC
before setting a daily target; fresh news is deliberately not buffered for months.
Booked delivery works all day without loading a text model.

The current local model budget is **1,200 seconds per call**:

```dotenv
PLATFORM_INFERENCE_TIMEOUT_SECONDS=1200
```

The operator may choose 30–3,600 seconds in `platform/.env.local`, then restart the
worker. This does not change Vercel request limits: generation/rendering remain
background jobs, and the dashboard polls recorded stages. More time prevents an
early timeout; it cannot make a small model faster or improve its factual ability.
