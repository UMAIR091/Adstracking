# Meta App Review — submission package

Everything needed to submit ReportFlow for Meta App Review, written against the
Permissions Reference as published on 2026-07-31.

**App:** Report Flow — `1066499872598790`
**Console:** developers.facebook.com (owner: Ali Umair)
**Redirect URI:** `https://tryreportflow.com/api/meta/callback`

---

## 0. Blockers — read first

### 0.1 There are no Meta assets to demonstrate

Both connections were made and then never synced, because the Graph API
returned **empty asset lists** for this user:

| Source | Connected | `accounts` | Sync |
|---|---|---|---|
| `meta_ads` | 2026-07-04 | `[]` | never — "No ad account selected" |
| `instagram` | 2026-07-11 | `[]` | never — "No account selected" |

Meta requires a **screencast showing each permission returning real data**.
With no ad account and no Instagram professional account linked to a Facebook
Page, that screencast cannot be produced, and the submission will be rejected.

**Required before submitting:**

1. **A Meta ad account** inside a Business Manager, with at least one campaign
   that has delivered — enough for `/insights` to return non-zero spend,
   impressions and clicks. A campaign that ran for one day on a small budget is
   sufficient; the reviewer checks that data flows, not that it is large.
2. **An Instagram professional (Business or Creator) account linked to a
   Facebook Page** that the submitting user administers. `instagram_basic` and
   `instagram_manage_insights` reach Instagram *through* the Page — a personal
   Instagram account cannot satisfy them.

### 0.2 Both stored tokens are dead

Both connections now fail with *"An active access token must be used to query
information about the current user."* They must be reconnected once the assets
above exist. Meta long-lived tokens last ~60 days and these were issued 2026-07-04
and 2026-07-11.

### 0.3 Business Verification is mandatory

The Permissions Reference states plainly: *"Business Verification – is required
for all apps making requests for Advanced Access."* Every permission below is
Advanced Access. This requires legal business documents (registration
certificate, utility bill or bank statement showing the business name and
address) submitted in Meta Business Manager. Only the business owner can do
this, and it can take several days.

---

## 1. Permissions requested, and what the code does with each

Requested in `src/lib/integrations/oauth/meta.ts` (Ads) and
`src/lib/integrations/oauth/instagram.ts` (Instagram).

| Permission | Requested by | Endpoint actually called |
|---|---|---|
| `ads_read` | Meta Ads | `/{ad-account}/insights` — spend, impressions, clicks, CTR, CPC, reach, conversions; totals, previous period, daily series, per-campaign |
| `business_management` | both | `/me/adaccounts` for accounts owned via Business Manager |
| `pages_show_list` | Instagram | `/me/accounts` — find Pages the user manages |
| `pages_read_engagement` | Instagram | `/me/accounts?fields=instagram_business_account` — resolve Page → linked IG account |
| `instagram_basic` | Instagram | `/{ig-user}?fields=username,followers_count,media_count,profile_picture_url` and `/{ig-user}/media` |
| `instagram_manage_insights` | Instagram | `/{ig-user}/insights` — reach, follower_count, profile_views, website_clicks; per-media saved/shares; `/stories` |

**Dependency gap to decide before submitting.** Meta lists `instagram_basic`
dependencies as `pages_read_user_content` + `pages_show_list`. ReportFlow
requests `pages_show_list` and `pages_read_engagement` but **not**
`pages_read_user_content`, because it never reads Page-posted content — it reads
Instagram media through the IG endpoints. Meta also warns that *"selecting
unneeded permissions is a common reason for rejection."* Recommendation: submit
without it, and add it only if the reviewer asks. Do not pre-emptively request a
permission the product does not use.

---

## 2. Use case descriptions (paste verbatim)

Each is written to answer the specific question Meta's Permissions Reference
says that permission's submission must answer.

### ads_read

> ReportFlow is a white-label client-reporting tool for small marketing
> agencies. Agencies connect the Meta ad accounts of the clients they manage,
> and ReportFlow generates the recurring performance report those agencies
> deliver to those clients.
>
> We call the Ads Insights API on the ad account the user selects and read
> spend, impressions, clicks, CTR, CPC, reach and conversions — as period
> totals, as a daily series, and broken down per campaign. These appear in the
> "Paid advertising" section of the generated report: headline metrics with
> period-over-period comparison, a daily spend and clicks trend chart, and a
> campaign performance table.
>
> Example: an agency managing paid social for a retail client connects that
> client's ad account, and each month ReportFlow produces a branded PDF showing
> the client what their budget delivered. Without ads_read the agency would
> export those figures from Ads Manager by hand every month.
>
> Access is read-only. We never create, modify or pause campaigns. Data is
> stored only for the agency that connected it, is visible only to that agency,
> and is deleted immediately when they disconnect the source.

### business_management

> Requested as a dependency of ads_read.
>
> The agencies using ReportFlow do not own the ad accounts they report on —
> those accounts belong to their clients and are shared with the agency through
> Meta Business Manager. business_management lets us enumerate the ad accounts
> the signed-in user can access via `/me/adaccounts` so the agency can pick the
> right client account to report on.
>
> Without it, ad accounts held in a Business Manager are invisible to the app
> and the agency cannot select the account they were hired to report on. We only
> read the account list. We do not claim ad accounts, create assets, or make any
> write call to the Business Manager API.

### pages_show_list

