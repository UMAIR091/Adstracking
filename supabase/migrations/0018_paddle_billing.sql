-- ─────────────────────────────────────────────────────────────
-- 0018: Paddle Billing
--
-- ReportFlow moves from Lemon Squeezy to Paddle as merchant of record. The
-- subscriptions table was already provider-agnostic, so this migration only
-- widens it rather than reshaping it — no data migration, no RLS change, and
-- existing Lemon Squeezy rows stay valid.
--
-- Column mapping for Paddle (provider = 'paddle'):
--   provider_customer_id     → Paddle customer id  (ctm_…)
--   provider_subscription_id → Paddle subscription id (sub_…)
--   price_id                 → Paddle price id     (pri_…)   [new]
--   cancel_at_period_end     → scheduled_change = cancel     [new]
--   current_period_end       → next_billed_at / current period end
--   ends_at                  → access end once cancellation takes effect
-- ─────────────────────────────────────────────────────────────

-- Paddle joins the allowed providers (lemonsqueezy/stripe kept for old rows).
alter table subscriptions drop constraint if exists subscriptions_provider_check;
alter table subscriptions add constraint subscriptions_provider_check
  check (provider in ('paddle', 'lemonsqueezy', 'stripe'));

alter table subscriptions
  -- Paddle price id for the active item. `variant_id` stays for Lemon Squeezy
  -- rows so historical records keep their original identifier.
  add column if not exists price_id            text,
  -- True while a cancellation is scheduled but the paid period is still running.
  add column if not exists cancel_at_period_end boolean not null default false;

-- Paddle's `trialing` maps to our existing `on_trial`, and `canceled` to
-- `cancelled`, so the status vocabulary is unchanged. Re-assert it here so the
-- constraint is guaranteed present regardless of migration history.
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('inactive', 'on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired'));

-- Webhooks resolve the agency by subscription id first and customer id as a
-- fallback (subscription.* events carry both; transaction.* may carry only the
-- customer). Both lookups need an index.
create index if not exists subscriptions_provider_sub_idx
  on subscriptions (provider_subscription_id);
create index if not exists subscriptions_provider_customer_idx
  on subscriptions (provider_customer_id);
