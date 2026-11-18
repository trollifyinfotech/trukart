-- =====================================================================
-- migration_v11.sql  -  run ONCE in Supabase > SQL Editor (safe to run again, never deletes data)
-- Background music: a public bucket for songs (only admins can upload/delete) + the "music" setting row.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-music', 'site-music', true, 15728640,
        array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm'])
on conflict (id) do update set public = true, file_size_limit = 15728640,
        allowed_mime_types = array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm'];

drop policy if exists "admin manage site music" on storage.objects;
create policy "admin manage site music" on storage.objects for all to authenticated
  using (bucket_id = 'site-music' and public.is_admin()) with check (bucket_id = 'site-music' and public.is_admin());

insert into public.store_settings(key, value, is_public, description)
values ('music', '{"enabled":false,"volume":0.5,"shuffle":false,"tracks":[]}'::jsonb, true, 'Background music playlist (managed in Admin > Music)')
on conflict (key) do nothing;
update public.store_settings set is_public = true where key = 'music';
