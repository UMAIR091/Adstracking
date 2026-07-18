-- ─────────────────────────────────────────────────────────────
-- 0015: usage_counters — per-workspace, per-month usage metering.
--
-- SaaS usage tracking that scales and is ready for subscription limits. Two
-- kinds of metric, handled the cheapest correct way:
--
--   • Current-state counts (connected integrations, scheduled reports) are NOT
--     stored here — they're COUNT()ed live from data_sources / report_schedules
--     so they can never drift. See lib/usage.ts.
--   • Cumulative events (reports generated, sync executions, AI summaries) are
--     accumulated here as one counter row per (agency, metric, month). Bounded
--     growth (a handful of rows per workspace per month) means limit checks are
--     a single indexed point-read, not a scan over an event log.
--
-- Multi-tenant safe: every row is agency-scoped; RLS lets an owner read only
-- their own counters. Writes go exclusively through increment_usage(), which is
-- revoked from client roles so a tenant can't inflate/deflate usage (important
-- once limits gate features). No existing table, OAuth, or RLS policy changes.
-- ─────────────────────────────────────────────────────────────

create table if not exists usage_counters (
  agency_id    uuid not null references agencies (id) on delete cascade,
  metric       text not null,   -- reports_generated | sync_executions | ai_summaries
  period_month date not null,   -- first day of the UTC month this counter covers
  count        bigint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (agency_id, metric, period_month)
);

create index if not exists usage_counters_agency_period_idx
  on usage_counters (agency_id, period_month desc);

alter table usage_counters enable row level security;
drop policy if exists "own usage_counters" on usage_counters;
create policy "own usage_counters" on usage_counters
  for select using (agency_id in (select id from agencies where owner_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policy: mutations happen only via increment_usage().

-- Atomic, race-free increment: upsert the current month's counter, adding to any
-- existing value. Called from trusted server code with the service-role key.
create or replace function increment_usage(p_agency uuid, p_metric text, p_amount bigint default 1)
returns void
language sql
as $$
  insert into usage_counters (agency_id, metric, period_month, count, updated_at)
  values (p_agency, p_metric, date_trunc('month', (now() at time zone 'utc'))::date, greatest(p_amount, 0), now())
  on conflict (agency_id, metric, period_month)
  do update set count = usage_counters.count + excluded.count, updated_at = now();
$$;

-- Only server code (service role) may write usage; clients can never call it.
revoke all on function increment_usage(uuid, text, bigint) from public;
grant execute on function increment_usage(uuid, text, bigint) to service_role;
