-- ─────────────────────────────────────────────────────────────
-- 0033: Phase 3 data-source types
--
-- The registry has shipped eleven integrations whose ids were never added to
-- the data_sources CHECK constraint, so connecting any of them would have
-- failed at the final UPSERT in completeOAuthConnect with a constraint
-- violation — after the user had already granted access at the provider.
--
-- Missing: moz, pinterest_ads, snapchat_ads, reddit_ads, amazon_ads, x_ads,
-- adobe_analytics, salesforce, activecampaign, constantcontact, campaignmonitor.
--
-- Note the distinction between the paid-media ids and the organic-social ids
-- that already existed: 'pinterest' (social) and 'pinterest_ads' (advertising)
-- are different sources, as are 'tiktok'/'tiktok_ads'. Both forms are allowed.
--
-- As before, the authoritative validation is the app registry; this constraint
-- is a backstop against a typo'd type reaching the table.
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
    'ahrefs', 'semrush', 'stripe', 'youtube_analytics', 'bigquery',
    -- Phase 3
    'moz',
    'pinterest_ads', 'snapchat_ads', 'reddit_ads', 'amazon_ads', 'x_ads',
    'adobe_analytics', 'salesforce',
    'activecampaign', 'constantcontact', 'campaignmonitor'
  ));
