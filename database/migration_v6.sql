-- =====================================================================
-- migration_v6.sql  -  run ONCE in Supabase > SQL Editor (safe to run again, never deletes data)
-- Adds: seller SHOP page (logo, banner, share link, followers, product count, ratings) and review "Helpful" votes.
-- =====================================================================

-- 1) shop fields
alter table public.seller_profiles add column if not exists shop_slug text;
alter table public.seller_profiles add column if not exists logo_path text;
alter table public.seller_profiles add column if not exists banner_path text;
create unique index if not exists seller_profiles_shop_slug_key on public.seller_profiles (shop_slug);

create or replace function public._make_shop_slug(p_name text, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare base text; cand text;
begin
  base := trim(both '-' from lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', '-', 'g')));
  if base = '' then base := 'shop'; end if;
  base := left(base, 50); cand := base;
  while exists (select 1 from public.seller_profiles where shop_slug = cand and id <> p_id) loop
    cand := base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end loop;
  return cand;
end $$;

create or replace function public._shop_slug_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shop_slug is null or new.shop_slug = '' then new.shop_slug := public._make_shop_slug(new.store_name, new.id); end if;
  return new;
end $$;
drop trigger if exists shop_slug_trg on public.seller_profiles;
create trigger shop_slug_trg before insert or update on public.seller_profiles for each row execute function public._shop_slug_trg();
update public.seller_profiles set shop_slug = public._make_shop_slug(store_name, id) where shop_slug is null;

-- a seller may change only these (shop_slug stays fixed so shared links never break)
grant update (logo_path, banner_path) on public.seller_profiles to authenticated;

-- 2) followers
create table if not exists public.shop_follows (
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (seller_id, user_id)
);
alter table public.shop_follows enable row level security;
drop policy if exists follow_select_own on public.shop_follows;
create policy follow_select_own on public.shop_follows for select to authenticated using (user_id = auth.uid());
grant select on public.shop_follows to authenticated;

create or replace function public.toggle_follow(p_seller uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.seller_profiles where id = p_seller and approval_status = 'approved') then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.shop_follows where seller_id = p_seller and user_id = auth.uid()) then
    delete from public.shop_follows where seller_id = p_seller and user_id = auth.uid(); return false;
  end if;
  insert into public.shop_follows(seller_id, user_id) values (p_seller, auth.uid()); return true;
end $$;
revoke all on function public.toggle_follow(uuid) from public, anon;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- 3) review "Helpful" votes
alter table public.product_reviews add column if not exists helpful_count int not null default 0;
create table if not exists public.review_votes (
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (review_id, user_id)
);
alter table public.review_votes enable row level security;
drop policy if exists vote_select_own on public.review_votes;
create policy vote_select_own on public.review_votes for select to authenticated using (user_id = auth.uid());
grant select on public.review_votes to authenticated;

create or replace function public.vote_review(p_review uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_on boolean; v_n int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.product_reviews where id = p_review and moderation_status = 'approved') then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.review_votes where review_id = p_review and user_id = auth.uid()) then
    delete from public.review_votes where review_id = p_review and user_id = auth.uid(); v_on := false;
  else insert into public.review_votes(review_id, user_id) values (p_review, auth.uid()); v_on := true; end if;
  select count(*) into v_n from public.review_votes where review_id = p_review;
  update public.product_reviews set helpful_count = v_n where id = p_review;
  return jsonb_build_object('voted', v_on, 'count', v_n);
end $$;
revoke all on function public.vote_review(uuid) from public, anon;
grant execute on function public.vote_review(uuid) to authenticated;

-- 4) public shop info (owner-rights view: only non-sensitive fields of APPROVED sellers; new columns are added at the end)
create or replace view public.public_sellers as
select sp.id, sp.store_name, sp.business_description, sp.created_at,
       sp.shop_slug, sp.logo_path, sp.banner_path,
       (select count(*) from public.products p where p.seller_id = sp.id and p.approval_status = 'approved' and p.is_active)::int as product_count,
       (select round(avg(pr.rating)::numeric, 1) from public.product_reviews pr join public.products p on p.id = pr.product_id
          where p.seller_id = sp.id and pr.moderation_status = 'approved') as avg_rating,
       (select count(*) from public.product_reviews pr join public.products p on p.id = pr.product_id
          where p.seller_id = sp.id and pr.moderation_status = 'approved')::int as rating_count,
       (select count(*) from public.shop_follows f where f.seller_id = sp.id)::int as followers_count
from public.seller_profiles sp where sp.approval_status = 'approved';
grant select on public.public_sellers to anon, authenticated;
