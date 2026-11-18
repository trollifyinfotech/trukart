-- =====================================================================
-- migration_razorpay.sql  -  run ONCE in Supabase > SQL Editor (safe to run again, never deletes data)
-- Turns on "Pay online" in checkout. The tables/functions for payments already exist from setup.sql.
-- =====================================================================

-- 1) switch online payments ON (you can switch it off again any time in Admin > Settings)
insert into public.store_settings(key, value, is_public, description)
values ('online_payments_enabled', 'true'::jsonb, true, 'Online payments (Razorpay): true = show "Pay online" in checkout')
on conflict (key) do update set value = 'true'::jsonb;

-- 2) unpaid online orders are cancelled (stock returned) after this many minutes
insert into public.store_settings(key, value, is_public, description)
values ('online_payment_window_minutes', '30'::jsonb, false, 'Unpaid online orders are cancelled after this many minutes')
on conflict (key) do nothing;

-- 3) automatic clean-up of unpaid online orders every 10 minutes (needs the pg_cron extension).
--    If this block shows a notice, it is not fatal: enable it in Supabase > Database > Extensions > pg_cron and run this file again.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'veloura-release-expired-orders';
  perform cron.schedule('veloura-release-expired-orders', '*/10 * * * *', 'select public.release_expired_orders();');
exception when others then
  raise notice 'pg_cron not set up (%). Unpaid online orders will NOT auto-cancel until you enable pg_cron and re-run this file.', sqlerrm;
end $$;
