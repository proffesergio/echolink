# Buffered generation and lightweight publishing

## Operating decision

Keep the creator API, calendar and publisher available. Put expensive generation
on a demand-based batch cycle, and unload its Ollama model after idle activity.
Stopping the entire worker would also stop scheduled posts, website publication,
Instagram processing, comments and account APIs on the current installation.

The PC must remain awake while it hosts publication. An always-on cloud worker
can later publish prepared content while this PC sleeps; migration and shared
assets remain separate work.

## Batch cycle

1. Inspect the Page's actual calendar reservations and publishing rules.
2. If an unfilled slot is within the refill lead time, start a refill with a
   fixed endpoint: current time plus the configured number of hours.
3. Prepare small sequential batches, respecting the backlog, plan allowance,
   Page daily goal, posting gap and configured approval mode.
4. Stop when those slots are filled or a limit blocks further work. Keep the
   publisher available for booked content.
5. Release a worker-used Ollama model after approximately 30–45 idle seconds.
   Load it again when another generation request needs it.
6. Check calendar demand again at the calculated next check. Idle buffered
   routines check at most every 15 minutes; active refills check about once per
   minute while preventing duplicate preparation tasks.

The endpoint stays fixed during a refill. A moving target could keep slow
generation running indefinitely. The horizon starts when the refill starts,
so the remaining coverage when it finishes depends on preparation time.

An isolated post far in the future does not count as continuous coverage:
the planner checks the next available slot against actual reservations.
Unsent drafts without calendar reservations do not fill the buffer. Held
review slots remain reserved, and human approval is still required when that
Page has it enabled.

## Initial Page settings

| Page | Generation mode | Prepare ahead | Refill lead | Existing frequency |
| --- | --- | --- | --- | --- |
| Noble Seek | Buffered | 2 hours | 45 minutes | 100 daily target, 5-minute minimum gap |
| Fabrything | Buffered | 6 hours | 120 minutes | 10 daily routine target, 10-minute minimum gap; spread scheduling |

These are per-Page settings under **Automation builder → Configure workflow**.
The existing daily caps and posting frequencies are retained. Buffering does
not guarantee that a configured post count is suitable for Meta distribution.
Explicit manual/urgent generation remains available outside the automatic
buffer cycle.

Source exhaustion or failed preparation returns the routine to its source
cooldown. Existing transient retry limits remain in effect. Empty product
imports do not request another immediate import. A model failure does not
trigger continuous new draft creation.

## What the measurement means

On 8 November 2026, this Windows PC reported 11.9 GB RAM with approximately
0.2 GB free during inference. Ollama's `llama-server` working set was about
4.36 GB. The last 24 hours contained 31 completed caption tasks averaging
131 seconds, plus average news aggregation of 19 seconds and creative tasks
of 6 seconds. These are observed task timings, not capacity guarantees.

At that caption rate, 24 drafts alone need about 52 minutes of serial work.
Preparing content while existing posts publish reduces the remaining coverage.
If the queue drains faster than generation can refill it, increase the lead
time or reduce the content rate. Switching orchestration tools does not make
the model faster. Initial buffer filling can keep inference busy for a while.

The idle manager tracks only models used through the current worker. It does
not stop Ollama's server, remove model files, terminate other applications or
unload other providers' models. It never unloads an active tracked request;
new requests wait for an in-progress unload to finish. A failed unload is
retried later. Models used independently by other applications should be
managed separately.

Operator setting in `platform/.env.local`:

```dotenv
PLATFORM_INFERENCE_IDLE_SECONDS=30
```

The supported range is 5–600 seconds. The periodic check adds up to 15 seconds
before release. This does not lower peak model RAM or provide a GPU quota.
Ollama's native API supports `keep_alive: 0` for unloading:
[chat API](https://docs.ollama.com/api/chat),
[model memory controls](https://docs.ollama.com/faq).

## Contact and support

The demo now includes a contact form, WhatsApp links to **+8801353529899**,
and **support@fabrything.com**. The footer contains copyright information and
an animated developer credit linking to **https://billsbro.vercel.app**.
Animations respect reduced-motion preferences.

Messages are saved in the owner-only **Owner console → Inquiries** inbox.
When SMTP is configured, a notification is submitted to the fixed support
address, with the visitor's email as Reply-To. A stored inquiry remains
available if email submission fails. The UI does not claim inbox delivery.
No test notification is sent during automated verification.

The form requires contact consent, validates input, ignores honeypot submissions,
suppresses identical messages for ten minutes, and caps a sender at three
messages per hour and total submissions at 100 per day. Owner inbox reads are
paginated and loaded only when opened. Non-owner tenants cannot read them.

The landing page and sample workspace remain independent of the worker. The
contact form uses the current backend, so email and WhatsApp remain visible
alternatives when that service is unavailable.
