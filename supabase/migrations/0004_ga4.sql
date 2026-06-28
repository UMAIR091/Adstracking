-- GA4 background-sync cache, mirroring gsc_snapshots. One cached snapshot per
-- (GA4 connection, period). The scheduled job (/api/cron/sync) refreshes these
-- alongside the Search Console snapshots, so reports read GA4 data from Postgres
-- (instant) instead of calling Google on page load.
-- data_sources already allows type = 'ga4' (see 0001_init.sql), so no change
-- to that table is needed here.

create table if not exists ga4_snapshots (
  id             uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources (id) on delete cascade,
  agency_id      uuid not null references agencies (id) on delete cascade,
  period_days    integer not null,                -- 28 | 90
  data           jsonb not null,                  -- the Ga4ReportFull payload
  synced_at      timestamptz not null default now(),
  unique (data_source_id, period_days)
);
create index if not exists ga4_snapshots_ds_idx on ga4_snapshots (data_source_id);

-- RLS: an agency can read its own snapshots. The cron job writes with the
-- service-role key (bypasses RLS), so no insert/update policy is needed for it.
alter table ga4_snapshots enable row level security;
drop policy if exists "own ga4_snapshots" on ga4_snapshots;
create policy "own ga4_snapshots" on ga4_snapshots
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));
