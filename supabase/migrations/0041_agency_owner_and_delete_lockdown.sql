-- ─────────────────────────────────────────────────────────────
-- 0041: Agency ownership is server-owned (launch audit N4)
--
-- agencies.owner_id is the anchor for every owner-only power: the
-- "owner deletes agency" RLS policy (owner_id = auth.uid()), owner-only team
-- management (api/team/members), and the billing owner lookups. The
-- "admins update agency" policy lets any admin UPDATE the agency row so they
-- can edit branding — but it is column-agnostic, and guard_agency_trial_columns
-- (0038) pinned only created_at and paid_trial_used_at. So a non-owner ADMIN
-- could PATCH owner_id to themselves, become the owner, and then delete the
-- workspace or seize owner-only controls. (A UNIQUE(owner_id) only blocked this
-- when the attacker already owned another agency; an ownerless admin had no
-- conflict — confirmed by a live rolled-back probe: ALLOWED, rowCount 1.)
--
-- Fix: pin owner_id for the client roles in the SAME guard trigger that already
-- pins the trial clock — the identical database-level approach used for the
-- other server-owned columns. An admin can no longer change ownership, so the
-- "take over, then delete" path is closed at its first step and needs no change
-- to the DELETE policy. The legitimate owner keeps every existing power,
-- including the current workspace-deletion flow (owner_id = auth.uid() still
-- matches only the real owner).
--
-- Scope: this is the N4 authorization boundary only. N5 (an owner deleting and
-- recreating a workspace to reset the free app-level trial) is a separately
-- ACCEPTED low-priority risk and is deliberately NOT addressed here — the
-- owner-delete policy and tenant DELETE grant are left exactly as they are so
-- legitimate owner deletion keeps working.
--
-- Ownership transfer, if ever built, runs as the service role, which is exempt
-- from this guard (current_user not in anon/authenticated) — exactly like the
-- trial columns. No tenant client writes agencies.owner_id today (the server
-- only sets it once, at creation, on INSERT), so nothing existing breaks.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

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
    raise exception 'agencies.created_at, paid_trial_used_at and owner_id are managed by ReportFlow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
