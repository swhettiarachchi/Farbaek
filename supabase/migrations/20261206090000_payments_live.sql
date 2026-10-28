-- Farbaek schema v65: going live with Dodo Payments (ADR 0104).
--
-- Live payments need both the server's live keys (BILLING_MODE=live) and an
-- owner's confirmation here, with a fresh authenticator code and a reason,
-- recorded in the staff audit chain (spec §23.6). Confirming ends every
-- test-mode plan and test top-up, so a test card never counts as a real
-- payment. Turning live off is the same kind of decision. The server key
-- reads the row; only these functions write it.

create table public.billing_go_live (
  id             integer primary key default 1 check (id = 1),
  confirmed_at   timestamptz not null,
  confirmed_by   uuid references auth.users (id) on delete set null,
  terms_version  text not null check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  reason         text not null check (char_length(reason) between 10 and 500),
  ended_at       timestamptz,
  ended_by       uuid references auth.users (id) on delete set null
);
alter table public.billing_go_live enable row level security;
revoke all on public.billing_go_live from public, anon, authenticated, service_role;
grant select on public.billing_go_live to service_role;

create or replace function private.staff_can(p_role text, p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_action
    when 'console.read'          then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    when 'people.read_email'     then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'audit.read_all'        then p_role in ('owner', 'admin', 'viewer')
    when 'audit.verify'          then p_role in ('owner', 'admin')
    when 'staff.read'            then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    when 'staff.manage'          then p_role in ('owner')
    when 'workspace.suspend'     then p_role in ('owner', 'admin', 'trust_safety')
    when 'site.block'            then p_role in ('owner', 'admin', 'trust_safety')
    when 'usage.add'             then p_role in ('owner', 'admin')
    when 'trial.extend'          then p_role in ('owner', 'admin', 'support')
    when 'flags.set'             then p_role in ('owner')
    when 'announcements.manage'  then p_role in ('owner', 'admin')
    when 'support.read'          then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'support.reply'         then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'devices.own'           then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    when 'models.canary'         then p_role in ('owner', 'admin')
    when 'models.switch'         then p_role in ('owner')
    when 'billing.products'      then p_role in ('owner')
    when 'billing.replay'        then p_role in ('owner', 'admin')
    when 'billing.go_live'       then p_role in ('owner')
    else false
  end, false);
$$;

-- Turns live payments on. Returns how many test plans and test top-ups were ended.
create function public.app_staff_confirm_payments_live(
  p_actor uuid,
  p_session uuid,
  p_auth_strength text,
  p_terms_version text,
  p_reason text,
  p_ip_hash text,
  p_ua text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'billing.go_live');
  v_reason text := private.require_reason(p_reason);
  v_plans integer := 0;
  v_topups integer := 0;
  r record;
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if p_terms_version is null or p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  insert into public.billing_go_live (id, confirmed_at, confirmed_by, terms_version, reason, ended_at, ended_by)
  values (1, now(), p_actor, p_terms_version, v_reason, null, null)
  on conflict (id) do update set confirmed_at = now(), confirmed_by = p_actor, terms_version = p_terms_version, reason = v_reason, ended_at = null, ended_by = null;

  -- Test-mode plans end: the workspace goes back to Free, with nothing paid.
  for r in select b.org_id, b.state::text as state, b.paid_plan_id from public.billing_accounts b where b.provider_mode = 'test' for update loop
    update public.billing_accounts b
       set state = 'free', paid_plan_id = null, paid_through = null, suspended_reason = null, cancel_at_period_end = false,
           provider = null, provider_mode = null, provider_customer_id = null, provider_subscription_id = null,
           subscription_started_at = null, provider_synced_at = null, updated_at = now()
     where b.org_id = r.org_id;
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (r.org_id, null, 'billing.test_plan_ended', r.org_id::text, jsonb_build_object('was', r.state, 'plan', r.paid_plan_id));
    v_plans := v_plans + 1;
  end loop;

  -- Test top-ups' usage ends too.
  update public.usage_grants g set expires_at = greatest(now(), g.starts_at + interval '1 second')
   where g.kind = 'topup' and g.expires_at > now()
     and g.source_key in (select 'topup:' || t.id::text from public.billing_topups t where t.mode = 'test');
  get diagnostics v_topups = row_count;

  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'billing.payments_live', 'payments', 'live', null, v_reason, null, 'success',
    jsonb_build_object('terms_version', p_terms_version, 'test_plans_ended', v_plans, 'test_topups_ended', v_topups), p_ip_hash, p_ua, null);
  return jsonb_build_object('test_plans_ended', v_plans, 'test_topups_ended', v_topups);
end;
$$;

-- Turns live payments off. Existing subscriptions keep running at Dodo; new checkouts stop.
create function public.app_staff_end_payments_live(p_actor uuid, p_session uuid, p_auth_strength text, p_reason text, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'billing.go_live');
  v_reason text := private.require_reason(p_reason);
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  update public.billing_go_live g set ended_at = now(), ended_by = p_actor where g.id = 1 and g.ended_at is null;
  if not found then
    raise exception 'NOTHING_TO_CHANGE' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'billing.payments_live_ended', 'payments', 'live', null, v_reason, null, 'success',
    '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

revoke all on function public.app_staff_confirm_payments_live(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_end_payments_live(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_staff_confirm_payments_live(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.app_staff_end_payments_live(uuid, uuid, text, text, text, text) to service_role;
