-- ─────────────────────────────────────────────────────────────
-- 0042: Ad attribution for the Meta Conversions API
--
-- A 3-day trial turns into a payment on the server, days after the browser
-- has gone, so the Meta Pixel can never see the conversion that matters. When
-- a customer opens checkout, the billing route stores the browser identifiers
-- Meta needs to attribute that later payment (the _fbp/_fbc cookies the pixel
-- set, plus IP and user agent). The Paddle webhook then reports the agency's
-- first real payment to Meta once and stamps purchase_sent_at, clearing the
-- identifiers (lib/metaCapi.ts).
--
-- A row is written only when the pixel cookies exist, i.e. the visitor was
-- somewhere the pixel may run: never for the EEA, UK or Switzerland, never for
-- a browser sending Global Privacy Control. Rows that never convert are purged
-- after 60 days by the daily sync cron.
--
-- Service role only: RLS is on with no policies, and the tenant roles get no
-- grants, so no customer can read or write these rows.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.ad_attribution (
  agency_id         uuid primary key references public.agencies (id) on delete cascade,
  fbp               text,
  fbc               text,
  client_ip         text,
  user_agent        text,
  captured_at       timestamptz not null default now(),
  purchase_sent_at  timestamptz
);

alter table public.ad_attribution enable row level security;
revoke all on public.ad_attribution from anon, authenticated;

create index if not exists ad_attribution_captured_at_idx on public.ad_attribution (captured_at);
