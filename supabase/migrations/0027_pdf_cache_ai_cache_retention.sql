-- ─────────────────────────────────────────────────────────────
-- 0027: PDF cache, AI insights cache, metric retention  (audit #3, #11)
--
-- 1) REPORT PDF CACHE. The public /r/<token>/pdf route re-rendered the PDF
--    (fontkit + wasm) on every request with no caching. We add columns so a
--    rendered PDF can be stored once in Storage and streamed on subsequent hits,
--    re-rendering only when the report's data changes.
--
-- 2) AI INSIGHTS CACHE. generateReportInsights ran the model on every report
--    generation, even when the underlying snapshot was byte-for-byte identical
--    (e.g. a schedule re-running before the next sync). Cache keyed on a hash of
--    the exact model input.
--
-- 3) METRIC RETENTION. metric_daily is append-only and unbounded. A retention
--    function trims rows older than a configurable horizon; the cron calls it.
-- ─────────────────────────────────────────────────────────────

-- 1) PDF cache bucket (private — access is mediated by the app via share token).
insert into storage.buckets (id, name, public)
values ('report-pdfs', 'report-pdfs', false)
on conflict (id) do nothing;

-- Storage RLS: no tenant policies → only the service-role (which bypasses RLS)
-- can read/write. The public PDF route streams via the admin client after
-- verifying the share token, so objects are never directly reachable.

alter table reports add column if not exists pdf_cached_hash text;
alter table reports add column if not exists pdf_cached_at   timestamptz;

-- 2) AI insights cache.
create table if not exists ai_insights_cache (
  cache_key   text primary key,          -- sha256 of the model input
  insights    jsonb not null,
  created_at  timestamptz not null default now()
);
-- Server-only (written/read with the service-role client). RLS on, no policy.
alter table ai_insights_cache enable row level security;

-- 3) Metric retention.
create or replace function purge_old_metrics(p_days int default 400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from metric_daily
   where date < (current_date - make_interval(days => greatest(p_days, 1)));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function purge_old_metrics(int) from public, anon, authenticated;
grant execute on function purge_old_metrics(int) to service_role;
