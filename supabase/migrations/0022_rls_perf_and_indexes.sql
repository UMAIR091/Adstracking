-- ─────────────────────────────────────────────────────────────
-- 0022: RLS performance + hot-path indexes  (audit #9)
--
-- Two non-functional changes — identical access semantics, better plans:
--
-- 1) RLS INITPLAN CACHING. Every tenant policy called auth.uid() inline, which
--    Postgres re-evaluates once PER ROW. Wrapping it as `(select auth.uid())`
--    turns it into an initplan evaluated ONCE per query (documented Supabase
--    pattern). We also collapse the correlated `agency_id in (select id from
--    agencies where owner_id = auth.uid())` into a stable subquery. Policy
--    names are preserved so nothing else has to change.
--
-- 2) WEBHOOK LOOKUP INDEXES. The Paddle webhook resolves an agency by
--    provider_subscription_id / provider_customer_id on every event; those
--    columns had no index (only unique(agency_id) existed).
--
-- Safe to re-run: every policy is dropped-if-exists then recreated; indexes use
-- IF NOT EXISTS. No data migration.
-- ─────────────────────────────────────────────────────────────

-- Helper: an agency-id set the current user owns, evaluated once per query.
-- Kept as a SQL function (STABLE) so every policy shares one definition and the
-- planner can inline + cache it. SECURITY INVOKER (default) keeps RLS on
-- agencies applying normally.
create or replace function auth_agency_ids()
returns setof uuid
language sql
stable
as $$
  select id from agencies where owner_id = (select auth.uid());
$$;

-- ── agencies ──────────────────────────────────────────────────
drop policy if exists "own agency" on agencies;
create policy "own agency" on agencies
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ── clients ───────────────────────────────────────────────────
drop policy if exists "own clients" on clients;
create policy "own clients" on clients
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));

-- ── data_sources ──────────────────────────────────────────────
drop policy if exists "own data_sources" on data_sources;
create policy "own data_sources" on data_sources
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));

-- ── report_templates ──────────────────────────────────────────
drop policy if exists "read system or own templates" on report_templates;
create policy "read system or own templates" on report_templates
  for select using (agency_id is null or agency_id in (select auth_agency_ids()));
drop policy if exists "write own templates" on report_templates;
create policy "write own templates" on report_templates
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));

-- ── reports ───────────────────────────────────────────────────
drop policy if exists "own reports" on reports;
create policy "own reports" on reports
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));

-- ── report_schedules ──────────────────────────────────────────
drop policy if exists "own schedules" on report_schedules;
create policy "own schedules" on report_schedules
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));

-- ── email_logs ────────────────────────────────────────────────
drop policy if exists "own email_logs" on email_logs;
create policy "own email_logs" on email_logs
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));

-- ── subscriptions ─────────────────────────────────────────────
drop policy if exists "own subscription" on subscriptions;
create policy "own subscription" on subscriptions
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));

-- ── snapshot + history + counters (guarded: tables may exist from later files)
do $$
begin
  if to_regclass('public.gsc_snapshots') is not null then
    drop policy if exists "own gsc_snapshots" on gsc_snapshots;
    create policy "own gsc_snapshots" on gsc_snapshots
      for all using (agency_id in (select auth_agency_ids()))
      with check (agency_id in (select auth_agency_ids()));
  end if;

  if to_regclass('public.ga4_snapshots') is not null then
    drop policy if exists "own ga4_snapshots" on ga4_snapshots;
    create policy "own ga4_snapshots" on ga4_snapshots
      for all using (agency_id in (select auth_agency_ids()))
      with check (agency_id in (select auth_agency_ids()));
  end if;

  if to_regclass('public.integration_snapshots') is not null then
    drop policy if exists "own integration_snapshots" on integration_snapshots;
    create policy "own integration_snapshots" on integration_snapshots
      for all using (agency_id in (select auth_agency_ids()))
      with check (agency_id in (select auth_agency_ids()));
  end if;

  if to_regclass('public.sync_errors') is not null then
    drop policy if exists "own sync_errors" on sync_errors;
    create policy "own sync_errors" on sync_errors
      for select using (agency_id in (select auth_agency_ids()));
  end if;

  if to_regclass('public.metric_daily') is not null then
    drop policy if exists "own metric_daily" on metric_daily;
    create policy "own metric_daily" on metric_daily
      for all using (agency_id in (select auth_agency_ids()))
      with check (agency_id in (select auth_agency_ids()));
  end if;

  if to_regclass('public.usage_counters') is not null then
    drop policy if exists "own usage_counters" on usage_counters;
    create policy "own usage_counters" on usage_counters
      for select using (agency_id in (select auth_agency_ids()));
  end if;

  if to_regclass('public.paid_trial_grants') is not null then
    drop policy if exists "read own paid_trial_grant" on paid_trial_grants;
    create policy "read own paid_trial_grant" on paid_trial_grants
      for select using (agency_id in (select auth_agency_ids()));
  end if;

  if to_regclass('public.email_domains') is not null then
    drop policy if exists "own email_domains" on email_domains;
    create policy "own email_domains" on email_domains
      for all using (agency_id in (select auth_agency_ids()))
      with check (agency_id in (select auth_agency_ids()));
  end if;
end $$;

-- ── Webhook attribution indexes ───────────────────────────────
create index if not exists subscriptions_provider_sub_idx
  on subscriptions (provider_subscription_id);
create index if not exists subscriptions_provider_cust_idx
  on subscriptions (provider_customer_id);
