# Bring the existing EchoLink workspace back online

**Current status:** The owner chose a fresh operational database, and the platform is live again. See [Fresh start and current operations](FRESH_START.md). The source-recovery instructions below now apply only to optional recovery of the archived Neon history.

## What is preserved now

The production PostgreSQL export is **not complete**. Neon still rejects the correct source connection with SQLSTATE `53000`, quota exceeded.

On 9 November 2026, a full-data branch was created from the authoritative platform branch without adding a compute:

| Item | Value |
| --- | --- |
| Project | `echolink` · `gentle-dust-30064543` |
| Authoritative branch | `echolink-platform-local` · `br-cool-wind-azfeoryp` |
| Authoritative database | `creator_local` |
| Recovery hold | `echolink-recovery-hold-20261109` · `br-silent-sea-azys4s3x` |
| Captured parent LSN | `0/5746450` |
| Hold compute | None |

The existing manual snapshot `snap-weathered-water-az8omrbh` covers the older branch named `production`. It does not cover the platform branch above. The attempt to create another manual snapshot was rejected with `snapshots limit exceeded`; the existing snapshot was retained.

The recovery hold preserves a point inside the same Neon project. It is not an independent downloadable backup, does not bypass the quota and does not restore platform availability.

The local recovery materials were separately encrypted and tested:

- Archive: `.codex/backups/echolink-local-materials-2026-11-09T05-32-45-571Z.enc` (~29.8 MB).
- Separate decryption key: `.codex/secrets/echolink-recovery-2026-11-09T05-32-45-571Z.key`.
- Includes root/platform environment settings, local PostgreSQL credentials, the provider CA and local creative assets.
- AES-256-GCM authentication passed; a private extraction was compared against the originals and **266 file checksums matched**.
- No production SQL rows are included. Keep this distinction when copying backups.

Copy the encrypted archive to a protected second disk. Keep its key in a separate protected location. Do not attach either environment files or the key to a support request. The temporary test extraction remains under `.codex/recovery-unpack-1794202471599` because automated cleanup was rejected; it contains private decrypted copies and may be removed through File Explorer after confirming the encrypted archive/key are retained.

## Your next action: request temporary source access

Open the [Neon Console](https://console.neon.tech). Select the organization containing `echolink`, then use the top-right organization menu → **Help → Get help**.

Free-plan users have community and AI assistance. If a support-ticket option is unavailable, choose **Get help from the community** and use the Neon Discord support channel. Ask whether a Neon team member can help with a one-time export. [Neon's support guide](https://neon.com/docs/introduction/support) explains which channels are available; no quota exception or response time is guaranteed.

Send this message, without credentials:

```text
Subject: Request temporary PostgreSQL export access after network-transfer quota

My EchoLink project is suspended after exhausting the Free plan's monthly
network-transfer allowance. I need a complete pg_dump so I can migrate the
existing application dataset to my own PostgreSQL server.

Project name: echolink
Project ID: gentle-dust-30064543
Organization ID: org-restless-field-32561692
Authoritative branch: echolink-platform-local
Branch ID: br-cool-wind-azfeoryp
Database: creator_local
Error: SQLSTATE 53000 — account or project has exceeded the quota
Reported transfer: 5,669,991,071 bytes in the November 2026 period
Reported branch logical size: approximately 63.3 MB (all branch databases)
Current quota period ends: 2026-12-01 00:00 UTC

I have paused the local application services. A no-compute recovery hold
exists: echolink-recovery-hold-20261109 / br-silent-sea-azys4s3x.

Could you temporarily enable source connections/egress for a one-time
read-only pg_dump, or offer a supported way to export the complete data?
Please preserve the existing branch, roles and data. I am not requesting
a reset, deletion or an automatic paid-plan change.

Please confirm whether you can help and when export access is available.
```

If the team cannot grant an exception, the documented alternatives are the next quota period or an owner-approved paid plan. This recovery does not automatically change billing. [Neon documents the transfer suspension behavior](https://neon.com/docs/introduction/network-transfer).

Once access is enabled, reply **“Neon export access ready”**. No new database URI or secret needs to be pasted into chat.

## Confirm the correct database

If you want to check access yourself, open the SQL Editor, explicitly choose branch **echolink-platform-local** and database **creator_local**, and run:

```sql
SELECT current_database(), now();
```

The database result must be `creator_local`. A working `neondb` connection on the older `production` branch is not proof that the current platform can be exported. Do not reset either branch or point the app at an empty standby.

Alternatively, from the project directory:

```powershell
npm run db:connections
```

The Neon profile must return `ok: true`. The Aiven/local profiles passing does not mean Neon is available.

## What happens after source access returns

1. Keep application services stopped while taking the final consistent production export. The production export command is:

   ```powershell
   node scripts/backup-platform-db.mjs --profile=neon
   ```

   This reads the saved URI for the actual platform database, uses a direct source connection and writes a private custom-format dump. `.part` files and the existing standby/test dumps are not production backups.

2. Validate the archive and restore it into a new local recovery database using [the local PostgreSQL procedure](LOCAL_POSTGRES_RECOVERY.md). Do not overwrite the source or the existing staging databases. Apply missing migrations and preserve the original encryption/authentication keys.
3. Compare original/restored accounts, workspaces, Pages, content counts, credentials, schedules, deduplication records and delivery receipts. Check the existing owner's sign-in and both NobleSeek/Fabrything configurations. Retain local media files at their expected paths.
4. Reconcile `publishing`/`unknown` outcomes with the website, Facebook and Instagram before allowing another submission. Missed schedules need new future slots; do not release the entire overdue backlog at once. Check current Page tokens while validating connections.
5. Select the restored local PostgreSQL database as the sole worker primary. Keep Aiven as the cloud recovery/route-registry destination. An Aiven primary is also possible after a validated full import; it is not selected automatically.
6. Restart the matching worker/bridge with queue dispatch initially disabled, then test auth, Page settings, full article edits, calendar and credentials. Deploy the matching Vercel frontend/registry resolver only after its backend is ready. Vercel reaches the worker through the protected HTTPS bridge; local PostgreSQL remains bound to `127.0.0.1:55432`.
7. Resume one reconciled Page queue at a time, confirm website/social receipts, then enable new generation batches. Take a new full backup from the restored primary and verify a separate restore.

The PC must remain awake and online while it hosts the worker and local database. Starting n8n does not replace the Node worker or unlock Neon. The complete public release remains dependent on recovering the existing dataset and validating delivery state.

## Backup utility commands

```powershell
# Encrypt a fresh copy of local environment settings and media (not SQL)
npm run db:recovery:backup

# Verify the existing encrypted archive without extracting it
node scripts/backup-recovery-materials.mjs verify .codex/backups/echolink-local-materials-2026-11-09T05-32-45-571Z.enc .codex/secrets/echolink-recovery-2026-11-09T05-32-45-571Z.key

# Extract to a new private folder; never overwrites the active environment
npm run db:recovery:unpack -- .codex/backups/echolink-local-materials-2026-11-09T05-32-45-571Z.enc .codex/secrets/echolink-recovery-2026-11-09T05-32-45-571Z.key
```

These commands do not send credentials to Neon support, enable publication, change billing or promote a database.
