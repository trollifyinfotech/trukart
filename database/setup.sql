-- =============================================================================
-- Veloura  -  database/setup.sql      (the ONLY SQL file you need)
--
-- HOW: Supabase Dashboard > SQL Editor > New query > paste this WHOLE file > Run.
-- Run it once on a fresh project. It is written to be safe to run again:
--   tables/indexes use IF NOT EXISTS, policies/triggers are dropped+recreated by name,
--   functions use CREATE OR REPLACE, seed rows use ON CONFLICT / NOT EXISTS.
--   It never deletes your data (no DROP TABLE / TRUNCATE).  Re-running DOES reset
--   table GRANTS and RLS policies to the ones defined here (that is the security baseline).
--
-- WHAT IT CREATES: profiles & roles, seller applications, addresses, categories, brands,
--   products/images/variants, carts, wishlists, orders/items/payments/refunds/status history,
--   coupons, reviews, banners, home sections, notifications, return requests, audit logs,
--   analytics, delivery PINs, store settings, storage buckets + policies, and every SQL function
--   (RPC) the website calls. Row Level Security is ON for every table.
--
-- AFTER RUNNING: register on the website, then create your first admin with database/make_admin.sql
-- =============================================================================

-- >>>>>>>> 0001_schema.sql
-- =====================================================================
-- 0001_schema.sql  — tables, constraints, indexes
-- Money is NUMERIC(10,2) in INR. Prices are GST-inclusive (Indian retail norm).
-- =====================================================================
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ---------- identity ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  avatar_url text,
  account_status text not null default 'active' check (account_status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('buyer','seller','admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  owner_name text not null check (char_length(owner_name) between 2 and 120),
  store_name text not null check (char_length(store_name) between 2 and 120),
  business_description text check (char_length(business_description) <= 2000),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email text,
  business_address text not null check (char_length(business_address) between 5 and 500),
  registration_details text check (char_length(registration_details) <= 200),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','suspended')),
  decision_note text,
  decided_by uuid references auth.users(id),
  approved_at timestamptz,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists seller_store_name_uq on public.seller_profiles (lower(store_name));

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  address_line text not null check (char_length(address_line) between 5 and 300),
  landmark text check (char_length(landmark) <= 120),
  city text not null check (char_length(city) between 2 and 80),
  state text not null check (char_length(state) between 2 and 80),
  postal_code text not null check (postal_code ~ '^[1-9][0-9]{5}$'),
  address_type text not null default 'Home' check (address_type in ('Home','Work','Other')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);
create unique index if not exists addresses_one_default_uq on public.addresses(user_id) where is_default;

-- ---------- catalog ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  parent_id uuid references public.categories(id) on delete set null,
  image_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_parent_idx on public.categories(parent_id);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  title text not null check (char_length(title) between 3 and 200),
  slug text not null unique,
  description text check (char_length(description) <= 8000),
  material text check (char_length(material) <= 200),
  care_instructions text check (char_length(care_instructions) <= 1000),
  specifications jsonb not null default '{}'::jsonb,
  original_price numeric(10,2) not null check (original_price > 0),
  base_price numeric(10,2) not null check (base_price > 0),
  tax_rate numeric(5,2) not null default 5 check (tax_rate between 0 and 28),
  is_returnable boolean not null default true,
  approval_status text not null default 'draft' check (approval_status in ('draft','pending_review','approved','rejected','archived')),
  rejection_note text,
  is_active boolean not null default true,
  sales_count int not null default 0 check (sales_count >= 0),
  view_count int not null default 0 check (view_count >= 0),
  search_document text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_price_order check (base_price <= original_price)
);
create index if not exists products_seller_idx on public.products(seller_id);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_brand_idx on public.products(brand_id);
create index if not exists products_status_idx on public.products(approval_status, is_active);
create index if not exists products_created_idx on public.products(created_at desc);
create index if not exists products_sales_idx on public.products(sales_count desc);
create index if not exists products_search_trgm on public.products using gin (search_document gin_trgm_ops);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images(product_id, sort_order);
create unique index if not exists product_images_one_primary_uq on public.product_images(product_id) where is_primary;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique check (char_length(sku) between 2 and 60),
  size text check (char_length(size) <= 20),
  color text check (char_length(color) <= 40),
  price_override numeric(10,2) check (price_override is null or price_override > 0),
  stock_quantity int not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);
create unique index if not exists product_variants_combo_uq on public.product_variants(product_id, coalesce(size,''), coalesce(color,''));

-- ---------- cart / wishlist ----------
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity int not null check (quantity between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_variant_id)
);
create index if not exists cart_items_variant_idx on public.cart_items(product_variant_id);

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (wishlist_id, product_id)
);
create index if not exists wishlist_items_product_idx on public.wishlist_items(product_id);

-- ---------- coupons ----------
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  minimum_order_value numeric(10,2) not null default 0 check (minimum_order_value >= 0),
  maximum_discount numeric(10,2) check (maximum_discount is null or maximum_discount > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit int check (usage_limit is null or usage_limit > 0),
  per_user_limit int not null default 1 check (per_user_limit > 0),
  category_id uuid references public.categories(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  seller_id uuid references public.seller_profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_percent_cap check (discount_type <> 'percent' or discount_value <= 90)
);

-- ---------- orders ----------
create sequence if not exists public.order_number_seq start 100001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  shipping_address_snapshot jsonb not null,
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  shipping_amount numeric(10,2) not null default 0 check (shipping_amount >= 0),
  tax_amount numeric(10,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  coupon_code text,
  payment_method text not null check (payment_method in ('cod','online')),
  payment_status text not null check (payment_status in ('pending','paid','failed','cod_pending','cod_collected','refund_pending','partially_refunded','refunded')),
  order_status text not null check (order_status in ('pending_confirmation','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','return_requested','returned','refunded')),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint orders_total_math check (total_amount = subtotal - discount_amount + shipping_amount)
);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_idx on public.orders(order_status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  seller_id uuid references public.seller_profiles(id) on delete restrict,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null,
  variant_snapshot jsonb not null default '{}'::jsonb,
  seller_snapshot jsonb not null default '{}'::jsonb,
  image_snapshot text,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  tax_rate numeric(5,2) not null default 0,
  is_returnable boolean not null default true,
  fulfillment_status text not null check (fulfillment_status in ('pending_confirmation','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','return_requested','returned','refunded')),
  tracking_number text,
  courier text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_items_line_math check (line_total = unit_price * quantity)
);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_seller_idx on public.order_items(seller_id, created_at desc);
create index if not exists order_items_product_idx on public.order_items(product_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','paid','failed','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id);

-- idempotency ledger for provider webhooks (service-role only)
create table if not exists public.payment_events (
  event_id text primary key,
  provider text not null default 'razorpay',
  event_type text not null,
  received_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested','processing','processed','failed')),
  provider_refund_id text unique,
  reason text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refunds_order_idx on public.refunds(order_id);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  status text not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_history_order_idx on public.order_status_history(order_id, created_at);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  discount_amount numeric(10,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_user_idx on public.coupon_redemptions(coupon_id, user_id);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'requested' check (status in ('requested','approved','rejected','received','refunded')),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists return_requests_user_idx on public.return_requests(user_id);

-- ---------- reviews ----------
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  review_text text check (char_length(review_text) <= 2000),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 4),
  reviewer_name text not null default 'Verified buyer',
  moderation_status text not null default 'approved' check (moderation_status in ('approved','hidden')),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists product_reviews_product_idx on public.product_reviews(product_id, moderation_status);

-- ---------- storefront content ----------
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  cta_label text default 'Shop now',
  image_path text not null,
  target_url text not null default '/',
  placement text not null default 'hero' check (placement in ('hero','mid','strip')),
  starts_at timestamptz,
  ends_at timestamptz,
  show_countdown boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('trending','bestsellers','new','deals','budget','category','recommended','recent','brands')),
  category_id uuid references public.categories(id) on delete cascade,
  max_price numeric(10,2),
  min_discount int,
  item_limit int not null default 10 check (item_limit between 2 and 30),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.pincodes (
  pincode text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  city text,
  state text,
  eta_days int not null default 5 check (eta_days between 1 and 30),
  cod_available boolean not null default true,
  is_active boolean not null default true
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'general',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('product_view','add_to_cart','begin_checkout','purchase')),
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_idx on public.analytics_events(event_name, created_at desc);

-- >>>>>>>> 0002_core_functions.sql
-- =====================================================================
-- 0002_core_functions.sql — helpers, triggers, catalog views
-- =====================================================================

-- updated_at triggers
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','seller_profiles','addresses','categories','brands','products','product_variants',
    'carts','cart_items','coupons','orders','order_items','payments','refunds','return_requests','banners','home_sections','store_settings']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- settings + identity helpers ----------
create or replace function public._setting_num(k text, d numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from store_settings where key = k), d) $$;

create or replace function public._setting_bool(k text, d boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from store_settings where key = k), d) $$;

