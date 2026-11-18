-- =====================================================================
-- migration_v5.sql  -  run ONCE in Supabase > SQL Editor (safe to run again, never deletes data)
--  1) FIX: orders without a coupon code failed with "That coupon cannot be applied" (coupon looked mandatory)
--  2) Adds the editable "Storefront" settings used by the new Meesho/Flipkart-style home page
-- =====================================================================

-- 1) coupon is OPTIONAL again
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

-- 2) storefront layout (edited in Admin > Storefront). Only inserted if missing.
insert into public.store_settings(key, value, is_public, description)
values ('storefront', $sf${"hero":{"enabled":false,"image_path":null,"offer_text":"Upto 35% OFF on your first order","offer_sub":"*Only on App","qr_path":null,"qr_caption":"Scan now to install","headline":"Smart Shopping","subheadline":"Trusted by Millions","button_text":"Shop Now","button_link":"/search"},"circles":{"enabled":true,"items":[]},"banners":[],"cards":{"enabled":false,"title":"Original Brands","view_all":"/search","items":[]},"marquee":{"enabled":true,"title":""}}$sf$::jsonb, true, 'Home page layout: hero, category circles, banners, brand cards (managed in Admin > Storefront)')
on conflict (key) do nothing;
