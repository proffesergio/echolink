# NobleSeek website publishing

EchoLink connects to the Django/PostgreSQL news module in
`H:\Desktop\Music Projects\fabrythingweb`. Its source is now under
`backend/nobleseek/`; the production article table is `public.nobleseek_article`.
Article states are `DRAFT`, `REVIEW`, `PUBLISHED` and `ARCHIVED`. Public routes are
`https://www.fabrything.com/nobleseek/<slug>`.

## Local settings

These variables belong to EchoLink's ignored `.env.local`. The website database
connection is separate from EchoLink's existing `DATABASE_URL` and
`DATABASE_URL_UNPOOLED`; do not replace those values.

```dotenv
NOBLESEEK_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=verify-full"
NOBLESEEK_ENABLED=true
NOBLESEEK_FACEBOOK_PAGE_IDS=236380006216214
NOBLESEEK_REQUIRE_BEFORE_FACEBOOK=false
NOBLESEEK_SITE_URL=https://www.fabrything.com
NOBLESEEK_API_BASE_URL=https://fabrythingapi.vercel.app/api/store/nobleseek
NOBLESEEK_DATABASE_SCHEMA=public
NOBLESEEK_CATEGORY_ID=
FB_AUTOMATIC_LINKS_ENABLED=false
```

Only Pages listed by numeric **Facebook Page ID** use this website; other Pages
continue without it. Remove a Page from the list, or set `NOBLESEEK_ENABLED=false`,
to turn website publication off. A blank category means uncategorized; a supplied
category must be an active `nobleseek_newscategory` row. Per-Page connection pickers
and separate website-only publishing controls are planned in
[PLATFORM_ROADMAP.md](PLATFORM_ROADMAP.md); they are not implemented UI controls yet.

The owner chose **automatic links disabled**. No source/website link comments are
sent automatically. Due queued comments become `Skipped`; sent and uncertain
comments are preserved. An unexpected AI URL in an unapproved caption goes to
review. Explicitly approved custom captions are preserved without hidden edits.
The article URL is available in the dashboard and mirrors for manual sharing.
No platform-wide safe posting rate or subscription entitlement is inferred.

After editing `.env.local`, restart the local worker when no background task is
running. GitHub/Vercel deploys the frontend, not the Windows worker or its secrets.
The Page's active state, schedule, cap, gap and approval preference still apply.

## Delivery behavior

The connector maps the reviewed caption to an HTML summary, retains source
attribution and selected photo, and fills the fields Django normally populates
on save. HTML text and link attributes are escaped. Hashtags become website tags;
this summary does not claim to be a new 600-word original reported article.
Source-image credit is not a license to reuse it.

The slug is deterministic: `echolink-<EchoLink article UUID>`. A unique slug and
ownership/source check let a retry reuse the same record. Publication time, views
and any existing Facebook backlink survive retries. EchoLink does not migrate or
alter the production website's schema.

When a scheduled item becomes due or Publish Now runs in live mode:

1. Existing Page, approval, timing and Meta credential checks run.
2. If configured for that Page, prepare/publish the website article and confirm
   its ID, slug and content through the public Django API.
3. With `NOBLESEEK_REQUIRE_BEFORE_FACEBOOK=false`, a website failure is logged but
   Facebook can continue with the reviewed native photo/text. An unconfirmed
   website URL is not substituted into an automatic comment.
4. With `NOBLESEEK_REQUIRE_BEFORE_FACEBOOK=true`, unconfirmed website delivery holds
   Facebook. Retry reconciles the same slug rather than making a second article.
5. Facebook confirmation and each website outcome remain separate in the logs.
   Automatic source comments are skipped while the owner's link setting is off.

Dry-run and draft preview do not publish website articles. A disabled Facebook
Page remains disabled; configuring the website does not enable it.

## Connection and draft checks

```powershell
node scripts/check-website-connection.mjs
node scripts/check-website-connection.mjs --probe-draft
```

The second command tests a DRAFT insert/read/retry inside a transaction, then
rolls it back. It retains no test article and never publishes to Facebook. Database
identity sequences may advance normally during this probe. The first command
checks schema, permissions and the public catalog without writing an article.
An authenticated dashboard endpoint, `POST /admin/api/test-website`, runs the
read-only check. Credentials are not returned to the browser.

November 4 evidence: all 28 expected columns were present; insert/update access
was available; the draft/retry/rollback probe passed; the public API listing
matched the configured database. **Existing published Bangla-slug detail URLs
returned HTTP 404.** The cause is not established. The connection test reports
that warning and does not claim a live article detail works. New EchoLink slugs
are ASCII, but real public delivery of a newly approved article still requires
verification after the Page is deliberately enabled. No production website
article was retained or publicly published by these probes.

Disposable Neon tests separately prove website-first delivery, required versus
optional failure behavior, idempotent retry, preserved counters, skipped automatic
comments and dry-run protection. Those tests mock remote APIs and do not prove
live publication.

The website caches its latest strip and categories for approximately five and
ten minutes. Direct database writes do not run Django's admin cache invalidation;
uncached article/detail APIs are checked immediately, while those widgets may
lag until their normal expiry.

## Logs and next steps

The dashboard shows Website status and an article link beside the existing post.
Airtable receives Website Article URL, Website Post ID and Website Status. Sheets
adds Website URL and Website status at columns T/U, preserving the old A:S fields
and upgrading the dedicated tab header without interpreting formulas.

Remaining work: per-Page UI connection/toggle controls, independently scheduled
website-only deliveries, a website retry action that never republishes Facebook,
cache-invalidation API support, and real public-article acceptance. The broader
multi-niche/channel migration is specified in the platform roadmap.
