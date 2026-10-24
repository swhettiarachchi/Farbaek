-- Farbaek schema v39: rate limit windows don't outlive a day (ADR 0067).
--
-- app_rate_limit only cleared a key's old windows when the same key came
-- back, so a key seen once stayed forever. Sign-in now limits by a hash of
-- the network address and of the email address, and the Privacy Policy says
-- those are gone within a day. Each call now deletes every window that
-- started more than a day ago, and windows longer than a day are refused, so
-- the cleanup can never cut a live window short.

create index rate_limit_windows_start_idx on private.rate_limit_windows (window_start);

create or replace function public.app_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'INVALID_WINDOW' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  delete from private.rate_limit_windows where window_start < now() - interval '1 day';
  delete from private.rate_limit_windows where key = p_key and window_start < v_window;
  insert into private.rate_limit_windows (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = private.rate_limit_windows.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.app_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.app_rate_limit(text, integer, integer) to service_role;
