-- Farbaek schema v42: a copy of everything Farbaek holds about a person (ADR 0070).
--
-- The Privacy Policy offers people a copy of their data; until now that meant
-- writing to support. app_account_export(user) gathers it as one JSON
-- document: the account, email choices, workspaces and roles, support
-- requests with Farbaek's replies (never staff-only notes), the actions they
-- took, their AI use, and the projects, tasks and sites they created. Other
-- people's details stay out: actions are listed without their metadata.
-- Project files belong to the workspace and have their own export.

create function public.app_account_export(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'farbaek-account-export/v1',
    'exported_at', now(),
    'account', (
      -- Read through to_jsonb so a column Supabase Auth adds or drops never breaks the export.
      select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', to_jsonb(u) -> 'created_at', 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', to_jsonb(u) -> 'last_sign_in_at')
      from auth.users u where u.id = p_user
    ),
    'email_preferences', coalesce(
      (select jsonb_build_object('work_updates', e.work_updates, 'trial_reminders', e.trial_reminders, 'updated_at', e.updated_at) from public.email_preferences e where e.user_id = p_user),
      jsonb_build_object('work_updates', true, 'trial_reminders', true)
    ),
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role, 'joined_at', m.created_at) order by m.created_at)
      from public.organization_members m join public.organizations o on o.id = m.org_id
      where m.user_id = p_user
    ), '[]'::jsonb),
    'support_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', t.subject, 'topic', t.topic, 'status', t.status, 'created_at', t.created_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object('from', case when sm.from_staff then 'Farbaek' else 'you' end, 'body', sm.body, 'at', sm.created_at) order by sm.created_at)
          from public.support_messages sm where sm.thread_id = t.id and not sm.internal
        ), '[]'::jsonb)
      ) order by t.created_at)
      from public.support_threads t where t.author_id = p_user
    ), '[]'::jsonb),
    'projects_created', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'workspace', o.name, 'created_at', p.created_at, 'archived_at', p.archived_at) order by p.created_at)
      from public.projects p join public.organizations o on o.id = p.org_id
      where p.created_by = p_user
    ), '[]'::jsonb),
    'tasks_created', coalesce((
      select jsonb_agg(x.row order by x.at)
      from (
        select jsonb_build_object('title', t.title, 'state', t.state, 'workspace', o.name, 'created_at', t.created_at) as row, t.created_at as at
        from public.tasks t join public.organizations o on o.id = t.org_id
        where t.created_by = p_user order by t.created_at desc limit 2000
      ) x
    ), '[]'::jsonb),
    'sites_created', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'workspace', o.name, 'live', s.live_deployment_id is not null, 'created_at', s.created_at) order by s.created_at)
      from public.sites s join public.organizations o on o.id = s.org_id
      where s.created_by = p_user
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(x.row order by x.at)
      from (
        select jsonb_build_object('action', a.action, 'target', a.target, 'workspace', o.name, 'at', a.occurred_at) as row, a.occurred_at as at
        from public.audit_events a left join public.organizations o on o.id = a.org_id
        where a.actor_id = p_user order by a.occurred_at desc limit 5000
      ) x
    ), '[]'::jsonb),
    'ai_use', coalesce((
      select jsonb_agg(x.row order by x.at)
      from (
        select jsonb_build_object('operation', l.operation, 'model', l.model, 'input_tokens', l.input_tokens, 'output_tokens', l.output_tokens, 'status', l.status, 'workspace', o.name, 'at', l.created_at) as row, l.created_at as at
        from public.ai_credit_ledger l join public.organizations o on o.id = l.org_id
        where l.actor_id = p_user order by l.created_at desc limit 10000
      ) x
    ), '[]'::jsonb),
    'trial_fingerprint_kept', exists (
      select 1 from public.trial_claims c, auth.users u
      where u.id = p_user and c.email_hash = private.email_claim(u.email)
    )
  )
  where exists (select 1 from auth.users u where u.id = p_user);
$$;

revoke all on function public.app_account_export(uuid) from public, anon, authenticated;
grant execute on function public.app_account_export(uuid) to service_role;
