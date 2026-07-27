-- Record HOW a report email was sent: by a person, or by the scheduler.
--
-- The activity timeline needs to tell "Report emailed" from "Scheduled report
-- sent", and nothing in email_logs distinguished them — every delivery goes
-- through the same pipeline (lib/delivery.ts), so the origin has to be carried
-- in rather than inferred. Guessing from "does this client have a schedule?"
-- would mislabel every manual send to a scheduled client.
--
-- Deliberately NULLABLE with no default: rows written before this migration
-- have an genuinely unknown origin, and NULL says that honestly. Readers treat
-- NULL as "manual" for display, which preserves exactly what the timeline
-- showed before this change — no historical row changes meaning.

alter table email_logs add column if not exists source text;

-- NULL stays legal (historical rows); anything present must be a known origin.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'email_logs'::regclass
       and conname  = 'email_logs_source_check'
  ) then
    alter table email_logs
      add constraint email_logs_source_check
      check (source is null or source in ('manual', 'scheduled'));
  end if;
end $$;

-- The timeline and delivery history both read an agency's recent logs newest
-- first; source rides along so filtering by origin stays index-only.
create index if not exists email_logs_agency_source_idx
  on email_logs (agency_id, sent_at desc, source);

comment on column email_logs.source is
  'How the email was triggered: manual (a person clicked send) or scheduled (the cron delivery engine). NULL = sent before this column existed.';
