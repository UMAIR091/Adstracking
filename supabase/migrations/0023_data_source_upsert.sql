-- ─────────────────────────────────────────────────────────────
-- 0023: Atomic reconnect for data_sources  (audit #6, transactions)
--
-- Reconnecting a source used to be DELETE-then-INSERT in app code — two round
-- trips with a window where the client had no source (and a crash between them
-- left it permanently gone). We replace that with a single idempotent UPSERT,
-- which needs a unique key on (client_id, type): one connection of each type
-- per client, which is exactly the invariant the old delete enforced.
--
-- NULL client_id rows (unattached sources, if any) are left untouched — NULLs
-- are distinct in a unique index (NULLS DISTINCT, the default), so they never
-- collide with each other. The index is intentionally NON-partial so PostgREST
-- can use (client_id, type) directly as an ON CONFLICT target for upserts.
--
-- Dedupe first so the index can be created even if historical duplicates exist.
-- ─────────────────────────────────────────────────────────────

-- Keep the most recently updated row per (client_id, type); drop older dupes.
delete from data_sources d
using data_sources keep
where d.client_id is not null
  and d.client_id = keep.client_id
  and d.type = keep.type
  and (
    keep.updated_at > d.updated_at
    or (keep.updated_at = d.updated_at and keep.id > d.id)
  );

create unique index if not exists data_sources_client_type_key
  on data_sources (client_id, type);
