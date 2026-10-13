-- ─────────────────────────────────────────────────────────────
-- 0043: Affiliate / referral tracking
--
-- A creator shares https://<site>/?ref=<code>. Middleware keeps the code in a
-- first-party cookie (anavyst_ref) where ad measurement is allowed, and the
-- agency created at signup is linked to that affiliate once (`referrals`,
-- first touch wins). Each later Paddle payment by a referred agency records
-- what the affiliate is owed (`affiliate_commissions`), keyed on the Paddle
-- transaction so webhook replays never double-count. Refunds and chargebacks
-- reduce or reverse a commission. Payouts happen by hand outside the app; the
-- owner marks commissions paid from /dashboard/admin/affiliates.
--
-- Money is integers in the currency's minor units, never floats.
--
-- Service role only, like ad_attribution (0042): RLS is on with no policies
-- and the tenant roles get no grants, so no customer can read or write these
-- rows — including the affiliates' payout details.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.affiliates (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  name             text not null,
  email            text not null,
  notes            text,
  status           text not null default 'active' check (status in ('active', 'paused')),
  commission_pct   numeric(5,2) not null check (commission_pct >= 0 and commission_pct <= 100),
  commission_type  text not null default 'recurring' check (commission_type in ('first_payment', 'recurring')),
  -- Recurring only: commission applies to payments within this many months of
  -- the referred agency's first payment. Null = for the life of the subscription.
  recurring_months int check (recurring_months is null or recurring_months > 0),
  -- The owner's reference to a Paddle discount code. Not read by the app.
  discount_code    text,
  payout_method    text,
  payout_details   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One row per referred agency. The first affiliate to claim an agency keeps it.
create table if not exists public.referrals (
  agency_id            uuid primary key references public.agencies (id) on delete cascade,
  affiliate_id         uuid not null references public.affiliates (id),
  landing_path         text,
  captured_at          timestamptz not null default now(),
  -- The agency's first payment above zero, which anchors first_payment and
  -- the recurring window. Set by the Paddle webhook.
  first_paid_at        timestamptz,
  first_transaction_id text
);

create table if not exists public.affiliate_commissions (
  id                      uuid primary key default gen_random_uuid(),
  affiliate_id            uuid not null references public.affiliates (id),
  agency_id               uuid not null references public.agencies (id) on delete cascade,
  paddle_transaction_id   text not null unique,
  currency                text not null,
  -- Pre-tax amount charged after discounts (subtotal − discount), minor units.
  net_amount_minor        bigint not null check (net_amount_minor >= 0),
  -- Rate at the time the commission was created; later rate changes don't
  -- rewrite history.
  commission_pct          numeric(5,2) not null,
  commission_amount_minor bigint not null check (commission_amount_minor >= 0),
  status                  text not null default 'pending' check (status in ('pending', 'payable', 'paid', 'reversed')),
  -- pending reads as payable once this passes (computed when read).
  payable_after           timestamptz not null,
  paid_at                 timestamptz,
  payout_reference        text,
  reversed_at             timestamptz,
  -- A refund arrived after the commission was paid out: money to recover.
  clawback_needed         boolean not null default false,
  note                    text,
  -- Net amount refunded so far (partial refunds accumulate), and the Paddle
  -- adjustment ids already applied, so a replayed refund is applied once.
  refunded_net_minor      bigint not null default 0 check (refunded_net_minor >= 0),
  applied_adjustment_ids  text[] not null default '{}',
  created_at              timestamptz not null default now()
);

alter table public.affiliates enable row level security;
alter table public.referrals enable row level security;
alter table public.affiliate_commissions enable row level security;
revoke all on public.affiliates from anon, authenticated;
revoke all on public.referrals from anon, authenticated;
revoke all on public.affiliate_commissions from anon, authenticated;

create index if not exists affiliates_created_at_idx on public.affiliates (created_at);
create index if not exists referrals_affiliate_id_idx on public.referrals (affiliate_id);
create index if not exists referrals_captured_at_idx on public.referrals (captured_at);
create index if not exists affiliate_commissions_affiliate_id_idx on public.affiliate_commissions (affiliate_id);
create index if not exists affiliate_commissions_agency_id_idx on public.affiliate_commissions (agency_id);
create index if not exists affiliate_commissions_created_at_idx on public.affiliate_commissions (created_at);
