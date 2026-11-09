# Client showcase and private trial

## Share the experience

Public showcase: **https://echolinkbd.vercel.app/demo**.
The sample workspace opens at `/demo/workspace` after entering its public demo
credentials. The landing page also displays and prefills them:

```text
Email: demo@echolink.example
Password: ExploreEchoLink!
```

These are public sample-access values, not a server account or production
password. They never authenticate to the creator API. No customer account,
database row or owner credential is created for them.

The demo is a separate client entry. It does not mount the real dashboard,
request `/api/state`, start identity checks or poll the worker. It continues to
work when the publishing worker is offline. Existing account cookies are not
used to load content into the sample workspace.

The optional contact form at `/demo#contact` submits a real inquiry to the
owner inbox. Unlike the sample workspace, sending that form requires the
backend. Email and WhatsApp links remain available when it is offline. See
[batch operation and support](GENERATION_BATCHES.md) for delivery behavior.

## What visitors can try

- Three fictional, independent brands: ecommerce, news and creator content.
- English, Bangla and bilingual template captions, with distinct channel copy.
- Product-aware illustrated creatives, editable headlines and design palettes.
- Caption editing, SVG download, future-date scheduling and a content calendar.
- Simulated publication, post deletion, per-Page sample connections and activity.
- A reset action, responsive layouts, keyboard-operated dialogs and reduced
  motion support.

Sample status changes and generated templates are labelled throughout. No
news is fetched, AI provider is called, or post is sent to Facebook, Instagram
or a website from this experience. No tokens should be entered there.

Each tab stores only its own sample state in `sessionStorage`, under a demo
namespace. Storage is bounded to 50 posts and 40 activity entries. If storage
is unavailable, the UI remains usable and explains that reload will reset it.
Production data is never the fixture source.

## From demo to a real account

The trial buttons open `/?signup=1&from=demo`, which selects the real signup
form. Clients must create their own account and complete verification; demo
credentials grant no access. The existing server-side trial allowance remains
one Page and three publications in the initial seven-day period.

Client setup is explained on `/demo#setup`:

1. Sign up using email or an available Google sign-in identity.
2. Finish onboarding and choose the Page's niche, type and language.
3. Add and verify a Facebook Page they manage. Optionally connect its supported
   professional Instagram account.
4. Add a store for ecommerce, trusted feeds for news, or a creator brief.
   Website publication is optional on every Page.
5. Configure an available generation connection or arrange assisted setup.
   A trial account does not automatically provision a paid provider or grant
   access to the owner's AI connections.
6. Prepare and check a draft and image; test the connection, then publish or
   schedule within the active plan. Enable automatic routines after the first
   successful end-to-end test.

Real generation and delivery continue to depend on the configured backend and
provider availability. This showcase does not migrate those services to Vercel.

Before inviting clients, the owner should verify SMTP delivery, Google consent
audience/test-user settings, and Meta access for customer-owned Pages. A working
owner Page token is not proof that every outside account has app access. The
demo itself does not require these permissions or consent steps.

## Presentation and confidentiality

The showcase focuses on benefits, working capabilities and customer setup.
It contains no owner Page identifiers, inference hostnames, actual model
settings, private prompts, tokens or database details. Public access errors no
longer need to instruct visitors to start the operator's local inference stack.
The roadmap explicitly separates planned Reels, YouTube and visual-builder
features from current capabilities.

Source repository visibility is a separate control: UI confidentiality does
not make source files confidential if they are published in a public repository.

The demo has its own HTML metadata, canonical URL and PNG social-share card.
Set `VITE_PUBLIC_ORIGIN` at build time if deploying under another domain.

## Verification

```powershell
npm run build --prefix platform
npm run test:demo --prefix platform
npm run test:unit --prefix platform
npm run build
```

The demo browser test uses a temporary static server with no backend. It checks
editing, download, past-date rejection, scheduling, modal closure, tab isolation,
per-Page connection isolation, simulated publication, deletion and mobile
layouts. It asserts zero production API requests and no JavaScript errors.
It also verifies the private signup entry with intercepted authentication reads.
Screenshots are saved privately under `platform/.local/verification/`.

For hosting decisions, see [Vercel backend options](VERCEL_HOSTING.md).
