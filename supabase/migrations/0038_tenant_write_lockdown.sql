-- ─────────────────────────────────────────────────────────────
-- 0038: Tenant write lockdown (launch audit B1 + B2, step 2 of 2)
--
-- RLS scoped every tenant table to the caller's agency, but most policies were
-- FOR ALL. Scoping rows is not scoping operations, and several of those rows
-- are the inputs to billing:
--
--   subscriptions     status/plan decide paid access. Any member could PATCH
--                     their own row to status 'active', plan 'agency'.
--   agencies          created_at starts the app-level trial clock. Moving it
--                     forward re-opened the trial, and an expired paid
--                     subscription falls through to that trial with its old
--                     plan's limits (lib/billing/subscription.ts).
--   clients           the client limit was checked in a server action, but
--                     tenants could insert rows, or un-archive them, directly.
--   report_schedules  scheduled delivery is the free/paid line, and tenants
--                     could insert schedules directly. The cron now checks
--                     the plan as well (lib/scheduledReports.ts).
--   storage "logos"   upload/update/delete checked only the bucket, so any
--                     account could overwrite or delete any agency's or
--                     client's logo, the images on white-label reports.
--
-- After this migration tenants can READ their billing state and edit
-- descriptive fields, but every write that changes what they are entitled to
-- goes through server code (service role) that checks the plan first.
--
-- Apply AFTER the deploy that moves those writes to the service role (billing
-- confirm/subscription/portal routes, client create/restore actions, schedules
-- route). The previous deploy still writes them as the user.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- ── 1) subscriptions: read-only for tenants ───────────────────
-- Written only by the Paddle webhook and the billing routes, all service role.
drop policy if exists "own subscription" on subscriptions;
drop policy if exists "members read subscription" on subscriptions;
create policy "members read subscription" on subscriptions
  for select using (agency_id in (select auth_agency_ids()));

revoke insert, update, delete, truncate on subscriptions from anon, authenticated;

-- ── 2) agencies: the trial clock is server-owned ──────────────
-- Admins still edit branding, contact and email settings. created_at (trial
-- start) and paid_trial_used_at (one-trial-per-customer fast path) are pinned
-- for the client roles: set by the database on insert, unchangeable after.
-- Checked by role rather than by a column allowlist, so no settings form can
-- break over a column missing from the list.
create or replace function guard_agency_trial_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.paid_trial_used_at := null;
    return new;
  end if;

  if new.created_at is distinct from old.created_at
     or new.paid_trial_used_at is distinct from old.paid_trial_used_at then
    raise exception 'agencies.created_at and paid_trial_used_at are managed by ReportFlow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agencies_guard_trial on agencies;
create trigger trg_agencies_guard_trial
  before insert or update on agencies
  for each row execute function guard_agency_trial_columns();

-- ── 3) clients: creation and restore go through the plan check ─
drop policy if exists "own clients" on clients;
drop policy if exists "members read clients" on clients;
drop policy if exists "members update clients" on clients;
drop policy if exists "members delete clients" on clients;

create policy "members read clients" on clients
  for select using (agency_id in (select auth_agency_ids()));
create policy "members update clients" on clients
  for update using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));
create policy "members delete clients" on clients
  for delete using (agency_id in (select auth_agency_ids()));

-- No INSERT policy: create_client_within_limit() (0037) is the way in.
revoke insert, truncate on clients from anon, authenticated;

-- Editing a client's details stays a direct update. The two transitions that
-- change what counts against the limit are refused for the client roles:
--   archived true -> false   restore_client_within_limit() checks the limit
--   agency_id changes        would move a client between workspaces' counts
create or replace function guard_client_limit_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.agency_id is distinct from old.agency_id then
    raise exception 'A client cannot be moved to another workspace'
      using errcode = '42501';
  end if;
  if old.archived and not new.archived then
    raise exception 'Restore archived clients from the app so the plan limit is checked'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_guard_limit on clients;
create trigger trg_clients_guard_limit
  before update on clients
  for each row execute function guard_client_limit_columns();

-- ── 4) report_schedules: created and edited by the server only ─
-- POST /api/schedules checks the plan, then writes with the service role.
-- Removing a schedule gives nothing away, so members may still delete.
drop policy if exists "own schedules" on report_schedules;
drop policy if exists "members read schedules" on report_schedules;
drop policy if exists "members delete schedules" on report_schedules;

create policy "members read schedules" on report_schedules
  for select using (agency_id in (select auth_agency_ids()));
create policy "members delete schedules" on report_schedules
  for delete using (agency_id in (select auth_agency_ids()));

revoke insert, update, truncate on report_schedules from anon, authenticated;

-- ── 5) logos bucket: writes scoped to the uploader's own agency ─
-- LogoUpload writes one folder deep:
--   <agency id>/          agency logo, settings page       (owner/admin)
--   agency-<agency id>/   agency logo, onboarding wizard   (owner/admin)
--   client-<agency id>/   client logos                     (any member)
-- Mirrors the row permissions: agency branding is admin-only (0032), clients
-- are editable by every member. Public read is unchanged.
create or replace function can_write_logo_object(p_name text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (storage.foldername(p_name))[1] in (
      select 'client-' || a.id::text from auth_agency_ids() as a(id)
      union all
      select a.id::text from auth_admin_agency_ids() as a(id)
      union all
      select 'agency-' || a.id::text from auth_admin_agency_ids() as a(id)
    ),
    false
  );
$$;

revoke all on function can_write_logo_object(text) from public, anon;
grant execute on function can_write_logo_object(text) to authenticated, service_role;

drop policy if exists "logos auth upload" on storage.objects;
drop policy if exists "logos auth update" on storage.objects;
drop policy if exists "logos auth delete" on storage.objects;
drop policy if exists "logos agency upload" on storage.objects;
drop policy if exists "logos agency update" on storage.objects;
drop policy if exists "logos agency delete" on storage.objects;

create policy "logos agency upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and public.can_write_logo_object(name));

create policy "logos agency update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and public.can_write_logo_object(name))
  with check (bucket_id = 'logos' and public.can_write_logo_object(name));

create policy "logos agency delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and public.can_write_logo_object(name));
