# EchoLink public creator platform: local implementation plan

The owner requested a multi-user creator platform on November 5, 2026. This work
is isolated in the `platform/multi-tenant-local` worktree and a separate Neon
development branch. The owner subsequently authorized the v2 live rollout and
requested repair of the public worker connection. The rollout preserves the
owner workspace and reconciles legacy deliveries before enabling v2 publishing.

## Acceptance requirements

| Area | Required behavior and evidence |
| --- | --- |
| Identity | App-hosted Better Auth backed by isolated Neon PostgreSQL: email signup/sign-in, Google sign-in, recovery, logout/session restoration; verified identity required for sensitive operations. Managed Neon Auth provisioning was attempted and failed with database permission errors, including on a fresh development database. Preserve this documented fallback rather than claiming managed Auth works |
| Ownership | The configured verified owner identity is the only initial super-admin. Never grant owner privileges to the first registrant or a client-supplied role |
| Isolation | Every Page, website, source, product, connection, secret, creative, post, campaign, payment, task and activity belongs to a workspace. API, workers, relational constraints and cross-tenant tests enforce ownership |
| Onboarding | Niche, language, page type, desired Page count and website choice; free onboarding creates at most one Page; new accounts are independent |
| Plans | Free trial: one Page and three confirmed/reserved publications across the first seven days, not a replenishing weekly allowance. Premium limits and prices are owner controlled. Publish Now, scheduling and background delivery use the same atomic entitlement check |
| Workflows | News-only RSS aggregation. Blog/publisher website publication is optional. Ecommerce imports products/photos/prices/stock and routes through creative design/caption/review. General niches support original captions, quotes and images without news ingestion |
| Product sources | Authorized Shopify Storefront and WooCommerce APIs, structured product JSON import and public Product JSON-LD; safe outbound requests and no arbitrary tenant access to the operator's LAN |
| AI | At least ten configurable tools with truthful text/image capabilities. Local inference stays on an owner-controlled worker. Tenant cloud credentials are encrypted and never returned in state responses |
| Creatives | Selected aspect ratios, modern editable brand templates, factual product data/photo preserved, optional AI backgrounds, caption/SEO metadata/alt text/hashtags; actual exported image artifact is inspected |
| Editorial | Draft, edit, review/approve, schedule/calendar, Publish Now, publication outcome, local dry-run, failed/unknown outcomes and task logs/percentages |
| Marketing | Campaign briefs, product collections, UTM URLs, creative variations and promotion dates; ad-account/insights adapters and budgeted ad drafts. No ad spend or real test posts without an explicit reviewed launch action |
| Billing | International bank transfer, Stripe/cards and crypto; local bKash, Nagad, bank transfer and cash. Manual methods require owner verification. Stripe uses signed, idempotent webhooks, never the success redirect as proof of payment |
| Owner console | Search accounts/workspaces, suspend/reactivate, inspect plans/usage/pages/activity/payments, configure packages/payment instructions, approve/reject payments and audited subscription grants; no tenant secret disclosure |
| Usability | Approved charcoal/coral direction, straightforward labels, keyboard-accessible help tooltips for options, floating measured progress and useful empty/error/setup states |
| Verification | Real isolated Postgres, two independently authenticated users, owner/non-owner, direct cross-tenant API attacks, concurrent quotas, expiry/suspension, product import, creative export, provider adapters, approval/scheduling, manual payments and browser desktop/mobile flows |
| Public release | Separate gated release checklist after local acceptance: production OAuth/email, payment onboarding, Meta permissions/App Review as required, stable workers/storage, real-data backup and external testing. Do not expose legacy owner credentials or the legacy worker API to tenants |

## Research informing the design

