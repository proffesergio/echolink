# EchoLink Creator Platform · v2

**A private workspace for every creator. A clear control center for the owner.**

Turn news sources, product catalogs and original ideas into branded posts. Each
Page has its own niche, language, model, optional website and publishing cadence.

> Public testing: **https://echolinkbd.vercel.app/**. The frontend connects through
> an authenticated proxy to the Windows worker and local models. Follow the
> [live testing guide](../docs/LIVE_V2_TESTING.md) for Page setup and publication.

## What is implemented

| For creators | For the platform owner |
| --- | --- |
| Google sign-in and verified email accounts | Verified owner identity, never “first signup wins” |
| Guided niche/language onboarding | Account/workspace suspension and inspection |
| Independent Pages, websites and encrypted credentials | Configurable packages, prices and receiving instructions |
| News-only RSS with fallback and exact URL deduplication | Manual receipt approval and audited subscription grants |
| Shopify, WooCommerce, JSON catalogs and product JSON-LD | Activity/task visibility across workspaces |
| Original product photos in branded 1:1, 4:5, 9:16 and 16:9 exports | Isolated development database and genuine RLS enforcement |
| Captions, hashtags, logo upload and optional AI backgrounds | Signed Stripe webhook handler and hosted card checkout adapter |
| Draft/edit/review/approve, calendar booking and cancellation | Publication reservations, version approval and unknown-delivery reconciliation |
| Per-Page routines with review-first defaults | Protected local n8n dispatcher |
| Optional Google Sheets/Airtable delivery outbox | Private owner workspace migration |

Free clients get **one Page and three publications in their first seven days**.
This is one initial trial, not a weekly reset. Reserving a schedule uses a slot;
canceling an unsent reservation releases it. Failed or unknown remote writes are
handled separately so retries cannot silently create duplicate posts.

**13 AI configuration options:** Ollama, LM Studio, LocalAI, ComfyUI,
AUTOMATIC1111, OpenAI, Google Gemini, Anthropic, Groq, OpenRouter, DeepSeek,
Mistral and Together AI. Their text/image capabilities differ. Saved configuration
does not mean a tool is installed, a model is loaded, or a provider call has passed.

## Run locally on Windows

For a separate development instance, use its own port, origin and database.
For the configured public worker, run `npm run platform:repair` from the root.

```powershell
cd C:\Users\bhnbi\Music\echolink\platform
npm ci
npm run build
npm start
```

The isolated `.env.local` already exists on this PC and is ignored by Git. Never
replace it with the production newsroom environment. It uses database
`creator_local` on branch `echolink-platform-local`.

For a fresh installation, start with `.env.example`, set random authentication
and encryption secrets, and provide isolated database credentials. Setup order:

```powershell
npm run migrate
node scripts/setup-auth.mjs
node scripts/setup-runtime-role.mjs
npm run build
npm start
```

`DATABASE_URL` is the restricted runtime connection. `DATABASE_URL_UNPOOLED`
is the owner connection reserved for migrations and role setup. Back up the
encryption key together with the database; credentials cannot be decrypted
without it. Private logos/creatives live in `.local/assets/` and need backup too.

## First account and Page

1. Open localhost:8790 and continue with Google, or create an email account.
   Email verification requires SMTP. Development-only previews stay in private
   files; the local operator can verify a newly created test account with:
   `node scripts/verify-local-email.mjs your-email@example.com`.
2. Complete workspace name, niche, default language and intended Page count.
3. Connections → add/test the desired tools. For this PC, choose Ollama and
   exact model `echolink-gemma3:4b` or `gemma3:4b`. These models are installed.
4. Pages → configure niche/type/language and choose the text model. Ecommerce
   Pages should select an imported store. News Pages may enable RSS aggregation.
5. Add a Facebook connection using a Page token and supported Graph version;
   save the numeric Page ID on the Page, then choose Verify Page.
6. Create a post or use Find a story / an imported product. Generate a caption,
   design an image, check facts/photo/brand, then approve the current version.
7. Dry-run shows readiness without submitting a post. On the configured public
   instance, approved posts can be published immediately or scheduled.

Noble Seek's controlled cutover is complete: legacy delivery history was
reconciled, its old dispatcher was paused and the verified v2 Page was enabled.
The owner can submit the first reviewed publication from the live dashboard.

The operator can inspect the proposed cutover without changing delivery:

```powershell
node scripts/cutover-legacy.mjs C:\Users\bhnbi\Music\echolink\.env.local
```

Only after the owner reviews and approves the exact draft/photo should the
operator run the same command with `--execute --post THE_APPROVED_POST_ID`.
It pauses the old dispatcher, waits for in-flight legacy publishing, reconciles
confirmed delivery history and prepares the selected v2 Page. It does **not**
publish the test or deploy the public site. A story already published by the old
worker cannot be used for a duplicate test. Restart v2 after a successful cutover,
then explicitly choose Publish Now on the approved post.

## Windows AI setup

Ollama already runs on port 11434. Check with `ollama list`. To select another
installed model, save its exact name in a connection; no n8n node needs editing.

The operator can configure these origins in **platform/.env.local**:

| Tool | Variable | Typical origin |
| --- | --- | --- |
| Ollama | `PLATFORM_OLLAMA_URL` | `http://127.0.0.1:11434` |
| LM Studio | `PLATFORM_LM_STUDIO_URL` | `http://127.0.0.1:1234` |
| LocalAI | `PLATFORM_LOCALAI_URL` | `http://127.0.0.1:8080` |
| ComfyUI | `PLATFORM_COMFYUI_URL` | `http://127.0.0.1:8188` |
| AUTOMATIC1111 | `PLATFORM_A1111_URL` | `http://127.0.0.1:7860` |

