# OAuth App Verification Checklist

Status of ReportFlow against Google and Meta app-review requirements.
✅ = implemented in the app · 🔲 = action you must take in an external console.

> **Replace `<APP_URL>` everywhere with your production domain.**
> Strongly recommended: put the app on a custom domain you own before submitting —
> reviewers treat `*.vercel.app` as unverifiable, and Google requires an
> authorized domain you can verify in Search Console.

## Prerequisite (both reviews)

- 🔲 Fill in the placeholders in `src/lib/company.ts` — legal name, address,
  jurisdiction, and **real, monitored** support/privacy email addresses.
  Reviewers email these addresses and click every footer link.

---

## Google OAuth verification

App requirements — done:

- ✅ Public homepage describing the app (`/`), links to Privacy Policy in the footer
- ✅ Privacy Policy at `/privacy` on the same domain, including the
  **Google API Services User Data Policy — Limited Use disclosure** (section 3)
- ✅ Terms of Service at `/terms`
- ✅ In-app consent screen before OAuth (`/dashboard/connect/[type]`) explaining
  what is accessed, why, storage, and revocation
- ✅ User-facing data controls: disconnect + delete per source
  (Settings → Data & privacy), public instructions at `/data-deletion`
- ✅ Read-only scopes only: `webmasters.readonly`, `analytics.readonly`

Console steps (Google Cloud → APIs & Services → OAuth consent screen):

- 🔲 App name must match the site ("ReportFlow"), logo uploaded
- 🔲 Authorized domain = your production domain (verify ownership in Google Search Console)
- 🔲 Homepage URL: `<APP_URL>` · Privacy Policy: `<APP_URL>/privacy` · ToS: `<APP_URL>/terms`
- 🔲 Scopes requested: `.../auth/webmasters.readonly`, `.../auth/analytics.readonly`
- 🔲 Scope justification (draft — adapt as needed):
  > ReportFlow is a client-reporting tool for marketing agencies. It reads
  > Search Console performance data (webmasters.readonly) and Google Analytics 4
  > metrics (analytics.readonly) that the signed-in agency explicitly connects,
  > solely to generate the white-label performance reports the user creates and
  > schedules in the app. Access is read-only; data is cached per report period,
  > shown to the user in-app, and deletable by the user at any time.
- 🔲 Demo video (screen recording): sign-in → consent screen → Google OAuth →
  pick property → data appears → generate report → Settings → Data & privacy →
  disconnect. Show the full OAuth consent screen including the app name and scopes.
- 🔲 Enabled APIs: Search Console API, Google Analytics Data API, Google Analytics Admin API

## Meta app review

App requirements — done:

- ✅ Privacy Policy at `/privacy` (mentions Meta Platform data, section 4)
- ✅ **Data Deletion Instructions URL**: `<APP_URL>/data-deletion`
  (publicly accessible, no sign-in — paste this in App settings → Basic)
- ✅ In-app consent screen before Meta OAuth
- ✅ Disconnect + delete stored Meta data (Settings → Data & privacy)

Console steps (developers.facebook.com → your app):

- 🔲 App Settings → Basic: Privacy Policy URL, Terms URL, Data Deletion
  Instructions URL, app icon, category (Business)
- 🔲 App Review → request `ads_read` and `business_management` with a
  screencast showing: connect flow from ReportFlow → Meta login → ad account
  selection → metrics appearing in a report
- 🔲 **Instagram** — App Review → additionally request `instagram_basic`,
  `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`
  with a screencast showing: connect flow from ReportFlow → Meta login →
  Instagram account selection → follower/reach/engagement metrics appearing.
  The test account must be an **Instagram professional (Business/Creator)
  account linked to a Facebook Page**.
- 🔲 Business verification (Meta Business Manager) — required for Advanced
  Access to ads_read; needs your business documents
- 🔲 Until approved, the app works in Development Mode for users added as
  Testers/Developers on the app (Instagram: the IG account's linked Page
  must be accessible to that tester)

## SEO / crawlability (production hygiene)

- ✅ `robots.txt` (`src/app/robots.ts`): allows public pages, disallows
  `/dashboard/`, `/api/`, `/r/` (private share links)
- ✅ `sitemap.xml` (`src/app/sitemap.ts`): all public pages
- ✅ `metadataBase` + Open Graph defaults in the root layout; per-page titles
  and descriptions on every legal page; `noindex` on `/r/[token]`
- 🔲 Set `NEXT_PUBLIC_APP_URL` in Vercel to your production URL so sitemap,
  robots, and OG URLs resolve to the right domain (falls back to
  `COMPANY.website` in `src/lib/company.ts`)

## Future integrations (LinkedIn, TikTok, Microsoft, X, YouTube…)

The same assets are reused automatically:
- Consent screen is registry-driven — add a `dataAccess` list to the new
  integration's descriptor in `src/lib/integrations/providers.ts`
- Disconnect/delete works for any `data_sources` row (snapshots cascade)
- Privacy/security pages describe sources generically; add a row to the
  data table in `/security` when a new source goes live
