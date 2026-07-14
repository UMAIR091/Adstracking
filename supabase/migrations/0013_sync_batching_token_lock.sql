-- ─────────────────────────────────────────────────────────────
-- 0013: Scalable sync batching + single-flight token-refresh lock
--
-- Two operational hardening changes, both on data_sources:
--
-- 1) BOUNDED BATCH SYNC. The cron used to load *every* syncable source and
--    process them sequentially in one 60s request — this does not scale past a
--    few dozen connections. We now claim only the N stalest sources per run,
--    ordered by when they were last *attempted*. `last_sync_attempt_at` is
--    stamped on every attempt (success OR failure), so an erroring source can
--    never monopolise the queue and starve the others: it rotates to the back
--    just like a successful one. `last_synced_at` still records the last
--    *successful* sync for the UI.
--
-- 2) TOKEN-REFRESH LEASE LOCK. A short-lived, TTL'd row lease so the cron and a
--    manual "Refresh now" can't refresh the same source's OAuth token at the
--    same time (which, for providers with rotating refresh tokens, would
--    invalidate one of them). `token_locked_until` is the lease expiry, so a
--    crashed worker's lock is automatically reclaimable — no permanently stuck
--    locks. `token_lock_token` identifies the holder for a safe conditional
--    release.
--
-- All columns are nullable/back-compatible; no data migration required. RLS is
-- unchanged (still owner-scoped on the parent agency).
-- ─────────────────────────────────────────────────────────────

alter table data_sources add column if not exists last_sync_attempt_at timestamptz;
alter table data_sources add column if not exists token_lock_token uuid;
alter table data_sources add column if not exists token_locked_until timestamptz;

-- Backfill so existing rows enter the rotation using their last successful sync
-- (never-synced rows keep NULL and sort first — they get picked up first).
update data_sources
   set last_sync_attempt_at = last_synced_at
 where last_sync_attempt_at is null
   and last_synced_at is not null;

-- The cron orders by last_sync_attempt_at asc nulls first, filtered to syncable
-- types. This partial-friendly index keeps that ordering cheap at thousands of
-- rows. NULLS FIRST is the default for ASC, matching the query.
create index if not exists data_sources_sync_queue_idx
  on data_sources (last_sync_attempt_at asc nulls first);
