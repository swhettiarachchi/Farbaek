-- Farbaek schema v35: sandbox time stops counting at a session's expiry.
--
-- A runtime kills each sandbox at its timeout, which Farbaek sets from the
-- session's TTL, so no sandbox runs past expires_at (it is set once, at
-- creation). Running time was counted up to the moment a stop or expiry was
-- recorded, and for an open session up to now. When that record came late,
-- because no runtime was connected to finish a shutdown, days in which the
-- sandbox no longer existed were counted: one production session counted
-- 119 hours and used up its workspace's sandbox minutes.
--
-- Running time now counts only until expires_at, in the plan limit check and
-- when a segment closes. Sessions already counted past it are corrected, and
-- each correction is recorded as a session event with the old and new values.

create function private.sandbox_running_seconds(p_billed integer, p_since timestamptz, p_until timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_billed + coalesce(greatest(0, floor(extract(epoch from (least(now(), p_until) - p_since))))::integer, 0);
$$;
revoke all on function private.sandbox_running_seconds(integer, timestamptz, timestamptz) from public;

-- The two callers, unchanged apart from passing expires_at.
create or replace function public.app_create_sandbox_session(
  p_org uuid, p_actor uuid, p_project uuid, p_task uuid, p_name text, p_template text, p_size text, p_image text,
  p_network text, p_vcpu integer, p_memory_mib integer, p_provider text, p_isolation text,
  p_ttl_seconds integer, p_idle_seconds integer, p_max_concurrent integer, p_minutes_allowance integer,
  p_period_start timestamptz, p_idempotency_key text
)
returns table (session_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_archived timestamptz;
  v_task_project uuid;
  v_active integer;
  v_used integer;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);

  select s.id into v_id from public.sandbox_sessions s
  where s.org_id = p_org and s.created_by = p_actor and s.idempotency_key = p_idempotency_key;
  if found then
    return query select v_id, false;
    return;
  end if;

  if p_project is not null then
    select archived_at into v_archived from public.projects where id = p_project and org_id = p_org;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_archived is not null then
      raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
    end if;
  end if;
  if p_task is not null then
    select project_id into v_task_project from public.tasks where id = p_task and org_id = p_org;
    if not found or (p_project is not null and v_task_project <> p_project) then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if p_max_concurrent is null or p_max_concurrent < 1 or p_minutes_allowance is null or p_minutes_allowance < 0 then
    raise exception 'INVALID_LIMITS' using errcode = '22023';
  end if;
  select count(*) into v_active from public.sandbox_sessions
  where org_id = p_org and state in ('requested', 'provisioning', 'ready', 'paused', 'stopping');
  if v_active >= p_max_concurrent then
    raise exception 'SANDBOX_CONCURRENCY_LIMIT' using errcode = 'P0001';
  end if;
  select coalesce(sum(private.sandbox_running_seconds(billed_seconds, running_since, expires_at)), 0) into v_used
  from public.sandbox_sessions where org_id = p_org and created_at >= p_period_start;
  if v_used >= p_minutes_allowance * 60 then
    raise exception 'SANDBOX_MINUTES_EXHAUSTED' using errcode = 'P0001';
  end if;

  insert into public.sandbox_sessions (
    org_id, project_id, task_id, created_by, name, template, size, image, network_profile,
    requested_vcpu, requested_memory_mib, provider, isolation, ttl_seconds, idle_seconds, expires_at, idempotency_key
  ) values (
    p_org, p_project, p_task, p_actor, btrim(p_name), p_template, p_size, p_image, p_network,
    p_vcpu, p_memory_mib, p_provider, p_isolation, p_ttl_seconds, p_idle_seconds, now() + make_interval(secs => p_ttl_seconds), p_idempotency_key
  ) returning id into v_id;

  insert into public.sandbox_events (session_id, org_id, actor_id, event, to_state, detail)
  values (v_id, p_org, p_actor, 'session.requested', 'requested',
          jsonb_build_object('template', p_template, 'size', p_size, 'network', p_network, 'ttl_seconds', p_ttl_seconds));
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'sandbox.session_requested', v_id::text, jsonb_build_object('template', p_template, 'network', p_network));
  return query select v_id, true;
end;
$$;

