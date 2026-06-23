-- Storage bucket for agency & client logos (public-read, authenticated-write).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "logos public read" on storage.objects;
create policy "logos public read" on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists "logos auth upload" on storage.objects;
create policy "logos auth upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'logos');

drop policy if exists "logos auth update" on storage.objects;
create policy "logos auth update" on storage.objects
  for update to authenticated using (bucket_id = 'logos');

drop policy if exists "logos auth delete" on storage.objects;
create policy "logos auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'logos');
