-- ─────────────────────────────────────────────────────────────
-- 0019: Durable historical metrics
--
-- PROBLEM
-- The snapshot tables (gsc_snapshots, ga4_snapshots, integration_snapshots)
-- are a CACHE, not a history: each is uniquely keyed on
-- (data_source_id, period_days), so every sync overwrites the previous row.
-- Only the latest rolling 28- and 90-day windows survive. That makes true
-- historical reporting impossible — a report for "March" requested in July has
-- nothing to read, and the provider may no longer serve it (Search Console
-- keeps ~16 months, several ad platforms far less).
--
-- SOLUTION
-- An append-only daily fact table. One row per data source per day, holding
-- that day's normalized numeric totals as jsonb. Syncs upsert on
-- (data_source_id, date), so re-syncing a window corrects late-settling data
-- (GSC revises the last ~3 days) without ever creating duplicates or losing
-- older days.
--
-- WHY DAILY TOTALS ONLY
-- Dimensional breakdowns (top queries/pages/countries) are large and only
-- meaningful for a recent window, so they stay in the rolling snapshot cache.
-- Daily totals are what long-range reporting actually needs, and they are
-- tiny: ~365 rows/source/year at a few hundred bytes each. Monthly, quarterly
-- and yearly reports are then a date-range aggregate over this table — no
-- provider API call required.
-- ─────────────────────────────────────────────────────────────

create table if not exists metric_daily (
  data_source_id uuid        not null references data_sources (id) on delete cascade,
  agency_id      uuid        not null references agencies (id)     on delete cascade,
  -- Denormalized so history survives a client being re-pointed at a new source
  -- and so per-client aggregates don't need a join.
  client_id      uuid        references clients (id) on delete cascade,
  provider       text        not null,           -- data_sources.type at write time
  date           date        not null,
  -- Flat map of that day's numeric totals, e.g.
  --   gsc: {clicks, impressions, ctr, position}
  --   ga4: {users, sessions, views}
  -- Keys are whatever the provider's daily series exposes; readers treat
  -- missing keys as absent rather than zero.
  metrics        jsonb       not null,
  updated_at     timestamptz not null default now(),
  primary key (data_source_id, date)
);

-- Range scans per source (the common report query) are served by the primary
-- key. These two cover agency-wide and per-client roll-ups.
create index if not exists metric_daily_agency_date_idx on metric_daily (agency_id, date);
create index if not exists metric_daily_client_date_idx on metric_daily (client_id, date);

alter table metric_daily enable row level security;
drop policy if exists "own metric_daily" on metric_daily;
create policy "own metric_daily" on metric_daily
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));
