-- Allow the new integration types on data_sources. The type is validated by the
-- integration registry at the app layer; this widens the DB check to the known
-- current + planned providers so adding one needs no further migration.

do $$
declare cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'data_sources'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%gsc%';   -- the type check (uniquely contains 'gsc')
  if cname is not null then
    execute format('alter table data_sources drop constraint %I', cname);
  end if;
end $$;

alter table data_sources add constraint data_sources_type_check
  check (type in (
    'gsc', 'ga4', 'sheets',
    'google_ads', 'gbp',
    'meta_ads', 'linkedin_ads', 'microsoft_ads', 'tiktok_ads'
  ));
