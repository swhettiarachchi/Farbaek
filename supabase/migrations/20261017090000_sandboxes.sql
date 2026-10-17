-- Farbaek schema v10: FARBAEK Sandbox (ADR 0013).
--
-- Sessions are isolated environments run by an external runtime (E2B
-- microVMs). This schema is the control plane's record of them: who started
-- what, its lifecycle, every command with its real exit code and bounded
-- output, preview links, verification receipts and usage.
--
-- Same rules as the rest of the schema: members read through Row Level
-- Security; every write goes through a service-role-only app_* function that
-- re-checks membership, ownership, limits and versions under a lock. The
-- lifecycle table here mirrors src/core/sandbox/lifecycle.ts, and a test
-- keeps them equal.

-- ------------------------------------------------------------------ tables

create table public.sandbox_sessions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  project_id           uuid,
  task_id              uuid,
  created_by           uuid not null,
  name                 text not null check (char_length(name) between 1 and 80),
  template             text not null check (template in ('node-ts', 'python')),
  size                 text not null check (size in ('small', 'standard')),
  image                text not null check (image ~ '^[A-Za-z0-9._/:-]{1,120}$'),
  network_profile      text not null check (network_profile in ('none', 'package_registries')),
  requested_vcpu       integer not null check (requested_vcpu between 1 and 8),
  requested_memory_mib integer not null check (requested_memory_mib between 256 and 16384),
  vcpu                 integer check (vcpu between 1 and 64),
  memory_mib           integer check (memory_mib between 128 and 262144),
  provider             text not null check (provider ~ '^[a-z0-9-]{1,40}$'),
  provider_sandbox_id  text unique check (provider_sandbox_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  isolation            text not null check (char_length(isolation) between 1 and 40),
  state                text not null default 'requested'
                         check (state in ('requested', 'provisioning', 'ready', 'paused', 'stopping', 'terminated', 'expired', 'failed')),
  version              integer not null default 0,
  ttl_seconds          integer not null check (ttl_seconds between 300 and 86400),
  idle_seconds         integer not null check (idle_seconds between 60 and 86400),
  expires_at           timestamptz not null,
  last_activity_at     timestamptz not null default now(),
  billed_seconds       integer not null default 0 check (billed_seconds >= 0),
  running_since        timestamptz,
  end_reason           text check (end_reason in ('user', 'ttl', 'idle', 'provider_gone', 'failed')),
  failure_category     text check (char_length(failure_category) <= 40),
  failure_message      text check (char_length(failure_message) <= 500),
  cleanup_status       text not null default 'not_needed' check (cleanup_status in ('not_needed', 'pending', 'done', 'failed')),
  cleanup_attempts     integer not null default 0,
  metrics              jsonb,
  snapshot_sha256      text check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_files       integer check (snapshot_files >= 0),
  idempotency_key      text not null check (char_length(idempotency_key) between 8 and 100),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  ended_at             timestamptz,
  unique (org_id, created_by, idempotency_key),
  -- Composite keys: a session can only point at a project or task in its own workspace.
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete set null (project_id),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete set null (task_id)
);
create index sandbox_sessions_org_idx on public.sandbox_sessions (org_id, created_at desc);
create index sandbox_sessions_open_idx on public.sandbox_sessions (state, expires_at)
  where state in ('requested', 'provisioning', 'ready', 'paused', 'stopping') or cleanup_status in ('pending', 'failed');

