# Can EchoLink's backend run on Vercel?

Assessed 8 November 2026. **Yes. n8n is not the constraint.** The current
implementation combines an HTTP API, continuously polled task queues,
generation, publishing and machine-local assets. Its Vercel API is currently a
protected proxy, not a migration of that application backend.

## Current Vercel options

| Component | Suitable hosting approach | Required EchoLink work |
| --- | --- | --- |
| Public demo and dashboard assets | Vercel static delivery | Demo route, metadata and frontend build |
| Login, Page configuration, queue writes and reads | Vercel Node Functions | Extract request handlers from the listener and worker startup; preserve identity, workspace permissions and secrets |
| Continuous task processing | Vercel Daemons or another worker host | Container entry, Linux dependencies, graceful shutdown and external assets |
| Durable multi-stage jobs and delayed actions | Vercel Workflows/Queues | Explicit steps and waits, replay-safe business operations and delivery reconciliation |
| Images and creative files | Durable object storage | Replace Windows paths and verify every migrated asset |
| AI inference | A separately reachable inference service/provider | Authenticated access, capability checks and availability handling |

Vercel's current documentation supports continuous processes through
[Daemons](https://vercel.com/docs/daemons), including Hobby within quotas. A
blanket statement that Vercel cannot host workers is outdated. Daemons do not
accept inbound HTTP or provide persistent local storage; serve API traffic
through Functions/Services and store files externally.

The [daemon limits](https://vercel.com/docs/daemons/limits) currently give Hobby
1 or 2 GiB instance sizes, 420 GB-hours of provisioned memory and five active
CPU-hours monthly. Memory usage accrues while idle. At 1 GiB continuously,
420 GB-hours lasts about 17.5 days, before allowing for other use or CPU limits;
it does not cover a 30-day always-on worker. Reaching the quota stops daemons.

Ordinary [Functions](https://vercel.com/docs/functions/limitations) have a
300-second maximum on Hobby with Fluid Compute. Moving `setInterval` loops
into a request handler does not create a persistent scheduler. Vercel
[Workflows](https://vercel.com/docs/workflows) can persist multi-step progress
and waits, but integrating that execution model is application work.

Scheduling products also differ. Legacy Hobby
[Cron Jobs](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) are
daily, whereas the newer beta
[Schedules](https://vercel.com/docs/schedules/limits) permit a 15-minute minimum
recurring interval with a 15-minute jitter window on Hobby. Neither should be
advertised as a direct replacement for our current five-minute posting cadence.

Finally, [Hobby's terms](https://vercel.com/docs/plans/hobby) restrict it to
personal, non-commercial use. A platform serving business clients needs a
suitable commercial hosting arrangement, even if its traffic is small.

## Recommended migration boundary

1. Keep the independent demo available on Vercel. It needs no worker, database
   or inference connection.
2. Separate the application API from `startWorker()` and the HTTP listener.
   Port identity callbacks, database access and request protections as actual
   server handlers rather than forwarding everything through the PC.
3. Move existing assets to durable storage before changing the worker host.
   Preserve encryption keys and check tenant-scoped signed media access.
4. Choose a commercial Vercel daemon or another always-on worker host, or
   deliberately refactor jobs into durable workflows. Keep one publishing
   owner until leases, fencing and failover are tested.
5. Connect the chosen inference service securely. Putting an API on Vercel
   does not move a model or image renderer off its present machine.
6. Test interrupted generation, scheduled publication, website-first receipts,
   Instagram processing and delayed comments before switching production.

The demo release enables no daemon, billing upgrade, queue migration or new
publishing owner. Live generation and publication still use the existing worker.
