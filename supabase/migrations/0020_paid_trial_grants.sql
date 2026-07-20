-- ─────────────────────────────────────────────────────────────
-- 0020: One-time paid-plan trial
--
-- Paid plans offer a short trial on a customer's FIRST paid subscription only.
-- Enforcing "once, ever" is the whole difficulty: the obvious places to record
-- it are all erasable by the customer.
--
--   * subscriptions row  — replaced/cleared when they cancel and resubscribe
--   * agencies row       — gone if the account is deleted and recreated
--   * Paddle customer    — a new signup creates a new customer id
--
-- So the ledger is its own table, keyed on the normalized email address and
-- deliberately NOT foreign-keyed to agencies with a cascade. Deleting an
-- agency leaves the grant behind, which is precisely the point: signing up
-- again with the same email finds the existing row and bills immediately.
--
-- Writes happen server-side only (webhook / checkout, both service-role or
-- RLS-scoped), so the table carries a restrictive policy: an owner may read
-- their own grant to render accurate UI, and nobody may write through RLS.
-- ─────────────────────────────────────────────────────────────

create table if not exists paid_trial_grants (
  -- Lowercased, trimmed email. Primary key: one grant per identity, forever.
  email                    text        primary key,
  -- Informational; intentionally no FK/cascade so the row outlives the agency.
  agency_id                uuid,
  granted_at               timestamptz not null default now(),
  -- Which plan/interval the trial was taken on, for support and analytics.
  plan                     text,
  billing_interval         text,
  paddle_customer_id       text,
  paddle_subscription_id   text,
  -- Set once the trial ends (converted or lapsed). Presence of the ROW is what
  -- blocks a second trial; this is only for reporting.
  consumed_at              timestamptz
);

create index if not exists paid_trial_grants_agency_idx   on paid_trial_grants (agency_id);
create index if not exists paid_trial_grants_customer_idx on paid_trial_grants (paddle_customer_id);

alter table paid_trial_grants enable row level security;

-- Read-only for the owning agency; no INSERT/UPDATE/DELETE policy exists, so
-- the anon/authenticated roles cannot forge or clear a grant. The webhook and
-- checkout paths use the service-role client, which bypasses RLS.
drop policy if exists "read own paid_trial_grant" on paid_trial_grants;
create policy "read own paid_trial_grant" on paid_trial_grants
  for select using (agency_id in (select id from agencies where owner_id = auth.uid()));

-- Fast path for the common check ("has this agency already had its trial?"),
-- avoiding an email lookup on every billing page render. The grants table
-- remains the authority; this is a denormalized convenience that is only ever
-- set to true.
alter table agencies
  add column if not exists paid_trial_used_at timestamptz;
