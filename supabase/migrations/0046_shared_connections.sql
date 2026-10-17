-- ─────────────────────────────────────────────────────────────
-- 0046: Shared agency connections (sign in once per platform)
--
-- Until now every client connection was its own sign-in: data_sources held
-- one set of tokens per (client, type). An agency with 20 clients signed in to
-- Meta 20 times, and because Facebook tokens can't be extended (a fresh
-- sign-in every ~60 days), it would reconnect Meta 20 times every two months.
--
-- connections holds one saved sign-in (encrypted tokens + who signed in) per
-- agency and integration type. data_sources keeps everything per client (the
-- selected account, sync state) and points at the sign-in it uses, so a second
-- client reuses an existing sign-in by picking its account, and one reconnect
-- renews every client on it.
--
-- Tenants READ sign-ins (who, which provider, expiry, status) but never their
-- tokens; only server code (service role) writes them, the same pattern as
-- 0038. A composite foreign key keeps a client's connection on a sign-in from
-- its own workspace and of its own type.
--
-- The old token columns on data_sources stay for now so the previous deploy
-- keeps working during rollout; a later migration drops them. Apply BEFORE the
-- deploy that reads tokens from connections. Safe to re-run: the backfill only
-- touches rows not yet linked, so re-running after the deploy picks up any
-- connection made by the old code in between.
-- ─────────────────────────────────────────────────────────────

create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  type text not null,
  -- Which sign-in route made it, for integrations that offer more than one
  -- (instagram | facebook, microsoft | google). Null = the only route.
  identity_provider text,
  -- Who signed in (a name or an email), shown when choosing a sign-in.
  display_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  token_lock_token uuid,
  token_locked_until timestamptz,
  status text not null default 'connected' check (status in ('connected', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_id_agency_type_key unique (id, agency_id, type)
);

create index if not exists connections_agency_type_idx on connections (agency_id, type);

drop trigger if exists trg_connections_updated on connections;
create trigger trg_connections_updated
  before update on connections
  for each row execute function set_updated_at();

alter table connections enable row level security;
drop policy if exists "members read connections" on connections;
create policy "members read connections" on connections
  for select using (agency_id in (select auth_agency_ids()));

revoke all on connections from anon, authenticated;
grant select (id, agency_id, type, identity_provider, display_name, token_expires_at, status, created_at, updated_at)
  on connections to authenticated;

-- ── data_sources → connections ───────────────────────────────
alter table data_sources add column if not exists connection_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'data_sources_connection_fkey') then
    alter table data_sources
      add constraint data_sources_connection_fkey
      foreign key (connection_id, agency_id, type) references connections (id, agency_id, type);
  end if;
end $$;

create index if not exists data_sources_connection_idx on data_sources (connection_id);

-- A sign-in exists only while a client uses it: when the last client on it
-- disconnects, moves to another sign-in, or is deleted, its tokens go too
-- (the consent screen promises disconnecting deletes the stored tokens).
-- Security definer because tenants can delete their data_sources but have no
-- write access to connections.
create or replace function delete_orphan_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.connection_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if new.connection_id is not distinct from old.connection_id then
      return null;
    end if;
  end if;
  if not exists (select 1 from data_sources where connection_id = old.connection_id) then
    delete from connections where id = old.connection_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_data_sources_orphan_connection on data_sources;
create trigger trg_data_sources_orphan_connection
  after delete or update of connection_id on data_sources
  for each row execute function delete_orphan_connection();

-- ── Backfill: one sign-in per existing connection ─────────────
-- Nobody has to reconnect. Instagram connections made before Instagram
-- sign-in existed (17 Oct 2026) were all Facebook ones.
do $$
declare
  r record;
  new_id uuid;
begin
  for r in
    select * from data_sources
    where connection_id is null and access_token is not null
    order by created_at
  loop
    insert into connections (
      agency_id, type, identity_provider, display_name,
      access_token, refresh_token, token_expires_at, status, created_at
    ) values (
      r.agency_id,
      r.type,
      coalesce(r.config->>'identity_provider', case when r.type = 'instagram' then 'facebook' end),
      r.display_name,
      r.access_token,
      r.refresh_token,
      r.token_expires_at,
      case when r.status = 'revoked' then 'revoked' else 'connected' end,
      r.created_at
    )
    returning id into new_id;

    update data_sources set connection_id = new_id where id = r.id;
  end loop;
end $$;