> Requested as a dependency of instagram_basic and instagram_manage_insights.
>
> Instagram professional accounts are reached through the Facebook Page they are
> linked to. To find the Instagram account an agency wants to report on, we first
> list the Pages the signed-in user manages via `/me/accounts`, then resolve the
> Instagram Business account linked to the chosen Page.
>
> We use the Page list solely to locate linked Instagram accounts and to present
> the user with the choice of which one to report on. We do not post to, manage,
> or read the content of any Page.

### pages_read_engagement

> Requested as a dependency of instagram_basic and instagram_manage_insights.
>
> We read the `instagram_business_account` field on the Pages the signed-in user
> manages, which is the only supported way to resolve a Page to the Instagram
> professional account linked to it. That linkage is what lets an agency select
> the correct client Instagram account.
>
> This is the entire use: resolving Page → linked Instagram account. ReportFlow
> does not read Page posts, photos, videos, events or follower data, and never
> publishes to a Page.

### instagram_basic

> ReportFlow reads the following Instagram professional account profile
> information: username, profile picture, follower count and media count, plus
> the account's media objects (caption, media type, permalink, timestamp,
> like count and comment count).
>
> In the product this appears in the Instagram section of the client report and
> on the client dashboard: a profile header showing the account's username,
> picture and follower count, and a "Top content" table listing the account's
> best-performing recent posts. The same data is rendered into the branded PDF
> the agency sends its client.
>
> Access is read-only, limited to accounts the signed-in user explicitly
> connects, and the stored copy is deleted when they disconnect.

### instagram_manage_insights

> Agencies are hired to report on how a client's Instagram presence performed,
> which is exactly the data this permission covers.
>
> We call `/{ig-user}/insights` for account-level reach, follower_count,
> profile_views and website_clicks, request per-media insights (saved, shares)
> for recent posts, and read the 24-hour story count. These become the Instagram
> section of the report: a reach trend chart, a follower growth chart, a metric
> grid, and per-post engagement in the "Top content" table — each with
> period-over-period comparison against the previous equivalent window.
>
> Example: an agency managing social for a restaurant connects the restaurant's
> Instagram account, and the monthly report shows reach, follower growth and
> which posts drove saves and shares. Profile metadata alone (instagram_basic)
> cannot answer "how did we perform this month", which is the entire purpose of
> the report.
>
> Read-only, per-account, user-initiated, and deleted on disconnect.

---

## 3. Screencast requirements

Meta requires, for **every** permission above, a screencast demonstrating the
complete Facebook Login flow on the app platform and the permission's data in
use. One continuous recording can cover all six if it follows this order.

Record at 1080p, unlisted, with the browser URL bar visible throughout.

1. Show `https://tryreportflow.com` in the URL bar. Sign in.
2. Open a client → show ReportFlow's own consent screen listing what Meta data
   will be accessed and why (`/dashboard/connect/meta_ads`).
3. Click Connect → **the Facebook Login dialog, with the permission list
   legible on screen** — this frame is what the reviewer is looking for. Grant.
4. Show the returned **ad account list** and select one → covers
   `business_management` + `pages_show_list` context.
5. Show the ad account's **spend, impressions, clicks, CTR and campaign table**
   rendering in the dashboard → covers `ads_read`.
6. Repeat Connect for Instagram → Facebook Login dialog with the Instagram
   permissions legible → grant.
7. Show the **Page list → linked Instagram account** selection → covers
   `pages_show_list` and `pages_read_engagement`.
8. Show the **Instagram profile header** (username, picture, followers) and
   the **Top content** table → covers `instagram_basic`.
9. Show the **reach and follower charts and the metric grid** → covers
   `instagram_manage_insights`.
10. Generate the report so the Meta data appears in the finished PDF.
11. Settings → Data & privacy → **disconnect and delete**, showing the user
    control over their data.

No frame may show a "Sample data" badge. Placeholder data presented as live
Meta data is grounds for rejection.

---

## 4. App settings checklist (App Dashboard → Settings → Basic)

| Setting | Value |
|---|---|
| App name | ReportFlow |
| Category | Business and pages |
| Privacy Policy URL | `https://tryreportflow.com/privacy` ✅ live (200) |
| Terms of Service URL | `https://tryreportflow.com/terms` ✅ live (200) |
| Data Deletion Instructions URL | `https://tryreportflow.com/data-deletion` ✅ live (200), names Facebook, Meta and Instagram |
| App icon | 1024×1024 PNG — **was still missing at last check** |
| App domain | `tryreportflow.com` |
| Valid OAuth Redirect URI | `https://tryreportflow.com/api/meta/callback` |
| App mode | must be **Live**, not Development |

Recommended: remove `https://adstracking-cyan.vercel.app/api/meta/callback` from
the Valid OAuth Redirect URIs if still present, for the same reason it was
removed from Google — it is a domain you cannot verify ownership of. Safe now
that middleware forces the canonical host.

---

## 5. Also required

- **Data handling questions** — Meta asks how each data type is stored, secured
  and deleted. ReportFlow's answers: tokens encrypted at rest with AES-256-GCM;
  metrics cached per reporting period in Postgres with row-level security
  scoping every row to the owning agency; deletion is immediate and
  user-initiated from Settings → Data & privacy, with public instructions at
  `/data-deletion`.
- **Annual Data Use Checkup** — recurring obligation once approved.
- **Test credentials for the reviewer** — a ReportFlow login with a client that
  has the Meta sources connected, so the reviewer can reproduce the screencast.
- Note: *"If your app does not use a permission for 90 days, usually due to user
  inactivity, your app user must regrant your app that permission."*
