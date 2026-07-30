# OAuth App Verification Checklist

Status of ReportFlow against Google and Meta app-review requirements.
✅ = done · 🔲 = action required · ⛔ = only the account owner can do this

**Google Cloud project:** `ads-tracking-499914` ("Ads Tracking")
**OAuth client:** `reportflow Production` — `775664922002-jb7k1i2ho20neij58aekm16sgpkdkgeo`
**Console account:** umairlodhi091@gmail.com

---

## Google OAuth verification

### App requirements — done

- ✅ Public homepage (`/`) with Privacy Policy linked in the footer
- ✅ Privacy Policy at `/privacy` including the **Google API Services User Data
  Policy — Limited Use disclosure**
- ✅ Terms of Service at `/terms`
- ✅ Real business details on every legal page (`src/lib/company.ts`) — no
  placeholders remain
- ✅ In-app consent screen before OAuth (`/dashboard/connect/[type]`)
- ✅ User-facing data controls: disconnect + delete per source
  (Settings → Data & privacy), public instructions at `/data-deletion`
- ✅ Read-only scopes only

### Console configuration — done (2026-07-28)

- ✅ App name = **ReportFlow** (was "Report Flow" — must match the site)
- ✅ Homepage `https://tryreportflow.com`, Privacy `…/privacy`, ToS `…/terms`
- ✅ Authorized domain: `tryreportflow.com` (only — no stale vercel.app)
- ✅ Redirect URI `https://tryreportflow.com/api/google/callback` registered
- ✅ Developer contact + user support email set
- ✅ **Scopes trimmed to exactly what the app uses:**

  | Scope | Tier |
  |---|---|
  | `userinfo.email` | non-sensitive |
  | `userinfo.profile` | non-sensitive |
  | `webmasters.readonly` | non-sensitive |
  | `analytics.readonly` | **sensitive** |

  **Restricted scopes: none.** This is the single most important fact about
  this submission — restricted scopes (`business.manage`, `bigquery.readonly`,
  `spreadsheets.readonly`, `youtube.readonly`) require a third-party CASA
  security assessment costing roughly $15k–$75k and taking months. Removed
  `adwords`, `bigquery.readonly`, `youtube.readonly` and `yt-analytics.readonly`
  from the consent screen; the app no longer requests them.

- ✅ `LIVE_INTEGRATIONS=gsc,ga4,meta_ads,instagram` set in Vercel production.
  Without it the registry treats **every** coded-live integration as
  connectable (see `src/lib/integrations/registry.ts`), which would let the app
  request the restricted scopes above and pull CASA back into scope. **Do not
  add gbp / sheets / bigquery / youtube / google_ads to that list without
  re-reading this section first.**

### Cleared 2026-07-30

- ✅ **App logo** uploaded (Branding page).
- ✅ **Domain ownership.** `tryreportflow.com` verified in Search Console as a
  **Domain property** (`sc-domain:tryreportflow.com`), auto-verified via the
  DNS provider. Confirmed end-to-end: the app's live `listGscSites` call
  returns it, so the token, the verification and the account all line up.
- ✅ **Authorized domains reduced to `tryreportflow.com` alone.** The
  `adstracking-cyan.vercel.app` JavaScript origin and redirect URI were
  deleted, which dropped the matching authorized domain. This mattered:
  authorized domains must be ones you own and can verify, and nobody can
  verify `vercel.app`. Removing them was only safe once
  `GOOGLE_OAUTH_REDIRECT_URI` pointed at the custom domain — deleting the
  redirect URI while the env var still named it would have broken OAuth
  outright.
- ✅ **`GOOGLE_OAUTH_REDIRECT_URI`** set to
  `https://tryreportflow.com/api/google/callback` in Vercel production and
  redeployed. Proven by a fresh GSC OAuth grant completing through it.
- ✅ **Both Google sources connected and syncing** with real data (GA4
  property `547548308`; GSC `sc-domain:tryreportflow.com`).

### Remaining — blocked on the account owner

- ⛔ **Demo video.** An unlisted YouTube video showing the full flow:
  sign in → in-app consent screen → Google OAuth screen (app name + scopes
  clearly visible) → pick a Search Console property → data appears →
  generate a report → Settings → Data & privacy → disconnect.
  This cannot be automated — it needs a real screen recording with real
  credentials.

  **Do not reuse the 2026-07-30 06:14 recording.** It was made before the GA4
  property was selected, when `ga4_snapshots` was empty — so the client page
  was rendering `SAMPLE_GA4` behind a "Sample data" badge. Placeholder numbers
  shown as if they were live Google data is worse than showing none. Re-record
  only after confirming a real snapshot exists, and make sure no "Sample data"
  badge is visible in any frame.

  Note both sources are newly tagged/verified, so trend charts show a single
  point until roughly 2026-08-02 (GA4 has ~1 day of series; a freshly verified
  Search Console property collects nothing for its first 2–3 days). Real but
  sparse data passes — volume is not a review criterion — it just looks thin.
- 🔲 **Publish the app.** Audience → Publish app. Verification cannot be
  submitted while publishing status is "Testing" — the Verification Center
  says so explicitly. Consequences: the consent screen shows an "unverified
  app" warning until Google approves (users can still proceed), and the app is
  capped at 100 users. In exchange, refresh tokens stop expiring after 7 days.
- 🔲 **Submit** in Verification Center once the four items above are done.

### Scope justification (paste into the submission)

> ReportFlow is a white-label client-reporting tool for marketing agencies. It
> reads Google Analytics 4 metrics (`analytics.readonly`) and Search Console
> performance data (`webmasters.readonly`) for properties the signed-in agency
> explicitly connects, solely to generate the performance reports the user
> creates and schedules in the app. Access is read-only. Data is cached per
> reporting period, shown only to the agency that connected it, and deleted by
> the user at any time from Settings → Data & privacy. It is never sold,
> transferred, or used for advertising.

### Testing-mode caveat

While publishing status is "Testing", only accounts on the test-user list can
authorize, and **refresh tokens expire after 7 days** — connected clients stop
syncing about a week later. That alone makes Testing unusable for real
customers.

Current test users: 3 (includes umairlodhi091@ and umairlodhi223@).

---

## Meta app review

App requirements — done:

- ✅ Privacy Policy at `/privacy` (mentions Meta Platform data)
- ✅ **Data Deletion Instructions URL**: `https://tryreportflow.com/data-deletion`
- ✅ In-app consent screen before Meta OAuth
- ✅ Disconnect + delete stored Meta data (Settings → Data & privacy)

Console steps (developers.facebook.com):

- 🔲 App Settings → Basic: Privacy Policy URL, Terms URL, Data Deletion
  Instructions URL, app icon (1024px), category (Business)
- 🔲 App Review → request `ads_read` and `business_management` with a screencast
- 🔲 **Instagram** — additionally `instagram_basic`, `instagram_manage_insights`,
  `pages_show_list`, `pages_read_engagement`. The test account must be an
  Instagram professional account linked to a Facebook Page.
- 🔲 Business verification (Meta Business Manager) — needs business documents

---

## SEO / crawlability

- ✅ `robots.txt`, `sitemap.xml`, `metadataBase` + OG defaults, `noindex` on
  `/r/[token]`
- ✅ `NEXT_PUBLIC_APP_URL` set to the production URL in Vercel

---

## Adding a new Google integration later

Adding GBP, Sheets, BigQuery, YouTube or Google Ads re-introduces a
**restricted or additional sensitive scope** and requires a new verification
round (CASA for the restricted ones). Plan for that before flipping any of
them into `LIVE_INTEGRATIONS`.
