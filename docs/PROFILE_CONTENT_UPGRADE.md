# Profile and content lifecycle upgrade

The current application is `platform/` (React/Vite and persistent Node worker).

## Database and deployment order

1. Back up the writable primary using the existing operator procedure. Preserve
   the encryption key, all publication attempts and ambiguous receipts.
2. Apply `platform/sql/017-content-status.sql`, then
   `platform/sql/018-profile-config.sql`, then
   `platform/sql/019-content-workflow.sql` using an authorized migration role.
   The migrations are transactional and recorded in `creator.migrations`.
   The existing development runner is `cd platform && npm run migrate`; it
   deliberately refuses the production branch. Do not bypass that protection.
3. Deploy the corresponding backend and frontend together. Gracefully restart
   the worker with root `npm run platform:restart` after draining active work.
   These changes have not been applied to a live database by this coding task.
4. Verify authenticated `/api/state`, `/api/posts?status=attention`,
   `/api/posts?status=preparing` and `/api/content-events` before enabling normal
   activity. Anonymous access must return 401.

`posts.content_status` is the canonical editorial enum: `DRAFT`, `PREPARING`,
`NEED_ATTENTION`, `APPROVED`, `SCHEDULED`, `PUBLISHED`, `FAILED`. Existing lowercase
`posts.status` remains the delivery/workflow state so `unknown`, `publishing`
and `ready_manual` keep their reconciliation semantics. Clients cannot set the
canonical column: database triggers derive it from posts and generation tasks.
An active caption task followed by a rendering task stays `PREPARING` until the
last task completes. Review holds/errors take precedence. A published receipt
remains published even if it has a historical warning.

Overview counters use complete per-profile aggregates, independent of the
bounded dashboard sample. Attention lists and counters both include
`NEED_ATTENTION` and `FAILED`. List count and rows share a repeatable-read
snapshot; state responses also use a consistent snapshot. Separate requests
can observe subsequent commits; revisions drive the next refresh.

The SSE endpoint emits a finite authenticated revision event and closes;
EventSource reconnects every three seconds. This supports the existing buffered
bridge/proxy without holding database connections. Existing pulse polling
remains the fallback and supplies task progress. This is bounded refresh latency,
not a zero-latency or exactly-once event-delivery guarantee.

`pages.profile_config.content_workflow` selects `TEXT`, `PHOTO_CAPTION` or
`VIDEO_REELS`. Open **Configure workflow** in Live workflow or Creative studio
to edit it. An explicit choice overrides the older `reels_` niche preset.
New personal profiles default to Photo Design + Caption. All existing profiles
keep their saved language, prompts and legacy workflow until explicitly edited.
SQL018/019 add schema and validation without replacing existing settings. Regenerating an editable draft normalizes its media type and clears
stale storyboard/media assets; published and unresolved deliveries are protected.
Video rendering still requires configured media/narration and the existing
rendering controls. This setting never authorizes automatic personal publishing.
The existing storyboard/narration engine is Bengali. Audience captions follow
the selected single-language or bilingual policy independently; selecting
English captions does not add an English narration engine.

## Regression checklist

Use an isolated test database and mocked inference/delivery adapters. Never send
synthetic reports, website writes or social posts to production for QA.

1. Open NobleSeek and Fabrything separately. Compare attention counters with
   the attention list total; verify each returned item has the selected page ID.
   Test more than 300 items so the overview sample cannot hide an older hold.
2. Queue caption preparation and rendering. Confirm the item appears only in
   Preparing while work is active, then in Needs attention when review is
   pending. A source/safety hold must appear in attention immediately.
3. Approve and schedule a fixture. Verify count/list transitions without reload.
   Simulate a rejected mutation: optimistic changes must roll back/refetch.
4. Interrupt SSE and restore it; confirm pulse fallback, reconnect, and no
   duplicate rows. Switch profiles during an in-flight list request; stale
   responses must not enter the newly selected profile.
5. Set NobleSeek to Bangla only and Fabrything to English + Bangla. Reopen both
   settings panels; ensure settings, prompts and generated validation stay
   independent. Reject wrong-language copy rather than silently publishing it.
6. Configure different fonts, palette, padding, watermark and layout. Render
   private fixtures, including Bangla text. Verify the selected profile’s assets
   only; a foreign tenant font asset must be rejected.
7. Classify Hossain Billal as Personal Profile. Confirm its badge and assisted
   sharing workflow. Page access tokens must not enable automatic personal
   timeline publication. Creator and business Pages retain Page-token checks.
8. Select the Islamic education/science/AI preset. Verify source/reference slots
   and topic pillars; missing or conflicting religious/scientific evidence must
   remain reviewable. A model verdict or animation is not external verification.
9. Inspect the wave visualizer through actual grounding, synthesis and rendering
   task phases. Test bilingual labels, narrow screens, keyboard access and
   reduced-motion preference. No task must imply successful source verification
   merely because time elapsed.
10. Preserve uncertain deliveries: no retry, reclassification or migration may
    automatically republish a post with an unknown receipt. Recheck tenant
    isolation, factual/crisis guards, one-model concurrency and memory guard.
11. On the personal profile, choose each content workflow independently:
    **Text**, **Photo Design + Caption**, and **Video Reels**. Generate private
    fixtures and verify that Text stops after copy, Photo proceeds to image
    design, and only Video enters storyboard preparation. Switch away from an
    older `reels_` niche preset and verify it cannot override the saved workflow.
    Existing published/uncertain receipts must remain intact. Changing settings
    does not rewrite completed content or restart a running inference call.

## Automated checks

Personal-profile insights accept optional imported `saves`, `topicPillar` and
human `techFaithAnalogyScore` (0–5). Engagement depth is `(comments + shares) /
reach`; save/share ratio requires measured saves for every row and nonzero
shares. Topic engagement is an observational authority proxy. Missing data
remains unavailable. These fields neither fetch Meta profile analytics nor
certify religious/scientific claims.

`cd platform && npm run test:unit` runs portable tests without production
credentials. `npm run build` checks the React application. The existing isolated
API suite includes `content-status-db-check.mjs` and SSE authentication checks;
it requires the separately configured `creator_test` database and auth setup.
The database lifecycle helper checks caption→render handoff, review, approval,
scheduling, guardrails and delivery uncertainty without external calls.
