-- ─────────────────────────────────────────────────────────────
-- 0037: Atomic client-limit writes (launch audit B1, step 1 of 2)
--
-- The plan's client limit was checked in a server action and the row was then
-- inserted with the caller's own RLS client. Two gaps:
--
--   * RLS let tenants insert clients (and un-archive them) directly, skipping
--     the check altogether. Closed in 0038.
--   * The check and the write were separate round-trips, so concurrent
--     requests could all read "4 of 5" and all insert.
--
-- These functions do the count and the write in one transaction, serialised
-- per agency with an advisory lock. The limit is still decided in lib/billing
-- (config.ts stays the single source of truth) and passed in; SQL only
-- guarantees that the number is honoured atomically.
--
-- Service role only. A caller chooses the limit, so EXECUTE is revoked from
-- the client roles (Supabase grants it to them by default).
--
-- Additive: nothing existing changes, so this is safe to apply while the
-- previous deploy is still serving. Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- Inserts a client unless the agency already has p_max_clients active ones.
-- Returns the new id, or null when the limit is reached.
create or replace function create_client_within_limit(
  p_agency      uuid,
  p_max_clients int,
  p_name        text,
  p_logo_url    text,
  p_email       text,
  p_website     text,
  p_notes       text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_active int;
  v_id     uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('client-limit:' || p_agency::text, 0));

  select count(*) into v_active
    from clients
   where agency_id = p_agency and not archived;

  if v_active >= p_max_clients then
    return null;
  end if;

  insert into clients (agency_id, name, logo_url, email, website, notes)
  values (p_agency, p_name, p_logo_url, p_email, p_website, p_notes)
  returning id into v_id;

  return v_id;
end;
$$;

-- Un-archives a client unless that would exceed p_max_clients active ones.
-- Returns 'restored' (also when it was already active), 'limit' or 'not_found'.
create or replace function restore_client_within_limit(
  p_agency      uuid,
  p_client      uuid,
  p_max_clients int
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_archived boolean;
  v_active   int;
begin
  perform pg_advisory_xact_lock(hashtextextended('client-limit:' || p_agency::text, 0));

  select archived into v_archived
    from clients
   where id = p_client and agency_id = p_agency
     for update;

  if not found then
    return 'not_found';
  end if;
  if not v_archived then
    return 'restored';
  end if;

  select count(*) into v_active
    from clients
   where agency_id = p_agency and not archived;

  if v_active >= p_max_clients then
    return 'limit';
  end if;

  update clients set archived = false where id = p_client;
  return 'restored';
end;
$$;

revoke all on function create_client_within_limit(uuid, int, text, text, text, text, text) from public, anon, authenticated;
revoke all on function restore_client_within_limit(uuid, uuid, int) from public, anon, authenticated;
grant execute on function create_client_within_limit(uuid, int, text, text, text, text, text) to service_role;
grant execute on function restore_client_within_limit(uuid, uuid, int) to service_role;
