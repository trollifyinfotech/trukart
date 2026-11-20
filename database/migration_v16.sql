-- =====================================================================
-- migration_v16.sql  -  run ONCE in Supabase > SQL Editor (safe to run again, never deletes data)
-- Marketplace posters + links (Amazon, Flipkart, Meesho ...) under the price of a product.
--   * admin manages the marketplaces and their poster pictures (Admin > Marketplaces)
--   * every product can carry up to 4 links; the database only accepts https links whose web address belongs to that marketplace
--   * changing the links of a live product sends it back for review (like changing the price)
--   * sellers see these links on their incoming orders
-- =====================================================================
create table if not exists public.marketplaces (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 2 and 40),
  poster_path text,
  domains text[] not null default '{}',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.marketplaces enable row level security;
drop policy if exists mk_select on public.marketplaces;
create policy mk_select on public.marketplaces for select using (true);
drop policy if exists mk_admin on public.marketplaces;
create policy mk_admin on public.marketplaces for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.marketplaces to anon, authenticated;
grant insert, update, delete on public.marketplaces to authenticated;

insert into public.marketplaces (id, name, domains, sort_order) values
  ('amazon',   'Amazon',   array['amazon.in','amazon.com','amzn.in','amzn.to','a.co'], 1),
  ('flipkart', 'Flipkart', array['flipkart.com','fkrt.it','fkrt.cc'], 2),
  ('meesho',   'Meesho',   array['meesho.com'], 3),
  ('myntra',   'Myntra',   array['myntra.com','myntr.in'], 4),
  ('ajio',     'Ajio',     array['ajio.com','ajiio.in'], 5),
  ('nykaa',    'Nykaa',    array['nykaa.com'], 6),
  ('snapdeal', 'Snapdeal', array['snapdeal.com'], 7),
  ('jiomart',  'JioMart',  array['jiomart.com'], 8)
on conflict (id) do nothing;

alter table public.products add column if not exists external_links jsonb not null default '[]'::jsonb;

-- accept only: <= 4 links, https, plain web address of the chosen marketplace (no user@, no port, no look-alike domains)
create or replace function public._validate_external_links() returns trigger
language plpgsql security definer set search_path = public as $$
declare e jsonb; m public.marketplaces; u text; v_auth text; cnt int := 0; res jsonb := '[]'::jsonb;
begin
  if new.external_links is null or jsonb_typeof(new.external_links) <> 'array' then new.external_links := '[]'::jsonb; return new; end if;
  if tg_op = 'UPDATE' and new.external_links = old.external_links then return new; end if;
  for e in select * from jsonb_array_elements(new.external_links) loop
    cnt := cnt + 1; if cnt > 4 then raise exception 'TOO_MANY_LINKS'; end if;
    if jsonb_typeof(e) <> 'object' then raise exception 'INVALID_LINK'; end if;
    u := btrim(coalesce(e->>'url', ''));
    if char_length(u) > 600 or u !~* '^https://[^/?#[:space:]]+' or u ~ '[[:space:]]' then raise exception 'INVALID_LINK'; end if;
    v_auth := lower(substring(u from '^https://([^/?#]*)'));
    if v_auth !~ '^[a-z0-9.-]+$' then raise exception 'INVALID_LINK'; end if;
    select * into m from public.marketplaces where id = (e->>'m') and is_active;
    if not found then raise exception 'INVALID_MARKETPLACE'; end if;
    if not exists (select 1 from unnest(m.domains) d where v_auth = d or v_auth like '%.' || d) then raise exception 'LINK_DOMAIN_MISMATCH'; end if;
    res := res || jsonb_build_array(jsonb_build_object('m', m.id, 'url', u));
  end loop;
  new.external_links := res; return new;
end $$;
drop trigger if exists trg_products_links on public.products;
create trigger trg_products_links before insert or update on public.products for each row execute function public._validate_external_links();

-- live products go back for review when their links change
create or replace function public.guard_product() returns trigger language plpgsql security definer set search_path = public as $$
declare v_privileged boolean := coalesce(current_setting('app.internal', true), '') = '1'
                                 or public.is_admin() or auth.role() = 'service_role' or auth.uid() is null;
begin
  new.search_document := public.compute_search_document(new);
  if not v_privileged then
    if tg_op = 'INSERT' then
      if new.approval_status not in ('draft','pending_review') then new.approval_status := 'draft'; end if;
      new.sales_count := 0; new.view_count := 0; new.rejection_note := null;
    else
      if new.seller_id <> old.seller_id then raise exception 'FORBIDDEN'; end if;
      new.sales_count := old.sales_count; new.view_count := old.view_count; new.rejection_note := old.rejection_note;
      if new.approval_status is distinct from old.approval_status then
        if new.approval_status not in ('draft','pending_review','archived') then raise exception 'FORBIDDEN_STATUS'; end if;
      elsif old.approval_status = 'approved' and public._setting_bool('require_reapproval', true)
            and (new.title, new.description, new.base_price, new.original_price, new.category_id, new.brand_id, new.material, new.external_links)
                is distinct from (old.title, old.description, old.base_price, old.original_price, old.category_id, old.brand_id, old.material, old.external_links) then
        new.approval_status := 'pending_review';
      end if;
    end if;
    if new.approval_status = 'pending_review' and public._setting_bool('auto_approve_products', false) then
      new.approval_status := 'approved';
    end if;
  end if;
  return new;
end $$;

-- sellers see the marketplace links of the products on their orders
create or replace function public.seller_order_links(p_items uuid[]) returns table(item_id uuid, product_id uuid, links jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_seller_id() is null then raise exception 'FORBIDDEN'; end if;
  return query select oi.id, oi.product_id, coalesce(p.external_links, '[]'::jsonb)
    from public.order_items oi left join public.products p on p.id = oi.product_id
   where oi.id = any(p_items) and oi.seller_id = public.current_seller_id();
end $$;
revoke all on function public.seller_order_links(uuid[]) from public, anon;
grant execute on function public.seller_order_links(uuid[]) to authenticated;
