-- Fail fast instead of hanging: a stuck query or lock surfaces as an error the app can retry.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'scan_app') then
    execute 'alter role scan_app set statement_timeout = ''10s''';
    execute 'alter role scan_app set lock_timeout = ''5s''';
    execute 'alter role scan_app set idle_in_transaction_session_timeout = ''30s''';
  end if;
end $$;
