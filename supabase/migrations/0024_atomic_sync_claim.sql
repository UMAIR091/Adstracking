-- ─────────────────────────────────────────────────────────────
-- 0024: Atomic sync-batch claim  (audit #2)
--
-- claimSyncBatch used to SELECT the N stalest sources; last_sync_attempt_at was
-- only stamped later, inside the per-source sync. Two overlapping cron runs (or
-- cron + a manual trigger) therefore claimed the SAME rows and double-processed
-- them — wasted provider quota and double-counted usage.
--
-- claim_sync_batch() makes the claim atomic: it selects the stalest N rows with
-- FOR UPDATE SKIP LOCKED (the standard Postgres work-queue primitive — a row a
-- concurrent worker already grabbed is skipped, never blocked or double-taken)
-- and stamps last_sync_attempt_at = now() as part of the same statement. Rows
-- are returned to the caller for processing; because their attempt time is now
-- fresh, a second concurrent run picks a disjoint set, and a crashed worker's
-- rows re-enter the queue on the next run (fair rotation preserved).
--
-- SECURITY DEFINER + EXECUTE revoked from tenants: only server (service_role)
-- code may claim work. p_types scopes to syncable integration types (passed
-- from the registry, so no type list is hard-coded in SQL).
-- ─────────────────────────────────────────────────────────────

create or replace function claim_sync_batch(p_types text[], p_limit int)
returns setof data_sources
language sql
security definer
set search_path = public
as $$
  update data_sources
     set last_sync_attempt_at = now()
   where id in (
     select id
       from data_sources
      where type = any(p_types)
      order by last_sync_attempt_at asc nulls first
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning *;
$$;

revoke all on function claim_sync_batch(text[], int) from public, anon, authenticated;
grant execute on function claim_sync_batch(text[], int) to service_role;