- [Buffer collaboration](https://buffer.com/collaborate): approval and coordinated
  publishing are useful operator workflows. Keep editorial review and calendars.
- [Shopify Storefront products](https://shopify.dev/docs/api/storefront/latest/queries/products):
  paginate authorized product data; preserve product IDs, media and inventory facts.
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks):
  handle lifecycle changes and verified webhook events for entitlements.
- [Neon Managed Better Auth](https://neon.com/docs/auth/overview) and
  [Better Auth installation](https://better-auth.com/docs/installation): managed
  provisioning was unavailable in this project; app-hosted Better Auth uses pg,
  verified Google identities and private development email previews. Production
  email signup requires actual SMTP. Identity alone does not authorize tenant rows.
- [ComfyUI developer documentation](https://docs.comfy.org/llms.txt),
  [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation),
  [Black Forest Labs API](https://docs.bfl.ai/quick_start/generating_images): image
  providers have different payloads, capabilities and asynchronous job models.
  Provider configuration must not claim an unavailable model or imply a model test
  succeeded without an actual response.

## Delivery order

1. Local worktree/database isolation, auth, tenant schema, quotas and owner identity.
2. Provider/secret configuration, Page/onboarding/type routing and optional websites.
3. Product/news ingestion, editable creative artifacts and caption generation.
4. Review/schedule/publish workers, payment verification, owner controls and marketing.
5. Complete UI/help/progress, end-to-end isolation/concurrency/browser checks and
   document the exact manual setup still needed before public testing.

Pricing, receiving accounts/wallet addresses and payment credentials are not
invented. The owner has supplied their super-admin identity privately. Public
signup does not grant access to the owner's migrated NobleSeek Page or production data.

## Current local acceptance evidence

- Google owner sign-in completed by the owner; verified super-admin identity confirmed.
- Real email/signup/session/isolation tests pass against a dedicated `creator_test`
  database on the `echolink-platform-local` branch, separate from the owner's
  migrated `creator_local` data. Runtime role is `creator_runtime`, NOBYPASSRLS;
  migrations alone use the owner connection. Cross-tenant API, composite foreign
  key and actual RLS denial checks pass.
- Free trial is enforced atomically: concurrent Page creation allows exactly one;
  five concurrent publication reservations allow exactly three. Calendar booking,
  cancellation, trial expiry, account suspension and owner-only manual payment
  approval are exercised against real Postgres.
- Owner migration imported one Page, 21 feeds, 1,273 article records, five encrypted
  connections and one optional NobleSeek website. Live source was read-only.
  Imported Page stays paused; no old schedule was copied into the new queue.
  The owner workspace has a private owner package, not a client free trial.
- Meta Page identity, NobleSeek schema, Airtable log access and Google spreadsheet
  read access passed. Ollama 4B connection and actual caption inference passed.
  Public sample catalog download and actual source-photo creative export passed.
- Sixteen dashboard views passed browser navigation, onboarding, creation,
  editorial approval, creative rendering and dry-run checks at desktop/mobile.
- Separate n8n v2 dispatcher completed a protected webhook → worker → result
  round trip (HTTP 200), then was returned to inactive. Existing live workflow unchanged.
- A fresh RSS story was collected, rewritten by the owner's actual local model
  and composed with its real source photo. The model mixed a historical election
  result into a current story; the draft was corrected against its source and
  kept in Review with that limitation recorded. Automated checks are not factual
  verification, and this evidence does not justify unattended news publication.

## Release conditions supplied by the owner

Both localhost and Vercel redirect URIs are configured in the Google OAuth client.
The owner's latest instruction explicitly authorizes making v2 live now for
their own publication tests. Verified owner and normal-client onboarding are
confirmed. Reconcile legacy delivery history and pause its dispatcher, then
enable the verified migrated Page for explicit review/schedule/publish actions.
No routine or unreviewed article is automatically launched by the rollout.
Record the first real Facebook/website result when the owner submits that test.

Release verification: 25 v2 tests and 61 existing tests pass; browser verification
passes all 16 views, signup/onboarding/configuration/creative/approval/dry-run,
with zero JavaScript errors. SMTP authentication passed and a normal client has
verified email and completed onboarding. Vercel Web Analytics is enabled; the
React tracking integration strips URL query strings. The public bridge supports
OAuth redirects, private cookies, binary creatives and workspace-scoped APIs.

Production email delivery, Stripe merchant/webhook credentials, receiving instructions,
production OAuth consent availability and the reviewed Page publication test are
external setup items. Cloud image providers, paid Meta ads and customer funds have
not been exercised. Ad planning is implemented; paid ad submission is not enabled.

## Product direction based on research

Prioritize niche-specific content briefs, real product catalogs/availability,
brand templates, approval/calendar operations, transparent client billing and
measurable outcomes. Do not promise maximum income or use volume as a proxy for
value. [Meta's originality guidance](https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/)
and [YouTube monetization policy](https://support.google.com/youtube/answer/1311392)
favor original contributions and limit monetization of generic mass-produced
content. A future YouTube phase should add original scripts, licensed media,
local voice/subtitle/render jobs, human review and separately authorized channel
upload; it is not implemented or advertised as working in this release.
