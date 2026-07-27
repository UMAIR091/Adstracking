-- ─────────────────────────────────────────────────────────────
-- 0032: Team invitations + membership-scoped access
--
-- Migration 0030 created `memberships` and `is_agency_member()` as PREP and
-- said so explicitly: existing RLS stayed owner-scoped, so a non-owner could
-- sign in and see an empty workspace. This migration makes membership real.
--
-- The pivot is small on purpose. 20 of the 22 existing policies already route
-- through auth_agency_ids(); redefining that ONE function grants members access
-- to clients, data sources, reports, schedules, snapshots, email logs and the
-- rest at once, with no policy rewritten and no chance of missing a table.
--
-- Only two policies did not use the helper:
--   * agencies  — split below (members read; owners/admins write)
--   * feedback INSERT — already routes via the helper in WITH CHECK, unchanged
--
-- RECURSION HAZARD (the reason for SECURITY DEFINER):
--   memberships' own policy is `user_id = auth.uid() OR agency_id in
--   (select auth_agency_ids())`. Pointing auth_agency_ids() at memberships
--   under SECURITY INVOKER makes reading memberships evaluate a policy that
--   reads memberships — Postgres aborts with "infinite recursion detected in
--   policy". SECURITY DEFINER lets the helper read the table without
--   re-entering RLS. search_path is pinned so the definer right cannot be
--   redirected at a shadowed table.
--
-- Safe to re-run. Additive: no column is dropped and no existing row changes.
-- ─────────────────────────────────────────────────────────────

-- ── 1) Membership-aware agency set ────────────────────────────
-- The UNION with agencies.owner_id is a deliberate safety net, not redundancy:
-- an owner whose membership row is missing (the app only started writing them
-- in this release) keeps full access instead of being locked out of their own
-- workspace. Owners are therefore never dependent on the backfill.
create or replace function auth_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.agency_id from memberships m where m.user_id = (select auth.uid())
  union
  select a.id from agencies a where a.owner_id = (select auth.uid());
$$;

-- Agencies where the user may change settings, billing or the team.
-- Same definer reasoning as above.
create or replace function auth_admin_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.agency_id from memberships m
   where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
  union
  select a.id from agencies a where a.owner_id = (select auth.uid());
$$;

-- Used by policies on memberships itself, so it needs the same treatment.
create or replace function is_agency_member(p_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
     where m.agency_id = p_agency and m.user_id = (select auth.uid())
  ) or exists (
    select 1 from agencies a
     where a.id = p_agency and a.owner_id = (select auth.uid())
  );
$$;

-- ── 2) agencies: members read, admins write ───────────────────
-- Previously one FOR ALL policy keyed on owner_id, which is why a member saw
-- nothing: agency name, logo and brand colour are read on nearly every page.
drop policy if exists "own agency" on agencies;
drop policy if exists "members read agency" on agencies;
drop policy if exists "owner creates agency" on agencies;
drop policy if exists "admins update agency" on agencies;
drop policy if exists "owner deletes agency" on agencies;

create policy "members read agency" on agencies
  for select using (id in (select auth_agency_ids()));

-- Signup: you may only create an agency you own.
create policy "owner creates agency" on agencies
  for insert with check (owner_id = (select auth.uid()));

-- Branding/settings changes are owner+admin. The WITH CHECK repeats the
-- predicate so a row cannot be updated out of the caller's own agency.
create policy "admins update agency" on agencies
  for update using (id in (select auth_admin_agency_ids()))
  with check (id in (select auth_admin_agency_ids()));

-- Deleting the workspace stays with the owner alone.
create policy "owner deletes agency" on agencies
  for delete using (owner_id = (select auth.uid()));

-- ── 3) memberships: readable by the team, writable by admins ──
drop policy if exists "read own memberships" on memberships;
create policy "read own memberships" on memberships
  for select using (
    user_id = (select auth.uid()) or agency_id in (select auth_agency_ids())
  );

-- Insert covers two cases and needs no service role for either: a new signup
-- writing their own owner row (auth_admin_agency_ids() already includes an
-- agency you own, via its owner_id union), and an admin adding a member.
drop policy if exists "admins insert memberships" on memberships;
create policy "admins insert memberships" on memberships
  for insert with check (agency_id in (select auth_admin_agency_ids()));

drop policy if exists "admins manage memberships" on memberships;
create policy "admins manage memberships" on memberships
  for delete using (agency_id in (select auth_admin_agency_ids()));

drop policy if exists "admins update memberships" on memberships;
create policy "admins update memberships" on memberships
  for update using (agency_id in (select auth_admin_agency_ids()))
  with check (agency_id in (select auth_admin_agency_ids()));

-- ── 4) invitations ────────────────────────────────────────────
-- Only the HASH of the token is stored. The raw token exists solely in the
-- emailed link, so read access to this table (or a database dump) cannot be
-- used to accept an invitation on someone else's behalf.
create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies (id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('admin', 'member')),
  token_hash  text not null unique,
  invited_by  uuid references auth.users (id) on delete set null,
  status      text not null default 'pending'
              check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists invitations_agency_idx on invitations (agency_id, created_at desc);
create index if not exists invitations_email_idx  on invitations (lower(email));

-- At most one OUTSTANDING invite per email per agency; historical accepted or
-- revoked rows are kept for the audit trail, so this is a partial index rather
-- than a plain unique constraint.
create unique index if not exists invitations_pending_uniq
  on invitations (agency_id, lower(email))
  where status = 'pending';

alter table invitations enable row level security;

-- Admins see and manage their agency's invitations. The invitee is NOT covered
-- by any policy on purpose: acceptance runs server-side with the service role,
-- because the invitee is by definition not yet a member of the agency.
drop policy if exists "admins read invitations" on invitations;
create policy "admins read invitations" on invitations
  for select using (agency_id in (select auth_admin_agency_ids()));

drop policy if exists "admins write invitations" on invitations;
create policy "admins write invitations" on invitations
  for insert with check (agency_id in (select auth_admin_agency_ids()));

drop policy if exists "admins update invitations" on invitations;
create policy "admins update invitations" on invitations
  for update using (agency_id in (select auth_admin_agency_ids()))
  with check (agency_id in (select auth_admin_agency_ids()));

drop policy if exists "admins delete invitations" on invitations;
create policy "admins delete invitations" on invitations
  for delete using (agency_id in (select auth_admin_agency_ids()));

comment on column invitations.token_hash is
  'SHA-256 of the invite token. The raw token is only ever in the emailed link.';

-- ── 5) Backfill any owner missing a membership ────────────────
-- 0030 backfilled existing agencies; the app did not yet write a membership on
-- signup, so agencies created between then and this release have none. Repeat
-- the backfill so no owner depends on the UNION safety net above.
insert into memberships (agency_id, user_id, role)
  select id, owner_id, 'owner' from agencies
on conflict (agency_id, user_id) do nothing;
