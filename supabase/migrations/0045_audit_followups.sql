-- 0045: Audit follow-ups (2026-10-16)
--
-- APPLY BEFORE deploying the matching code: the Paddle webhook and the billing
-- re-sync write subscriptions.provider_updated_at, which must exist first.
-- Every change here is additive or a stricter check that existing rows already
-- satisfy (verified: 0 data_sources rows whose client is in another workspace).

-- 1. Paddle event ordering. Paddle doesn't guarantee webhook delivery order, so
--    a delayed older event could overwrite a newer subscription state. The
--    subscription's own updatedAt from Paddle is stored and older events are
--    ignored (lib/billing/paddle.isStaleSubscriptionEvent).
alter table public.subscriptions
  add column if not exists provider_updated_at timestamptz;

-- 2. A data source belongs to the same workspace as its client. The app always
--    writes them consistently, and report generation filters by both, but a
--    tenant writing data_sources directly could attach a row to another
--    workspace's client id. Runs as the invoker: under a tenant's RLS another
--    workspace's client is invisible, so the check fails exactly when it should.
create or replace function public.guard_data_source_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from clients c where c.id = new.client_id and c.agency_id = new.agency_id
  ) then
    raise exception 'A data source must belong to the same workspace as its client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists data_sources_client_same_agency on public.data_sources;
create trigger data_sources_client_same_agency
  before insert or update of client_id, agency_id on public.data_sources
  for each row execute function public.guard_data_source_client();

-- 3. The tenant-facing guard message still named the old brand. Same logic as
--    migration 0041; only the message text changes.
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
    -- created_at (trial clock) and paid_trial_used_at are database-set; owner_id
    -- on INSERT is validated by the "owner creates agency" policy (= auth.uid()).
    new.created_at := now();
    new.paid_trial_used_at := null;
    return new;
  end if;

  -- UPDATE: none of the server-owned columns may change through a tenant client.
  if new.created_at is distinct from old.created_at
     or new.paid_trial_used_at is distinct from old.paid_trial_used_at
     or new.owner_id is distinct from old.owner_id then
    raise exception 'agencies.created_at, paid_trial_used_at and owner_id are managed by Anavyst'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
