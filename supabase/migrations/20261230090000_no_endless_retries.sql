-- v89: no function raises error code 40001 any more (ADR 0178).
--
-- PostgREST runs each call in a transaction that retries for ever on 40001 (its transaction library,
-- hasql-transaction, treats it as a conflict worth repeating). Functions raised it on purpose, to say FILE_CHANGED,
-- VERSION_CONFLICT and so on. So a refusal was never delivered: the same call ran again and again, past the
-- gateway's 30 seconds and after the person had gone. They saw "Something went wrong", and each press kept one of
-- PostgREST's connections busy until it restarted.
--
-- The app reads the words, not the code, so the words stay and only the code changes, to P0001, the ordinary code
-- for a function's own refusal. Each function is rewritten from its own live definition, so nothing else in it
-- changes, and its owner and grants stay as they are.
do $$
declare
  v_oid oid;
begin
  for v_oid in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f' and p.prosrc like '%40001%'
  loop
    execute regexp_replace(pg_catalog.pg_get_functiondef(v_oid), 'errcode\s*=\s*''40001''', 'errcode = ''P0001''', 'g');
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f' and p.prosrc like '%40001%'
  ) then
    raise exception 'A function still mentions 40001';
  end if;
end;
$$;
