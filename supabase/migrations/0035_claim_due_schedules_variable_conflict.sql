-- ─────────────────────────────────────────────────────────────
-- Fix: claim_due_schedules() raised 42702 on every call.
--
-- Evidence: the 2026-08-25 08:50:27Z reports cron recorded
--   ops_heartbeats.detail = 'column reference "schedule_id" is ambiguous'
-- and every run before it failed the same way, unseen, since 0025 shipped.
-- The throw happens at the first statement, so no ledger row was ever written
-- and no scheduled report was ever sent — nothing was half-sent or duplicated.
--
-- Cause: the function's RETURNS TABLE names (schedule_id, agency_id,
-- occurrence_at) are in scope as PL/pgSQL variables throughout the body, and
-- the `claimed` CTE references those same names as bare columns — in the
-- ON CONFLICT inference list and the RETURNING list. Postgres cannot tell the
-- OUT parameter from the column. Its sibling claim_stuck_deliveries has the
-- same output signature but is `language sql` and qualifies every reference,
-- which is why only this one failed.
--
-- Fix: #variable_conflict use_column, so a bare identifier resolves to the
-- column. The function never reads its OUT variables by name (it uses RETURN
-- QUERY), and p_limit is unaffected — no column shares that name. The ON
-- CONFLICT inference list cannot be table-qualified, so this directive is the
-- one-line fix that leaves the signature intact; renaming the output columns
-- would break the DeliveryJob mapping in lib/scheduledReports.ts.
--
-- Body below is character-for-character the definition from
-- 0025_report_deliveries.sql, plus that single directive line.
-- ─────────────────────────────────────────────────────────────

create or replace function claim_due_schedules(p_limit int)
returns table (
  delivery_id  uuid,
  schedule_id  uuid,
  agency_id    uuid,
  client_id    uuid,
  template_key text,
  frequency    text,
  send_day     int,
  send_hour    int,
  recipients   jsonb,
  subject      text,
  message      text,
  occurrence_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select s.*
      from report_schedules s
     where s.enabled = true
       and s.next_run_at <= now()
     order by s.next_run_at asc
     limit greatest(p_limit, 0)
     for update skip locked
  ),
  claimed as (
    insert into report_deliveries (schedule_id, agency_id, occurrence_at, status, attempts)
    select d.id, d.agency_id, d.next_run_at, 'claimed', 1
      from due d
    on conflict (schedule_id, occurrence_at) do nothing
    returning id, schedule_id, agency_id, occurrence_at
  ),
  advanced as (
    -- Runs to completion even though the final SELECT doesn't read it. Provisional
    -- bump (>> the cron interval) so the row isn't re-claimed before the app layer
    -- sets the precise next_run_at.
    update report_schedules s
       set next_run_at = greatest(s.next_run_at, now()) + interval '1 hour',
           last_run_at = now(),
           updated_at  = now()
      from claimed c
     where s.id = c.schedule_id
    returning s.id
  )
  select c.id, c.schedule_id, c.agency_id,
         d.client_id, d.template_key, d.frequency, d.send_day, d.send_hour,
         d.recipients, d.subject, d.message, c.occurrence_at
    from claimed c
    join due d on d.id = c.schedule_id;
end;
$$;

-- Re-asserted verbatim from 0025. CREATE OR REPLACE preserves privileges, so
-- these are a no-op against the current grants; they are here so the migration
-- is self-contained and the security posture is stated, not assumed.
revoke all on function claim_due_schedules(int) from public, anon, authenticated;
grant execute on function claim_due_schedules(int) to service_role;
