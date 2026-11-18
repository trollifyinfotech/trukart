-- =============================================================================
-- OPTIONAL: create your FIRST admin (trusted, run by YOU in the Supabase SQL Editor).
-- There is no admin sign-up on the website and nothing in the browser can grant admin.
--
-- 1) Register normally on the website with the email you want as admin, and confirm the email.
-- 2) Put that email on the line marked  <<< CHANGE ME  and press Run.
-- The script refuses to continue unless the account exists, its email is confirmed, and
-- the account is active. It reads only the authenticated record in auth.users - never
-- user-editable metadata.
-- =============================================================================
do $$
declare
  v_email text := lower('owner@yourdomain.com');   -- <<< CHANGE ME
  v_id uuid; v_confirmed timestamptz; v_status text;
begin
  if position('@' in v_email) = 0 then raise exception 'That is not a full email address (it needs a name before the @, like name@yourdomain.com). You wrote: %', v_email; end if;
  if v_email = 'owner@yourdomain.com' then raise exception 'Edit make_admin.sql: replace owner@yourdomain.com with YOUR email first.'; end if;
  select id, email_confirmed_at into v_id, v_confirmed from auth.users where lower(email) = v_email;
  if v_id is null then raise exception 'No account with email % exists. Register on the website with this EXACT email first (and confirm it). To see which emails exist, run:  select email, email_confirmed_at from auth.users;', v_email; end if;
  if v_confirmed is null then raise exception 'The email % is not confirmed yet. Click the link in the confirmation email first.', v_email; end if;
  select account_status into v_status from public.profiles where id = v_id;
  if v_status is distinct from 'active' then raise exception 'Account % is not active (status: %).', v_email, coalesce(v_status, 'no profile'); end if;
  insert into public.user_roles(user_id, role) values (v_id, 'admin') on conflict do nothing;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (null, 'first_admin_bootstrap', 'user_roles', v_id::text, jsonb_build_object('email', v_email));
  raise notice 'Done: % is now an admin. Log out and log in again on the website.', v_email;
end $$;
