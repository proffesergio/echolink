# Commerce and journal release — November 13, 2026

The owner approved both hosted designs and authorized pushing both repositories through CI/CD after checks. The GitHub profile/workflow release `64b435f` was merged into the local review branch (merge `505b09a`) without dropping commerce/journal changes. Fabrything origin/main remained at `dca888c`; no incoming Fabrything merge was needed.

## Completed work

- Brand & design settings implement the approved typography/upload panel and grouped commerce controls. Pointer shape/target/color/size/rotation, stable seeded backgrounds, five headline treatments and a truthful style preview preserve the signature renderer. TTF/OTF/WOFF/WOFF2 uploads retain permission, decompression, glyph and tenant checks. New controls wait for a compatible worker instead of silently saving unsupported settings.
- Journal profile plans, article source/product/image briefs and the signed website connector are available in the CMS. Large journal payloads are excluded from dashboard list projections and remain in authenticated detail responses.
- Problem-first generation and independent source-relative review retain factual/originality/crisis checks, serial inference and the emergency memory guard. There was no real-model QA or test publication.
- Fabrything has reusable structured article blocks, topic/intent archives, TOC, verdict, responsive images/plans, comparison tables, merchant cards, pros/cons, expandable FAQs, sources and related guides. External merchant buttons use nofollow sponsored. No price or invented rating/first-hand testing is generated.
- Direct canonical articles and archives render the complete content server-side, including metadata/JSON-LD. React navigation uses the same structured contract. Real Fabrything branding, policy/contact/disclosure routes and dynamic sitemap/robots are retained. Empty, future and review-only topics stay out of the sitemap/navigation.
- Added EchoLink SQL020 because the new connector was missing from the database CHECK constraint. Incoming SQL017–019 remain in their original order. Existing unresolved receipts, manual prompts, language and profile choices are preserved.
- Fixed signed malformed block inputs to return validation errors. Updated seven older pricing assertions for the documented no-over-markup policy and made timestamp polling fixtures deterministic on Windows; production price rules were preserved.
- Fixed bundled SVG mask URLs in settings dialogs; invalid unquoted data URLs had rendered section icons as solid squares. Browser computed-style verification confirms real masks now.
- Both READMEs are client-facing product overviews without setup instructions.

## Approved design and alignment evidence

