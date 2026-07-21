-- ─────────────────────────────────────────────────────────────
-- 0021: White-label email sending
--
-- Agencies can send report emails from their own domain (reports@agency.com)
-- instead of the platform default. Three pieces:
--
--   email_domains   one Resend-managed sending domain per agency, with the
--                   DNS records Resend requires cached for display and the
--                   last known verification status
--   agencies        the sender identity the agency wants to use (name, from
--                   address, reply-to, email footer). Logo, company name and
--                   brand color intentionally reuse the existing branding
--                   columns — one brand, everywhere.
--   email_logs      who the email was actually sent AS, per delivery, so the
--                   history shows whether white-label or the fallback sender
--                   was used for any given send
--
-- SECURITY MODEL: these settings are agency-editable (RLS own-agency), so the
-- stored sender email is treated as a *request*, not a grant. The send path
-- (lib/email/sender.ts) re-derives eligibility on every send: white-label
-- applies only when a verified email_domains row exists AND the sender email
-- is on exactly that domain. Anything else falls back to the platform sender,
-- so a forged row can never make us send as a domain the agency doesn't own.
-- ─────────────────────────────────────────────────────────────

create table if not exists email_domains (
  id                uuid        primary key default gen_random_uuid(),
  agency_id         uuid        not null references agencies (id) on delete cascade,
  domain            text        not null,               -- lowercased, e.g. "agency.com"
  resend_domain_id  text        not null,               -- Resend's id for this domain
  -- Resend statuses: not_started | pending | verified | failed | temporary_failure.
  -- Stored as text (no CHECK) so a new provider status can't break inserts.
  status            text        not null default 'not_started',
  -- The DNS records Resend requires (SPF/DKIM/MX), cached verbatim for the UI.
  dns_records       jsonb       not null default '[]'::jsonb,
  region            text,
  last_checked_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (agency_id)                                    -- one sending domain per agency
);
create index if not exists email_domains_agency_idx on email_domains (agency_id);

create trigger trg_email_domains_updated before update on email_domains
  for each row execute function set_updated_at();

alter table email_domains enable row level security;
drop policy if exists "own email_domains" on email_domains;
create policy "own email_domains" on email_domains
  for all using (agency_id in (select id from agencies where owner_id = auth.uid()))
  with check (agency_id in (select id from agencies where owner_id = auth.uid()));

-- Sender identity. Nulls mean "use the platform defaults".
alter table agencies
  add column if not exists email_sender_name text,      -- "ABC Marketing"
  add column if not exists email_sender_email text,     -- "reports@agency.com"
  add column if not exists email_reply_to text,         -- defaults to contact_email
  add column if not exists email_footer text;           -- closing line in emails

-- What each email was actually sent as (white-label vs fallback is per-send).
alter table email_logs
  add column if not exists from_email  text,
  add column if not exists from_domain text;