For LM Studio, load a compatible model and start its local server. For
AUTOMATIC1111, enable its API when launching. ComfyUI requires an installed
model and an API workflow: the operator sets `PLATFORM_COMFYUI_WORKFLOW_PATH`
to a JSON file shaped as `{ "workflow": { ...API workflow... }, "promptNode": "6" }`.
The configured node must have an `inputs.text` field. Only the owner can save
arbitrary ComfyUI workflow graphs; public accounts use the operator's template.

CPU inference is slow on this PC: the real Bangla draft took about three and a
half minutes. Follow Activity for measured stages. Optional image models have
not been downloaded or benchmarked here. Source-photo templates work without
them. A successful model connection is not a factual-quality guarantee.

## Google, Facebook, websites and logging

- **Google login:** the OAuth client is configured and owner sign-in passed.
  Use `/api/auth/callback/google` under the actual application origin. Public
  beta clients must be allowed by the Google consent app's publishing/test-user
  configuration. Google login and a Sheets service account serve different purposes.
- **Facebook:** store a Page token with `pages_manage_posts` and
  `pages_read_engagement`; comments additionally need `pages_manage_engagement`.
  Use your supported Graph version. External client Pages may require Meta App
  Review/Advanced Access. There is no guaranteed “safe” posting count.
- **Website publication:** optional on every Page. WordPress uses a scoped
  application password; the migrated owner also has the existing NobleSeek
  database adapter. Generic Shopify/WooCommerce connections import products;
  they do not publish blog articles. Source/website comments on Facebook stay off.
- **Sheets:** enable the Google Sheets API, create a service-account JSON key,
  share the spreadsheet with its `client_email` as Editor, then save the JSON,
  spreadsheet ID and a dedicated logging tab. Select that connection on the Page.
- **Airtable:** save the PAT/base/log table, test it, then select it on the Page.
  Imported Noble Seek retains its linked Airtable record mapping. Automatic
  Airtable Page-record creation for new client Pages is not implemented; use
  Sheets or add a compatible mapping before enabling Airtable logging.

Logging is optional and off on imported copies during migration. The durable
outbox records pending/failed deliveries under Activity; a logging failure does
not submit a second Facebook post. Real read access passed for both imported
logging connections; new v2 write delivery still needs its controlled test.

## Billing setup

Owner console → Packages sets page/post/generation limits, period and USD/BDT
prices in minor units. Receiving instructions enable bank transfer, crypto,
bKash, Nagad or cash. Clients submit a reference; the owner independently checks
receipt before approval. No funds are inferred from a screenshot or client claim.

Stripe/cards use hosted checkout with `STRIPE_SECRET_KEY` and signed events
with `STRIPE_WEBHOOK_SECRET` at `/api/billing/stripe-webhook`. Use a test merchant
key with sandbox billing. Only a currently active subscription with a paid latest
invoice grants the Stripe plan. No merchant credentials or real charges were
tested in this preview. Checkout retries preserve a committed idempotency key;
existing Stripe subscriptions open the customer portal instead of a second
contract. Enable the Stripe customer portal in the merchant account. Owner
administrative grants do not cancel an existing Stripe billing contract.

## n8n

Open the prepared [v2 dispatcher](http://localhost:5678/workflow/4sR62MKzJyf3lINJ).
It is inactive. The protected webhook round trip passed. The old live dispatcher
was subsequently paused during cutover. The native v2 worker checks its durable
queue and routines without requiring n8n; the dispatcher remains an optional trigger.

The single canvas dispatches due routines to the authenticated local worker.
Tenant secrets stay in the worker; quotas, review versions, schedules, media and
outcomes are enforced there. Dashboard Activity exposes each work stage.
The built-in minute check and n8n can coexist: database locks/next-run timestamps
prevent duplicate rule dispatch. For a new n8n instance:

```powershell
node scripts/setup-n8n.mjs C:\path\to\legacy\.env.local
```

This creates only the separate inactive dispatcher and encrypted header
credential. For Docker n8n, configure a reachable host address rather than its
container's loopback, and bind/protect the worker accordingly before use.

## Verify and contribute

```powershell
npm test
npm run build
npm run verify
npm run test:browser
```

Tests use independently authenticated fixture accounts in a **separate
`creator_test` database**, not the owner's `creator_local` data. Its private
`.env.test.local` is already configured on this PC, uses separate authentication
and encryption secrets, and disables external mail. For a fresh test environment,
copy `.env.test.example`, supply direct/restricted connections to `creator_test`,
then run `npm run test:prepare` after the runtime role exists. Tests refuse to run
against the owner workspace database and clean up their fixture accounts.
Browser verification exercises 16 views and saves private
desktop/mobile evidence under `.local/verification/`. External provider tests
must report actual responses; mocks do not prove Meta, Stripe or an image model works.

See [the project plan](../docs/MULTI_TENANT_PLAN.md) for evidence, limitations and
release conditions. Improve an adapter, add a meaningful test, report a reproducible
issue, or star [EchoLink on GitHub](https://github.com/proffesergio/echolink).
Original content and useful client workflows are the product; monetization is
never guaranteed. Paid ad submission and YouTube production are later phases.
