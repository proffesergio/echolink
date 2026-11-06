# Creative operations and worker reliability

The creator dashboard is at https://echolinkbd.vercel.app/. Select a Page or
personal-profile workspace under **Working on**. Its content, prompts, model,
catalog/RSS sources, insights and calendar stay independent.

## Start the right service

`n8n start` starts n8n. It does not start the creator worker, Ollama or its tunnel.
From the EchoLink project directory run:

```powershell
npm run platform:start
```

This starts the hidden worker supervisor, protected bridge and Ollama when
installed. The existing Windows Startup shortcut starts the same supervisor at
sign-in. Keep the PC online; an awake PC alone cannot replace a stopped service.
For repair, use `npm run platform:repair`. For a planned update while work is
running, use `npm run platform:restart`; it holds pending work and lets current
tasks finish before restarting.

The public proxy discovers the current tunnel through a dedicated Neon routing
record. The registry credential can only read that route and cannot read tenant
connections, accounts or tokens. A changing quick-tunnel address no longer needs
a Vercel redeployment. The bridge still requires its separate authentication key.
Recovery is automatic, with a short reconnect interval rather than a promise of
zero downtime. A stable named tunnel remains an option when an owned hostname is
configured.

This Windows worker uses `PLATFORM_DATABASE_TRANSPORT=websocket` in its private
platform environment because direct PostgreSQL connections proved intermittent
while secure WebSocket transactions succeeded. Other installations retain TCP
by default. Both transports retain interactive transactions, tenant row security
and the existing database role; credentials stay on the worker. See the
[Neon transport documentation](https://neon.com/docs/serverless/serverless-driver).

The dashboard uses one status region. It shows connection recovery, action
errors, measured task progress, or the next scheduled-post countdown. Model
inference can stay at a stage while it works; the percentage is not increased
by a timer. **Creative studio** shows the active queue, stages, latest design,
caption and actual tools used. **Activity** retains detailed task events.

## Set each Page’s direction

Open **Page settings → Creative direction & prompts**:

- Choose messages, sales, leads or engagement as the caption/CTA goal.
- Set its language. Fabrything uses Bilingual-Mix; NobleSeek keeps Bangla.
- Add caption instructions and image art direction.
- Select a studio background, AI when connected, or request an AI backdrop.
- Enable local product background removal for ecommerce.
- Keep automatic authorization on, or enable manual editorial review for that Page.

News designs use the actual source photo, shaped Bengali typography, a restrained
editorial palette and the original brand logo. Product designs preserve the
catalog item, remove its background locally when possible, and compose it with
studio lighting, a compact top-centered title, verified detail callouts, an original logo and one CTA. The real product
is not redrawn by an image model. Low-confidence cutouts retain the original
photo and record a warning.

The worker currently has the CPU cutout installed. To install it on another
Windows worker with `uv` available:

```powershell
npm run creative:setup
```

This uses rembg 2.0.72 and U2-Net-P. rembg is MIT licensed; the upstream U2-Net
project uses Apache-2.0. See [rembg](https://github.com/danielgatis/rembg) and
[U2-Net](https://github.com/xuebinqin/U-2-Net).

## Connect an image provider

Ollama Gemma is the caption model; it does not create images. In **Page
connections**, add an image-capable adapter, then choose it under **Page settings
→ Image model**. Available adapters include ComfyUI, AUTOMATIC1111, LocalAI,
OpenAI, Gemini and Together AI, alongside the other caption providers.

For ComfyUI, start its local server, set `PLATFORM_COMFYUI_URL` on the worker,
and supply an API workflow with a prompt node and image output. The operator can
use `PLATFORM_COMFYUI_WORKFLOW_PATH` for a trusted workflow template. Public
clients cannot execute arbitrary graphs on the worker PC. Cloud providers need
their own valid keys and supported image-model identifiers.

Without a connected image provider, the backdrop is a designed studio scene,
not an AI-generated image. The studio displays that provenance. AI-backed
composites embed IPTC/XMP provenance metadata. The current GT 730 2 GB is a
constraint for modern local diffusion; the CPU cutout and designed studio path
work without downloading a large diffusion model.

## Independent Meta apps and durable Page tokens

Facebook setup lives in **Page connections → Facebook**. Owner app profiles can
be configured independently in the root `.env.local`:

```dotenv
NOBLESEEK_META_APP_ID=4467764663536983
NOBLESEEK_META_APP_SECRET=
NOBLESEEK_META_USER_ACCESS_TOKEN=

FABRYTHING_META_APP_ID=1058606046583333
FABRYTHING_META_APP_SECRET=
FABRYTHING_META_USER_ACCESS_TOKEN=
```

Never commit this file or paste secrets into chat. Existing `META_APP_ID` and
`META_APP_SECRET` remain a legacy fallback; they are not shared automatically
between Page app profiles. Select the matching **Meta app profile** on each
Page. Other admins can supply their own app ID/secret in their own Page form;
the secret stays encrypted in that workspace’s connection.

For long-lived exchange, authorize a fresh User token with pages_show_list,
pages_read_engagement and pages_manage_posts, from the exact same Meta app.
The worker exchanges it, derives the selected Page’s token and validates its
identity, scopes and lifecycle before saving. Only the Page credential is used
for publication. A short-lived Explorer token can expire quickly. Meta can still
revoke a token with no scheduled expiry after security or permission changes.

Meta code 190/463 means expiration. EchoLink stops queued attempts for that Page,
preserves prepared content and releases unsent reservations. A verified
reconnection resumes prepared content; unknown remote outcomes still require
reconciliation and are never blindly retried.

## Personal profiles and measured insights

Create a new entry in **Manage Pages** and choose **Personal profile · manual
sharing** as the destination. This integration uses Meta’s Page APIs; it does
not automate private timeline publishing or private profile-insights retrieval.
No Facebook password, browser session or Page token is required for a profile.

The worker can generate content, authorize the finished version and schedule a
handoff. When due, it becomes **Ready to share**. Copy the caption, download the
design, publish it yourself on Facebook and confirm the real post link. The
dashboard records this as your manual confirmation, not an API-verified delivery.

For Pages, **Insights → Sync Page engagement** reads recent post reactions,
comments and shares. For profiles, import your own measurements as JSON or CSV.
Supported columns: publishedAt, type, title, reach, reactions, comments, shares,
clicks, messages and purchases. Use ISO dates and non-negative numeric counts.
Use photo/video/reel/text/link/other as types. Missing reach and conversions are
not estimated. Recommendations are comparisons within that Page’s sample, with
limited-sample labels; they are experiments, not predictions of sales or virality.

## Publishing and content quality

Automatic routines prepare the caption and required image before scheduling the
current version. Saved drafts remain paused. Per-Page daily goals, gaps, plan
allowances and duplicate records still apply. Posting windows remain all day for
the owner’s Pages. Source-link comments remain disabled.

Prompts avoid unrelated hashtags, engagement bait, fabricated urgency and
unsupported product claims. This follows Meta’s emphasis on relevant captions and
original content in its [spam update](https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/).
Chat-style model introductions are removed. If the product caption adds an
unsupported sanitizer, disinfectant or cure claim, a caption based on the catalog
title and a product-details CTA replaces it and the generation metadata records why. This targeted
check does not establish that every generated statement is factually correct.
No posting frequency is guaranteed safe, and the app cannot guarantee reach,
monetization or a restriction-free account.

Website SEO metadata uses descriptive titles, summaries and image alt text.
Google emphasizes useful original value and accuracy, and recommends reviewing
AI output; keyword stuffing or large volumes of lightly rewritten articles do
not establish quality. See [Google’s AI-content guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content).


## Catalogue and live worker console

Select the ecommerce Page, open **Product catalog**, then filter by category,
search name/brand/SKU or show only available items. **Prepare urgent post** queues
caption and creative preparation at priority; it preserves posting gaps, plan
allowances and duplicate checks. Existing pending posts for that product are
reused rather than duplicated. Routine generation chooses a random eligible
category and random unused product, avoiding the immediately previous category
when alternatives exist. Refresh the catalogue to keep stock and facts current.

Generated commerce captions and image overlays omit prices. Catalogue cards keep
prices as an internal reference. Fabrilife layouts retain the actual product
photo and use verified material/color callouts, compact centered titles and the
Page’s own website and social handles. No fabric specification is invented.
Page settings contain independent caption/image system instructions per post
type. The backdrop model follows the image instructions; the branded renderer
keeps readable typography, source/product pixels and logo placement.

**Creative studio** and **Activity** include a terminal-style view of recorded
backend task events. Task filters, pause/follow scrolling and measured progress
make long CPU inference visible. They do not expose raw process output or secrets
and do not fabricate intermediate model tokens or success messages.

News selection balances the recent category mix instead of always choosing the
latest story in the same section. RSS/section metadata and source URL/headline
classification populate the category; edit it in the post editor if needed.
BBC বাংলা and DW বাংলা feeds were verified and added to NobleSeek. RSS media and
OpenGraph/Twitter images are read from the actual article. NobleSeek website
publication resolves the category against existing active website categories.

## n8n cadence and historical failures

The old Complete pipeline’s recent failures were connection refusals to its
retired worker. All legacy workflows remain inactive. The optional creator
dispatcher now checks every 15 minutes; its authenticated worker endpoint has a
five-minute dispatch safeguard. The creator worker handles due publication and
per-Page generation intervals independently. Do not enable both generations of
workflow. Historical execution counts remain visible for their original dates;
this update does not erase failed executions to change the reported percentage.

## Instagram photo sharing

In **Page connections**, verify Facebook, then choose **Discover / verify linked
account** under Instagram. Enable automatic sharing and save. Meta must expose a
Business/Creator account linked to that Page, and the Page authorization needs
instagram_basic and instagram_content_publish. Each Page controls its own toggle.
Fabrything’s linked @fabrything account and required scopes were confirmed.

Future finished image posts are shared after Facebook succeeds. Instagram
containers, processing, remote IDs, errors and links are recorded separately;
an Instagram failure does not repeat Facebook publication. Definite failures can
be retried with **Retry Instagram only**. Uncertain publishing outcomes require
reconciliation. Text-only Facebook posts are skipped for Instagram with an
explanation. Reels are a future release.

Meta fetches an expiring signed HTTPS JPEG URL. The full design is square-padded
when needed rather than cropped. Normal asset URLs remain authenticated; signed
links are bound to one tenant/asset and expire after two hours. The PC, bridge and
public dashboard must remain reachable while Meta fetches media. See
[Meta’s Instagram API reference](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).
