-- =====================================================================
-- migration_v8.sql  -  run ONCE in Supabase > SQL Editor (safe to run again, never deletes data)
-- FIXES "The database did not keep the change" / appearance saved but not showing.
-- Cause: the website look is stored as one JSON object. If that row was ever edited as plain text (for example in
-- Admin > Settings), it became TEXT and every later save was merged into the text instead of being stored.
-- =====================================================================

-- 1) repair damaged rows (text / list instead of an object)
do $$
declare r record; fixed jsonb;
begin
  for r in select key, value from public.store_settings where key in ('branding', 'storefront') and jsonb_typeof(value) <> 'object' loop
    fixed := '{}'::jsonb;
    begin
      if jsonb_typeof(r.value) = 'string' and (r.value #>> '{}') ~ '^\s*\{' then fixed := (r.value #>> '{}')::jsonb;
      elsif jsonb_typeof(r.value) = 'array' and jsonb_typeof(r.value -> -1) = 'object' then fixed := r.value -> -1; end if;
    exception when others then fixed := '{}'::jsonb;
    end;
    if jsonb_typeof(fixed) <> 'object' then fixed := '{}'::jsonb; end if;
    update public.store_settings set value = fixed, is_public = true where key = r.key;
  end loop;
end $$;
update public.store_settings set is_public = true where key in ('branding', 'storefront');

-- 2) latest save function (also ignores any damaged value in future)
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
  if jsonb_typeof(cur) <> 'object' then cur := '{}'::jsonb; end if;   -- a damaged (text/list) value is replaced instead of being merged into
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
