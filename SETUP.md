# ReportFlow — Setup

White-label client reporting for marketing agencies. Next.js + Supabase + Resend + Lemon Squeezy.

## What you need to create (and give me the keys for, via `.env` — not chat)

| Service | Why | Gate |
|---|---|---|
| **Supabase** project | DB, Auth, Storage | none — instant |
| **Google Cloud** OAuth client + Search Console API + GA4 Data API | connect agency data sources | OAuth consent-screen **verification** (can take days) |
| **Resend** account + verified domain | send/track white-label report emails | domain verify |
| **Lemon Squeezy** store + product | subscriptions (pays out to Payoneer) | account approval |

## Order of setup

1. **Supabase:** create a project. Project Settings → API → copy the URL, `anon` key, and `service_role` key into `.env`.
2. **Run the schema:** in Supabase → SQL Editor, paste & run `supabase/migrations/0001_init.sql`. This creates all tables, RLS policies, and seeds the 4 system report templates.
3. **Auth:** Supabase → Authentication → enable Email + Google provider (paste Google client id/secret).
4. **Google Cloud:** create an OAuth Web client; enable *Search Console API* and *Google Analytics Data API*; add the redirect URI from `.env`. Submit the consent screen for verification when ready to go public.
5. **Resend / Lemon Squeezy:** create accounts, add keys to `.env` when we reach those phases.

## Build phases (we verify each before moving on)
1. ✅ **Foundation** — schema + RLS + scaffold *(this commit)*
2. Auth + agency workspace (branding)
3. Clients (CRUD/archive/search)
4. Google Search Console connector + report data model
5. Report builder + premium PDF/online report (one template)
6. GA4 + Google Sheets connectors
7. Scheduling + Resend delivery + tracking
8. Billing (Lemon Squeezy)
9. Dashboard, report history, admin, polish

## Notes
- **Stripe is not used** — it doesn't support Pakistan-based accounts. Billing uses **Lemon Squeezy** (Merchant of Record → Payoneer), which also handles global sales tax/VAT.
- OAuth tokens in `data_sources` are encrypted at the app layer and only touched server-side; RLS keeps rows owner-scoped.
- The scheduler and public shareable reports run with the service-role key (bypasses RLS) and enforce their own checks.
