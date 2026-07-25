-- ─────────────────────────────────────────────────────────────
-- 0029: Performance indexes for hot query paths
--
-- Composite indexes matching the app's most frequent filter+sort patterns, so
-- they become index scans instead of "filter by agency, then sort in memory"
-- or "scan snapshots by period". All additive; no data change.
--
-- NOTE for large production tables: create these CONCURRENTLY (outside a
-- transaction) to avoid a write lock. On the current dataset a plain CREATE
-- INDEX is instant.
-- ─────────────────────────────────────────────────────────────

-- Reports list: `where agency_id = ? order by created_at desc` (+ client filter).
create index if not exists reports_agency_created_idx on reports (agency_id, created_at desc);
create index if not exists reports_client_created_idx on reports (client_id, created_at desc);

-- Dashboard snapshot reads: `where agency_id = ? and period_days = ?`.
create index if not exists gsc_snapshots_agency_period_idx on gsc_snapshots (agency_id, period_days);
create index if not exists ga4_snapshots_agency_period_idx on ga4_snapshots (agency_id, period_days);
create index if not exists integration_snapshots_agency_period_idx on integration_snapshots (agency_id, period_days);

-- Delivery history: `where agency_id = ? order by sent_at desc`.
create index if not exists email_logs_agency_sent_idx on email_logs (agency_id, sent_at desc);
