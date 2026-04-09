-- ═══════════════════════════════════════════════════════════════
--  BeatMarket — Supabase Storage Buckets + RLS
--  Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Create buckets ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers', 'covers', true, 5242880,   array['image/jpeg','image/png','image/webp','image/gif']),
  ('audio',  'audio',  true, 104857600, array['audio/mpeg','audio/wav','audio/mp3','audio/x-wav','audio/aac'])
on conflict (id) do nothing;

-- ── Covers bucket policies ────────────────────────────────────
create policy "Cover images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'covers');

create policy "Authenticated users can upload covers"
  on storage.objects for insert
  with check (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
  );

create policy "Users can update their own covers"
  on storage.objects for update
  using (
    bucket_id = 'covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own covers"
  on storage.objects for delete
  using (
    bucket_id = 'covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Audio bucket policies ─────────────────────────────────────
create policy "Audio files are publicly readable"
  on storage.objects for select
  using (bucket_id = 'audio');

create policy "Authenticated users can upload audio"
  on storage.objects for insert
  with check (
    bucket_id = 'audio'
    and auth.role() = 'authenticated'
  );

create policy "Users can update their own audio"
  on storage.objects for update
  using (
    bucket_id = 'audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own audio"
  on storage.objects for delete
  using (
    bucket_id = 'audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
