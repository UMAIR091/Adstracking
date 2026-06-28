-- Automated scheduling + delivery: day/time selection on schedules, and
-- delivery-history bookkeeping (pending status + retry tracking) on email_logs.

-- When in the cadence to send. send_day: weekly = 0–6 (Sun–Sat), monthly/
-- quarterly = day-of-month 1–28. send_hour: 0–23, UTC.
alter table report_schedules add column if not exists send_day  integer;
alter table report_schedules add column if not exists send_hour integer not null default 8;
alter table report_schedules add column if not exists last_run_at timestamptz;

-- Delivery history: allow a 'pending' state and track retry attempts + error.
alter table email_logs add column if not exists attempts   integer not null default 0;
alter table email_logs add column if not exists error      text;
alter table email_logs add column if not exists report_url text;

-- Replace the status check so 'pending' is allowed (constraint name is auto-
-- generated, so find and drop it robustly).
do $$
declare cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'email_logs'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then
    execute format('alter table email_logs drop constraint %I', cname);
  end if;
end $$;

alter table email_logs add constraint email_logs_status_check
  check (status in ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'));
