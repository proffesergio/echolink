# Using the EchoLink dashboard

The dashboard uses the approved Omniroute-inspired charcoal/coral layout across
all 13 views. The public frontend controls the worker on your Windows PC; it does
not move n8n or local AI inference into Vercel.

## Connections

Choose **Connections** to manage the provider catalog. Search by name, select a
category, or turn on **Configured only**. Counts reflect the actual inventory:
12 available adapters and four planned integrations. Planned adapters have no
runnable controls.

Click **Configure** or **Resolve** to open a provider drawer. Close it with the
close button or Escape. Unsaved form changes require confirmation before closing.
Keyboard focus returns to the provider card.

| Provider | Controls |
| --- | --- |
| Facebook Pages | Save a token alias/version, reconnect using the server-side long-lived exchange, inspect token/data-access expiry, test Page permissions |
| n8n | Inspect schedule state, test API access, explicitly unlock/verify a replacement key, repair the minute trigger, Start/Stop |
| Google Sheets | Spreadsheet/tab, service-account JSON, connection test and log sync |
| Airtable | Base ID and private token; test Page/feed access |
| Neon PostgreSQL | Pooled/direct connection credentials; test the existing schema |
| Ollama, LM Studio, LocalAI | Discover models for configured engines, optional authentication aliases, link to per-Page model settings |
| Neon AI Gateway | Private gateway credential and base URL, plus per-Page model configuration |
| Local embeddings | Endpoint/model/authentication, threshold, TTL and optional semantic skipping |
| NobleSeek website | Enable optional delivery for selected numeric Facebook Page IDs, website/API/schema/category settings, private database credential and connection test |
| Slack approvals | Save or disconnect the private incoming webhook; no test notification is sent |

**Saved** means configuration exists. **Verified previously** includes the date
of the Facebook verification. **Running** uses n8n's recorded schedule tick.
**Test passed** is the result of a manual test in this browser session. **Needs
attention** identifies a failed check or recorded delivery problem. A successful
model-discovery request does not prove inference quality.

**Test all configured** runs supported read-only connection checks sequentially.
Individual failures remain visible; they do not become a blanket success. The
tests do not publish posts, sync spreadsheet rows, generate articles or send
notifications. A valid Facebook test may clear an existing authorization pause,
allowing the separately running schedule to resume its usual work.

Secret inputs remain blank; leave them blank to retain the existing value.
Saving general settings cannot replace the n8n API key. That key requires
**Replace n8n API key → Verify & save n8n key** and a successful worker-side check.

Website publication and Facebook link comments are separate choices. Changing
website settings does not enable link comments. The owner's automatic-comment
policy remains disabled. Requiring website success before Facebook is an
explicit optional setting; enable it only when that dependency is intended.

## Editorial and scheduling views

- **Overview:** generate a review-only draft and inspect current work.
- **Operations center:** upcoming publications, Page restrictions and run results.
- **Review queue / Drafts:** edit caption, editorial notes and selected photo;
  approve, save draft, schedule or Publish Now using the existing controls.
- **Scheduled:** calendar reservations and available-slot suggestions. Due posts
  still follow the Page timezone/window, daily cap, minimum gap and real Meta
  restrictions. Items over six hours late return to Draft for freshness review.
- **Published:** actual Facebook references, website delivery and comment state.
- **Activity:** measured stage percentages, heartbeats, output and blocking reasons.
- **Pages & models / News feeds:** Page-specific AI/rules and RSS/fallback sources.
- **Workflow / Settings / Getting started:** schedule control, runtime preferences
  and setup instructions.

On phones, use **Open navigation** to choose a view. Menus and drawers work by
keyboard; reduced-motion preferences are respected. Progress percentages count
completed stages or feeds, not a prediction of how long local inference will take.

## Verification

`npm run verify:redesign` checks all 13 views at desktop and phone widths,
navigation, actual provider counts, filters, planned controls, drawer keyboard
behavior, secret isolation and partial test failures. It defaults to a separately
started local preview at port 18792. To use the normal running worker:

```powershell
$env:CMS_TEST_ORIGIN='http://127.0.0.1:8787'
npm run verify:redesign
```

The verifier logs in with local credentials and reads actual state, then
intercepts test writes. `npm run verify:cms` covers editorial/calendar controls;
`npm run verify:password-ui` uses a temporary worker to verify key/password saves.
