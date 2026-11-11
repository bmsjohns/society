-- The app connects as its own least-privilege login, `scan_app`, not as `postgres`.
-- Create the login once, out of band, with a generated password:
--   create role scan_app login password '<random>' noinherit;
-- This migration grants it exactly what the app needs. RLS stays on: scan_app gets
-- policies allowing everything, while anon/authenticated (the public API) still get nothing.
do $$
declare t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'scan_app') then
    raise notice 'scan_app role not present; skipping grants';
    return;
  end if;
  execute 'grant usage on schema public to scan_app';
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'grant usage on schema extensions to scan_app';
  end if;
  execute 'grant select, insert, update, delete on all tables in schema public to scan_app';
  execute 'grant usage, select on all sequences in schema public to scan_app';
  execute 'grant execute on function public.touch_updated_at() to scan_app';
  execute 'alter default privileges in schema public grant select, insert, update, delete on tables to scan_app';
  execute 'alter default privileges in schema public grant usage, select on sequences to scan_app';
  foreach t in array array['members','member_tokens','staff','benefits','events','event_guests','redemptions','member_notes','scans','stations'] loop
    execute format('drop policy if exists scan_app_all on public.%I', t);
    execute format('create policy scan_app_all on public.%I for all to scan_app using (true) with check (true)', t);
  end loop;
  -- The app never touches migration bookkeeping.
  execute 'revoke all on public.schema_migrations from scan_app';
end $$;
