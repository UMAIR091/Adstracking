-- ─────────────────────────────────────────────────────────────
-- 0039: Sending-domain state is server-written (launch audit N3)
--
-- lib/email/sender.ts sends white-label mail from a domain only while the
-- agency's email_domains row says status = 'verified'. That row was
-- tenant-writable: the policy was FOR ALL, so any signed-in member could insert
-- a row reading 'verified' for a domain they never proved, or rewrite domain or
-- resend_domain_id on an existing one. Resend accepts any address on a domain
-- verified in the platform's account, so a forged row for the platform's own
-- domain let a tenant send as billing@<platform domain>, and a rewritten row
-- could point at another agency's verified domain.
--
-- After this migration every column of email_domains is written only by the
-- service role, in the domain routes, from Resend's own answer. Members keep
-- what they had a real use for: reading their row and deleting it.
--
-- A sending domain also belongs to at most one workspace, so a second agency is
-- never handed a domain someone else verified.
--
-- Apply AFTER the deploy that moves the domain routes' writes to the service
-- role; the previous deploy still writes this table as the user.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

drop policy if exists "own email_domains" on email_domains;
drop policy if exists "members read email_domains" on email_domains;
drop policy if exists "members delete email_domains" on email_domains;

create policy "members read email_domains" on email_domains
  for select using (agency_id in (select auth_agency_ids()));
create policy "members delete email_domains" on email_domains
  for delete using (agency_id in (select auth_agency_ids()));

revoke insert, update, truncate on email_domains from anon, authenticated;

create unique index if not exists email_domains_domain_uniq on email_domains (lower(domain));
