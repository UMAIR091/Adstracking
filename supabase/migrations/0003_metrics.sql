-- Background-sync cache: store Search Console metrics in the DB so dashboards
-- read from Postgres (instant) instead of calling Google live on every page load.
-- A scheduled job (/api/cron/sync) refreshes these rows every few hours.

-- Sync bookkeeping on the connection itself.
alter table data_sources add column if not exists last_synced_at timestamptz;
alter table data_sources add column if not exists last_sync_error text;

-- One cached snapshot per (connection, period). period_days = 28 | 90.
create table if not exists gsc_snapshots (
  id             uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources (id) on delete cascade,
  agency_id      uuid not null references agencies (id) on delete cascade,
  period_days    integer not null,
  data           jsonb not null,                 -- the GscReport (totals, topQueries, topPages, byDate)
  synced_at      timestamptz not null default now(),
  unique (data_source_id, period_days)
);
create index if not exists gsc_snapshots_ds_idx on gsc_snapshots (data_source_id);

-- RLS: an agency can read its own snapshots. The cron job writes with the
-- service-role key (bypasses RLS), so no insert/update policy is needed for it.
alter table gsc_snapshots enable row level security;
drop policy if exists "own gsc_snapshots" on gsc_snapshots;
create policy "own gsc_snapshots" on gsc_snapshots
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));