create or replace function public._setting_text(k text, d text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value #>> '{}' from store_settings where key = k), d) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin') $$;

create or replace function public.current_seller_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from seller_profiles where user_id = auth.uid() and approval_status = 'approved' limit 1 $$;

create or replace function public.seller_is_approved(p_seller uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from seller_profiles where id = p_seller and approval_status = 'approved') $$;

create or replace function public.product_is_public(p_product uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from products p where p.id = p_product and p.approval_status = 'approved' and p.is_active
                 and exists (select 1 from seller_profiles s where s.id = p.seller_id and s.approval_status = 'approved')) $$;

create or replace function public.owns_product(p_product uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from products where id = p_product and seller_id = public.current_seller_id()) $$;

create or replace function public.owns_cart(p_cart uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from carts where id = p_cart and user_id = auth.uid()) $$;

create or replace function public.owns_wishlist(p_wl uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wishlists where id = p_wl and user_id = auth.uid()) $$;

-- ---------- notifications + audit ----------
create or replace function public._notify(p_user uuid, p_title text, p_msg text, p_type text default 'general', p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications(user_id, title, message, notification_type, link)
  select p_user, p_title, p_msg, p_type, p_link where p_user is not null $$;

create or replace function public._notify_admins(p_title text, p_msg text, p_type text default 'admin', p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications(user_id, title, message, notification_type, link)
  select user_id, p_title, p_msg, p_type, p_link from user_roles where role = 'admin' $$;

create or replace function public._audit(p_action text, p_type text, p_id text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs(actor_user_id, action, entity_type, entity_id, metadata) values (auth.uid(), p_action, p_type, p_id, coalesce(p_meta, '{}'::jsonb)) $$;

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
        v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  if auth.uid() is not null then
    insert into audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_new, v_old)->>'id' , jsonb_build_object('old', v_old, 'new', v_new));
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','brands','coupons','banners','home_sections','store_settings','pincodes']
  loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ---------- signup ----------
-- Role comes from DB only. Every new user is a buyer. A seller *application* (status pending)
-- may be created from signup metadata; it grants NO seller privileges until an admin approves.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        sa jsonb := m->'seller_application';
begin
  insert into profiles(id, full_name, phone)
  values (new.id, left(coalesce(m->>'full_name', ''), 120), case when (m->>'phone') ~ '^[6-9][0-9]{9}$' then m->>'phone' end);
  insert into user_roles(user_id, role) values (new.id, 'buyer');

  if sa is not null and jsonb_typeof(sa) = 'object' then
    begin
      insert into seller_profiles(user_id, owner_name, store_name, business_description, phone, email, business_address, registration_details, terms_accepted_at)
      values (new.id, left(coalesce(sa->>'owner_name', m->>'full_name', ''), 120), left(sa->>'store_name', 120),
              left(sa->>'business_description', 2000), sa->>'phone', new.email, left(sa->>'business_address', 500),
              left(sa->>'registration_details', 200), now());
      perform public._notify_admins('New seller application', coalesce(sa->>'store_name', 'A store') || ' applied to sell.', 'seller_application', '/admin/sellers');
    exception when others then
      null; -- keep the buyer account; the user can re-apply from /seller/register
    end;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.apply_as_seller(p_owner_name text, p_store_name text, p_description text, p_phone text, p_address text, p_registration text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_existing seller_profiles; v_email text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_existing from seller_profiles where user_id = auth.uid();
  select email into v_email from auth.users where id = auth.uid();
  if found and v_existing.approval_status in ('pending','approved','suspended') then raise exception 'ALREADY_APPLIED'; end if;
  if found then
    update seller_profiles set owner_name = p_owner_name, store_name = p_store_name, business_description = p_description, phone = p_phone,
      business_address = p_address, registration_details = p_registration, approval_status = 'pending', decision_note = null, terms_accepted_at = now()
    where id = v_existing.id returning id into v_id;
  else
    insert into seller_profiles(user_id, owner_name, store_name, business_description, phone, email, business_address, registration_details, terms_accepted_at)
    values (auth.uid(), p_owner_name, p_store_name, p_description, p_phone, v_email, p_address, p_registration, now()) returning id into v_id;
  end if;
  perform public._notify_admins('New seller application', p_store_name || ' applied to sell.', 'seller_application', '/admin/sellers');
  return v_id;
end $$;

-- ---------- product guard + search document ----------
create or replace function public.compute_search_document(p products) returns text
language sql stable security definer set search_path = public as $$
  select lower(concat_ws(' ', p.title, p.material,
    (select name from brands where id = p.brand_id),
    (select name from categories where id = p.category_id),
    (select string_agg(distinct color, ' ') from product_variants where product_id = p.id))) $$;

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
            and (new.title, new.description, new.base_price, new.original_price, new.category_id, new.brand_id, new.material)
                is distinct from (old.title, old.description, old.base_price, old.original_price, old.category_id, old.brand_id, old.material) then
        new.approval_status := 'pending_review';
      end if;
    end if;
    if new.approval_status = 'pending_review' and public._setting_bool('auto_approve_products', false) then
      new.approval_status := 'approved';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_products_guard on public.products;
create trigger trg_products_guard before insert or update on public.products for each row execute function public.guard_product();

create or replace function public.notify_product_submitted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status = 'pending_review' and (tg_op = 'INSERT' or old.approval_status is distinct from 'pending_review') then
    perform public._notify_admins('Product awaiting review', new.title, 'product_review', '/admin/products');
  end if;
  return null;
end $$;
drop trigger if exists trg_products_submitted on public.products;
create trigger trg_products_submitted after insert or update on public.products for each row execute function public.notify_product_submitted();

create or replace function public.refresh_search_from_variant() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update products set search_document = public.compute_search_document(products) where id = pid;
  return null;
end $$;
drop trigger if exists trg_variants_search on public.product_variants;
create trigger trg_variants_search after insert or update of color or delete on public.product_variants
  for each row execute function public.refresh_search_from_variant();

-- keep exactly one primary image
create or replace function public.ensure_primary_image() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_primary then
    update product_images set is_primary = false where product_id = new.product_id and id <> new.id and is_primary;
  elsif not exists (select 1 from product_images where product_id = new.product_id and is_primary and id <> new.id) then
    new.is_primary := true;
  end if;
  return new;
end $$;
drop trigger if exists trg_images_primary on public.product_images;
create trigger trg_images_primary before insert or update on public.product_images for each row execute function public.ensure_primary_image();

-- ---------- public views ----------
create or replace view public.v_products with (security_invoker = true) as
select p.id, p.slug, p.title, p.brand_id, b.name as brand_name, p.category_id, c.name as category_name, c.slug as category_slug,
       p.seller_id, p.base_price, p.original_price,
       coalesce(vs.min_price, p.base_price) as min_price,
       case when p.original_price > coalesce(vs.min_price, p.base_price)
            then round((p.original_price - coalesce(vs.min_price, p.base_price)) / p.original_price * 100)::int else 0 end as discount_pct,
       img.storage_path as image_path,
       coalesce(vs.in_stock, false) as in_stock,
       coalesce(vs.sizes, '{}'::text[]) as sizes, coalesce(vs.colors, '{}'::text[]) as colors,
       r.avg_rating, coalesce(r.review_count, 0)::int as review_count,
       p.sales_count, p.view_count, p.created_at, p.search_document
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.categories c on c.id = p.category_id
left join lateral (
  select min(coalesce(v.price_override, p.base_price)) as min_price, bool_or(v.stock_quantity > 0) as in_stock,
         array_remove(array_agg(distinct v.size), null) as sizes, array_remove(array_agg(distinct v.color), null) as colors
  from public.product_variants v where v.product_id = p.id and v.is_active) vs on true
left join lateral (
  select storage_path from public.product_images i where i.product_id = p.id order by i.is_primary desc, i.sort_order limit 1) img on true
left join lateral (
  select round(avg(rating)::numeric, 1) as avg_rating, count(*) as review_count
  from public.product_reviews pr where pr.product_id = p.id and pr.moderation_status = 'approved') r on true
where p.approval_status = 'approved' and p.is_active and public.seller_is_approved(p.seller_id);

-- Intentionally owner-rights view: exposes ONLY non-sensitive store fields of approved sellers.
create or replace view public.public_sellers as
select id, store_name, business_description, created_at from public.seller_profiles where approval_status = 'approved';

-- ---------- small public RPCs ----------
create or replace function public.check_pincode(p_pin text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r pincodes;
begin
  if p_pin is null or p_pin !~ '^[1-9][0-9]{5}$' then return jsonb_build_object('valid', false); end if;
  if not exists (select 1 from pincodes) then return jsonb_build_object('valid', true, 'configured', false); end if;
  select * into r from pincodes where pincode = p_pin and is_active;
  if not found then return jsonb_build_object('valid', true, 'configured', true, 'serviceable', false); end if;
  return jsonb_build_object('valid', true, 'configured', true, 'serviceable', true, 'eta_days', r.eta_days, 'cod_available', r.cod_available, 'city', r.city);
end $$;

create or replace function public.record_product_view(p_product uuid) returns void
language sql security definer set search_path = public as $$
  update products set view_count = view_count + 1 where id = p_product and public.product_is_public(id) $$;

create or replace function public.track_event(p_event text, p_product uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into analytics_events(event_name, product_id) select p_event, p_product where p_event in ('product_view','add_to_cart','begin_checkout','purchase') $$;

-- >>>>>>>> 0003_order_functions.sql
-- =====================================================================
-- 0003_order_functions.sql — quote, checkout, payments, cancellation, returns
-- All price/stock/coupon math happens HERE. The browser never supplies a total.
-- =====================================================================

create or replace function public._rank(s text) returns int language sql immutable as $$
  select case s when 'pending_confirmation' then 0 when 'confirmed' then 1 when 'processing' then 2 when 'packed' then 3
    when 'shipped' then 4 when 'out_for_delivery' then 5 when 'delivered' then 6 when 'return_requested' then 6
    when 'returned' then 6 when 'refunded' then 6 else null end $$;

create or replace function public._rank_name(r int) returns text language sql immutable as $$
  select (array['pending_confirmation','confirmed','processing','packed','shipped','out_for_delivery','delivered'])[r + 1] $$;

-- ---------- coupon ----------
create or replace function public._apply_coupon(p_user uuid, p_code text, p_lines jsonb, p_subtotal numeric, p_lock boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c coupons; v_elig numeric; v_disc numeric; v_used int; v_user_used int;
begin
  if p_code is null or length(trim(p_code)) = 0 then return null; end if;
  if p_user is null then return jsonb_build_object('error', 'Log in to apply a coupon'); end if;
  if p_lock then select * into c from coupons where code = upper(trim(p_code)) and is_active for update;
  else select * into c from coupons where code = upper(trim(p_code)) and is_active; end if;
  if not found then return jsonb_build_object('error', 'This coupon code is not valid'); end if;
  if (c.starts_at is not null and now() < c.starts_at) or (c.expires_at is not null and now() > c.expires_at) then
    return jsonb_build_object('error', 'This coupon is not active right now');
  end if;
  select coalesce(sum((l->>'line_total')::numeric), 0) into v_elig from jsonb_array_elements(p_lines) l
   where (c.category_id is null or (l->>'category_id')::uuid = c.category_id)
     and (c.product_id is null or (l->>'product_id')::uuid = c.product_id)
     and (c.seller_id is null or (l->>'seller_id')::uuid = c.seller_id);
  if v_elig <= 0 then return jsonb_build_object('error', 'This coupon does not apply to items in your bag'); end if;
  if p_subtotal < c.minimum_order_value then
    return jsonb_build_object('error', 'Add items worth ₹' || (c.minimum_order_value - p_subtotal)::text || ' more to use this coupon');
  end if;
  select count(*) into v_used from coupon_redemptions where coupon_id = c.id;
  if c.usage_limit is not null and v_used >= c.usage_limit then return jsonb_build_object('error', 'This coupon has been fully redeemed'); end if;
  select count(*) into v_user_used from coupon_redemptions where coupon_id = c.id and user_id = p_user;
  if v_user_used >= c.per_user_limit then return jsonb_build_object('error', 'You have already used this coupon'); end if;
  v_disc := case c.discount_type when 'percent' then round(v_elig * c.discount_value / 100, 2) else c.discount_value end;
  if c.maximum_discount is not null then v_disc := least(v_disc, c.maximum_discount); end if;
  v_disc := greatest(least(v_disc, v_elig), 0);
  return jsonb_build_object('coupon_id', c.id, 'code', c.code, 'discount', v_disc, 'error', null);
end $$;

-- ---------- quote ----------
create or replace function public._build_quote(p_user uuid, p_items jsonb, p_coupon text, p_lock boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_lines jsonb := '[]'::jsonb; v_errors jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_tax numeric := 0; v_disc numeric := 0; v_ship numeric := 0; v_total numeric;
  v_max_qty int := _setting_num('max_qty_per_item', 10)::int;
  v_fee numeric := _setting_num('shipping_fee', 99); v_free numeric := _setting_num('free_shipping_threshold', 999);
  v_c jsonb; v_c_err text; v_c_id uuid; v_c_code text; v_line_total numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('lines', '[]'::jsonb, 'errors', jsonb_build_array(jsonb_build_object('code','EMPTY_CART','message','Your bag is empty')),
      'subtotal',0,'discount',0,'shipping',0,'tax',0,'total',0,'coupon',null);
  end if;

  if p_lock then
    perform 1 from product_variants where id in (select (i->>'variant_id')::uuid from jsonb_array_elements(p_items) i) order by id for update;
  end if;

  for r in
    with req as (
      select (i->>'variant_id')::uuid as variant_id, sum(greatest((i->>'quantity')::int, 0))::int as qty
      from jsonb_array_elements(p_items) i group by 1)
    select req.variant_id, req.qty, v.id as vid, v.sku, v.size, v.color, v.stock_quantity, v.is_active as v_active,
           coalesce(v.price_override, p.base_price) as price, p.id as pid, p.title, p.original_price, p.tax_rate,
           p.is_active as p_active, p.approval_status as p_status, p.seller_id, p.category_id, s.store_name, s.approval_status as s_status,
           (select storage_path from product_images where product_id = p.id order by is_primary desc, sort_order limit 1) as img,
           p.slug, p.is_returnable
    from req left join product_variants v on v.id = req.variant_id
             left join products p on p.id = v.product_id
             left join seller_profiles s on s.id = p.seller_id
    order by req.variant_id
  loop
    if r.vid is null then
      v_errors := v_errors || jsonb_build_object('code','VARIANT_NOT_FOUND','variant_id',r.variant_id,'message','An item in your bag is no longer available');
    elsif not (r.v_active and r.p_active and r.p_status = 'approved' and r.s_status = 'approved') then
      v_errors := v_errors || jsonb_build_object('code','UNAVAILABLE','variant_id',r.variant_id,'message', r.title || ' is no longer available');
    elsif r.qty < 1 or r.qty > v_max_qty then
      v_errors := v_errors || jsonb_build_object('code','INVALID_QTY','variant_id',r.variant_id,'message','Quantity for ' || r.title || ' must be between 1 and ' || v_max_qty);
    elsif r.qty > r.stock_quantity then
      v_errors := v_errors || jsonb_build_object('code','OUT_OF_STOCK','variant_id',r.variant_id,'available',r.stock_quantity,
        'message', case when r.stock_quantity = 0 then r.title || ' is out of stock' else 'Only ' || r.stock_quantity || ' left of ' || r.title end);
    else
      v_line_total := r.price * r.qty;
      v_sub := v_sub + v_line_total;
      v_tax := v_tax + round(v_line_total * r.tax_rate / (100 + r.tax_rate), 2);
      v_lines := v_lines || jsonb_build_object('variant_id', r.vid, 'product_id', r.pid, 'seller_id', r.seller_id, 'category_id', r.category_id,
        'title', r.title, 'slug', r.slug, 'size', r.size, 'color', r.color, 'sku', r.sku, 'unit_price', r.price, 'original_price', r.original_price,
        'quantity', r.qty, 'line_total', v_line_total, 'tax_rate', r.tax_rate, 'seller_name', r.store_name, 'image', r.img,
        'stock', r.stock_quantity, 'is_returnable', r.is_returnable);
    end if;
  end loop;

  v_c := _apply_coupon(p_user, p_coupon, v_lines, v_sub, p_lock);
  if v_c is not null then
    v_c_err := v_c->>'error';
    if v_c_err is null then v_disc := (v_c->>'discount')::numeric; v_c_id := (v_c->>'coupon_id')::uuid; v_c_code := v_c->>'code'; end if;
  end if;
  v_disc := least(v_disc, v_sub);
  if v_sub > 0 then v_tax := round(v_tax * (1 - v_disc / v_sub), 2); end if;
  if v_sub > 0 and (v_sub - v_disc) < v_free then v_ship := v_fee; end if;
  v_total := v_sub - v_disc + v_ship;

  return jsonb_build_object('lines', v_lines, 'errors', v_errors, 'subtotal', v_sub, 'discount', v_disc, 'shipping', v_ship,
    'tax', v_tax, 'total', v_total,
    'coupon', case when p_coupon is null or length(trim(p_coupon)) = 0 then null
                   else jsonb_build_object('code', coalesce(v_c_code, upper(trim(p_coupon))), 'id', v_c_id, 'applied', v_c_err is null, 'error', v_c_err) end);
end $$;

-- Browser-callable preview (guest or logged in). Never used as the source of truth for an order.
create or replace function public.quote_order(p_items jsonb, p_coupon text default null) returns jsonb
language sql security definer set search_path = public as $$
  select public._build_quote(auth.uid(), p_items, p_coupon, false) $$;

-- ---------- place order (service_role only; called by the checkout Edge Function) ----------
create or replace function public.place_order(p_user uuid, p_address_id uuid, p_items jsonb, p_coupon text, p_method text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing orders; v_addr addresses; v_q jsonb; v_id uuid; v_num text; l jsonb; v_cnt int; v_pin pincodes; v_sellers uuid[];
  v_prefix text := _setting_text('order_prefix', 'ORD');
begin
  perform set_config('app.internal', '1', true);
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_key is null or char_length(p_key) < 8 or char_length(p_key) > 100 then raise exception 'INVALID_KEY'; end if;
  if p_method not in ('cod','online') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_key, 0));

  select * into v_existing from orders where user_id = p_user and idempotency_key = p_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number, 'total_amount', v_existing.total_amount,
      'payment_method', v_existing.payment_method, 'duplicate', true);
  end if;

  if exists (select 1 from profiles where id = p_user and account_status = 'suspended') then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if p_method = 'cod' and not _setting_bool('cod_enabled', true) then raise exception 'COD_DISABLED'; end if;
  if p_method = 'online' and not _setting_bool('online_payments_enabled', true) then raise exception 'ONLINE_DISABLED'; end if;

  select * into v_addr from addresses where id = p_address_id and user_id = p_user;
  if not found then raise exception 'ADDRESS_INVALID'; end if;
  if exists (select 1 from pincodes) then
    select * into v_pin from pincodes where pincode = v_addr.postal_code and is_active;
    if not found then raise exception 'PIN_NOT_SERVICEABLE'; end if;
    if p_method = 'cod' and not v_pin.cod_available then raise exception 'COD_NOT_AVAILABLE_FOR_PIN'; end if;
  end if;

  v_q := _build_quote(p_user, p_items, p_coupon, true);
  if jsonb_array_length(v_q->'errors') > 0 then
    raise exception 'CART_INVALID' using errcode = 'P0001', detail = (v_q->'errors')::text;
  end if;
  if jsonb_typeof(v_q->'coupon') = 'object' and coalesce((v_q->'coupon'->>'applied')::boolean, false) = false then
    raise exception 'COUPON_INVALID' using errcode = 'P0001', detail = coalesce(v_q->'coupon'->>'error', 'Invalid coupon');
  end if;
  if p_method = 'cod' and (v_q->>'total')::numeric > _setting_num('cod_max_order_value', 20000) then
    raise exception 'COD_LIMIT_EXCEEDED';
  end if;
  if (v_q->>'total')::numeric <= 0 then raise exception 'INVALID_TOTAL'; end if;

  v_num := v_prefix || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || nextval('order_number_seq');
  insert into orders(order_number, user_id, idempotency_key, shipping_address_snapshot, subtotal, discount_amount, shipping_amount, tax_amount,
                     total_amount, coupon_code, payment_method, payment_status, order_status)
  values (v_num, p_user, p_key,
          jsonb_build_object('full_name', v_addr.full_name, 'phone', v_addr.phone, 'address_line', v_addr.address_line, 'landmark', v_addr.landmark,
                             'city', v_addr.city, 'state', v_addr.state, 'postal_code', v_addr.postal_code, 'address_type', v_addr.address_type),
          (v_q->>'subtotal')::numeric, (v_q->>'discount')::numeric, (v_q->>'shipping')::numeric, (v_q->>'tax')::numeric, (v_q->>'total')::numeric,
          v_q->'coupon'->>'code', p_method, case when p_method = 'cod' then 'cod_pending' else 'pending' end, 'pending_confirmation')
  returning id into v_id;

  for l in select * from jsonb_array_elements(v_q->'lines') loop
    update product_variants set stock_quantity = stock_quantity - (l->>'quantity')::int
      where id = (l->>'variant_id')::uuid and stock_quantity >= (l->>'quantity')::int;
    get diagnostics v_cnt = row_count;
    if v_cnt <> 1 then raise exception 'OUT_OF_STOCK'; end if;
    update products set sales_count = sales_count + (l->>'quantity')::int where id = (l->>'product_id')::uuid;
    insert into order_items(order_id, product_id, seller_id, product_variant_id, product_name_snapshot, variant_snapshot, seller_snapshot, image_snapshot,
                            unit_price, quantity, line_total, tax_rate, is_returnable, fulfillment_status)
    values (v_id, (l->>'product_id')::uuid, (l->>'seller_id')::uuid, (l->>'variant_id')::uuid, l->>'title',
            jsonb_build_object('size', l->>'size', 'color', l->>'color', 'sku', l->>'sku'),
            jsonb_build_object('id', l->>'seller_id', 'store_name', l->>'seller_name'), l->>'image',
            (l->>'unit_price')::numeric, (l->>'quantity')::int, (l->>'line_total')::numeric, (l->>'tax_rate')::numeric,
            coalesce((l->>'is_returnable')::boolean, true), 'pending_confirmation');
  end loop;

  if (v_q->'coupon'->>'id') is not null then
    insert into coupon_redemptions(coupon_id, user_id, order_id, discount_amount) values ((v_q->'coupon'->>'id')::uuid, p_user, v_id, (v_q->>'discount')::numeric);
  end if;
  if p_method = 'online' then
    insert into payments(order_id, amount, status) values (v_id, (v_q->>'total')::numeric, 'created');
  end if;

  insert into order_status_history(order_id, status, note, changed_by) values (v_id, 'pending_confirmation', 'Order placed', p_user);
  delete from cart_items using carts c where c.id = cart_items.cart_id and c.user_id = p_user
    and cart_items.product_variant_id in (select (x->>'variant_id')::uuid from jsonb_array_elements(v_q->'lines') x);

  perform _notify(p_user, 'Order placed', 'Order ' || v_num || ' has been placed.', 'order', '/orders/' || v_id);
  if p_method = 'cod' then perform _notify_order_sellers(v_id); end if;

  return jsonb_build_object('order_id', v_id, 'order_number', v_num, 'total_amount', (v_q->>'total')::numeric, 'payment_method', p_method, 'duplicate', false);
end $$;

create or replace function public._notify_order_sellers(p_order uuid) returns void
language sql security definer set search_path = public as $$
  select public._notify(sp.user_id, 'New order', 'You have a new order ' || o.order_number, 'seller_order', '/seller/orders')
  from orders o join (select distinct seller_id from order_items where order_id = p_order) s on true
  join seller_profiles sp on sp.id = s.seller_id where o.id = p_order $$;

-- ---------- status plumbing ----------
create or replace function public._recompute_order(p_order uuid, p_actor uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; v_active int; v_min int; v_ref int; v_ret int; v_rq int; v_new text;
begin
  select * into o from orders where id = p_order for update;
  select count(*) filter (where fulfillment_status <> 'cancelled'),
         min(public._rank(fulfillment_status)) filter (where fulfillment_status <> 'cancelled'),
         count(*) filter (where fulfillment_status = 'refunded'),
         count(*) filter (where fulfillment_status in ('returned','refunded')),
         count(*) filter (where fulfillment_status = 'return_requested')
    into v_active, v_min, v_ref, v_ret, v_rq from order_items where order_id = p_order;
  v_new := case when v_active = 0 then 'cancelled' when v_ref = v_active then 'refunded' when v_ret = v_active then 'returned'
                when v_rq > 0 and v_min = 6 then 'return_requested' else public._rank_name(v_min) end;
  if v_new is distinct from o.order_status then
    update orders set order_status = v_new,
      payment_status = case when o.payment_method = 'cod' and o.payment_status = 'cod_pending' and v_new = 'delivered' then 'cod_collected' else o.payment_status end
      where id = p_order;
    insert into order_status_history(order_id, status, note, changed_by) values (p_order, v_new, p_note, p_actor);
    perform public._notify(o.user_id, 'Order update', 'Order ' || o.order_number || ' is now ' || replace(v_new, '_', ' ') || '.', 'order', '/orders/' || p_order);
  end if;
end $$;

create or replace function public._set_item_status(p_item uuid, p_status text, p_actor uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare it order_items;
begin
  update order_items set fulfillment_status = p_status,
    shipped_at = case when p_status = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end
  where id = p_item returning * into it;
  insert into order_status_history(order_id, order_item_id, status, note, changed_by) values (it.order_id, p_item, p_status, p_note, p_actor);
  perform public._recompute_order(it.order_id, p_actor, p_note);
end $$;

create or replace function public._cancel_items(p_order uuid, p_items uuid[], p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; it record; v_refund numeric := 0; v_left int; v_prior numeric; v_amt numeric;
begin
  perform set_config('app.internal', '1', true);
  select * into o from orders where id = p_order for update;
  for it in select * from order_items where order_id = p_order and id = any(p_items)
            and fulfillment_status in ('pending_confirmation','confirmed','processing','packed','shipped','out_for_delivery') loop
    if it.product_variant_id is not null then update product_variants set stock_quantity = stock_quantity + it.quantity where id = it.product_variant_id; end if;
    if it.product_id is not null then update products set sales_count = greatest(sales_count - it.quantity, 0) where id = it.product_id; end if;
    update order_items set fulfillment_status = 'cancelled' where id = it.id;
    insert into order_status_history(order_id, order_item_id, status, note, changed_by) values (p_order, it.id, 'cancelled', p_reason, p_actor);
    v_refund := v_refund + round(it.line_total * (o.subtotal - o.discount_amount) / nullif(o.subtotal, 0), 2);
  end loop;
  select count(*) into v_left from order_items where order_id = p_order and fulfillment_status <> 'cancelled';
  if v_left = 0 then
    v_refund := o.total_amount;
    delete from coupon_redemptions where order_id = p_order;
    update orders set cancel_reason = p_reason where id = p_order;
  end if;
  if o.payment_method = 'online' and o.payment_status in ('paid','partially_refunded','refund_pending') and v_refund > 0 then
    select coalesce(sum(amount), 0) into v_prior from refunds where order_id = p_order and status <> 'failed';
    v_amt := least(v_refund, o.total_amount - v_prior);
    if v_amt > 0 then
      insert into refunds(order_id, payment_id, amount, reason, created_by)
      values (p_order, (select id from payments where order_id = p_order and status = 'paid' limit 1), v_amt, p_reason, p_actor);
      update orders set payment_status = 'refund_pending' where id = p_order;
    end if;
  end if;
  perform public._recompute_order(p_order, p_actor, p_reason);
end $$;

-- ---------- buyer cancellation ----------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order_id;
  if not found or (o.user_id is distinct from auth.uid() and not public.is_admin()) then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.order_status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;
  if not public.is_admin() and exists (select 1 from order_items where order_id = p_order_id
       and fulfillment_status in ('shipped','out_for_delivery','delivered','return_requested','returned','refunded')) then
    raise exception 'CANNOT_CANCEL';
  end if;
  perform public._cancel_items(p_order_id, array(select id from order_items where order_id = p_order_id), auth.uid(), coalesce(nullif(trim(p_reason), ''), 'Cancelled by ' || case when public.is_admin() then 'admin' else 'customer' end));
  perform public._notify_order_sellers(p_order_id);
  if public.is_admin() then perform public._audit('order_cancelled', 'orders', p_order_id::text, jsonb_build_object('reason', p_reason)); end if;
end $$;

-- cron-friendly: cancel unpaid online orders after the payment window
create or replace function public.release_expired_orders() returns int
language plpgsql security definer set search_path = public as $$
declare o record; n int := 0; v_win numeric := _setting_num('online_payment_window_minutes', 30);
begin
  for o in select id from orders where payment_method = 'online' and payment_status in ('pending','failed') and order_status = 'pending_confirmation'
             and created_at < now() - make_interval(mins => v_win::int) loop
    perform public._cancel_items(o.id, array(select id from order_items where order_id = o.id), null, 'Payment not completed in time');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- payments (service_role only) ----------
create or replace function public.mark_payment_paid(p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pay payments; o orders;
begin
  perform set_config('app.internal', '1', true);
  select * into pay from payments where provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if pay.status = 'paid' then return jsonb_build_object('order_id', pay.order_id, 'already_processed', true); end if;
  if round(pay.amount * 100) <> p_amount_paise then raise exception 'AMOUNT_MISMATCH'; end if;
  update payments set status = 'paid', provider_payment_id = p_provider_payment_id where id = pay.id;
  select * into o from orders where id = pay.order_id for update;
  if o.order_status = 'cancelled' then
    -- paid after the order expired/cancelled: money must go back
    update orders set payment_status = 'refund_pending' where id = o.id;
    insert into refunds(order_id, payment_id, amount, reason) values (o.id, pay.id, pay.amount, 'Payment received after order was cancelled');
    perform public._notify_admins('Refund needed', 'Late payment for cancelled order ' || o.order_number, 'refund', '/admin/refunds');
    return jsonb_build_object('order_id', o.id, 'late_payment', true);
  end if;
  update orders set payment_status = 'paid', order_status = 'confirmed' where id = o.id;
  update order_items set fulfillment_status = 'confirmed' where order_id = o.id and fulfillment_status = 'pending_confirmation';
  insert into order_status_history(order_id, status, note) values (o.id, 'confirmed', 'Payment received');
  perform public._notify(o.user_id, 'Payment received', 'Payment for order ' || o.order_number || ' was successful.', 'order', '/orders/' || o.id);
  perform public._notify_order_sellers(o.id);
  insert into analytics_events(event_name) values ('purchase');
  return jsonb_build_object('order_id', o.id, 'already_processed', false);
end $$;

create or replace function public.mark_payment_failed(p_provider_order_id text) returns void
language plpgsql security definer set search_path = public as $$
declare pay payments;
begin
  select * into pay from payments where provider_order_id = p_provider_order_id for update;
  if not found or pay.status = 'paid' then return; end if;
  update payments set status = 'failed' where id = pay.id;
  update orders set payment_status = 'failed' where id = pay.order_id and payment_status = 'pending';
end $$;

-- called by payment-init when the buyer retries payment on an unpaid order
create or replace function public.prepare_payment_retry(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; pay payments;
begin
  select * into o from orders where id = p_order and user_id = p_user for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.payment_method <> 'online' or o.payment_status not in ('pending','failed') or o.order_status <> 'pending_confirmation' then raise exception 'NOT_PAYABLE'; end if;
  select * into pay from payments where order_id = p_order order by created_at desc limit 1;
  update orders set payment_status = 'pending' where id = p_order;
  return jsonb_build_object('order_number', o.order_number, 'amount', o.total_amount, 'payment_id', pay.id);
end $$;

create or replace function public.attach_provider_order(p_payment uuid, p_provider_order_id text) returns void
language sql security definer set search_path = public as $$
  update payments set provider_order_id = p_provider_order_id, status = 'created' where id = p_payment and status <> 'paid' $$;

-- ---------- refunds ----------
create or replace function public._apply_refund_status(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; v_sum numeric;
begin
  select * into o from orders where id = p_order for update;
  select coalesce(sum(amount), 0) into v_sum from refunds where order_id = p_order and status = 'processed';
  if o.payment_method = 'online' then
    update orders set payment_status = case when v_sum >= o.total_amount then 'refunded' when v_sum > 0 then 'partially_refunded' else payment_status end where id = p_order;
    if v_sum >= o.total_amount then update payments set status = 'refunded' where order_id = p_order and status = 'paid'; end if;
  end if;
end $$;

create or replace function public._finish_refund(p_refund uuid, p_status text, p_provider_refund_id text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare f refunds;
begin
  if p_status not in ('processing','processed','failed') then raise exception 'INVALID_STATUS'; end if;
  update refunds set status = p_status, provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id), note = coalesce(p_note, note)
   where id = p_refund and status in ('requested','processing','failed') returning * into f;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  if p_status = 'processed' then
    perform public._apply_refund_status(f.order_id);
    perform public._notify((select user_id from orders where id = f.order_id), 'Refund processed', '₹' || f.amount || ' has been refunded.', 'refund', '/orders/' || f.order_id);
  end if;
end $$;

create or replace function public.mark_refund_result(p_refund uuid, p_status text, p_provider_refund_id text, p_note text) returns void
language sql security definer set search_path = public as $$ select public._finish_refund(p_refund, p_status, p_provider_refund_id, p_note) $$;

-- ---------- returns ----------
create or replace function public.request_return(p_item uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare it order_items; o orders; v_id uuid; v_window int := _setting_num('return_window_days', 7)::int;
begin
  perform set_config('app.internal', '1', true);
  select * into it from order_items where id = p_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into o from orders where id = it.order_id;
  if o.user_id is distinct from auth.uid() then raise exception 'ITEM_NOT_FOUND'; end if;
  if it.fulfillment_status <> 'delivered' then raise exception 'NOT_DELIVERED'; end if;
  if not it.is_returnable then raise exception 'NOT_RETURNABLE'; end if;
  if it.delivered_at is null or it.delivered_at < now() - make_interval(days => v_window) then raise exception 'RETURN_WINDOW_CLOSED'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  insert into return_requests(order_item_id, user_id, reason) values (p_item, auth.uid(), trim(p_reason)) returning id into v_id;
  perform public._set_item_status(p_item, 'return_requested', auth.uid(), 'Return requested');
  perform public._notify_admins('Return requested', 'Order ' || o.order_number, 'return', '/admin/returns');
  return v_id;
exception when unique_violation then raise exception 'ALREADY_REQUESTED';
end $$;

create or replace function public.admin_resolve_return(p_id uuid, p_status text, p_resolution text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rr return_requests; it order_items; o orders; v_amt numeric;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform set_config('app.internal', '1', true);
  select * into rr from return_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not ((rr.status = 'requested' and p_status in ('approved','rejected')) or (rr.status = 'approved' and p_status = 'received') or (rr.status = 'received' and p_status = 'refunded')) then
    raise exception 'INVALID_TRANSITION';
  end if;
  select * into it from order_items where id = rr.order_item_id;
  select * into o from orders where id = it.order_id;
  update return_requests set status = p_status, resolution = coalesce(p_resolution, resolution) where id = p_id;
  if p_status = 'rejected' then perform public._set_item_status(it.id, 'delivered', auth.uid(), 'Return rejected');
  elsif p_status = 'received' then
    perform public._set_item_status(it.id, 'returned', auth.uid(), 'Return received');
    if it.product_variant_id is not null then update product_variants set stock_quantity = stock_quantity + it.quantity where id = it.product_variant_id; end if;
  elsif p_status = 'refunded' then
    v_amt := round(it.line_total * (o.subtotal - o.discount_amount) / nullif(o.subtotal, 0), 2);
    insert into refunds(order_id, order_item_id, payment_id, amount, reason, created_by)
    values (o.id, it.id, (select id from payments where order_id = o.id and status in ('paid','refunded') limit 1), v_amt, 'Return refund', auth.uid());
    perform public._set_item_status(it.id, 'refunded', auth.uid(), 'Refund initiated');
  end if;
  perform public._notify(rr.user_id, 'Return ' || p_status, coalesce(p_resolution, 'Your return request was updated.'), 'return', '/orders/' || o.id);
  perform public._audit('return_' || p_status, 'return_requests', p_id::text, jsonb_build_object('resolution', p_resolution));
end $$;

create or replace function public.admin_create_refund(p_order uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o orders; v_prior numeric; v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from orders where id = p_order; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select coalesce(sum(amount), 0) into v_prior from refunds where order_id = p_order and status <> 'failed';
  if p_amount <= 0 or p_amount + v_prior > o.total_amount then raise exception 'INVALID_AMOUNT'; end if;
  insert into refunds(order_id, payment_id, amount, reason, created_by)
  values (p_order, (select id from payments where order_id = p_order and status in ('paid','refunded') limit 1), p_amount, p_reason, auth.uid()) returning id into v_id;
  perform public._audit('refund_created', 'refunds', v_id::text, jsonb_build_object('order_id', p_order, 'amount', p_amount));
  return v_id;
end $$;

create or replace function public.admin_mark_refund_processed(p_refund uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public._finish_refund(p_refund, 'processed', null, p_note);
  perform public._audit('refund_processed_manually', 'refunds', p_refund::text, jsonb_build_object('note', p_note));
end $$;

-- ---------- seller fulfillment ----------
create or replace function public.seller_update_item(p_item uuid, p_status text, p_tracking text default null, p_courier text default null) returns void
language plpgsql security definer set search_path = public as $$
declare it order_items; o orders; v_allowed text[];
begin
  perform set_config('app.internal', '1', true);
  select * into it from order_items where id = p_item for update;
  if not found or it.seller_id is distinct from public.current_seller_id() then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into o from orders where id = it.order_id;
  if o.payment_method = 'online' and o.payment_status not in ('paid','partially_refunded') then raise exception 'PAYMENT_PENDING'; end if;
  v_allowed := case it.fulfillment_status
    when 'pending_confirmation' then array['confirmed','cancelled'] when 'confirmed' then array['processing','cancelled']
    when 'processing' then array['packed','cancelled'] when 'packed' then array['shipped','cancelled']
    when 'shipped' then array['out_for_delivery','delivered'] when 'out_for_delivery' then array['delivered'] else '{}'::text[] end;
  if not (p_status = any (v_allowed)) then raise exception 'INVALID_TRANSITION'; end if;
  if p_status = 'shipped' and (coalesce(trim(p_tracking), '') = '' or coalesce(trim(p_courier), '') = '') then raise exception 'TRACKING_REQUIRED'; end if;
  if p_status = 'shipped' then update order_items set tracking_number = left(trim(p_tracking), 80), courier = left(trim(p_courier), 80) where id = p_item; end if;
  if p_status = 'cancelled' then perform public._cancel_items(it.order_id, array[p_item], auth.uid(), 'Cancelled by seller');
  else perform public._set_item_status(p_item, p_status, auth.uid(), null); end if;
end $$;

-- >>>>>>>> 0004_admin_seller_functions.sql
-- =====================================================================
-- 0004_admin_seller_functions.sql — privileged operations (server-side authz in every function)
-- =====================================================================

create or replace function public.admin_decide_seller(p_seller uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s seller_profiles; v_status text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into s from seller_profiles where id = p_seller for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_decision in ('reject','suspend') and coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;
  v_status := case p_decision when 'approve' then 'approved' when 'reactivate' then 'approved' when 'reject' then 'rejected' when 'suspend' then 'suspended' end;
  if v_status is null then raise exception 'INVALID_DECISION'; end if;
  update seller_profiles set approval_status = v_status, decision_note = p_note, decided_by = auth.uid(),
    approved_at = case when v_status = 'approved' then coalesce(approved_at, now()) else approved_at end where id = p_seller;
  if v_status = 'approved' then insert into user_roles(user_id, role) values (s.user_id, 'seller') on conflict do nothing;
  else delete from user_roles where user_id = s.user_id and role = 'seller'; end if;
  perform public._notify(s.user_id, 'Seller account ' || v_status, coalesce(p_note, 'Your seller application was updated.'), 'seller_status', '/seller');
  perform public._audit('seller_' || p_decision, 'seller_profiles', p_seller::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_moderate_product(p_product uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p products; v_user uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into p from products where id = p_product for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_decision in ('reject','disable') and coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;
  if p_decision = 'approve' then update products set approval_status = 'approved', rejection_note = null where id = p_product;
  elsif p_decision = 'reject' then update products set approval_status = 'rejected', rejection_note = p_note where id = p_product;
  elsif p_decision = 'disable' then update products set is_active = false, rejection_note = p_note where id = p_product;
  elsif p_decision = 'enable' then update products set is_active = true where id = p_product;
  else raise exception 'INVALID_DECISION'; end if;
  select user_id into v_user from seller_profiles where id = p.seller_id;
  perform public._notify(v_user, 'Product ' || p_decision || 'd', p.title || coalesce(': ' || p_note, ''), 'product_review', '/seller/products');
  perform public._audit('product_' || p_decision, 'products', p_product::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_set_account_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('active','suspended') then raise exception 'INVALID_STATUS'; end if;
  if p_user = auth.uid() or exists (select 1 from user_roles where user_id = p_user and role = 'admin') then raise exception 'CANNOT_MODIFY_ADMIN'; end if;
  update profiles set account_status = p_status where id = p_user;
  perform public._audit('account_' || p_status, 'profiles', p_user::text);
end $$;

create or replace function public.admin_update_order_status(p_order uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; it record; v_target int; v_changed int := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform set_config('app.internal', '1', true);
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_status = 'cancelled' then
    if o.order_status in ('cancelled','delivered','return_requested','returned','refunded') then raise exception 'INVALID_TRANSITION'; end if;
    perform public._cancel_items(p_order, array(select id from order_items where order_id = p_order), auth.uid(), coalesce(p_note, 'Cancelled by admin'));
  else
    if p_status not in ('confirmed','processing','packed','shipped','out_for_delivery','delivered') then raise exception 'INVALID_STATUS'; end if;
    if o.payment_method = 'online' and o.payment_status not in ('paid','partially_refunded') then raise exception 'PAYMENT_PENDING'; end if;
    v_target := public._rank(p_status);
    for it in select id, fulfillment_status from order_items where order_id = p_order
              and fulfillment_status in ('pending_confirmation','confirmed','processing','packed','shipped','out_for_delivery') and public._rank(fulfillment_status) < v_target loop
      perform public._set_item_status(it.id, p_status, auth.uid(), p_note);
      v_changed := v_changed + 1;
    end loop;
    if v_changed = 0 then raise exception 'INVALID_TRANSITION'; end if;
  end if;
  perform public._audit('order_status_' || p_status, 'orders', p_order::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_list_users(p_role text default null, p_search text default null, p_limit int default 25, p_offset int default 0)
returns table(id uuid, email text, full_name text, phone text, account_status text, created_at timestamptz, roles text[], seller_status text, seller_id uuid, store_name text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select u.id, u.email::text, p.full_name, p.phone, p.account_status, p.created_at,
         array(select role from user_roles r where r.user_id = u.id), sp.approval_status, sp.id, sp.store_name,
         count(*) over ()
  from auth.users u join profiles p on p.id = u.id left join seller_profiles sp on sp.user_id = u.id
  where (p_role is null or exists (select 1 from user_roles r where r.user_id = u.id and r.role = p_role))
    and (p_search is null or u.email ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%' or p.full_name ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%')
  order by p.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gross numeric; v_ref numeric;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select coalesce(sum(total_amount), 0) into v_gross from orders where order_status <> 'cancelled';
  select coalesce(sum(amount), 0) into v_ref from refunds where status = 'processed';
  return jsonb_build_object(
    'buyers', (select count(*) from user_roles where role = 'buyer'),
    'sellers', (select count(*) from seller_profiles where approval_status = 'approved'),
    'pending_sellers', (select count(*) from seller_profiles where approval_status = 'pending'),
    'active_products', (select count(*) from products where approval_status = 'approved' and is_active),
    'pending_products', (select count(*) from products where approval_status = 'pending_review'),
    'low_stock', (select count(*) from product_variants where is_active and stock_quantity <= _setting_num('low_stock_threshold', 5)),
    'orders_by_status', coalesce((select jsonb_object_agg(order_status, c) from (select order_status, count(*) c from orders group by 1) x), '{}'::jsonb),
    'gross_sales', v_gross, 'refunded', v_ref, 'net_sales', v_gross - v_ref,
    'pending_returns', (select count(*) from return_requests where status = 'requested'),
    'pending_refunds', (select count(*) from refunds where status in ('requested','processing')),
    'recent_activity', coalesce((select jsonb_agg(a) from (select action, entity_type, entity_id, created_at from audit_logs order by created_at desc limit 8) a), '[]'::jsonb));
end $$;

create or replace function public.admin_sales_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'daily', coalesce((select jsonb_agg(d order by d.day) from (
        select (o.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as orders, sum(o.total_amount) as gross,
               coalesce(sum(r.amt), 0) as refunded
        from orders o left join lateral (select sum(amount) amt from refunds where order_id = o.id and status = 'processed') r on true
        where o.order_status <> 'cancelled' and (o.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to group by 1) d), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(t) from (
        select oi.product_name_snapshot as name, sum(oi.quantity) as units, sum(oi.line_total) as revenue
        from order_items oi join orders o on o.id = oi.order_id
        where oi.fulfillment_status <> 'cancelled' and (o.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
        group by 1 order by revenue desc limit 10) t), '[]'::jsonb),
    'funnel', coalesce((select jsonb_object_agg(event_name, c) from (select event_name, count(*) c from analytics_events
        where created_at::date between p_from and p_to group by 1) f), '{}'::jsonb));
end $$;

-- ---------- seller read APIs ----------
-- Sellers never read `orders`. They get only their own line items + the ship-to details needed to fulfil.
create or replace function public.seller_orders(p_status text default null, p_limit int default 50, p_offset int default 0)
returns table(item_id uuid, order_id uuid, order_number text, ordered_at timestamptz, payment_method text, payment_status text,
              product_name text, variant jsonb, image text, quantity int, unit_price numeric, line_total numeric,
              fulfillment_status text, tracking_number text, courier text, ship_to jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_seller_id() is null then raise exception 'FORBIDDEN'; end if;
  return query
  select oi.id, o.id, o.order_number, o.created_at, o.payment_method, o.payment_status, oi.product_name_snapshot, oi.variant_snapshot,
         oi.image_snapshot, oi.quantity, oi.unit_price, oi.line_total, oi.fulfillment_status, oi.tracking_number, oi.courier,
         jsonb_build_object('name', o.shipping_address_snapshot->>'full_name', 'phone', o.shipping_address_snapshot->>'phone',
           'address_line', o.shipping_address_snapshot->>'address_line', 'landmark', o.shipping_address_snapshot->>'landmark',
           'city', o.shipping_address_snapshot->>'city', 'state', o.shipping_address_snapshot->>'state', 'postal_code', o.shipping_address_snapshot->>'postal_code')
  from order_items oi join orders o on o.id = oi.order_id
  where oi.seller_id = public.current_seller_id()
    and not (o.payment_method = 'online' and o.payment_status in ('pending','failed'))
    and (p_status is null or oi.fulfillment_status = p_status)
  order by o.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0);
end $$;

-- Sales definition: GROSS = non-cancelled lines of confirmed orders; NET = gross minus returned/refunded lines.
create or replace function public.seller_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid := public.current_seller_id(); v_low numeric := _setting_num('low_stock_threshold', 5);
begin
  if sid is null then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'total_products', (select count(*) from products where seller_id = sid and approval_status <> 'archived'),
    'active_products', (select count(*) from products where seller_id = sid and approval_status = 'approved' and is_active),
    'pending_products', (select count(*) from products where seller_id = sid and approval_status = 'pending_review'),
    'low_stock', (select count(*) from product_variants v join products p on p.id = v.product_id where p.seller_id = sid and v.is_active and v.stock_quantity <= v_low),
    'total_orders', (select count(distinct oi.order_id) from order_items oi join orders o on o.id = oi.order_id
                      where oi.seller_id = sid and not (o.payment_method = 'online' and o.payment_status in ('pending','failed'))),
    'gross_sales', coalesce((select sum(oi.line_total) from order_items oi join orders o on o.id = oi.order_id
                      where oi.seller_id = sid and oi.fulfillment_status not in ('cancelled','pending_confirmation')
                        and not (o.payment_method = 'online' and o.payment_status in ('pending','failed'))), 0),
    'net_sales', coalesce((select sum(oi.line_total) from order_items oi join orders o on o.id = oi.order_id
                      where oi.seller_id = sid and oi.fulfillment_status not in ('cancelled','pending_confirmation','returned','refunded')
                        and not (o.payment_method = 'online' and o.payment_status in ('pending','failed'))), 0),
    'daily', coalesce((select jsonb_agg(d order by d.day) from (
        select (o.created_at at time zone 'Asia/Kolkata')::date as day, sum(oi.line_total) as sales, count(*) as items
        from order_items oi join orders o on o.id = oi.order_id
        where oi.seller_id = sid and oi.fulfillment_status not in ('cancelled','returned','refunded') and o.created_at > now() - interval '30 days'
        group by 1) d), '[]'::jsonb));
end $$;

-- >>>>>>>> 0005_rls_grants.sql
-- =====================================================================
-- 0005_rls_grants.sql — RLS on every table, least-privilege grants
-- Strategy: (1) revoke everything, (2) grant minimum table/column rights, (3) RLS policies narrow rows.
-- =====================================================================

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- grants ----------
grant select on public.categories, public.brands, public.banners, public.home_sections, public.products, public.product_images,
  public.product_variants, public.product_reviews, public.store_settings, public.v_products, public.public_sellers to anon, authenticated;

grant select on public.profiles, public.user_roles, public.seller_profiles, public.addresses, public.carts, public.cart_items,
  public.wishlists, public.wishlist_items, public.orders, public.order_items, public.payments, public.order_status_history,
  public.refunds, public.coupon_redemptions, public.return_requests, public.notifications, public.audit_logs,
  public.coupons, public.pincodes, public.analytics_events to authenticated;

grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
grant update (owner_name, store_name, business_description, phone, business_address, registration_details) on public.seller_profiles to authenticated;
grant insert, update, delete on public.addresses to authenticated;
grant insert, update, delete on public.carts, public.cart_items, public.wishlists, public.wishlist_items to authenticated;
grant insert, delete on public.product_reviews to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
-- seller + admin catalog writes (rows limited by policy; privileged columns limited by guard trigger)
grant insert, update, delete on public.products, public.product_images, public.product_variants to authenticated;
-- admin-only content tables (policy requires is_admin())
grant insert, update, delete on public.categories, public.brands, public.banners, public.home_sections, public.store_settings,
  public.coupons, public.pincodes to authenticated;
grant update on public.product_reviews to authenticated;  -- policy: admin only (moderation)
-- orders, order_items, payments, refunds, history, return_requests, redemptions, roles, audit: NO direct writes from clients.

-- ---------- policies ----------
-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- user_roles (read only; written by definer functions)
drop policy if exists roles_select on public.user_roles;
create policy roles_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- seller_profiles
drop policy if exists seller_select on public.seller_profiles;
create policy seller_select on public.seller_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists seller_update_own on public.seller_profiles;
create policy seller_update_own on public.seller_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- addresses
drop policy if exists addr_all_own on public.addresses;
create policy addr_all_own on public.addresses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- categories / brands
drop policy if exists cat_public on public.categories;
create policy cat_public on public.categories for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists cat_admin on public.categories;
create policy cat_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists brand_public on public.brands;
create policy brand_public on public.brands for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists brand_admin on public.brands;
create policy brand_admin on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- products
drop policy if exists prod_select on public.products;
create policy prod_select on public.products for select to anon, authenticated using (
  public.product_is_public(id) or seller_id = public.current_seller_id() or public.is_admin());
drop policy if exists prod_insert_seller on public.products;
create policy prod_insert_seller on public.products for insert to authenticated with check (seller_id = public.current_seller_id());
drop policy if exists prod_update_seller on public.products;
create policy prod_update_seller on public.products for update to authenticated using (seller_id = public.current_seller_id()) with check (seller_id = public.current_seller_id());
drop policy if exists prod_delete_seller on public.products;
create policy prod_delete_seller on public.products for delete to authenticated using (seller_id = public.current_seller_id() and approval_status in ('draft','rejected','archived'));
drop policy if exists prod_admin on public.products;
create policy prod_admin on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- images / variants
drop policy if exists img_select on public.product_images;
create policy img_select on public.product_images for select to anon, authenticated using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
drop policy if exists img_seller on public.product_images;
create policy img_seller on public.product_images for all to authenticated using (public.owns_product(product_id)) with check (public.owns_product(product_id));
drop policy if exists img_admin on public.product_images;
create policy img_admin on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists var_select on public.product_variants;
create policy var_select on public.product_variants for select to anon, authenticated using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
drop policy if exists var_seller on public.product_variants;
create policy var_seller on public.product_variants for all to authenticated using (public.owns_product(product_id)) with check (public.owns_product(product_id));
drop policy if exists var_admin on public.product_variants;
create policy var_admin on public.product_variants for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- cart / wishlist
drop policy if exists cart_own on public.carts;
create policy cart_own on public.carts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cart_items_own on public.cart_items;
create policy cart_items_own on public.cart_items for all to authenticated using (public.owns_cart(cart_id)) with check (public.owns_cart(cart_id));
drop policy if exists wl_own on public.wishlists;
create policy wl_own on public.wishlists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists wl_items_own on public.wishlist_items;
create policy wl_items_own on public.wishlist_items for all to authenticated using (public.owns_wishlist(wishlist_id)) with check (public.owns_wishlist(wishlist_id));

-- orders & children (read-only to clients)
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists oi_select on public.order_items;
create policy oi_select on public.order_items for select to authenticated using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists pay_select on public.payments;
create policy pay_select on public.payments for select to authenticated using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists hist_select on public.order_status_history;
create policy hist_select on public.order_status_history for select to authenticated using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists refunds_select on public.refunds;
create policy refunds_select on public.refunds for select to authenticated using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists returns_select on public.return_requests;
create policy returns_select on public.return_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists redemptions_select on public.coupon_redemptions;
create policy redemptions_select on public.coupon_redemptions for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- reviews
drop policy if exists rev_select on public.product_reviews;
create policy rev_select on public.product_reviews for select to anon, authenticated using (
  (moderation_status = 'approved' and public.product_is_public(product_id)) or user_id = auth.uid() or public.is_admin());
drop policy if exists rev_insert on public.product_reviews;
create policy rev_insert on public.product_reviews for insert to authenticated with check (
  user_id = auth.uid() and moderation_status = 'approved' and exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id and o.user_id = auth.uid() and oi.product_id = product_reviews.product_id and oi.fulfillment_status = 'delivered'));
drop policy if exists rev_delete_own on public.product_reviews;
create policy rev_delete_own on public.product_reviews for delete to authenticated using (user_id = auth.uid());
drop policy if exists rev_admin_update on public.product_reviews;
create policy rev_admin_update on public.product_reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists rev_admin_delete on public.product_reviews;
create policy rev_admin_delete on public.product_reviews for delete to authenticated using (public.is_admin());

-- coupons / pincodes / settings / content
drop policy if exists coupons_admin on public.coupons;
create policy coupons_admin on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists pincodes_admin on public.pincodes;
create policy pincodes_admin on public.pincodes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists settings_public on public.store_settings;
create policy settings_public on public.store_settings for select to anon, authenticated using (is_public or public.is_admin());
drop policy if exists settings_admin on public.store_settings;
create policy settings_admin on public.store_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists banners_public on public.banners;
create policy banners_public on public.banners for select to anon, authenticated using (
  public.is_admin() or (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())));
drop policy if exists banners_admin on public.banners;
create policy banners_admin on public.banners for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists sections_public on public.home_sections;
create policy sections_public on public.home_sections for select to anon, authenticated using (
  public.is_admin() or (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())));
drop policy if exists sections_admin on public.home_sections;
create policy sections_admin on public.home_sections for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- notifications / audit / analytics
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists analytics_select on public.analytics_events;
create policy analytics_select on public.analytics_events for select to authenticated using (public.is_admin());
-- payment_events: RLS on, no policies => service_role only.

-- ---------- function execute rights ----------
revoke execute on all functions in schema public from public, anon, authenticated;

-- used inside policies / by client
grant execute on function public.is_admin(), public.current_seller_id(), public.seller_is_approved(uuid), public.product_is_public(uuid),
  public.owns_product(uuid), public.owns_cart(uuid), public.owns_wishlist(uuid) to anon, authenticated;
grant execute on function public.check_pincode(text), public.record_product_view(uuid), public.track_event(text, uuid), public.quote_order(jsonb, text) to anon, authenticated;
grant execute on function public.apply_as_seller(text, text, text, text, text, text), public.cancel_order(uuid, text), public.request_return(uuid, text),
  public.seller_update_item(uuid, text, text, text), public.seller_orders(text, int, int), public.seller_summary(),
  public.admin_decide_seller(uuid, text, text), public.admin_moderate_product(uuid, text, text), public.admin_set_account_status(uuid, text),
  public.admin_update_order_status(uuid, text, text), public.admin_list_users(text, text, int, int), public.admin_overview(),
  public.admin_sales_report(date, date), public.admin_resolve_return(uuid, text, text), public.admin_create_refund(uuid, numeric, text),
  public.admin_mark_refund_processed(uuid, text) to authenticated;
-- service_role only (Edge Functions): place_order, mark_payment_paid, mark_payment_failed, prepare_payment_retry,
-- attach_provider_order, mark_refund_result, release_expired_orders, _build_quote, _apply_coupon, internals.
grant execute on function public.place_order(uuid, uuid, jsonb, text, text, text), public.mark_payment_paid(text, text, bigint),
  public.mark_payment_failed(text), public.prepare_payment_retry(uuid, uuid), public.attach_provider_order(uuid, text),
  public.mark_refund_result(uuid, text, text, text), public.release_expired_orders() to service_role;

-- >>>>>>>> 0006_storage.sql
-- =====================================================================
-- 0006_storage.sql — buckets + storage RLS. Convention: first path segment = auth.uid() (owner folder).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('review-images',  'review-images',  true, 3145728, array['image/jpeg','image/png','image/webp']),
  ('brand-assets',   'brand-assets',   true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('seller-documents','seller-documents', false, 5242880, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read public buckets" on storage.objects;
create policy "public read public buckets" on storage.objects for select to anon, authenticated
  using (bucket_id in ('product-images','review-images','brand-assets'));

drop policy if exists "seller upload product images" on storage.objects;
create policy "seller upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text and public.current_seller_id() is not null);
drop policy if exists "seller update product images" on storage.objects;
create policy "seller update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text and public.current_seller_id() is not null);
drop policy if exists "seller delete product images" on storage.objects;
create policy "seller delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "buyer upload review images" on storage.objects;
create policy "buyer upload review images" on storage.objects for insert to authenticated
  with check (bucket_id = 'review-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "buyer delete review images" on storage.objects;
create policy "buyer delete review images" on storage.objects for delete to authenticated
  using (bucket_id = 'review-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "admin manage brand assets" on storage.objects;
create policy "admin manage brand assets" on storage.objects for all to authenticated
  using (bucket_id = 'brand-assets' and public.is_admin()) with check (bucket_id = 'brand-assets' and public.is_admin());

drop policy if exists "owner manage seller documents" on storage.objects;
create policy "owner manage seller documents" on storage.objects for all to authenticated
  using (bucket_id = 'seller-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
  with check (bucket_id = 'seller-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- >>>>>>>> 0007_defaults.sql
-- =====================================================================
-- 0007_defaults.sql — required configuration rows (NOT demo data; safe for production)
-- =====================================================================
insert into public.store_settings(key, value, is_public, description) values
  ('brand_name', '"Veloura"', true, 'Store display name'),
  ('brand_tagline', '"Style that feels like you"', true, 'Tagline'),
  ('contact_email', '"support@example.com"', true, 'Support email'),
  ('contact_phone', '"+91 00000 00000"', true, 'Support phone'),
  ('contact_address', '"Your registered business address"', true, 'Footer/contact address'),
  ('cod_enabled', 'true', true, 'Allow Cash on Delivery'),
  ('online_payments_enabled', 'false', true, 'Online payments: keep false until Razorpay + server functions are configured'),
  ('cod_max_order_value', '20000', true, 'Max COD order total (INR)'),
  ('shipping_fee', '99', true, 'Flat shipping fee (INR)'),
  ('free_shipping_threshold', '999', true, 'Free shipping at/above this payable subtotal'),
  ('max_qty_per_item', '10', true, 'Max quantity per variant per order'),
  ('low_stock_threshold', '5', true, 'Low stock warning level'),
  ('return_window_days', '7', true, 'Days after delivery a return can be requested'),
  ('order_prefix', '"ORD"', false, 'Order number prefix'),
  ('auto_approve_products', 'false', false, 'If true, seller submissions are approved automatically'),
  ('require_reapproval', 'true', false, 'Significant edits to approved products need re-approval'),
  ('online_payment_window_minutes', '30', false, 'Unpaid online orders are cancelled after this many minutes')
on conflict (key) do nothing;

insert into public.home_sections(title, kind, item_limit, sort_order, max_price)
select * from (values
  ('Trending now', 'trending', 10, 10, null),
  ('Recommended for you', 'recommended', 10, 20, null),
  ('New arrivals', 'new', 10, 30, null),
  ('Bestsellers', 'bestsellers', 10, 40, null),
  ('Top deals', 'deals', 10, 50, null),
  ('Under ₹999', 'budget', 10, 60, 999),
  ('Featured brands', 'brands', 12, 70, null),
  ('Recently viewed', 'recent', 10, 80, null)) v(title, kind, item_limit, sort_order, max_price)
where not exists (select 1 from public.home_sections);

-- >>>>>>>> 0008_browser_checkout.sql
-- The website runs in a plain browser (no server code), so Cash-on-Delivery checkout goes through a wrapper
-- that ONLY ever acts for the logged-in user (auth.uid()). The browser cannot choose the user, the price,
-- the total or the payment method. Online payment needs a server (Edge Function) and stays OFF.
create or replace function public.place_order_cod(p_address_id uuid, p_items jsonb, p_coupon text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then raise exception 'EMAIL_UNVERIFIED'; end if;
  return public.place_order(auth.uid(), p_address_id, p_items, p_coupon, 'cod', p_key);
end $$;
revoke all on function public.place_order_cod(uuid, jsonb, text, text) from public, anon;
grant execute on function public.place_order_cod(uuid, jsonb, text, text) to authenticated;

-- >>>>>>>> 0009_starter_categories.sql
-- Real configuration (not demo products): the category list the site needs on day one. Edit/remove later in Admin.
insert into public.categories(name, slug, sort_order) values
  ('T-Shirts','t-shirts',10),('Shirts','shirts',20),('Kurtas','kurtas',30),('Dresses','dresses',40),('Tops','tops',50),
  ('Jeans','jeans',60),('Trousers','trousers',70),('Footwear','footwear',80),('Accessories','accessories',90),
  ('Bags','bags',100),('Ethnic Wear','ethnic-wear',110),('Beauty','beauty',120),
  ('Women','women',5),('Men','men',6),('Kids','kids',7),('Western Wear','western-wear',115),('Jewellery','jewellery',95),('Home & Living','home-living',130)
on conflict (slug) do nothing;

-- >>>>>>>> 0010_branding.sql  (same as database/migration_branding.sql)
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
  if jsonb_typeof(cur) <> 'object' then cur := '{}'::jsonb; end if;
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

-- Done. Next: register on the website, then run database/make_admin.sql to create your first admin (see README.txt).