create table public.sandbox_executions (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sandbox_sessions (id) on delete cascade,
  org_id            uuid not null references public.organizations (id) on delete cascade,
  actor_id          uuid not null,
  kind              text not null check (kind in ('command', 'check', 'setup')),
  label             text check (char_length(label) <= 120),
  command           text not null check (char_length(command) between 1 and 4000),
  state             text not null default 'running' check (state in ('running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'error')),
  exit_code         integer,
  pid               integer check (pid > 0),
  timeout_seconds   integer not null check (timeout_seconds between 1 and 3600),
  started_at        timestamptz not null default now(),
  deadline_at       timestamptz not null,
  ended_at          timestamptz,
  duration_ms       integer check (duration_ms >= 0),
  stdout            text not null default '' check (char_length(stdout) <= 140000),
  stderr            text not null default '' check (char_length(stderr) <= 140000),
  stdout_truncated  boolean not null default false,
  stderr_truncated  boolean not null default false,
  stdout_sha256     text check (stdout_sha256 ~ '^[0-9a-f]{64}$'),
  stderr_sha256     text check (stderr_sha256 ~ '^[0-9a-f]{64}$'),
  failure_category  text check (char_length(failure_category) <= 40),
  policy            jsonb not null,
  cancel_requested_at timestamptz,
  idempotency_key   text not null check (char_length(idempotency_key) between 8 and 100),
  unique (session_id, idempotency_key)
);
-- One running command per session, enforced by the database.
create unique index sandbox_executions_one_running on public.sandbox_executions (session_id) where state = 'running';
create index sandbox_executions_session_idx on public.sandbox_executions (session_id, started_at desc);
create index sandbox_executions_running_idx on public.sandbox_executions (deadline_at) where state = 'running';

create table public.sandbox_events (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.sandbox_sessions (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  actor_id     uuid,
  event        text not null check (char_length(event) between 1 and 60),
  from_state   text,
  to_state     text,
  detail       jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);
create index sandbox_events_session_idx on public.sandbox_events (session_id, occurred_at desc);

create table public.sandbox_previews (
  id           text primary key check (id ~ '^[a-z2-7]{26}$'),
  session_id   uuid not null references public.sandbox_sessions (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  port         integer not null check (port between 1024 and 65535 and port not in (49983, 49999)),
  created_by   uuid not null,
  expires_at   timestamptz not null,
  launched_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index sandbox_previews_session_idx on public.sandbox_previews (session_id, created_at desc);

create table public.sandbox_receipts (
  digest       text primary key check (digest ~ '^[0-9a-f]{64}$'),
  session_id   uuid not null references public.sandbox_sessions (id),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  task_id      uuid,
  status       text not null check (status in ('verified', 'partially_verified', 'failed', 'unverified')),
  statement    jsonb not null check (jsonb_typeof(statement) = 'object' and statement ->> '_type' = 'https://in-toto.io/Statement/v1'),
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete set null (task_id)
);
create index sandbox_receipts_session_idx on public.sandbox_receipts (session_id, created_at desc);
create index sandbox_receipts_task_idx on public.sandbox_receipts (task_id, created_at desc) where task_id is not null;

-- Receipts are evidence: once written they never change. (Deleting a whole
-- organization still cascades.) task_id may be cleared by "on delete set null".
create function private.sandbox_receipts_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.digest is distinct from old.digest or new.statement is distinct from old.statement or new.status is distinct from old.status
     or new.session_id is distinct from old.session_id or new.org_id is distinct from old.org_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
     or (new.task_id is not null and new.task_id is distinct from old.task_id) then
    raise exception 'RECEIPT_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger sandbox_receipts_immutable before update on public.sandbox_receipts
  for each row execute function private.sandbox_receipts_immutable();

create table private.rate_limit_windows (
  key           text not null check (char_length(key) between 1 and 200),
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

-- ------------------------------------------------------------------ RLS

alter table public.sandbox_sessions enable row level security;
alter table public.sandbox_executions enable row level security;
alter table public.sandbox_events enable row level security;
alter table public.sandbox_previews enable row level security;
alter table public.sandbox_receipts enable row level security;

create policy "members read sandbox sessions" on public.sandbox_sessions for select to authenticated using ((select private.is_member(org_id)));
create policy "members read sandbox executions" on public.sandbox_executions for select to authenticated using ((select private.is_member(org_id)));
create policy "members read sandbox events" on public.sandbox_events for select to authenticated using ((select private.is_member(org_id)));
create policy "members read sandbox previews" on public.sandbox_previews for select to authenticated using ((select private.is_member(org_id)));
create policy "members read sandbox receipts" on public.sandbox_receipts for select to authenticated using ((select private.is_member(org_id)));

revoke all on public.sandbox_sessions, public.sandbox_executions, public.sandbox_events, public.sandbox_previews, public.sandbox_receipts
  from anon, authenticated;
grant select on public.sandbox_sessions, public.sandbox_executions, public.sandbox_events, public.sandbox_previews, public.sandbox_receipts
  to authenticated;

-- ------------------------------------------------------------------ helpers

-- The lifecycle table. Mirrors nextSessionState in src/core/sandbox/lifecycle.ts.
create function private.sandbox_next_state(p_from text, p_event text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = 'requested'    and p_event = 'provision'          then 'provisioning'
    when p_from = 'requested'    and p_event = 'stop'               then 'stopping'
    when p_from = 'requested'    and p_event = 'fail'               then 'failed'
    when p_from = 'provisioning' and p_event = 'provisioned'        then 'ready'
    when p_from = 'provisioning' and p_event = 'stop'               then 'stopping'
    when p_from = 'provisioning' and p_event = 'fail'               then 'failed'
    when p_from = 'ready'        and p_event = 'pause'              then 'paused'
    when p_from = 'ready'        and p_event = 'stop'               then 'stopping'
    when p_from = 'ready'        and p_event = 'expire'             then 'stopping'
    when p_from = 'ready'        and p_event = 'fail'               then 'failed'
    when p_from = 'paused'       and p_event = 'resume'             then 'ready'
    when p_from = 'paused'       and p_event = 'stop'               then 'stopping'
    when p_from = 'paused'       and p_event = 'expire'             then 'stopping'
    when p_from = 'paused'       and p_event = 'fail'               then 'failed'
    when p_from = 'stopping'     and p_event = 'finish_termination' then 'terminated'
    when p_from = 'stopping'     and p_event = 'finish_expiry'      then 'expired'
    when p_from = 'stopping'     and p_event = 'fail'               then 'failed'
  end;
$$;
revoke all on function private.sandbox_next_state(text, text) from public;

-- The session's creator, or an owner or admin of its workspace.
create function private.require_session_operator(p_org uuid, p_creator uuid, p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  if p_actor <> p_creator and not exists (
    select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_session_operator(uuid, uuid, uuid) from public;

-- Seconds a session has been running, including the open segment.
create function private.sandbox_running_seconds(p_billed integer, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_billed + coalesce(greatest(0, floor(extract(epoch from (now() - p_since))))::integer, 0);
$$;
revoke all on function private.sandbox_running_seconds(integer, timestamptz) from public;

-- ------------------------------------------------------------------ sessions

-- p_max_concurrent and p_minutes_allowance come from the plan, computed by the
-- server (src/config/sandbox.ts). Both are re-checked here under a lock on the
-- organization so concurrent requests can't slip past them. A repeated
-- idempotency key returns the existing session instead of a second one.
create function public.app_create_sandbox_session(
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
  select coalesce(sum(private.sandbox_running_seconds(billed_seconds, running_since)), 0) into v_used
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

-- Applies one lifecycle event under a version check. p_actor is the person
-- acting (who must be the session's creator or an owner or admin), or null
-- for the system (the sweeper). p_patch carries the facts for the event.
create function public.app_transition_sandbox_session(p_session uuid, p_actor uuid, p_expected_version integer, p_event text, p_patch jsonb)
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
  v_closed := case when s.running_since is not null then private.sandbox_running_seconds(s.billed_seconds, s.running_since) else s.billed_seconds end;

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

-- Records a cleanup attempt for a session whose sandbox the runtime should
-- destroy. Failures are counted; the sweeper retries them.
create function public.app_record_sandbox_cleanup(p_session uuid, p_ok boolean, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sandbox_sessions%rowtype;
begin
  select * into s from public.sandbox_sessions where id = p_session for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if s.cleanup_status not in ('pending', 'failed') then
    return;
  end if;
  update public.sandbox_sessions set
    cleanup_status = case when p_ok then 'done' else 'failed' end,
    cleanup_attempts = cleanup_attempts + 1,
    updated_at = now()
  where id = p_session;
  insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
  values (p_session, s.org_id, null, case when p_ok then 'cleanup.done' else 'cleanup.failed' end,
          jsonb_build_object('attempt', s.cleanup_attempts + 1, 'message', left(coalesce(p_message, ''), 300)));
end;
$$;

create function public.app_record_sandbox_metrics(p_session uuid, p_metrics jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_metrics) <> 'object' or pg_column_size(p_metrics) > 4096 then
    raise exception 'INVALID_PATCH' using errcode = '22023';
  end if;
  update public.sandbox_sessions set metrics = p_metrics where id = p_session and state = 'ready';
end;
$$;

-- ------------------------------------------------------------------ executions

create function public.app_start_sandbox_execution(
  p_session uuid, p_actor uuid, p_kind text, p_label text, p_command text, p_timeout_seconds integer, p_policy jsonb, p_idempotency_key text
)
returns table (execution_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sandbox_sessions%rowtype;
  v_id uuid;
begin
  select * into s from public.sandbox_sessions where id = p_session for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_session_operator(s.org_id, s.created_by, p_actor);

  select e.id into v_id from public.sandbox_executions e where e.session_id = p_session and e.idempotency_key = p_idempotency_key;
  if found then
    return query select v_id, false;
    return;
  end if;
  if s.state <> 'ready' then
    raise exception 'SESSION_NOT_RUNNING' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sandbox_executions where session_id = p_session and state = 'running') then
    raise exception 'SESSION_BUSY' using errcode = 'P0001';
  end if;

  insert into public.sandbox_executions (session_id, org_id, actor_id, kind, label, command, timeout_seconds, deadline_at, policy, idempotency_key)
  values (p_session, s.org_id, p_actor, p_kind, nullif(left(coalesce(p_label, ''), 120), ''), p_command, p_timeout_seconds,
          now() + make_interval(secs => p_timeout_seconds + 30), coalesce(p_policy, '{}'::jsonb), p_idempotency_key)
  returning id into v_id;
  update public.sandbox_sessions set last_activity_at = now() where id = p_session;
  insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
  values (p_session, s.org_id, p_actor, 'execution.started', jsonb_build_object('execution', v_id, 'kind', p_kind));
  return query select v_id, true;
end;
$$;

create function public.app_set_sandbox_execution_pid(p_execution uuid, p_pid integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sandbox_executions set pid = p_pid where id = p_execution and state = 'running';
$$;

-- Finishes a running execution with its real outcome. The state must agree
-- with the exit code: "succeeded" only with exit 0, "failed" only with a
-- non-zero exit.
create function public.app_finish_sandbox_execution(
  p_execution uuid, p_state text, p_exit_code integer, p_duration_ms integer,
  p_stdout text, p_stderr text, p_stdout_truncated boolean, p_stderr_truncated boolean,
  p_stdout_sha256 text, p_stderr_sha256 text, p_failure text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.sandbox_executions%rowtype;
begin
  select * into e from public.sandbox_executions where id = p_execution for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if e.state <> 'running' then
    return;
  end if;
  if p_state not in ('succeeded', 'failed', 'timed_out', 'cancelled', 'error')
     or (p_state = 'succeeded' and coalesce(p_exit_code, -1) <> 0)
     or (p_state = 'failed' and (p_exit_code is null or p_exit_code = 0)) then
    raise exception 'INVALID_OUTCOME' using errcode = '22023';
  end if;
  update public.sandbox_executions set
    state = p_state, exit_code = p_exit_code, duration_ms = p_duration_ms, ended_at = now(),
    stdout = coalesce(p_stdout, ''), stderr = coalesce(p_stderr, ''),
    stdout_truncated = coalesce(p_stdout_truncated, false), stderr_truncated = coalesce(p_stderr_truncated, false),
    stdout_sha256 = p_stdout_sha256, stderr_sha256 = p_stderr_sha256,
    failure_category = case when p_state = 'succeeded' then null else left(p_failure, 40) end
  where id = p_execution;
  update public.sandbox_sessions set last_activity_at = now() where id = e.session_id;
  insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
  values (e.session_id, e.org_id, null, 'execution.finished',
          jsonb_build_object('execution', p_execution, 'state', p_state, 'exit_code', p_exit_code, 'duration_ms', p_duration_ms));
end;
$$;

-- Marks a running execution for cancellation and returns what the server
-- needs to stop it. The person who ran it, the session's creator, or an owner
-- or admin may cancel.
create function public.app_request_sandbox_cancel(p_execution uuid, p_actor uuid)
returns table (pid integer, provider_sandbox_id text, already_finished boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.sandbox_executions%rowtype;
  s public.sandbox_sessions%rowtype;
begin
  select * into e from public.sandbox_executions where id = p_execution for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into s from public.sandbox_sessions where id = e.session_id;
  if e.actor_id <> p_actor then
    perform private.require_session_operator(s.org_id, s.created_by, p_actor);
  end if;
  if e.state <> 'running' then
    return query select e.pid, s.provider_sandbox_id, true;
    return;
  end if;
  update public.sandbox_executions set cancel_requested_at = coalesce(cancel_requested_at, now()) where id = p_execution;
  insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
  values (e.session_id, e.org_id, p_actor, 'execution.cancel_requested', jsonb_build_object('execution', p_execution));
  return query select e.pid, s.provider_sandbox_id, false;
end;
$$;

create function public.app_touch_sandbox_session(p_session uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sandbox_sessions%rowtype;
begin
  select * into s from public.sandbox_sessions where id = p_session for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_session_operator(s.org_id, s.created_by, p_actor);
  if s.state <> 'ready' then
    raise exception 'SESSION_NOT_RUNNING' using errcode = 'P0001';
  end if;
  update public.sandbox_sessions set last_activity_at = now() where id = p_session;
end;
$$;

-- ------------------------------------------------------------------ previews

create function public.app_create_sandbox_preview(p_session uuid, p_actor uuid, p_id text, p_port integer, p_ttl_seconds integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sandbox_sessions%rowtype;
  v_expires timestamptz;
begin
  select * into s from public.sandbox_sessions where id = p_session for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_session_operator(s.org_id, s.created_by, p_actor);
  if s.state <> 'ready' then
    raise exception 'SESSION_NOT_RUNNING' using errcode = 'P0001';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 86400 then
    raise exception 'INVALID_LIMITS' using errcode = '22023';
  end if;
  if (select count(*) from public.sandbox_previews
      where session_id = p_session and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'PREVIEW_LIMIT' using errcode = 'P0001';
  end if;
  v_expires := least(now() + make_interval(secs => p_ttl_seconds), s.expires_at);
  insert into public.sandbox_previews (id, session_id, org_id, port, created_by, expires_at)
  values (p_id, p_session, s.org_id, p_port, p_actor, v_expires);
  update public.sandbox_sessions set last_activity_at = now() where id = p_session;
  insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
  values (p_session, s.org_id, p_actor, 'preview.opened', jsonb_build_object('port', p_port, 'expires_at', v_expires));
  return v_expires;
end;
$$;

-- Uses a preview's one launch. Only the person who opened it, only once,
-- only while it's open and its session runs.
create function public.app_launch_sandbox_preview(p_id text, p_user uuid)
returns table (session_id uuid, port integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.sandbox_previews%rowtype;
begin
  select * into p from public.sandbox_previews where id = p_id for update;
  if not found or p.created_by <> p_user or p.revoked_at is not null or p.expires_at <= now() or p.launched_at is not null
     or not exists (select 1 from public.sandbox_sessions s where s.id = p.session_id and s.state = 'ready')
     or not exists (select 1 from public.organization_members m where m.org_id = p.org_id and m.user_id = p_user) then
    raise exception 'PREVIEW_UNAVAILABLE' using errcode = 'P0001';
  end if;
  update public.sandbox_previews set launched_at = now() where id = p_id;
  return query select p.session_id, p.port, p.expires_at;
end;
$$;

create function public.app_revoke_sandbox_preview(p_id text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.sandbox_previews%rowtype;
  s public.sandbox_sessions%rowtype;
begin
  select * into p from public.sandbox_previews where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into s from public.sandbox_sessions where id = p.session_id;
  if p.created_by <> p_actor then
    perform private.require_session_operator(s.org_id, s.created_by, p_actor);
  end if;
  update public.sandbox_previews set revoked_at = coalesce(revoked_at, now()) where id = p_id;
  insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
  values (p.session_id, p.org_id, p_actor, 'preview.revoked', jsonb_build_object('port', p.port));
end;
$$;

-- ------------------------------------------------------------------ receipts

create function public.app_record_sandbox_receipt(p_session uuid, p_actor uuid, p_digest text, p_status text, p_statement jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sandbox_sessions%rowtype;
begin
  select * into s from public.sandbox_sessions where id = p_session;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_session_operator(s.org_id, s.created_by, p_actor);
  if (p_statement #>> '{predicate,session,id}') is distinct from p_session::text
     or (p_statement #>> '{predicate,session,organizationId}') is distinct from s.org_id::text
     or (p_statement #>> '{predicate,status}') is distinct from p_status then
    raise exception 'INVALID_RECEIPT' using errcode = '22023';
  end if;
  insert into public.sandbox_receipts (digest, session_id, org_id, task_id, status, statement, created_by)
  values (p_digest, p_session, s.org_id, s.task_id, p_status, p_statement, p_actor)
  on conflict (digest) do nothing;
  insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
  values (p_session, s.org_id, p_actor, 'receipt.recorded', jsonb_build_object('digest', p_digest, 'status', p_status));
end;
$$;

-- ------------------------------------------------------------------ limits and retention

-- Fixed-window counter. Returns false once the key has used its requests in
-- the current window. Old windows for the key are dropped as it goes.
create function public.app_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  delete from private.rate_limit_windows where key = p_key and window_start < v_window;
  insert into private.rate_limit_windows (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = private.rate_limit_windows.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- Drops command history and events older than the cutoff for sessions that
-- have ended. Receipts are kept: they are the evidence.
create function public.app_prune_sandbox_history(p_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.sandbox_executions e
  using public.sandbox_sessions s
  where e.session_id = s.id and s.state in ('terminated', 'expired', 'failed') and e.started_at < p_before;
  get diagnostics v_count = row_count;
  delete from public.sandbox_events ev
  using public.sandbox_sessions s
  where ev.session_id = s.id and s.state in ('terminated', 'expired', 'failed') and ev.occurred_at < p_before;
  delete from public.sandbox_previews where expires_at < p_before;
  return v_count;
end;
$$;

-- ------------------------------------------------------------------ grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_create_sandbox_session(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, integer, text, text, integer, integer, integer, integer, timestamptz, text)',
    'public.app_transition_sandbox_session(uuid, uuid, integer, text, jsonb)',
    'public.app_record_sandbox_cleanup(uuid, boolean, text)',
    'public.app_record_sandbox_metrics(uuid, jsonb)',
    'public.app_start_sandbox_execution(uuid, uuid, text, text, text, integer, jsonb, text)',
    'public.app_set_sandbox_execution_pid(uuid, integer)',
    'public.app_finish_sandbox_execution(uuid, text, integer, integer, text, text, boolean, boolean, text, text, text)',
    'public.app_request_sandbox_cancel(uuid, uuid)',
    'public.app_touch_sandbox_session(uuid, uuid)',
    'public.app_create_sandbox_preview(uuid, uuid, text, integer, integer)',
    'public.app_launch_sandbox_preview(text, uuid)',
    'public.app_revoke_sandbox_preview(text, uuid)',
    'public.app_record_sandbox_receipt(uuid, uuid, text, text, jsonb)',
    'public.app_rate_limit(text, integer, integer)',
    'public.app_prune_sandbox_history(timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
