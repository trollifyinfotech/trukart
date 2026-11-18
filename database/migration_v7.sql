-- =====================================================================
-- migration_v7.sql  -  run ONCE in Supabase > SQL Editor (safe to run again, never deletes data)
--  * Admin > Appearance: adds FONT upload (OTF / TTF / WOFF / WOFF2) and where-to-use settings
--  * Re-installs the appearance save function (fixes "saved but nothing changes" if an older copy was installed)
--  * Makes sure the saved appearance is PUBLIC so every visitor sees it
-- =====================================================================
create or replace function public.admin_save_branding(p_settings jsonb, p_expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur jsonb; cur_ts timestamptz; k text; v jsonb; found_row boolean;
  allowed text[] := array['site_name','tagline','primary_color','secondary_color','accent_color','logo_path','footer_logo_path','favicon_path','fonts','font_targets'];
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'INVALID_BRANDING'; end if;
  select value, updated_at into cur, cur_ts from public.store_settings where key = 'branding' for update;
  found_row := found;
  if found_row and p_expected is not null and cur_ts is distinct from p_expected then raise exception 'BRANDING_CONFLICT'; end if;
  cur := coalesce(cur, '{}'::jsonb);
  for k, v in select key, value from jsonb_each(p_settings) loop
    if not (k = any (allowed)) then raise exception 'INVALID_BRANDING'; end if;
    if k in ('primary_color','secondary_color','accent_color') and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^#[0-9A-Fa-f]{6}$') then raise exception 'INVALID_COLOR'; end if;
    if k = 'site_name' and (jsonb_typeof(v) <> 'string' or char_length(trim(v #>> '{}')) not between 2 and 60) then raise exception 'INVALID_NAME'; end if;
    if k = 'tagline' and (jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 120) then raise exception 'INVALID_TAGLINE'; end if;
    if k in ('logo_path','footer_logo_path','favicon_path') and jsonb_typeof(v) <> 'null'
       and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^branding/[a-z0-9-]+\.(png|jpe?g|webp|ico)$') then raise exception 'INVALID_PATH'; end if;
    if k = 'fonts' and jsonb_typeof(v) <> 'null' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 6 then raise exception 'INVALID_FONT'; end if;
      if exists (select 1 from jsonb_array_elements(v) f where jsonb_typeof(f) <> 'object' or (f->>'id') !~ '^[a-z0-9-]{1,40}$' or char_length(coalesce(f->>'name','')) not between 1 and 40
                 or (f->>'path') !~* '^branding/fonts/[a-z0-9-]+\.(otf|ttf|woff2?)$') then raise exception 'INVALID_FONT'; end if;
    end if;
    if k = 'font_targets' and jsonb_typeof(v) <> 'null' then
      if jsonb_typeof(v) <> 'object' then raise exception 'INVALID_FONT'; end if;
      if exists (select 1 from jsonb_each(v) t where t.key not in ('all','headings','product','price','button','menu') or (jsonb_typeof(t.value) not in ('string','null'))) then raise exception 'INVALID_FONT'; end if;
    end if;
    cur := cur || jsonb_build_object(k, v);
  end loop;
  insert into public.store_settings(key, value, is_public, description)
  values ('branding', cur, true, 'Website appearance & branding (managed in Admin > Appearance)')
  on conflict (key) do update set value = excluded.value, is_public = true;
  -- keep the older brand_name / brand_tagline keys in sync (used by footer text and policy pages)
  if cur ? 'site_name' then update public.store_settings set value = to_jsonb(cur ->> 'site_name') where key = 'brand_name'; end if;
  if cur ? 'tagline' then update public.store_settings set value = to_jsonb(cur ->> 'tagline') where key = 'brand_tagline'; end if;
  perform public._audit('branding_updated', 'store_settings', 'branding', jsonb_build_object('changed', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_object_keys(p_settings) x)));
  return jsonb_build_object('updated_at', (select updated_at from public.store_settings where key = 'branding'));
end $$;

-- allow font files next to the images in the public brand-assets bucket (admin-only upload policy already exists)
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/x-icon','image/vnd.microsoft.icon',
                                  'font/otf','font/ttf','font/woff','font/woff2','application/font-woff','application/font-woff2',
                                  'application/x-font-ttf','application/x-font-otf','application/vnd.ms-opentype','application/octet-stream'],
       file_size_limit = 5242880
 where id = 'brand-assets';

-- appearance + storefront rows must be readable by visitors
update public.store_settings set is_public = true where key in ('branding', 'storefront');
