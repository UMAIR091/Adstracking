-- ─────────────────────────────────────────────────────────────
-- 0040: Report allowances count generations, taken atomically (launch audit N2)
--
-- The Free plan's monthly report and the trial's cap were counted from saved
-- rows in `reports`. Tenants can delete their reports (a normal feature), so a
-- Free account could generate, delete and generate again without end.
--
-- Allowances now count usage_counters.reports_generated: one per generation,
-- kept whether or not the report is later deleted. The app reserves a
-- generation through reserve_report_generation(), which locks the agency, sums
-- what it has generated (this month on Free, ever on the trial) and increments
-- only if that is below the cap, so concurrent requests can't all take the
-- last slot. The cap is still decided in lib/billing (config.ts stays the
-- single source of truth) and passed in.
--
-- release_report_generation() hands a reservation back when its report was
-- never stored (the insert failed). Nothing calls it when a report is deleted.
--
-- Both are service-role only. Tenants also lose the write grants on
-- usage_counters, which they never needed: the table has no write policy, so
-- RLS already refused their writes, and the revoke makes that explicit.
--
-- Apply BEFORE the deploy that calls these functions. Additive for the running
-- deploy, which never writes usage_counters as a tenant. Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- Counts one report generation if the agency is under p_limit (null = no cap).
-- Returns the month the generation was counted in, or null when the cap is
-- reached. p_lifetime sums every month (the trial); otherwise only this one.
create or replace function reserve_report_generation(p_agency uuid, p_limit int, p_lifetime boolean)
returns date
language plpgsql
set search_path = public
as $$
declare
  v_month date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_used  bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('report-usage:' || p_agency::text, 0));

  if p_limit is not null then
    select coalesce(sum(u.count), 0) into v_used
      from usage_counters u
     where u.agency_id = p_agency
       and u.metric = 'reports_generated'
       and (p_lifetime or u.period_month = v_month);

    if v_used >= p_limit then
      return null;
    end if;
  end if;

  insert into usage_counters (agency_id, metric, period_month, count, updated_at)
  values (p_agency, 'reports_generated', v_month, 1, now())
  on conflict (agency_id, metric, period_month)
  do update set count = usage_counters.count + 1, updated_at = now();

  return v_month;
end;
$$;

-- Hands back one reservation whose report was never stored.
create or replace function release_report_generation(p_agency uuid, p_period_month date)
returns void
language sql
set search_path = public
as $$
  update usage_counters
     set count = greatest(count - 1, 0), updated_at = now()
   where agency_id = p_agency
     and metric = 'reports_generated'
     and period_month = p_period_month;
$$;

revoke all on function reserve_report_generation(uuid, int, boolean) from public, anon, authenticated;
revoke all on function release_report_generation(uuid, date) from public, anon, authenticated;
grant execute on function reserve_report_generation(uuid, int, boolean) to service_role;
grant execute on function release_report_generation(uuid, date) to service_role;

revoke insert, update, delete, truncate on usage_counters from anon, authenticated;
