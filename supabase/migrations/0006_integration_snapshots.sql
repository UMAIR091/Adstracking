-- Generic snapshot cache for future integrations (Google Ads, Meta Ads, etc.).
-- New providers point their descriptor's snapshotTable here instead of each
-- needing a dedicated table. GSC and GA4 keep their existing tables for backward
-- compatibility. Same shape + RLS as gsc_snapshots / ga4_snapshots.

create table if not exists integration_snapshots (
  id             uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources (id) on delete cascade,
  agency_id      uuid not null references agencies (id) on delete cascade,
  period_days    integer not null,
  data           jsonb not null,
  synced_at      timestamptz not null default now(),
  unique (data_source_id, period_days)
);
create index if not exists integration_snapshots_ds_idx on integration_snapshots (data_source_id);

alter table integration_snapshots enable row level security;
drop policy if exists "own integration_snapshots" on integration_snapshots;
create policy "own integration_snapshots" on integration_snapshots
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));