- [Commerce typography](https://p.superdesign.dev/draft/0d6e4ad4-f137-4041-a357-ebb3d5995188)
- [Journal buyer guide](https://p.superdesign.dev/draft/7d29b50f-e326-4e21-9082-1008bfa806e7)

SuperDesign drafts and 12ui conversions were reused. Both target-based 12ui alignment kits settled, with low automated anchor overlap (~22%); they are guidance, not proof of pixel identity. Manual comparison covered the real controls/content at320/390/768/1440px. The palette/shield and subtle journal ornament were carried from the approved assets. Real brand artwork and the editorial identity take precedence over raster logo/avatar crops. Unconfigured social links, sample keyboard claims and mismatched content-replacement suggestions were not shipped. Private design captures/kits remain ignored.

## Measured verification

- EchoLink:278 portable tests including disposable PostgreSQL queue fairness checks;63 root tests; isolated platform and root builds.
- Disposable PostgreSQL: all20 migrations, signed connector insertion, profile/prompt preservation, task-driven canonical status and ambiguous receipt preservation.
- Fabrything:1,187 backend tests pass in in-memory SQLite; migration drift and Django system checks pass.18 journal/legal React tests pass. Isolated frontend production build compiles with existing warnings.
- Browser:320/390/768/1440px, no horizontal document overflow or JavaScript errors; actual WOFF2 FontFace loading; mocked commerce settings persist while retaining manual prompts; article/schema/affiliate/FAQ/topic routes work. No real API writes or model requests.
- Full frontend ESLint remains166 baseline errors/234 warnings, zero new errors compared with the existing committed source. This is not a clean repository-wide lint result. There is no TypeScript project/typecheck command.
- Read-only live operations check: Worker, Supervisor, Primary database, Ollama, Protected bridge, Public tunnel and Public dashboard healthy. Health is a point-in-time observation.

## Activation and remaining owner steps

1. CI/CD can deploy the hosted dashboard and Fabrything frontend/backend from main. It does not restart the external Windows worker. Existing live processes were not restarted/killed by this task. No production migration was manually run.
2. Back up the selected writable primary and apply unapplied EchoLink SQL017,018,019,020 in order using the authorized release procedure. Schedule the worker’s normal graceful activation separately; preserve running and uncertain receipts. The development migration script intentionally refuses production.
3. Fabrything’s production Vercel release hook already runs Django migrations; the additive journal migration is `storefront/0005_topiccluster_journalarticle`. No conflicting incoming Django migration was found. Do not migrate the wrong database or seed demo content.
4. Configure the tenant-bound journal connector and an active topic chain. Backend variables: `ECHOLINK_BLOG_SECRET` (random, >=32 characters), `ECHOLINK_BLOG_WORKSPACE_ID`, `ECHOLINK_BLOG_PAGE_ID`; `ECHOLINK_BLOG_AUTO_PUBLISH` defaults false. Put the same signing secret in the encrypted EchoLink connection API key and use the exact website origin. No secret values are in this handoff.
5. Select the plan/keyword/audience and add real source facts, product URLs, affiliate programme-approved links and licensed images. The offline image tool produces actual WebP variants; the owner supplies their hosted public URLs. A placeholder is a plan, not an assertion that an image was generated/licensed.
6. Supply real Search Console/AdSense verification and publisher IDs, ads.txt and consent configuration appropriate to the audience, if using these services. Review policy wording, affiliate disclosures and editorial ownership. Indexing, advertising approval and rich results are not guaranteed.

## Research basis

Architecture follows [Google’s people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), [product snippet guidance](https://developers.google.com/search/docs/appearance/structured-data/product-snippet) and [AdSense account setup](https://support.google.com/adsense/answer/7402256). Schema is limited to visible supported content; markup does not replace editorial verification or confer advertising approval.

## Release state

Release candidate verified locally; main pushes and hosted CI/CD receipts are recorded after dispatch. The local worker remains on its previously running code until separately activated.

<!-- FILE_MANIFEST -->
## Exact release files relative to fetched main

### EchoLink

- `README.md`
- `docs/AGENT_HANDOFF.md`
- `docs/LOCAL_COMMERCE_JOURNAL_REVIEW.md`
- `docs/PROJECT_MEMORY.json`
- `platform/client/app.jsx`
- `platform/client/assets/commerce/palette.png`
- `platform/client/assets/commerce/shield.png`
- `platform/client/commerce-settings.css`
- `platform/client/commerce-settings.jsx`
- `platform/client/font-settings.jsx`
- `platform/client/journal-settings.jsx`
- `platform/client/settings-dialog.jsx`
- `platform/client/tests/motion-profile.browser.mjs`
- `platform/scripts/journal-image.mjs`
- `platform/server/api.mjs`
- `platform/server/commerce-design.mjs`
- `platform/server/commerce-settings.mjs`
- `platform/server/fonts.mjs`
- `platform/server/index.mjs`
- `platform/server/jobs.mjs`
- `platform/server/journal-images.mjs`
- `platform/server/journal.mjs`
- `platform/server/product-design.mjs`
- `platform/server/providers.mjs`
- `platform/server/read-model.mjs`
- `platform/server/validation.mjs`
- `platform/shared/commerce-design.mjs`
- `platform/sql/020-journal-connector.sql`
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
- `README.md`
- `backend/.env.example`
- `backend/catalog/test_admin_product_import.py`
- `backend/catalog/test_apply_pricing_markup.py`
- `backend/catalog/test_price_sync.py`
- `backend/catalog/test_seed_store_catalog.py`
- `backend/chat/tests/test_customer_api.py`
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
- `backend/storefront/templates/storefront/journal_blocks.html`
- `backend/storefront/templates/storefront/journal_cards.html`
- `backend/storefront/templates/storefront/journal_document.html`
- `backend/storefront/templates/storefront/journal_product_details.html`
- `backend/storefront/test_journal.py`
- `backend/storefront/urls.py`
- `docs/JOURNAL_ECHOLINK_HANDOFF.md`
- `frontend/package.json`
- `frontend/public/index.html`
- `frontend/public/journal.css`
- `frontend/public/journal/chevron.png`
- `frontend/scripts/verify-build.cjs`
- `frontend/src/App.js`
- `frontend/src/storefront/components/JournalBlocks.js`
- `frontend/src/storefront/layout/StorefrontLayout.js`
- `frontend/src/storefront/pages/BlogPages.js`
- `frontend/src/storefront/pages/BlogPages.test.js`
- `frontend/src/storefront/pages/legal/LegalPage.js`
- `frontend/src/storefront/pages/legal/content.js`
- `frontend/src/storefront/useSeo.js`
- `frontend/vercel.json`
