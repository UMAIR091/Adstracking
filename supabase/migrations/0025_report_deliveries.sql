-- ─────────────────────────────────────────────────────────────
-- 0025: Scheduled-delivery idempotency ledger  (audit #1, Critical)
--
-- The report cron generated + emailed reports in one unbounded sequential loop
-- and advanced next_run_at AFTER sending. Two failure modes:
--   • a 60s timeout mid-loop silently skipped every remaining schedule;
--   • a crash after send but before the advance re-sent the same report next run
--     (duplicate client email).
--
-- report_deliveries is an idempotency ledger: exactly one row per (schedule,
-- occurrence). claim_due_schedules() atomically claims due schedules AND inserts
-- the ledger row in one statement, so a given occurrence can be claimed by at
-- most one worker — the unique(schedule_id, occurrence_at) key makes a duplicate
-- claim (concurrent run or retry) a no-op. next_run_at is advanced by the caller
-- using the existing TS cadence logic, but only for occurrences this worker owns.
-- ─────────────────────────────────────────────────────────────

create table if not exists report_deliveries (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references report_schedules (id) on delete cascade,
  agency_id     uuid not null references agencies (id) on delete cascade,
  -- The scheduled occurrence this row represents (the next_run_at that was due).
  occurrence_at timestamptz not null,
  status        text not null default 'claimed'
                  check (status in ('claimed', 'sent', 'failed', 'skipped')),
  report_id     uuid references reports (id) on delete set null,
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (schedule_id, occurrence_at)
);
create index if not exists report_deliveries_agency_idx on report_deliveries (agency_id);
create index if not exists report_deliveries_schedule_idx on report_deliveries (schedule_id);

alter table report_deliveries enable row level security;
-- Read-only to the owning agency (for a future delivery-history UI); all writes
-- go through the service-role cron.
drop policy if exists "own report_deliveries" on report_deliveries;
create policy "own report_deliveries" on report_deliveries
  for select using (agency_id in (select auth_agency_ids()));

drop trigger if exists trg_report_deliveries_updated on report_deliveries;
create trigger trg_report_deliveries_updated before update on report_deliveries
  for each row execute function set_updated_at();

-- Atomically claim up to N due schedules. In ONE statement it: locks the due
-- rows (FOR UPDATE SKIP LOCKED — concurrent runs get disjoint sets), inserts a
-- ledger row per occurrence (ON CONFLICT DO NOTHING dedupes replays/races), and
-- provisionally advances next_run_at so a claimed schedule is immediately no
-- longer due. That provisional advance is what makes the whole thing crash-safe:
-- even if the worker dies before the app layer writes the precise next_run_at,
-- the schedule can never get stuck re-claiming the same occurrence forever (the
-- app layer overwrites next_run_at with the exact cadence in the normal path,
-- and a crashed occurrence is still delivered by claim_stuck_deliveries).
-- Only occurrences we actually inserted are returned → processed exactly once.
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

revoke all on function claim_due_schedules(int) from public, anon, authenticated;
grant execute on function claim_due_schedules(int) to service_role;

-- Recovery path: atomically claim deliveries that a previous run left mid-flight
-- (a worker crashed after claiming but before reaching a terminal state, or a
-- transient send failure). "Stuck" = status still claimed/failed, attempts below
-- the cap, and not touched recently. The UPDATE bumps attempts + updated_at as it
-- claims, and FOR UPDATE SKIP LOCKED means two concurrent runs can't grab the
-- same row — so a retry never becomes a duplicate send. Occurrence identity is
-- unchanged, so the delivery stays idempotent across attempts.
create or replace function claim_stuck_deliveries(p_limit int, p_stuck_minutes int, p_max_attempts int)
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
  attempts      int
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
         s.recipients, s.subject, s.message, t.occurrence_at, t.attempts
    from touched t
    join report_schedules s on s.id = t.schedule_id;
$$;

revoke all on function claim_stuck_deliveries(int, int, int) from public, anon, authenticated;
grant execute on function claim_stuck_deliveries(int, int, int) to service_role;
