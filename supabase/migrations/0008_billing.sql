-- ─────────────────────────────────────────────────────────────
-- 0008: Lemon Squeezy billing
-- Widens the subscriptions table to mirror Lemon Squeezy's real
-- subscription lifecycle and stores what the billing UI displays.
-- ─────────────────────────────────────────────────────────────

alter table subscriptions
  add column if not exists variant_id        text,
  add column if not exists billing_interval  text,          -- 'monthly' | 'annual'
  add column if not exists ends_at           timestamptz,   -- access end for cancelled subs
  add column if not exists trial_ends_at     timestamptz,   -- LS-managed trial (if any)
  add column if not exists card_brand        text,
  add column if not exists card_last_four    text,
  add column if not exists payment_failed_at timestamptz;

-- Migrate any rows using the old vocabulary before tightening the checks.
update subscriptions set plan = 'pro', billing_interval = 'annual' where plan = 'pro_annual';
update subscriptions set status = 'on_trial'  where status = 'trialing';
update subscriptions set status = 'cancelled' where status = 'canceled';

-- Re-shape the plan / status checks around Lemon Squeezy's lifecycle.
alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('free', 'pro', 'team'));

alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('inactive', 'on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired'));

-- Webhooks look subscriptions up by the Lemon Squeezy subscription id.
create index if not exists subscriptions_provider_sub_idx
  on subscriptions (provider_subscription_id);
