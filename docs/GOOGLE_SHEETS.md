# Connect the EchoLink Google Sheets post log

The connection form is in **Connections → Google Sheets post log**. The worker
keeps Airtable and the dashboard, and can additionally mirror drafts, scheduled
posts, confirmed publications and other article states to one dedicated sheet
tab. A sheet is not connected until you complete your Google account steps.

## Your account steps

1. Create a spreadsheet in Google Sheets under your own Google account, e.g.
   **EchoLink editorial log**. Keep it private; copy its URL.
2. In Google Cloud Console, select/create a project and enable **Google Sheets
   API** for it.
3. Under **IAM & Admin → Service Accounts**, create a service account for this
   integration. You do not need domain-wide delegation or a broad project Owner
   role to edit a spreadsheet that you explicitly share with this account.
4. On the service account's **Keys** tab, create/download a JSON key. If your
   organization disallows key creation, ask its administrator for an approved
   authentication method; do not disable organization policy just for this form.
5. Copy the `client_email` from that JSON. In the spreadsheet's **Share** dialog,
   add this exact email as **Editor**. Do not enable public link editing.

## Save and test in EchoLink

1. Open dashboard **Connections → Google Sheets post log**.
2. Enter the spreadsheet URL or its ID (the part between `/d/` and `/edit`).
3. Use the tab name **EchoLink Posts**, or another new dedicated tab. The worker
   creates this tab on the first sync if it is missing. It will not overwrite an
   unrelated existing header.
4. Paste the service-account JSON into **credentials** and save. The private key
   is saved only in the local worker's `.env.local` and is never returned to the
   browser. Leave the input blank on later saves to retain it. Keep the downloaded
   file out of source control and shared folders; rotate the key if disclosed.
5. Click **Test Sheets connection**. This reads spreadsheet metadata and confirms
   access; it does not publish a Facebook post or create a post draft.
6. Click **Sync Sheets now**. It creates the dedicated tab/header when needed
   and writes current article records.

For environment-based setup, the same local variables are:

```dotenv
GOOGLE_SHEET_ID=your-spreadsheet-id
GOOGLE_SHEET_TAB='EchoLink Posts'
# Single-line JSON, preserving JSON's escaped \n characters in the private_key.
# Prefer the dashboard form to avoid dotenv quoting mistakes.
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","client_email":"...","private_key":"..."}'
```

Restart the worker after editing `.env.local` manually. The dashboard form applies
changes immediately. These are server-only credentials; do not copy them into
Vercel frontend assets or NEXT_PUBLIC_/VITE_ variables.

## What is synchronized

Each row starts with its immutable **Automation ID**. The worker finds that ID
and updates its existing row instead of appending another row each time status
changes. A draft can therefore move through Drafts → Scheduled → Published on
the same row. State and remote post/comment IDs remain explicit; a dry-run is
never labeled as a real Facebook publication.

The 19 columns are Automation ID, Page, Panel, Status, Source title, Source URL,
Source published at, Caption, Image URL, Image suggestion, Analysis, Selection
score, Selection reason, Scheduled at, Published at, FB post ID, Comment status,
Comment ID, and Updated at.

- **Drafts** includes captions awaiting approval and completed dry-run captions.
- **Scheduled** means approved and waiting for the chosen time or the next
  eligible posting window. Page windows, caps and minimum gaps still apply.
- **Published** requires a confirmed Facebook post ID.
- Queued raw articles are labeled **News inbox** until a caption exists.

The normal **Update dashboard & review queue** n8n stage runs this mirror as well
as Airtable. There is no second n8n OAuth credential to configure for this adapter.
Sheets sync is attempted before Airtable mirroring, so an Airtable write failure
does not stop the Sheets attempt. A Sheets error is reported without blocking
Airtable. The next sync retries unsynchronized article versions. Changes made
just after a mirror, such as an edit/schedule/approval, appear on its next tick or
when **Sync Sheets now** is clicked.

Use the dedicated tab as an output log, not a second approval/control database.
Editing cells does not edit the dashboard or authorize publishing. Keep the
header and Automation IDs intact; do not sort just one column or insert your own
rows into the worker-owned table. Use filter views, other tabs or charts for
analysis. Duplicate Automation IDs or an unexpected header cause a safe sync
failure rather than guessing which row to overwrite. Cell values are written
with `RAW` input mode, so captions beginning with `=` are not evaluated as formulas.

## If connection/sync fails

Check that Sheets API is enabled in the service account's project, the complete
JSON key was pasted, the sheet was shared with its exact email, the spreadsheet
ID is correct and the dedicated tab has the expected header. Activity shows sync
failures. No real Google write can be verified before you supply and authorize
this connection.

Official references:
[service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account),
[Sheets read/write values](https://developers.google.com/workspace/sheets/api/guides/values).
