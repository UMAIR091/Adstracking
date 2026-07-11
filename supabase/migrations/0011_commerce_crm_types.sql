-- ─────────────────────────────────────────────────────────────
-- 0011: Commerce + CRM data-source types
-- Shopify and HubSpot join the Phase 1 integration set. Types
-- remain validated by the app registry; this widens the DB check.
-- ─────────────────────────────────────────────────────────────

alter table data_sources drop constraint if exists data_sources_type_check;
alter table data_sources add constraint data_sources_type_check
  check (type in (
    'gsc', 'ga4', 'sheets',
    'google_ads', 'gbp',
    'meta_ads', 'linkedin_ads', 'microsoft_ads', 'tiktok_ads',
    'instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest',
    'x_twitter', 'youtube',
    'shopify', 'hubspot'
  ));
