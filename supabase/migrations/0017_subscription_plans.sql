-- ─────────────────────────────────────────────────────────────
-- 0017: New subscription model — Pro / Pro Plus / Growth / Agency
--
-- The plan catalog moved to four client-tiered plans (identical features, only
-- the client cap + price differ; see src/lib/billing/config.ts). Widen the plan
-- CHECK so the Lemon Squeezy webhook can record subscriptions on the new plan
-- ids. Legacy ids are kept so existing subscription rows stay valid — no data
-- migration, no change to billing/RLS logic.
-- ─────────────────────────────────────────────────────────────

alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in (
    'free',
    'pro', 'pro_plus', 'growth', 'agency',   -- current model
    'starter', 'enterprise', 'team'           -- legacy, kept for existing rows
  ));
