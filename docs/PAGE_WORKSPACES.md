# Page workspaces and the publishing planner

Open [EchoLink](https://echolinkbd.vercel.app/) and choose a Page in **Working on**.
The Page workspace contains its Content, Calendar, Automation builder, connections,
website and brand settings. Account, billing, shared services and owner controls
appear separately. Use **All Pages** for a portfolio view.

## Schedule and publish

**Content → Publish now** queues the current caption and image. Pages configured
for automatic publishing require no manual approval; the worker authorizes the
exact version internally. If a configured posting gap is occupied, delivery moves
to the next available slot. Editing the caption or image invalidates that version.
Manual-review mode remains an optional preference for other Pages.

**Schedule** can choose the next open slot or accept a date/time in the Page's
timezone. **Prepare calendar slot only** records a proposed time without queuing
delivery. Automatic workflows resume prepared content when its Page is connected;
use **Save draft** to keep an individual post paused. Successful requests close
their dialogs; rejected requests show the error inside the dialog. Background
work continues in Activity and the measured progress panel.

The Calendar has week/month views and preparing/scheduled/published filters. Click
a card to inspect its image and caption; edit, schedule or reschedule from there.
Drag an unpublished card to another day to move its time. Conflicting bookings
are checked on the server. **Fill ready slots** prepares the existing ready backlog.

Posting windows are disabled for the current Pages: both time fields are 00:00.
Daily goals and minimum gaps remain editable in Page settings. A daily target
does not guarantee source availability, model throughput, review or successful
delivery, and is not a Meta-approved safe publishing limit.

## Generation without a draft flood

The Automation builder represents the actual configured pipeline:

`Page source → caption model → branded creative → review → calendar → destinations`

Configure the daily target, check interval, items per batch, pending-draft limit,
automatic slot preparation and publication mode. Source checks are at least
30 minutes apart. A full backlog, filled daily target, pending generation or
exhausted package stops additional generation. Future scheduled publication does
not block a new generation batch. Due publishing has its own queue check so local
model inference does not hold up delivery.

News Pages show RSS sources. Ecommerce Pages show Products. Fabrything uses its
public storefront catalog feed, including actual prices, stock and photos; imports
do not change the website. Its automatic routine prepares product creatives and schedules the final caption and image in the next available slot. Facebook is connected in **Page connections → Facebook**. Paste a User token for automatic Page-token conversion, or paste that Page's access token directly. The form verifies and links credentials in one step; Page settings no longer contains a second Facebook form. Blank token input reuses the selected saved credentials.

Other niches use an explicit content brief.

Imported unsent legacy articles live in **Content → Archive**, preserving their
history and duplicate fingerprints. **Delete** moves an unsent post to Trash and
cancels its queue entry; Restore brings it back as a draft. Published records and
unknown deliveries cannot be silently deleted.

## Connections, branding and delivery visibility

Add connections inside the selected Page. Reuse an existing model through Page
settings; each Page independently chooses its Facebook token, model, image tool,
website and optional logging. RSS settings never appear on ecommerce navigation.
The owner controls visibility of the shared n8n service under **Shared services**;
clients never receive its credentials or unrelated workflow data.

Logos appear on a white badge to keep dark artwork visible. Previously generated
images need **Design image** again to incorporate a changed logo. Delivery progress
shows website publication, Facebook submission/confirmation and saved records as
separate stages. Website publication remains optional; source-link comments stay off.

## Verification

The implementation passes 31 platform tests and 61 existing tests. Real browser
verification covers two Page workspaces, news/ecommerce navigation, creating a
creative, combined approval/scheduling, combined approval/publish queueing, dialog
closure, calendar details, Trash/Restore and mobile overflow. No real Facebook
write is made by those isolated tests. Fabrything's public feed returned 100
importable in-stock products during the read-only integration check.

The Page-centered organization follows the channel filtering and status tabs
documented by [Buffer](https://support.buffer.com/en-us/articles/how-to-use-the-all-channels-view-in-buffer-oqqE4Sdf3T),
and the calendar/review patterns described by [Metricool](https://help.metricool.com/how-to-manage-your-calendar-in-metricool-xhlbw).
The existing approved visual style is retained; 12ui hosted design generation
returned HTTP 403/missing_scope even after reauthentication.

Live verification: 1,269 legacy drafts archived, 100 Fabrything products imported, and the actual local model produced a product caption and branded image with a proposed calendar time. Both Pages have stored logos and unrestricted posting windows. Fabrything still requires its own verified Facebook connection for delivery.


## Automatic publishing per Page

Noble Seek and Fabrything use automatic publishing without manual editorial approval.
Each Page keeps its own model, sources or catalog, website option, daily cap,
minimum gap, branding, calendar and activity. Posting windows remain all day.
Finished generation prepares the image first when required, then schedules the
current version. The worker authorizes that exact version internally; content
edits invalidate it. Editorial warnings remain visible and are recorded in the
automatic authorization audit rather than requesting an approval click.

A disconnected Page can prepare a calendar slot. Once connected and enabled, the
worker resumes prepared posts on its next queue check. Explicitly saved drafts,
archived/deleted posts, failed deliveries and unknown remote outcomes are not
silently retried. Save draft pauses that post; deleting retains its duplicate
fingerprint. Website publishing stays optional; automatic source/link comments
remain disabled.

The Facebook form explains the required permissions, User-to-Page conversion,
Page ID matching and expired-token replacement. Only the derived Page credential
is encrypted at rest. Verification reads Page identity without publishing a test
post. Meta still checks publishing permissions on submission.
