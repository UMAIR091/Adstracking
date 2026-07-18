-- ─────────────────────────────────────────────────────────────
-- 0014: sync_errors — historical, queryable error log for production
-- monitoring.
--
-- data_sources already records the *latest* failure per source
-- (last_sync_error + status). That's enough to render a Reconnect prompt, but
-- it overwrites on every attempt, so there's no history and no cross-provider
-- view. This table appends one row per failure across every subsystem (sync,
-- OAuth callbacks, report generation, cron, API routes), so an operator can see
-- what's failing, for whom, and whether it will retry.
--
-- Writes come from trusted server code via the service-role key (which bypasses
-- RLS); the SELECT policy is owner-scoped so each agency sees only its own
-- errors in the dashboard. All columns are additive — no existing table changes.
-- ─────────────────────────────────────────────────────────────

create table if not exists sync_errors (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agencies (id) on delete cascade,
  -- Nullable + set null on delete so an error survives its source being removed;
  -- `provider` is denormalized for the same reason (the join may be gone).
  data_source_id uuid references data_sources (id) on delete set null,
  context        text not null,   -- sync | oauth_callback | report | cron | api_route
  provider       text,            -- integration id, e.g. 'google_ads'
  error_type     text not null,   -- reauth | transient | config | unexpected
  message        text not null,
  retry_status   text,            -- will_retry | needs_reconnect | exhausted | none
  created_at     timestamptz not null default now()
);

-- The admin view lists an agency's most recent errors first.
create index if not exists sync_errors_agency_time_idx on sync_errors (agency_id, created_at desc);

alter table sync_errors enable row level security;
drop policy if exists "own sync_errors" on sync_errors;
create policy "own sync_errors" on sync_errors
  for select using (agency_id in (select id from agencies where owner_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policy: only the service-role key (server code) writes.
