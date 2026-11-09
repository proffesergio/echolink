# Local PostgreSQL primary and Neon recovery

**Current status:** The owner chose a fresh operational database, and the platform is live again. See [Fresh start and current operations](FRESH_START.md). The source-recovery instructions below now apply only to optional recovery of the archived Neon history.

Use PostgreSQL for EchoLink. Existing code relies on PostgreSQL transactions, JSONB, advisory locks, `SKIP LOCKED`, partial indexes and row-level security. MySQL is not an interchangeable connection-string setting.

## Current state · 8 November 2026

Neon's `echolink` project reports **5,641,640,926 bytes of network transfer** for November and rejects connections with PostgreSQL error `53000` (“account or project has exceeded the quota”). Its reported compute consumption is 51,616 seconds, about 14.3 CU-hours. This points to transfer exhaustion, rather than a need to restart Ollama or change database passwords. [Neon documents that free-plan transfer exhaustion suspends compute](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md).

The local setup is intentionally separate. It does not switch the running production app to an empty database. No complete EchoLink dump was found in the project backups. Existing unpublished receipts and deduplication history cannot be reconstructed safely from Page configuration alone.

## Local installation

The operator setup uses official PostgreSQL 18.6 Windows binaries, downloaded from EDB's link in [PostgreSQL's Windows distribution guide](https://www.postgresql.org/download/windows/). It creates a new workspace-owned cluster under `platform/.local/postgres/data`. Existing clusters under `C:\Program Files\PostgreSQL` are left alone.

```powershell
node scripts/local-postgres.mjs setup
node scripts/local-postgres.mjs start
node scripts/local-postgres.mjs test
node scripts/local-postgres.mjs browser
```

The cluster listens only on `127.0.0.1:55432`, uses SCRAM passwords and conservative memory settings (64 MB shared buffers, 2 MB work memory, 40 connections). It creates `echolink_local` and an isolated `creator_test`. The application runtime role cannot bypass RLS and is not a superuser. Migration/auth setup uses a separate owner role.

Private connection values live in git-ignored `platform/.env.postgres.local`:

```dotenv
LOCAL_POSTGRES_ADMIN_URL=...
LOCAL_POSTGRES_DATABASE_URL=...
LOCAL_POSTGRES_DATABASE_URL_UNPOOLED=...
LOCAL_POSTGRES_TEST_URL=...
LOCAL_POSTGRES_TEST_URL_UNPOOLED=...
```

Do not paste these values into chat, commit them, expose port 55432 to the internet, or point Vercel directly at the local database.

## Recover existing production data before cutover

1. Restore source access once through the Neon Console (usage/billing or support), or obtain a recent **complete** PostgreSQL dump made before the suspension. Nothing in this setup purchases an upgrade or bypasses Neon's quota.
2. While the existing Neon connection is configured, export with `node scripts/backup-platform-db.mjs`. It uses the configured source connection (including a TLS-verified loopback WebSocket relay for restrictive Neon networks), stores credentials in the child process environment instead of command arguments, and renames the `.part` file only after a successful `pg_dump`. The file contains private tenant data and encrypted credentials; protect it and preserve the original `PLATFORM_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` separately.
3. Pause preparation and delivery through the current authoritative database, drain in-flight work, and take a final export. Restore it into a **new local recovery database**, not over the initialized test/staging database:

   ```powershell
   node scripts/restore-platform-local.mjs .codex/backups/echolink-YOUR-TIMESTAMP.dump
   ```

   This creates a new database, reapplies runtime grants, validates counts/foreign keys and checks tenant isolation. It writes a private recovery configuration with publishing disabled. Validate auth identities, Page connections, scheduled posts, publication receipts and duplicate fingerprints before activation.
4. Reconcile any `publishing`/`unknown` deliveries with Meta and the website before releasing the queue. A stale snapshot cannot tell you which posts were sent after it was created. Two independently writing databases must never dispatch the same queue.
5. Switch the worker's `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the validated local recovery database, with `PLATFORM_DATABASE_TRANSPORT=tcp`. Keep the current encryption and authentication secrets. Restart only after the old worker is stopped/drained. Enable publication only on the chosen primary.
6. Test sign-in, Page settings, generation and one already-authorized real delivery. Keep the Neon database as a rollback reference until reconciliation and backups are verified.

Steps 3–6 are a deliberate operator cutover, not automatic “try another connection string.” They remain blocked until the real workspace data can be read or a suitable dump is available.

## Keep heavy traffic local

The worker, queue, content bodies, model outputs, task events and dashboard polling should all use the local primary over loopback. Vercel serves the frontend and forwards authenticated API requests through the existing protected bridge. No caption/article database reads need cross Neon's network boundary in this mode.

The dashboard also slows idle refreshes and stops them in hidden tabs; owner-console data is not fetched with every task poll. The local build now separates lightweight revision/task pulses from full lists and hydrates article/product bodies only when opened. A representative local result-size test reduced article list JSON by 98.9%; this is not a measurement of production Neon billing. See [database operations](DATABASE_ARCHITECTURE.md).

The previous automatic tunnel registry was stored in Neon. A separate Aiven registry with reader/writer roles is now prepared; the compatible resolver and supervisor code still require rollout. A stable authenticated named tunnel remains an option. A local registry alone cannot be queried directly by Vercel. Keep the bridge shared secret; never publish the database or local inference endpoint.

## Backups and future standby

Run daily private `pg_dump` backups of the local primary and copy them to a separate disk or encrypted remote storage. A backup on the same PC alone does not protect against disk loss. Preserve asset files and encryption keys as well as SQL data. Verify restores regularly in an isolated database with publishing disabled.

Neon can later hold a small read-only reporting/control-plane mirror or a deliberately synchronized standby. Avoid sending full article bodies, repeated terminal events and large state refreshes through it. Database dump uploads and cloud standby verification still have storage/compute/transfer limits. Do not call a stale mirror an automatic publishing failover: promotion needs a single writer, confirmed synchronization and external-delivery reconciliation.

Local PostgreSQL removes Neon transfer from daily operations, but this PC must remain on for local API and publishing availability. A future cloud worker plus cloud PostgreSQL can provide independent uptime; that is a separate deployment with the same one-primary rule.
