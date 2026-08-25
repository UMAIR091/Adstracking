-- ─────────────────────────────────────────────────────────────
-- Two changes to report_schedules:
--
--   1) "daily" joins the frequency set.
--   2) A schedule can pin the reporting window it sends, instead of always
--      inheriting the cadence default. NULL keeps the old behaviour, so every
--      existing row is untouched and keeps sending exactly what it sends today.
--
-- Both claim RPCs must return the new column so the cron can honour it. A
-- function's return type cannot be changed by CREATE OR REPLACE, so those two
-- are dropped and recreated — which also drops their grants, re-issued below.
-- The whole file runs in one implicit transaction, so the functions are never
-- missing from the schema as far as any other session is concerned.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Frequency: widen the allowed set ──────────────────────
-- Postgres has no "ALTER CHECK", so the constraint is dropped and recreated.
-- Widening cannot invalidate existing rows.

alter table report_schedules
  drop constraint if exists report_schedules_frequency_check;

alter table report_schedules
  add constraint report_schedules_frequency_check
  check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly'));

-- ── 2. Period: the window this schedule reports on ───────────
-- NULL = "match the frequency" (lib/schedule.ts periodForSchedule), which is
-- what every row created before this migration means.
--
-- 'custom' is NOT allowed: a fixed start/end pair on a recurring schedule would
-- email the same frozen date range forever. The set below is PERIOD_PRESETS
-- minus custom — keep the two in step (lib/reports/periods.ts).

alter table report_schedules
  add column if not exists period text;

alter table report_schedules
  drop constraint if exists report_schedules_period_check;

alter table report_schedules
  add constraint report_schedules_period_check
  check (period is null or period in (
    'last_7', 'last_14', 'last_28', 'last_30', 'last_90',
    'this_month', 'previous_month', 'this_quarter', 'previous_quarter'
  ));

-- ── 3. claim_due_schedules: return the period ────────────────
-- Body is unchanged from 0035 apart from `period text` in the result and
-- `d.period` in the final SELECT. #variable_conflict use_column stays: the
-- RETURNS TABLE names are in scope as PL/pgSQL variables and the `claimed` CTE
-- names three of them as bare columns (see 0035).

drop function if exists claim_due_schedules(int);

create function claim_due_schedules(p_limit int)
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
  occurrence_at timestamptz,
  period       text
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
         d.recipients, d.subject, d.message, c.occurrence_at, d.period
    from claimed c
    join due d on d.id = c.schedule_id;
end;
$$;

revoke all on function claim_due_schedules(int) from public, anon, authenticated;
grant execute on function claim_due_schedules(int) to service_role;

-- ── 4. claim_stuck_deliveries: return the period ─────────────
-- Body unchanged apart from `period text` in the result and `s.period` in the
-- final SELECT. Stays `language sql` with every reference qualified, which is
-- why it never hit the ambiguity that 0035 fixed in its sibling.

drop function if exists claim_stuck_deliveries(int, int, int);

create function claim_stuck_deliveries(p_limit int, p_stuck_minutes int, p_max_attempts int)
returns table (
  delivery_id   uuid,
  schedule_id   uuid,
  agency_id     uuid,
  client_id     uuid,
  template_key  text,
  frequency     text,
  send_day      int,
  send_hour     int,
  recipients    jsonb,
  subject       text,
  message       text,
  occurrence_at timestamptz,
  attempts      int,
  period        text
)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select d.id
      from report_deliveries d
     where d.status in ('claimed', 'failed')
       and d.attempts < p_max_attempts
       and d.updated_at < now() - make_interval(mins => greatest(p_stuck_minutes, 0))
       and d.created_at > now() - interval '24 hours'
     order by d.updated_at asc
     limit greatest(p_limit, 0)
     for update skip locked
  ),
  touched as (
    update report_deliveries d
       set attempts = d.attempts + 1, updated_at = now()
      from picked p
     where d.id = p.id
    returning d.id as delivery_id, d.schedule_id, d.agency_id, d.occurrence_at, d.attempts
  )
  select t.delivery_id, t.schedule_id, t.agency_id,
         s.client_id, s.template_key, s.frequency, s.send_day, s.send_hour,
         s.recipients, s.subject, s.message, t.occurrence_at, t.attempts, s.period
    from touched t
    join report_schedules s on s.id = t.schedule_id;
$$;

revoke all on function claim_stuck_deliveries(int, int, int) from public, anon, authenticated;
grant execute on function claim_stuck_deliveries(int, int, int) to service_role;
