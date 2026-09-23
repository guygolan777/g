-- ============================================================
-- mibale · 0005 realtime + storage
-- ============================================================

-- Realtime (postgres_changes). RLS still applies to every subscriber.
alter publication supabase_realtime add table public.event_participants;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.event_messages;
alter publication supabase_realtime add table public.community_messages;

-- Storage: one public media bucket; every user writes only inside "{uid}/...".
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do nothing;

create policy "media: public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');
create policy "media: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
