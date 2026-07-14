-- ─────────────────────────────────────────────────────────────
-- 0012: Phase 2 data-source types
-- WooCommerce, Mailchimp, Klaviyo, Microsoft Ads, CallRail, Ahrefs,
-- Semrush, Stripe, YouTube Analytics and BigQuery join the set. As
-- before, the type is validated by the app registry at the app layer;
-- this widens the DB check to every current + planned type so adding
-- them needs no further migration. Snapshots reuse integration_snapshots.
-- ─────────────────────────────────────────────────────────────

alter table data_sources drop constraint if exists data_sources_type_check;
alter table data_sources add constraint data_sources_type_check
  check (type in (
    'gsc', 'ga4', 'sheets',
    'google_ads', 'gbp',
    'meta_ads', 'linkedin_ads', 'microsoft_ads', 'tiktok_ads',
    'instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest',
    'x_twitter', 'youtube',
    'shopify', 'hubspot',
    -- Phase 2
    'woocommerce', 'mailchimp', 'klaviyo', 'callrail',
    'ahrefs', 'semrush', 'stripe', 'youtube_analytics', 'bigquery'
  ));
