-- ─────────────────────────────────────────────────────────────
-- 0028: Onboarding, localization & retention fields
--
-- Supports the guided onboarding wizard, returning-user "welcome back" summary,
-- and cancellation-feedback capture. All additive and backward-compatible.
-- ─────────────────────────────────────────────────────────────

alter table agencies
  add column if not exists timezone              text,
  add column if not exists report_language       text not null default 'en',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists last_seen_at          timestamptz;

-- Existing agencies predate the onboarding wizard — treat them as already
-- onboarded so they're never forced back through it. Only agencies created
-- AFTER this migration (still NULL) will see the wizard.
update agencies set onboarding_completed_at = created_at where onboarding_completed_at is null;

-- Cancellation feedback — captured when an owner cancels, so churn reasons are
-- learnable. Owner-scoped read; writes go through the app (service role).
create table if not exists cancellation_feedback (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies (id) on delete cascade,
  reason      text,
  comment     text,
  created_at  timestamptz not null default now()
);
create index if not exists cancellation_feedback_agency_idx on cancellation_feedback (agency_id);

alter table cancellation_feedback enable row level security;
drop policy if exists "own cancellation_feedback" on cancellation_feedback;
create policy "own cancellation_feedback" on cancellation_feedback
  for all using (agency_id in (select auth_agency_ids()))
  with check (agency_id in (select auth_agency_ids()));
