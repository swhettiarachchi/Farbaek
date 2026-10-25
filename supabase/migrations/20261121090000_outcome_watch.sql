-- Farbaek schema v50: outcome watch (ADR 0080).
--
-- A project's people can ask Farbaek to keep checking what's live: its
-- Farbaek Site, or its latest Vercel launch. The hourly job records each
-- result here. The decision is made here too, so it's the same every time:
-- two failed checks in a row mean down, the next good one means back up, and
-- each change of state is returned once so the job can tell the person who
-- turned the watch on. The last 24 results are kept for the Launch page.

create table public.outcome_watches (
  project_id       uuid primary key,
  org_id           uuid not null references public.organizations (id) on delete cascade,
  enabled_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  state            text not null default 'unknown' check (state in ('unknown', 'ok', 'breached')),
  failures         smallint not null default 0 check (failures between 0 and 1000),
  breached_at      timestamptz,
  last_checked_at  timestamptz,
  last_detail      text check (last_detail is null or char_length(last_detail) between 1 and 300),
  history          jsonb not null default '[]' check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) <= 24),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  constraint outcome_watches_breach check ((state = 'breached') = (breached_at is not null))
);

alter table public.outcome_watches enable row level security;
revoke all on public.outcome_watches from public, anon, authenticated, service_role;
grant select on public.outcome_watches to authenticated, service_role;
create policy "members read their workspace's watches" on public.outcome_watches
  for select to authenticated using ((select private.is_member(org_id)));

-- Contributors turn a project's watch on or off. Turning it on again makes
-- them the person who's told; the record of past checks stays.
create function public.app_set_outcome_watch(p_org uuid, p_actor uuid, p_project uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.projects where id = p_project and org_id = p_org and archived_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.outcome_watches (project_id, org_id, enabled_by) values (p_project, p_org, p_actor)
    on conflict (project_id) do update set enabled_by = excluded.enabled_by;
  else
    delete from public.outcome_watches where project_id = p_project and org_id = p_org;
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, case when p_on then 'watch.on' else 'watch.off' end, p_project::text, '{}'::jsonb);
end;
$$;
revoke all on function public.app_set_outcome_watch(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_set_outcome_watch(uuid, uuid, uuid, boolean) to service_role;

-- Records one check. p_ok null means there was nothing live to check: the
-- time and the reason are kept, and the state doesn't move. Returns 'down'
-- or 'recovered' when the state changes, and null otherwise.
create function public.app_record_watch_result(p_project uuid, p_ok boolean, p_detail text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.outcome_watches%rowtype;
  v_failures smallint;
  v_state text;
  v_alert text := null;
  v_detail text := left(btrim(coalesce(p_detail, '')), 300);
begin
  select * into v from public.outcome_watches where project_id = p_project for update;
  if not found then
    return null;
  end if;
  if v_detail = '' then
    v_detail := null;
  end if;
  if p_ok is null then
    update public.outcome_watches set last_checked_at = now(), last_detail = v_detail where project_id = p_project;
    return null;
  end if;

  v_failures := case when p_ok then 0 else least(v.failures + 1, 1000) end;
  v_state := case
    when p_ok then 'ok'
    when v_failures >= 2 then 'breached'
    else v.state
  end;
  if v_state = 'breached' and v.state <> 'breached' then
    v_alert := 'down';
  elsif v_state = 'ok' and v.state = 'breached' then
    v_alert := 'recovered';
  end if;

  update public.outcome_watches
     set state = v_state,
         failures = v_failures,
         breached_at = case when v_state = 'breached' then coalesce(v.breached_at, now()) else null end,
         last_checked_at = now(),
         last_detail = v_detail,
         history = (
           select coalesce(jsonb_agg(e), '[]'::jsonb) from (
             select e from jsonb_array_elements(
               jsonb_build_array(jsonb_build_object('at', now(), 'ok', p_ok, 'detail', v_detail)) || v.history
             ) with ordinality as t(e, n)
             order by n limit 24
           ) s
         )
   where project_id = p_project;

  if v_alert is not null then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v.org_id, null, 'watch.' || v_alert, p_project::text, jsonb_build_object('detail', v_detail));
  end if;
  return v_alert;
end;
$$;
revoke all on function public.app_record_watch_result(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.app_record_watch_result(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
