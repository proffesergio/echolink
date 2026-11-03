# Airtable preparation

Use the three original tables and field names. Add these fields before syncing:

| Table | Field | Type / values |
| --- | --- | --- |
| Page Configurations | Active Status | Checkbox; default unchecked |
| Page Configurations | Timezone | Text, e.g. `Asia/Dhaka` |
| Page Configurations | AI Secret Alias | Text; key in `AI_TOKENS_JSON` |
| Page Configurations | FB Secret Alias | Text; key in `FB_TOKENS_JSON` |
| Content Log & Deduplication | Automation ID | Single line text; stable UUID used by Airtable upsert |
| Content Log & Deduplication | Approval Decision | Single select: `Approved`, `Rejected`; initially blank |

Posting Window Start/End must be text fields containing `09:00`, `23:00`, or
`9:00 AM`. Airtable has no native time-only field. Store tokens in local env or
n8n credentials; do not populate `FB Permanent Page Token` in the base.

Status must include `Queued`, `Pending Approval`, `Approved`, `Posted`,
`Skipped (Duplicate)`, `Failed`, `Publishing`, `Publish Unknown`, `Dry Run`,
and `Rejected`. `Skipped (Outside Window)` from the initial proposal is not used:
quiet-hours content stays queued.

Media Attachment URLs must be long text in this version. Linked Page fields must
link to Page Configurations. Timestamp Published must be a date field with time.
Use text for Source Title if titles can exceed the single-line limits in your
base. Give the Airtable token record read/write access scoped to this base.
Run `npm run airtable:setup` to create missing tables and fields through the
Airtable Metadata API. The token needs schema.bases:read, schema.bases:write,
data.records:read and data.records:write access to the target base. The setup
preserves existing tables and records, and stops on incompatible field types.
`airtable/SCHEMA.md`, `airtable/schema.json` and the three CSV templates contain
the complete table definitions. Provisioned IDs are text primary fields;
Timestamp Logged is a writable date/time filled by the worker. If an existing
base uses native createdTime, setup preserves it.

Approve by opening a mirrored `Pending Approval` record, checking the caption,
source and media, then setting Approval Decision to `Approved`. Set `Rejected`
to discard it. Page-wide approval is controlled by Require Human Approval. Only
approved caption hashes are eligible for publishing when that flag is enabled.

New rows start with Active Status unchecked. Set a reachable local model URL,
an installed model ID, language, daily cap, posting hours, FB page ID and token
alias before enabling a page. Add the source and article hosts to
`ALLOWED_SOURCE_HOSTS`. External RSS/article requests require HTTPS and do not
follow redirects; supply a final feed URL or a separate fallback URL.
