# EchoLink is live on a new operational database

On 9 November 2026, the owner chose to continue without importing the inaccessible Neon dataset. This replaces the earlier plan to wait for a production export before restoring service.

**Live dashboard:** https://echolinkbd.vercel.app · **Demo:** https://echolinkbd.vercel.app/demo

## Database responsibilities

| Service | Current role |
| --- | --- |
| Local PostgreSQL | Active worker primary: `echolink_live`, private loopback port 55432 |
| Aiven | Minimal public worker-route registry and verified cloud recovery snapshots |
| Previous Neon platform database | Archived in place; not queried by normal platform operations |

The existing website/catalog database is a separate connection and remains in use for the associated websites. Moving the platform database does not migrate the news website's own records or product catalog storage.

The old Neon database and `echolink-recovery-hold-20261109` were left intact. Old drafts, schedules, delivery receipts, learning examples, other client accounts, subscriptions and payments were **not imported**. They can be examined later if access returns. Do not point a running worker at the old queue or merge historical tasks automatically.

## Rebuilt and verified

- Owner: verified Google identity `fabrything@gmail.com`, with the original owner workspace ID and both cached Page IDs.
- Facebook: Fabrything (`462202073653168`) and Noble Seek (`236380006216214`) verified with their separate Meta app credentials.
- Instagram: linked professional account `@fabrything` verified and sharing enabled for future finished image posts. No NobleSeek Instagram account was verified; Facebook remains available for that Page.
- Fabrything: 100 products imported from the associated website; saved design settings and its available logo asset restored.
- NobleSeek: 20 configured Bangla RSS sources, saved editorial settings and the current `nobleseek.fabrything.com` destination.
- Both website connectors passed read-only schema/catalog checks. NobleSeek's saved website-publishing preference was restored; ecommerce website publishing stays optional/off.
- Google Sheets passed its connection check; Page logging is enabled. Existing spreadsheet rows were not replaced.
- Local caption model: `echolink-qwen3:4b`, with the existing resource/serialization safeguards. The model presence check does not claim a new inference benchmark.

No real Facebook, Instagram or news-website post was submitted during setup. Provider verification is not a live-delivery test.

## Start a Page from the dashboard

Both Page publishing switches and automatic generation routines start **paused**. The old queued jobs were not copied. No extra approval requirement was introduced: these Pages retain `Require editorial approval = off`, and their routines are configured for automatic publication when you start them.

1. Select **Fabrything** or **Noble Seek** in the Page switcher.
2. Open **Page connections** and review the verified Facebook account, website, model and logging connections. Fabrything's linked Instagram sharing can be managed here. Upload any missing brand logo through Page settings; cached media alone cannot recover missing logo metadata for every Page.
3. Open **Page settings → Edit Page settings**, enable **Page publishing**, review optional website publishing and save.
4. Open **Automation builder → Configure workflow**. Check the daily goal, interval, buffer and automatic publication setting, then save. Click **Start workflow**.
5. Watch **Creative studio** for actual preparation stages. Review the first new content/creative, its calendar slot and destination receipts. The next real delivery must be verified on the website and social account before treating that path as fully tested after the reset.

Saved goals are Fabrything **50/day, 10-minute minimum gap**, and NobleSeek **100/day, 5-minute minimum gap**. These are operator preferences, not platform-approved safe rates or guaranteed throughput. API throttling, credential failures, factual holds and hardware capacity still apply. Publication is allowed all day; overnight generation is separately configured for 22:00–07:00 with bounded emergency refill and batch size 1.

News candidate selection ignores articles dated before the fresh operational epoch. Deduplication covers the new database's history; unavailable old fingerprints are not reconstructed. Product routines rotate the current catalog and create new content rather than replaying old tasks.

## Backups now run daily

Windows task **`EchoLink-Daily-Backup`** runs at **03:30 in the Windows timezone** while the operator is signed in. Missed runs start when available; failed runs retry up to three times at ten-minute intervals. Keep the PC awake and online.

Each run:

1. Exports the active local database with `pg_dump`.
2. Restores the completed dump into a new dormant Aiven database and verifies schema, row counts and runtime tenant isolation.
3. Encrypts environment settings and local media separately using AES-256-GCM and verifies the archive.

The first cloud restore contained 1 account, 1 workspace, 2 Pages, 100 products, 20 feeds, 6 connections and all 14 migrations. A second snapshot includes the verified owner identity and refreshed credentials at its capture time. Snapshots are point-in-time copies; later changes enter the next backup.

The two newest managed cloud snapshots are retained. A snapshot referenced by another database profile or used by active connections is retained for operator review. Registry databases and unrelated databases are never removed by that retention rule. Local backup files are retained; inspect available disk space and copy important archives to a separate protected disk.

Private artifacts:

```text
.codex/backups/                  PostgreSQL dumps and encrypted media/env archives
.codex/secrets/                  Separate archive decryption keys
.codex/logs/latest-backup.json   Latest backup result
.codex/aiven-backups.json        Managed cloud snapshot inventory
```

Copy encrypted materials and their keys to separate protected locations. Aiven holds the SQL snapshot, not an independently served copy of all local images or inference models. **Cloud database backup does not provide automatic publishing failover.** A future cloud worker needs media availability, a single active writer and delivery reconciliation before promotion.

Useful commands:

```powershell
npm run platform:start           # Start/supervise worker, bridge, tunnel and local PostgreSQL
npm run db:backup:nightly         # Run the complete backup procedure now
npm run db:backup:install         # Reinstall/update the Windows backup task
npm run db:connections           # Operator-only connection inspection, including archived Neon
```

The existing Windows Startup shortcut starts the worker stack at sign-in. n8n is optional and is not required for the current Node worker to serve the platform. If the PC is offline, the public demo can remain visible but the local worker API and publisher are unavailable; the Aiven snapshot does not start another worker automatically.

## Verification

- Platform integration/unit tests: **123 passed**, including verified owner bootstrap claiming, tenant isolation and the new news cutoff.
- Root tests: **63 passed**.
- Browser verification: passed, including calendar, editing, owner database controls, scheduling dialogs, Page switching and mobile layout; zero JavaScript errors.
- Frontend and root builds passed.
- Live `/`, `/demo`, `/api/health` and `/api/public` returned HTTP 200; anonymous `/api/state` returned HTTP 401.
- Real owner Google sign-in completed and the rebuilt workspace was claimed successfully.
- Local dump and Aiven restore passed. External posts were not published as part of these checks.

Dedicated database assignments remain recovery candidates, not active tenant sharding. Normal independent client workspaces continue to use enforced tenant isolation in the operational primary.
