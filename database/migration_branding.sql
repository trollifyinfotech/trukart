-- =============================================================================
-- migration_branding.sql  -  "Website Appearance & Branding" (theme colours, logo, favicon, site name)
--
-- WHO NEEDS THIS:
--   * Fresh install: NOTHING to do. This same block is already at the end of database/setup.sql.
--   * You already ran an older setup.sql: open Supabase > SQL Editor > New query, paste THIS WHOLE FILE, Run once.
-- Safe to run again. It only ADDS: one settings row (if missing), one function, one storage MIME list update.
-- It does not delete or overwrite any existing data and does not weaken any policy.
-- =============================================================================

-- 1) Default branding row (public: the storefront must read it). Only inserted if missing.
insert into public.store_settings(key, value, is_public, description)
values ('branding',
        '{"site_name":"Veloura","tagline":"Style that feels like you","primary_color":"#AA336A","secondary_color":"#F8E8EF","accent_color":"#6B2146","logo_path":null,"footer_logo_path":null,"favicon_path":null}'::jsonb,
        true, 'Website appearance & branding (managed in Admin > Appearance)')
on conflict (key) do nothing;

-- 2) Admin-only, validated save. Existing RLS already limits direct writes on store_settings to admins;
--    this function adds server-side validation, optimistic concurrency and an audit entry.
create or replace function public.admin_save_branding(p_settings jsonb, p_expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur jsonb; cur_ts timestamptz; k text; v jsonb; found_row boolean;
  allowed text[] := array['site_name','tagline','primary_color','secondary_color','accent_color','logo_path','footer_logo_path','favicon_path'];
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
revoke all on function public.admin_save_branding(jsonb, timestamptz) from public, anon;
grant execute on function public.admin_save_branding(jsonb, timestamptz) to authenticated;

-- 3) Storage: logos/favicons live in the existing PUBLIC bucket "brand-assets", folder "branding/".
--    Writes are already admin-only by the existing storage policy "admin manage brand assets".
--    Only .ico types are added to the allowed list (PNG/JPEG/WebP were already allowed). SVG is intentionally NOT allowed.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/x-icon','image/vnd.microsoft.icon']
 where id = 'brand-assets';
