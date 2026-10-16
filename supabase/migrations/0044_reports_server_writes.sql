-- 0044: Report rows are written by the server only (audit 2026-10-16)
--
-- Tenants held INSERT and UPDATE on reports through the "own reports" ALL
-- policy, because report generation inserted through the caller's own session.
-- The plan's report allowance is counted by reserve_report_generation()
-- (migration 0040) before that insert, but nothing stopped a signed-in user
-- from inserting a report row straight through the REST API with their browser
-- session, skipping the count (Free = 1 report a month), or from rewriting an
-- existing report's data in place.
--
-- The app now writes reports only with the service role (lib/reportGen.ts and
-- the regenerate-insights route). Tenants keep SELECT (to view) and DELETE (the
-- Reports page lets a member delete a report).
--
-- ROLLOUT ORDER: deploy the code that writes reports with the service role
-- FIRST, then apply this migration. Applied before that code is live, report
-- generation fails for every tenant.

drop policy if exists "own reports" on public.reports;

create policy "members read reports" on public.reports
  for select using (agency_id in (select auth_agency_ids()));

create policy "members delete reports" on public.reports
  for delete using (agency_id in (select auth_agency_ids()));

revoke insert, update on public.reports from anon, authenticated;
