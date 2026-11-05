# Test EchoLink v2 on the live dashboard

Open **https://echolinkbd.vercel.app/** and sign in with Google. The verified
owner account retains Noble Seek, its feeds, website and encrypted connections.
Normal clients receive their own workspace, with one Page and three publications
in their initial seven days. The owner has a separate private owner package.

## First Facebook publication

1. Open **Pages**. Noble Seek should be verified and enabled. Its posting window,
   daily frequency and gap remain editable. Automatic source-link comments are off.
2. For fresh news, choose **Collect news** on a news Page. Follow **Activity** for
   the collection task. Open the resulting draft, choose **Generate caption** and
   **Design image**, and wait for each task to finish. An Automation can connect
   these steps for subsequent runs.
3. Open **Review queue**, inspect the caption, factual warnings and branded photo.
   Edit as needed, then **Approve** the current version.
4. Choose **Publish Now**, inspect the confirmation and submit it. Publication is
   real. Or choose **Schedule** and a time inside the Page's posting window.
5. Follow the publication task in **Activity**, then check **Published** and the
   actual Facebook Page. A successful task records the Facebook reference.

Editing an approved post requires approval again. A delivery with an unknown
outcome requires checking Facebook and the optional website before retrying;
use **Reconcile** to record the result. Do not repeatedly submit the same post.

## Add a Page with a different niche

1. **Connections → Add connection → Facebook Page**: save that Page's token and
   the supported Graph version. Tokens are encrypted and never shown in state.
2. **Pages → Add Page**: enter its name and numeric Facebook Page ID, select the
   Facebook connection, niche, language and Page type. Select a text model.
3. Save, choose **Verify Page**, and enable it. Configure its own window, daily
   frequency, gap, brand, optional logo and optional website.
4. Use the appropriate content flow:

| Page type | Content flow |
| --- | --- |
| News | Enable RSS aggregation; add sources in News sources; collect, generate caption, design photo, review and publish |
| Ecommerce | Add a Shopify, WooCommerce, JSON catalog or public product website; import Products; create a product post using its actual facts/photo; generate caption and design creative |
| Quotes / education / general creator | Create an original, quote or image post; supply the topic/facts; generate caption; design an image with your chosen ratio, headline and brand |
| Blog / publisher | Create a post and optionally connect WordPress; website publication is a per-Page choice |

Choose a free local Ollama model for captions or configure a cloud provider.
The registry contains thirteen AI tools. Image generation needs an installed
image model or a configured image provider. Branded photo and quote layouts work
without an image-generation service. An available adapter does not mean its
provider has been configured or tested.

## Automate after the first reviewed test

Open **Automations**, add a routine, select a Page, topic, interval and creative
option. Start with review enabled. Automatic publishing requires the Page's
review requirement to be off and the routine's auto-publish option to be on.
Editorial warnings hold the result for review. All routines share the same
Page windows, frequency rules, duplicate records and subscription allowance.

Website publication and Sheets/Airtable logging are optional and selected per
Page. The imported website can publish NobleSeek articles. Select a dedicated
Sheets logging tab before enabling its mirror. Automatic Facebook comments
containing website or source links remain disabled.

## Keep the local inference worker reachable

Vercel hosts the frontend and a protected proxy. The Windows PC hosts the
account API, queue processor, private image files and local models. Keep the PC
awake, online, and Ollama running. To start or repair the worker from the project
root:

```powershell
npm run platform:repair
```

The hidden supervisor restarts the worker/bridge if they exit, checks the public
tunnel, and updates/deploys its address when a replacement tunnel is needed.
Logs are private under `.codex/logs/platform-*.log`. A rotating free tunnel is
suitable for this public test; a permanent authenticated tunnel or always-on
worker is the next hosting step. Vercel alone cannot run the PC's local models.

Web Analytics is enabled for the Vercel project and the React integration is
included. View traffic in **Vercel → EchoLink → Analytics**. URL query strings
are removed before page-view events are sent.

Billing packages and receiving instructions are owner controlled. Real Stripe
merchant checkout, paid image providers, ad spending and YouTube publishing
have not been verified in this release. Ad plans can be saved without spending.
