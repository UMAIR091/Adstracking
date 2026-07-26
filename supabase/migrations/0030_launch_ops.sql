-- ─────────────────────────────────────────────────────────────
-- 0030: Launch operations — feedback, team-prep, cron heartbeats
--
-- Three additive, non-breaking pieces for launch readiness:
--   1) feedback        — in-app feedback / bug reports (P2 support).
--   2) memberships     — team-architecture PREP (owner backfilled as sole
--                        member) + is_agency_member() helper, so multi-user can
--                        be built later WITHOUT reworking the data model. Existing
--                        owner-scoped RLS is untouched (no regression).
--   3) ops_heartbeats  — crons stamp their last run so the health check + uptime
--                        monitoring can detect a stalled scheduler.
-- ─────────────────────────────────────────────────────────────

-- 1) Feedback / bug reports ────────────────────────────────────
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid references agencies (id) on delete set null,
  user_id    uuid references auth.users (id) on delete set null,
  type       text not null default 'feedback' check (type in ('feedback', 'bug', 'feature')),
  message    text not null,
  url        text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_agency_idx on feedback (agency_id);
alter table feedback enable row level security;
drop policy if exists "own feedback insert" on feedback;
create policy "own feedback insert" on feedback
  for insert with check (agency_id in (select auth_agency_ids()));
drop policy if exists "own feedback read" on feedback;
create policy "own feedback read" on feedback
  for select using (agency_id in (select auth_agency_ids()));

-- 2) Team architecture prep ────────────────────────────────────
create table if not exists memberships (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references agencies (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (agency_id, user_id)
);
create index if not exists memberships_user_idx on memberships (user_id);
create index if not exists memberships_agency_idx on memberships (agency_id);

-- Every existing agency owner becomes the 'owner' member. Future signups should
-- also insert a membership at agency-creation time (app change, separate).
insert into memberships (agency_id, user_id, role)
  select id, owner_id, 'owner' from agencies
on conflict (agency_id, user_id) do nothing;

alter table memberships enable row level security;
drop policy if exists "read own memberships" on memberships;
create policy "read own memberships" on memberships
  for select using (user_id = (select auth.uid()) or agency_id in (select auth_agency_ids()));

-- Helper for the FUTURE membership-based RLS. Not yet used by existing policies
-- (which stay owner-scoped), so this is pure preparation — no behavior change.
create or replace function is_agency_member(p_agency uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from memberships m
     where m.agency_id = p_agency and m.user_id = (select auth.uid())
  );
$$;

-- 3) Cron heartbeats ───────────────────────────────────────────
create table if not exists ops_heartbeats (
  job         text primary key,          -- 'sync' | 'reports'
  last_run_at timestamptz not null default now(),
  ok          boolean not null default true,
  detail      text
);
-- Server-only (service role writes; health check reads via admin). RLS on, no
-- tenant policy = deny all to anon/authenticated.
alter table ops_heartbeats enable row level security;

create or replace function record_heartbeat(p_job text, p_ok boolean, p_detail text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into ops_heartbeats (job, last_run_at, ok, detail)
  values (p_job, now(), coalesce(p_ok, true), p_detail)
  on conflict (job) do update set last_run_at = now(), ok = excluded.ok, detail = excluded.detail;
$$;

revoke all on function record_heartbeat(text, boolean, text) from public, anon, authenticated;
grant execute on function record_heartbeat(text, boolean, text) to service_role;
