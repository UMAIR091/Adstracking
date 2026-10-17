-- ─────────────────────────────────────────────────────────────
-- 0048: Client connect links
--
-- An agency can send a client a link (/connect/<token>) to connect their own
-- accounts from their own device, with no Anavyst login, so the client's
-- passwords never touch the agency. The link names the client and the
-- platforms it may connect, works for 7 days and can be revoked.
--
-- connect_links stores only a SHA-256 of the token: the link itself is shown
-- once, when it's created. Tenants read their links (to list and revoke them)
-- but every write goes through server code (service role), as in 0038.
--
-- A sign-in made through a link is the CLIENT's own, so connections gains
-- client_id: null = an agency sign-in any of its clients may use (0046); set =
-- that client's only, never offered to the agency's other clients.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

create table if not exists connect_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  token_hash text not null unique,
  -- The integrations this link may connect (data_sources.type values).
  types text[] not null check (cardinality(types) > 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists connect_links_client_idx on connect_links (client_id);

alter table connect_links enable row level security;
drop policy if exists "members read connect links" on connect_links;
create policy "members read connect links" on connect_links
  for select using (agency_id in (select auth_agency_ids()));

revoke all on connect_links from anon, authenticated;
grant select (id, agency_id, client_id, types, expires_at, revoked_at, last_used_at, created_by, created_at)
  on connect_links to authenticated;

-- The client must be in the link's workspace (written by the service role,
-- which skips RLS, so this is the check).
create or replace function guard_connect_link_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from clients c where c.id = new.client_id and c.agency_id = new.agency_id) then
    raise exception 'A connect link must belong to the same workspace as its client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connect_links_client on connect_links;
create trigger trg_connect_links_client
  before insert or update of client_id, agency_id on connect_links
  for each row execute function guard_connect_link_client();

-- ── Client-owned sign-ins ─────────────────────────────────────
alter table connections add column if not exists client_id uuid references clients(id) on delete cascade;

grant select (client_id) on connections to authenticated;

create or replace function guard_connection_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from clients c where c.id = new.client_id and c.agency_id = new.agency_id
  ) then
    raise exception 'A sign-in must belong to the same workspace as its client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connections_client on connections;
create trigger trg_connections_client
  before insert or update of client_id, agency_id on connections
  for each row execute function guard_connection_client();

-- A client's own sign-in serves only that client. Tenants can update their
-- data_sources rows directly, so the database holds the line, not just the
-- attach route.
create or replace function guard_data_source_connection()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner uuid;
begin
  if new.connection_id is null then
    return new;
  end if;
  select client_id into owner from connections where id = new.connection_id;
  if owner is not null and owner is distinct from new.client_id then
    raise exception 'That sign-in belongs to another client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_data_sources_connection_owner on data_sources;
create trigger trg_data_sources_connection_owner
  before insert or update of connection_id, client_id on data_sources
  for each row execute function guard_data_source_connection();
