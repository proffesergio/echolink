# Connect the store to Meta’s product catalogue

EchoLink’s Product catalogue now exports the connected website’s real product data for Meta Commerce Manager. This is independent of posting promotional images to a Facebook or Instagram feed.

## First import

1. Select **Fabrything → Product catalogue** in EchoLink. Refresh the website import first if prices or stock have changed.
2. Click **Download Meta CSV**. The export includes all imported products for this Page’s website, including out-of-stock products with their stock status. It uses stable website product IDs, original product photos and `BDT` prices, not generated advertising artwork.
3. Open [Commerce Manager](https://business.facebook.com/commerce/) using an account with catalogue administration access. Select or create the catalogue for the correct business.
4. Under **Catalogue → Data sources → Add items**, select a data feed and upload the CSV. Meta’s labels may vary by account.
5. Review Meta’s import diagnostics. Supply genuine brand/product identifiers where requested; EchoLink does not invent GTINs, brands or category codes.
6. Connect the catalogue to the correct Facebook Page and Instagram business account where available. Catalogue import does not guarantee shop, checkout or product-tagging eligibility; these depend on Meta’s account, market and commerce policies.

## Scheduled imports

Click **Set up scheduled feed** in EchoLink and paste the private HTTPS URL into Meta’s scheduled data-feed setup. Choose a daily fetch initially. No Facebook Page access token belongs in this URL.

The link grants read-only access to this Page’s product feed. Keep it private. **Replace private feed link** invalidates the old URL immediately; update Meta’s saved URL too. **Disable feed** revokes access. Each Page has independent settings, and products are restricted to its connected website.

The worker must be reachable when Meta fetches the URL. The feed reads EchoLink’s last successful website import; it does not query the website on every Meta request. Check the displayed import timestamp and refresh the website catalogue when inventory changes. This is not yet a real-time stock webhook integration.

Products without public HTTPS product/photo links, positive prices, currency, titles or descriptions are excluded with a visible explanation. Do not replace a populated Meta catalogue’s existing feed until you have checked the IDs: changing IDs can create duplicate items. EchoLink currently exports the products already imported into its library; it does not claim to have crawled every page of an external store.

## What needs your Meta login

Selecting/creating a catalogue, granting business permissions, accepting commerce terms, assigning the Page and reviewing eligibility require your Meta account. A working Page publishing token alone does not grant catalogue administration. This release prepares a CSV and scheduled feed; it does not automatically create Meta catalogues or campaigns, enable billing, or spend on ads.

Official reference: [Meta catalogue data-feed specifications](https://www.facebook.com/business/help/120325381656392). Meta may require signing in to view it.
