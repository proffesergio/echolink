# Facebook Page token: from My Apps to EchoLink

Use this guide for your own Page. Never paste a token into chat, a public URL,
GitHub or a third-party token checker. Save it only in EchoLink Connections.

## 1. Open the token tool

**My Apps lists apps; it does not have a general Page-token section.** Open
[Graph API Explorer](https://developers.facebook.com/tools/explorer/) directly
or use Meta for Developers → Tools → Graph API Explorer. Select your app in
the Meta App selector. Stay signed in as the Facebook account that controls
the target Page and has the required role in this app.

Meta's interface differs by app type/use case. If your app cannot request Page
permissions, return to its dashboard and add/configure the Page-management
use case and Facebook Login / Facebook Login for Business offered for that
app. An Instagram-only or WhatsApp-only setup does not grant Facebook Page
posting permissions. If the needed use case cannot be added to this app, create
an app with Page-management support; do not delete the existing app or Page.

## 2. Generate a User token with Page permissions

### If Explorer only offers Ads permissions

A list containing `ads_management`, `ads_read`, `business_management`, `pages_manage_ads`, `pages_show_list` and `pages_read_engagement` is insufficient for publishing posts. `pages_manage_ads` does not replace `pages_manage_posts`.

1. Open **My Apps → your app → Use cases → Add use cases**, if offered.
2. Look under **Content management** or the Page-management category for **Manage everything on your Page**. Open **Customize → Permissions and features** and add `pages_manage_posts` and `pages_manage_engagement`, retaining the required Page read/list permissions.
3. If the existing app cannot add that use case, create a separate app supporting Page management. Keep the current app and Page; do not delete them. Select the new app in Graph API Explorer afterward.
4. Follow any dependencies, app-role, Page-access, login-configuration or review requirements shown by Meta. Menus and available use cases depend on the account/app; changing an Ads token string cannot unlock an unavailable permission.
5. Generate a **new User token after adding the permissions**, authorize the actual Page, then rerun `me/accounts?fields=id,name,access_token,tasks`. Copy the returned Page token, not a token from an earlier response.
6. Save it under the Page's existing alias and run **Test Facebook connection**. EchoLink now checks the token's granted scopes as well as Page identity; an identity-only connection no longer passes as publishing-ready.

Meta's [Pages app use-case guide](https://developers.facebook.com/docs/development/create-an-app/pages-use-case/) may require login or return rate-limit errors. Follow the requirements shown in your own app dashboard rather than requesting unrelated Ads permissions.

In Explorer's token panel, choose **User Token / Get User Access Token** under
User or Page. Add the permissions offered by your app:

| Permission | EchoLink use |
| --- | --- |
| `pages_show_list` | Discover the Pages you authorized |
| `pages_read_engagement` | Page/post information required by Page operations |
| `pages_manage_posts` | Publish the Page's posts/photos |
| `pages_manage_engagement` | Send the delayed source-link comment as the Page |
| `read_insights` | Optional later Page-insights integration |

Click **Generate Access Token**, complete Facebook's consent dialog, and
explicitly select your Page. If consent has an **Edit settings** / Page-selection
step, check the Page there. Request only permissions needed for your app.

For initial development testing, use an account with an app role and the
required Page access/tasks. App Review/advanced access and business verification
can be required when serving other users/Pages; a development token is not a
substitute for those production requirements.

## 3. Get the actual Page token and numeric Page ID

Using that **User token**, select GET in Explorer and submit:

```text
me/accounts?fields=id,name,access_token,tasks
```

Find the object whose `name` is your Page. Copy its:

- `id` → numeric Facebook **Page ID**.
- `access_token` → **Page access token** for that Page.

The User token at the top of Explorer and the Page token returned inside this
object are different credentials. EchoLink needs the Page token. The app ID,
business portfolio ID, Page username and profile URL are not the Page ID.

Explorer may also offer **Get Page Access Token** and a Page selector. If it
does, select the target Page. The `/me/accounts` response remains useful for
checking which Page/token pair you are saving. For a known Page ID, Meta also
documents requesting its `access_token` field using the authorized User token.

Official Meta example:
[Get access tokens of Pages you manage](https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage).

## 4. Save in EchoLink

Open https://echolinkbd.vercel.app/admin → **Connections → Facebook Page token**:

| Form field | Enter |
| --- | --- |
| alias | `primary-page` |
| graphVersion | The version currently selected in Explorer, including `v`, in `vNN.N` format |
| value | The `access_token` from the target Page's object |

Click **Save Facebook token**. Then open **Pages & models**, choose the Page:

- **FB Page ID**: the numeric `id` from the same object.
- **FB Secret Alias**: `primary-page` (must match exactly).
- Keep **Require Human Approval** enabled.
- Save the Page, then click **Test Facebook connection**.

The test calls `me?fields=id,name`, compares the returned Page ID and inspects
the token with `debug_token`. Publishing requires a valid Page token with
`pages_manage_posts` and `pages_read_engagement`; source comments additionally
need `pages_manage_engagement`. It reports missing permissions without publishing
anything. Successful checks can clear a prior token/permission pause; policy
restrictions and server cooldowns remain protected. Credentials apply when
saved through the dashboard. Manual `.env.local` edits need a worker restart.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No token section in My Apps | Open Graph API Explorer directly; tokens are generated in that tool. |
| Page permissions missing in Explorer | Select the intended app; check its use case, login product and permissions available to your app role. |
| `/me/accounts` returns an empty `data` array | Confirm Page control/tasks, app role, selected Pages in consent and `pages_show_list`. Check business asset assignments when using a portfolio. Do not remove your Page from its business just to force token discovery. |
| ID/name test identifies your person | A User token was saved; replace it with the Page object's token. |
| No saved token for alias | The Page's FB Secret Alias must exactly match the alias in Connections. |
| Missing API version | Save `graphVersion` alongside the token using Explorer's currently supported version. |
| Permission error publishing/commenting | Inspect the token's granted permissions, Page tasks and app access level. Posting and commenting require separate capabilities. |

Use Meta's [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)
to inspect validity, app, granted permissions and expiration. For longer-running
automation, use Meta's supported long-lived user/Page-token flow or an eligible
business system-user setup. Do not assume a copied test token is permanent:
tokens/access can be revoked by account, app, permission and business changes.
Never put an app secret into the public frontend to exchange tokens.

After connection passes, follow [FIRST_FACEBOOK_POST.md](FIRST_FACEBOOK_POST.md)
and [EDITORIAL_OPERATIONS.md](EDITORIAL_OPERATIONS.md). DRY RUN remains enabled
until you deliberately change it; saving a token alone does not enable posting.
