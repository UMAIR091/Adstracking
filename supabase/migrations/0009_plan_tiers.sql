-- ─────────────────────────────────────────────────────────────
-- 0009: Client-based plan tiers
-- The public pricing page sells Starter / Pro / Agency / Enterprise
-- (identical features, different active-client limits). Widen the
-- plan check so webhooks can record subscriptions on the new tiers.
-- ─────────────────────────────────────────────────────────────

alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('free', 'starter', 'pro', 'agency', 'enterprise', 'team'));
