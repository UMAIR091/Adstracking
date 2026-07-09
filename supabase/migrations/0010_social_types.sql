-- ─────────────────────────────────────────────────────────────
-- 0010: Social platform data-source types
-- Instagram is the first social integration; the check is widened
-- to every current + planned type (including social platforms) so
-- adding TikTok / LinkedIn / Pinterest / Facebook later needs no
-- further migration. Types remain validated by the app registry.
-- ─────────────────────────────────────────────────────────────

alter table data_sources drop constraint if exists data_sources_type_check;
alter table data_sources add constraint data_sources_type_check
  check (type in (
    'gsc', 'ga4', 'sheets',
    'google_ads', 'gbp',
    'meta_ads', 'linkedin_ads', 'microsoft_ads', 'tiktok_ads',
    'instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest',
    'x_twitter', 'youtube'
  ));
