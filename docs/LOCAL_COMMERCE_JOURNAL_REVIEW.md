# Local commerce and Fabrything journal review

Status: local backend and design preparation; **the requested UI upgrade is not complete**.
The commerce control panels and structured journal UI await the owner's visual approval.
No Git push, deployment, service restart, production migration, real model request,
website write or social publication was performed for this task. Existing live
processes were left running. Build outputs used isolated folders.

## Implemented locally

- Product renderer v8 keeps the approved default studio treatment. Opt-in stable
  per-post backgrounds: gradient, fine texture, geometry, palette or mixed. Seeded
  selection avoids different artwork on identical retries. Headline presets:
  original, editorial, wide, highlight and stacked. Pointer/hand overlays have
  target, size, rotation and color controls in the API settings contract.
- Actual TTF, OTF, WOFF and WOFF2 validation, bounded decompression and Unicode
  shaping; selected files reach the renderer for every headline preset. Existing
  font-upload UI now accepts all four formats. WOFF/WOFF2 passed server shaping
  and browser FontFace registration. Original font licensing confirmation stays.
- Commerce prices remain omitted. The updated-price website notice stays in
  captions. A static pointer graphic is an overlay, not a clickable social link.
- Opt-in journal generation uses a focused Page plan and complete supplied source
  brief (under5000 characters on this worker). A separate source-relative model
  review follows static factual/originality checks. Existing routing, serialized
  local inference, crisis checks and emergency memory guard remain. Writer150s,
  reviewer180s and shared360s budgets apply. No real-model quality result is claimed.
- Structured blocks cover headings, paragraphs, verdict, pros/cons, comparisons,
  product references, FAQs and image plans. Product URLs/reviews come from supplied
  evidence, never from model invention. Uploaded image references can attach to
  plans; the offline image command exports real WebP widths and an alt-text manifest.
- `fabrything_blog` is an origin-scoped signed website connector. Receiver HMAC
  timestamps expire after5 minutes and are bound to the configured workspace/Page.
  Stable source keys and payload hashes prevent duplicate creation/overwrite.
  Changes to article, source URL, body, brief or tenant invalidate the saved review.
  A REVIEW receipt is not publication; a public canonical page and complete text
  must verify before social delivery. Uncertain responses remain reconciliation cases.

## Hosted designs and approval

- [Commerce typography/styling](https://p.superdesign.dev/draft/0d6e4ad4-f137-4041-a357-ebb3d5995188)
- [Journal buyer guide](https://p.superdesign.dev/draft/7d29b50f-e326-4e21-9082-1008bfa806e7)
- 12ui commerce conversion4a69adce-4bab-41ad-9446-318270a44651 and responsive
  export846e90fb-1022-4c2b-ad72-339cf161bf13 completed.
- 12ui journal conversionc208a7d7-0785-489c-b221-a8f3f503c42d and responsive
  export9e05f792-4eb0-43f3-860f-3160bbaa0a87 completed.

Private source context, original logos, screenshots, converted HTML and resume
artifacts stay in ignored `.superdesign/`. Draft prose is illustrative and must
not become published factual advice. Pending: approve designs, implement the
commerce preview/settings controls, connector/brief forms, topic archive route,
reusable structured product/affiliate renderer and responsive browser QA. Do not
treat the current local branch as the finished UI release.

## Verification

Measured before final handoff:229 portable EchoLink tests,63 root tests and
platform/root builds pass. Focused renderer/font/signature/delivery tests pass;
browser FontFace registration passes. Fabrything:209 backend tests passed before
the last projection case,8 final bridge checks pass,16 existing journal/legal
frontend checks pass and the isolated frontend build compiles with existing warnings.
Full frontend lint has166 errors/234 warnings; a comparison against Git HEAD found
the same166 baseline errors and **zero new errors**. No TypeScript project exists.
Do not report a clean full-repository lint run or completed end-to-end live delivery.

## Activation and remaining owner steps

See the sibling repository's `docs/JOURNAL_ECHOLINK_HANDOFF.md` for the migration,
signed bridge contract, environment variable names and verification checklist.
The new backend is **not applied to the running worker**. After the UI is finished,
review and push through the owner's CI/CD; schedule worker activation separately.
No credentials or account verification IDs were generated or committed. Google
indexing, rich results and AdSense approval are not guaranteed by code or a model review.

The exact file manifests below are generated from local Git changes. Runtime
outputs, dependency caches, private logs and design artifacts are excluded.

<!-- FILE_MANIFEST -->

## Exact changed files

### EchoLink

- `docs/AGENT_HANDOFF.md`
- `docs/LOCAL_COMMERCE_JOURNAL_REVIEW.md`
- `docs/PROJECT_MEMORY.json`
- `platform/client/font-settings.jsx`
- `platform/scripts/journal-image.mjs`
- `platform/server/api.mjs`
- `platform/server/commerce-design.mjs`
- `platform/server/commerce-settings.mjs`
- `platform/server/fonts.mjs`
- `platform/server/jobs.mjs`
- `platform/server/journal-images.mjs`
- `platform/server/journal.mjs`
- `platform/server/product-design.mjs`
- `platform/server/providers.mjs`
- `platform/server/validation.mjs`
- `platform/test/channel-brand.test.mjs`
- `platform/test/commerce-design.test.mjs`
- `platform/test/fixtures/fonts/NotoSansBengali.woff`
- `platform/test/fixtures/fonts/NotoSansBengali.woff2`
- `platform/test/fixtures/fonts/OFL.txt`
- `platform/test/fonts.test.mjs`
- `platform/test/journal-images.test.mjs`
- `platform/test/journal.test.mjs`
- `platform/test/product-design.test.mjs`

### Fabrything

- `.gitignore`
- `backend/.env.example`
- `backend/nobleseek/models.py`
- `backend/nobleseek/sanitization.py`
- `backend/nobleseek/serializers.py`
- `backend/nobleseek/views.py`
- `backend/storefront/admin.py`
- `backend/storefront/journal.py`
- `backend/storefront/journal_bridge.py`
- `backend/storefront/journal_contract.py`
- `backend/storefront/journal_models.py`
- `backend/storefront/journal_views.py`
- `backend/storefront/migrations/0005_topiccluster_journalarticle.py`
- `backend/storefront/models.py`
- `backend/storefront/seo.py`
- `backend/storefront/test_journal.py`
- `backend/storefront/urls.py`
- `docs/JOURNAL_ECHOLINK_HANDOFF.md`
- `frontend/package.json`
- `frontend/scripts/verify-build.cjs`
- `frontend/src/App.js`
- `frontend/src/storefront/layout/StorefrontLayout.js`
- `frontend/src/storefront/pages/legal/LegalPage.js`
- `frontend/src/storefront/pages/legal/content.js`
- `frontend/src/storefront/useSeo.js`
- `frontend/vercel.json`
