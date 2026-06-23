-- ReportFlow — initial schema + row-level security
-- Multi-tenant model: each authenticated user owns one agency (workspace).
-- All tenant data hangs off agencies.id and is isolated via RLS on auth.uid().

-- ─────────────────────────────────────────────────────────────
-- Helper: updated_at trigger
-- ─────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- agencies (the workspace; one per owner)
-- ─────────────────────────────────────────────────────────────
create table agencies (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'My Agency',
  logo_url      text,
  brand_color   text not null default '#4f46e5',
  website       text,
  contact_email text,
  contact_phone text,
  footer_text   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id)
);
create trigger trg_agencies_updated before update on agencies
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────────────────────────
create table clients (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies (id) on delete cascade,
  name        text not null,
  logo_url    text,
  email       text,
  website     text,
  notes       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index clients_agency_idx on clients (agency_id);
create trigger trg_clients_updated before update on clients
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- data_sources (connected accounts; tokens are sensitive — server-only)
-- type: gsc | ga4 | sheets
-- config holds property/site ids, sheet id, column mappings, etc.
-- ─────────────────────────────────────────────────────────────
create table data_sources (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies (id) on delete cascade,
  client_id     uuid references clients (id) on delete cascade,
  type          text not null check (type in ('gsc', 'ga4', 'sheets')),
  display_name  text,
  config        jsonb not null default '{}'::jsonb,
  -- OAuth tokens: encrypted at rest at the app layer; never exposed to the client.
  access_token  text,
  refresh_token text,
  token_expires_at timestamptz,
  status        text not null default 'connected' check (status in ('connected', 'error', 'revoked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index data_sources_agency_idx on data_sources (agency_id);
create index data_sources_client_idx on data_sources (client_id);
create trigger trg_data_sources_updated before update on data_sources
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- report_templates (system templates have agency_id = null; agencies may clone)
-- sections is an ordered list of {key, enabled, title}
-- ─────────────────────────────────────────────────────────────
create table report_templates (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references agencies (id) on delete cascade,
  key         text not null,
  name        text not null,
  description text,
  sections    jsonb not null default '[]'::jsonb,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index report_templates_agency_idx on report_templates (agency_id);

-- ─────────────────────────────────────────────────────────────
-- reports (a generated report instance)
-- ─────────────────────────────────────────────────────────────
create table reports (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies (id) on delete cascade,
  client_id     uuid not null references clients (id) on delete cascade,
  template_key  text not null,
  title         text not null,
  status        text not null default 'draft' check (status in ('draft', 'generating', 'ready', 'failed')),
  period_start  date,
  period_end    date,
  data          jsonb not null default '{}'::jsonb,  -- snapshot of pulled metrics
  sections      jsonb not null default '[]'::jsonb,  -- resolved sections for this report
  pdf_path      text,                                 -- Supabase Storage path
  share_token   text unique,                          -- for public online report
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index reports_agency_idx on reports (agency_id);
create index reports_client_idx on reports (client_id);
create trigger trg_reports_updated before update on reports
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- report_schedules
-- ─────────────────────────────────────────────────────────────
create table report_schedules (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies (id) on delete cascade,
  client_id     uuid not null references clients (id) on delete cascade,
  template_key  text not null,
  frequency     text not null check (frequency in ('weekly', 'monthly', 'quarterly')),
  next_run_at   timestamptz not null,
  recipients    jsonb not null default '[]'::jsonb,   -- ["client@x.com", ...]
  subject       text,
  message       text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index report_schedules_agency_idx on report_schedules (agency_id);
create index report_schedules_due_idx on report_schedules (enabled, next_run_at);
create trigger trg_report_schedules_updated before update on report_schedules
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- email_logs (delivery + open/click tracking)
-- ─────────────────────────────────────────────────────────────
create table email_logs (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies (id) on delete cascade,
  report_id   uuid references reports (id) on delete set null,
  to_email    text not null,
  subject     text,
  provider_id text,                  -- Resend message id
  status      text not null default 'sent' check (status in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at     timestamptz not null default now(),
  opened_at   timestamptz,
  clicked_at  timestamptz
);
create index email_logs_agency_idx on email_logs (agency_id);
create index email_logs_report_idx on email_logs (report_id);

-- ─────────────────────────────────────────────────────────────
-- subscriptions (provider-agnostic: lemonsqueezy | stripe)
-- ─────────────────────────────────────────────────────────────
create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  agency_id              uuid not null references agencies (id) on delete cascade,
  provider               text not null default 'lemonsqueezy' check (provider in ('lemonsqueezy', 'stripe')),
  provider_customer_id   text,
  provider_subscription_id text,
  plan                   text not null default 'free' check (plan in ('free', 'pro', 'pro_annual')),
  status                 text not null default 'inactive' check (status in ('active', 'trialing', 'past_due', 'canceled', 'inactive')),
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (agency_id)
);
create trigger trg_subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

-- ═════════════════════════════════════════════════════════════
-- Row-Level Security
-- ═════════════════════════════════════════════════════════════
alter table agencies          enable row level security;
alter table clients           enable row level security;
alter table data_sources      enable row level security;
alter table report_templates  enable row level security;
alter table reports           enable row level security;
alter table report_schedules  enable row level security;
alter table email_logs        enable row level security;
alter table subscriptions     enable row level security;

-- agencies: owner can do everything with their own agency
create policy "own agency" on agencies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Helper expression reused by child tables: the row's agency must belong to the user.
-- (Inlined as a subquery in each policy for clarity.)

create policy "own clients" on clients
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

create policy "own data_sources" on data_sources
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

-- templates: system templates (agency_id is null) are readable by everyone;
-- agency-owned templates are private to the agency.
create policy "read system or own templates" on report_templates
  for select using (agency_id is null or agency_id in (select id from agencies where owner_id = auth.uid()));
create policy "write own templates" on report_templates
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

create policy "own reports" on reports
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

create policy "own schedules" on report_schedules
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

create policy "own email_logs" on email_logs
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

create policy "own subscription" on subscriptions
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

-- NOTE: Public shareable reports (by share_token) and the scheduler/webhooks
-- run with the service-role key, which bypasses RLS by design. Those paths must
-- enforce their own checks (e.g., match share_token, verify webhook signature).

-- ═════════════════════════════════════════════════════════════
-- Seed system report templates
-- ═════════════════════════════════════════════════════════════
insert into report_templates (key, name, description, sections, is_system) values
  ('seo', 'SEO Report', 'Search Console + GA4 organic performance',
   '[{"key":"cover","title":"Cover","enabled":true},{"key":"summary","title":"Executive Summary","enabled":true},{"key":"gsc_overview","title":"Search Performance","enabled":true},{"key":"gsc_queries","title":"Top Queries","enabled":true},{"key":"gsc_pages","title":"Top Pages","enabled":true},{"key":"ga4_traffic","title":"Traffic & Engagement","enabled":true}]'::jsonb, true),
  ('ppc', 'PPC Report', 'Paid campaign performance (via Sheets/Ads)',
   '[{"key":"cover","title":"Cover","enabled":true},{"key":"summary","title":"Executive Summary","enabled":true},{"key":"spend","title":"Spend & ROAS","enabled":true},{"key":"campaigns","title":"Campaign Breakdown","enabled":true},{"key":"conversions","title":"Conversions","enabled":true}]'::jsonb, true),
  ('marketing', 'Marketing Performance Report', 'Full-funnel overview',
   '[{"key":"cover","title":"Cover","enabled":true},{"key":"summary","title":"Executive Summary","enabled":true},{"key":"ga4_traffic","title":"Traffic & Engagement","enabled":true},{"key":"gsc_overview","title":"Search Performance","enabled":true},{"key":"spend","title":"Paid Spend","enabled":true},{"key":"conversions","title":"Conversions","enabled":true}]'::jsonb, true),
  ('executive', 'Executive Summary Report', 'One-page high-level KPIs',
   '[{"key":"cover","title":"Cover","enabled":true},{"key":"summary","title":"Executive Summary","enabled":true},{"key":"kpis","title":"Key Metrics","enabled":true}]'::jsonb, true);
