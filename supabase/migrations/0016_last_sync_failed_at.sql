-- ─────────────────────────────────────────────────────────────
-- 0016: last_sync_failed_at — the one field integration health was missing.
--
-- data_sources already tracks connection status (status), last successful sync
-- (last_synced_at), last error (last_sync_error), last *attempt* time
-- (last_sync_attempt_at) and token expiry (token_expires_at). But
-- last_sync_attempt_at is overwritten by the next *successful* sync, so it can't
-- answer "when did it last FAIL?". This column is stamped only on failure, so the
-- health view can show last-success and last-failure side by side.
--
-- Additive + nullable; no backfill, no OAuth/RLS/sync-architecture change (it's
-- set in the same catch block that already writes last_sync_error).
-- ─────────────────────────────────────────────────────────────

alter table data_sources add column if not exists last_sync_failed_at timestamptz;