create or replace function public.app_transition_sandbox_session(p_session uuid, p_actor uuid, p_expected_version integer, p_event text, p_patch jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sandbox_sessions%rowtype;
  v_to text;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_closed integer;
begin
  select * into s from public.sandbox_sessions where id = p_session for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_actor is not null then
    perform private.require_session_operator(s.org_id, s.created_by, p_actor);
  end if;
  if s.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  v_to := private.sandbox_next_state(s.state, p_event);
  if v_to is null then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  -- Close the running segment whenever a session stops running.
  v_closed := case when s.running_since is not null then private.sandbox_running_seconds(s.billed_seconds, s.running_since, s.expires_at) else s.billed_seconds end;

  if p_event = 'provisioned' then
    if coalesce(v_patch ->> 'provider_sandbox_id', '') = '' then
      raise exception 'INVALID_PATCH' using errcode = '22023';
    end if;
    update public.sandbox_sessions set
      provider_sandbox_id = v_patch ->> 'provider_sandbox_id',
      vcpu = nullif(v_patch ->> 'vcpu', '')::integer,
      memory_mib = nullif(v_patch ->> 'memory_mib', '')::integer,
      snapshot_sha256 = nullif(v_patch ->> 'snapshot_sha256', ''),
      snapshot_files = nullif(v_patch ->> 'snapshot_files', '')::integer,
      running_since = now(), last_activity_at = now()
    where id = p_session;
  elsif p_event = 'pause' then
    update public.sandbox_sessions set billed_seconds = v_closed, running_since = null where id = p_session;
  elsif p_event = 'resume' then
    update public.sandbox_sessions set running_since = now(), last_activity_at = now() where id = p_session;
  elsif p_event in ('stop', 'expire') then
    update public.sandbox_sessions set
      billed_seconds = v_closed, running_since = null,
      end_reason = case when p_event = 'stop' then 'user' else coalesce(nullif(v_patch ->> 'end_reason', ''), 'ttl') end,
      cleanup_status = case when s.provider_sandbox_id is null and coalesce(v_patch ->> 'provider_sandbox_id', '') = '' then 'not_needed' else 'pending' end,
      provider_sandbox_id = coalesce(s.provider_sandbox_id, nullif(v_patch ->> 'provider_sandbox_id', ''))
    where id = p_session;
  elsif p_event in ('finish_termination', 'finish_expiry') then
    update public.sandbox_sessions set
      cleanup_status = case when cleanup_status = 'not_needed' then 'not_needed' else 'done' end,
      ended_at = now()
    where id = p_session;
  elsif p_event = 'fail' then
    update public.sandbox_sessions set
      billed_seconds = v_closed, running_since = null, end_reason = 'failed', ended_at = now(),
      failure_category = left(coalesce(v_patch ->> 'failure_category', 'provider_unavailable'), 40),
      failure_message = left(coalesce(v_patch ->> 'failure_message', ''), 500),
      provider_sandbox_id = coalesce(s.provider_sandbox_id, nullif(v_patch ->> 'provider_sandbox_id', '')),
      cleanup_status = case
        when coalesce(s.provider_sandbox_id, nullif(v_patch ->> 'provider_sandbox_id', '')) is null then 'not_needed'
        when (v_patch ->> 'cleaned_up') = 'true' then 'done'
        else 'pending' end
    where id = p_session;
  end if;

  update public.sandbox_sessions set state = v_to, version = version + 1, updated_at = now() where id = p_session;

  insert into public.sandbox_events (session_id, org_id, actor_id, event, from_state, to_state, detail)
  values (p_session, s.org_id, p_actor, 'session.' || p_event, s.state, v_to, v_patch - 'provider_sandbox_id');
  if p_actor is not null and p_event in ('stop', 'pause', 'resume') then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (s.org_id, p_actor, 'sandbox.session_' || p_event, p_session::text, jsonb_build_object('from', s.state, 'to', v_to));
  end if;
  return s.version + 1;
end;
$$;

drop function private.sandbox_running_seconds(integer, timestamptz);

-- Sessions already counted past their expiry. A running segment starts when
-- the sandbox is provisioned, after the session is created, so no session can
-- have run longer than expires_at - created_at.
with over as (
  select id, org_id, state, billed_seconds as was,
         greatest(0, floor(extract(epoch from (expires_at - created_at))))::integer as cap
  from public.sandbox_sessions
  where billed_seconds > extract(epoch from (expires_at - created_at))
), fixed as (
  update public.sandbox_sessions s set billed_seconds = o.cap
  from over o
  where s.id = o.id
  returning s.id
)
insert into public.sandbox_events (session_id, org_id, actor_id, event, from_state, to_state, detail)
select o.id, o.org_id, null, 'session.billing_corrected', o.state, o.state,
       jsonb_build_object('billed_seconds_was', o.was, 'billed_seconds', o.cap, 'reason', 'counted past expires_at')
from over o join fixed f on f.id = o.id;

notify pgrst, 'reload schema';
